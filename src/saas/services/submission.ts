import type { AttentionEventType, PrismaClient } from "@prisma/client";
import { requireOrgMembership } from "../auth/org-context.js";
import { notFound } from "../errors.js";
import { attentionTitleFor, pruneAttentionEventsForOrg } from "./attention.js";
import { queueAttentionEmail } from "./notify.js";

type SubmissionDocumentRef = {
  documentId: string;
  documentVersionId: string | null;
  storageKey: string | null;
  name: string;
  version: number | null;
};

const resolveSubmissionDocuments = async (
  prisma: PrismaClient,
  input: { organizationId: string; documentIds: string[] },
): Promise<SubmissionDocumentRef[]> => {
  if (input.documentIds.length === 0) return [];
  const documents = await prisma.vaultDocument.findMany({
    where: { id: { in: input.documentIds }, organizationId: input.organizationId },
    include: { versions: { orderBy: { version: "desc" }, take: 1 } },
  });
  if (documents.length !== new Set(input.documentIds).size) {
    throw notFound("vault_document_not_found");
  }
  return documents.map((doc) => ({
    documentId: doc.id,
    documentVersionId: doc.versions[0]?.id ?? null,
    storageKey: doc.versions[0]?.storageKey ?? null,
    name: doc.name,
    version: doc.versions[0]?.version ?? doc.version,
  }));
};

/**
 * Records a formal procurement offer submission.
 * Monitoring remains ACTIVE — submission does not end the thread watch.
 * Does NOT auto-set WON/LOST.
 */
export const recordFormalSubmission = async (
  prisma: PrismaClient,
  input: {
    userId: string;
    organizationId: string;
    tenderId: string;
    submittedAt?: Date;
    submissionMethod: string;
    recipient?: string | null;
    subject?: string | null;
    amountWithoutVat?: number | null;
    amountWithVat?: number | null;
    externalReference?: string | null;
    notes?: string | null;
    documentIds?: string[];
  },
) => {
  await requireOrgMembership(prisma, input.userId, input.organizationId);

  const orgTender = await prisma.organizationTender.findUnique({
    where: {
      organizationId_tenderId: {
        organizationId: input.organizationId,
        tenderId: input.tenderId,
      },
    },
    include: { tender: true },
  });
  if (!orgTender) throw notFound("organization_tender_not_found");

  const documents = await resolveSubmissionDocuments(prisma, {
    organizationId: input.organizationId,
    documentIds: input.documentIds ?? [],
  });

  const submittedAt = input.submittedAt ?? new Date();
  const now = new Date();

  const result = await prisma.$transaction(async (tx) => {
    const submission = await tx.submission.create({
      data: {
        organizationId: input.organizationId,
        organizationTenderId: orgTender.id,
        submittedAt,
        submissionMethod: input.submissionMethod,
        recipient: input.recipient ?? null,
        subject: input.subject ?? null,
        amountWithoutVat: input.amountWithoutVat ?? null,
        amountWithVat: input.amountWithVat ?? null,
        externalReference: input.externalReference ?? null,
        submittedByUserId: input.userId,
        notes: input.notes ?? null,
        attachments: documents.map((doc) => ({
          documentId: doc.documentId,
          name: doc.name,
          version: doc.version,
        })),
        result: "PENDING",
      },
    });

    // Versioned documents are snapshotted so the submission stays auditable.
    for (const doc of documents) {
      if (!doc.documentVersionId || !doc.storageKey) continue;
      await tx.submissionDocumentSnapshot.create({
        data: {
          organizationId: input.organizationId,
          submissionId: submission.id,
          documentId: doc.documentId,
          documentVersionId: doc.documentVersionId,
          nameSnapshot: doc.name,
          storageKeySnapshot: doc.storageKey,
        },
      });
    }

    const organizationTender = await tx.organizationTender.update({
      where: { id: orgTender.id },
      data: {
        pipelineStage: "SUBMITTED",
        operationalStatus: "SUBMITTED",
        monitoringActive: true,
        monitoringReason: "SUBMISSION_RECORDED",
        monitoringStartedAt: orgTender.monitoringStartedAt ?? now,
        monitoringStoppedAt: null,
      },
    });

    await tx.tenderEvent.create({
      data: {
        organizationId: input.organizationId,
        organizationTenderId: orgTender.id,
        eventType: "SUBMITTED",
        // Immutable snapshot for timeline rendering — never read latestSubmission.
        note: JSON.stringify({
          submissionId: submission.id,
          submissionMethod: input.submissionMethod,
          externalReference: input.externalReference ?? null,
          amountWithoutVat: input.amountWithoutVat ?? null,
          submittedAt: submission.submittedAt.toISOString(),
        }),
      },
    });

    const type = "SUBMISSION_RECORDED" as AttentionEventType;
    const dedupeKey = `SUBMISSION_RECORDED:${submission.id}`;
    const tenderTitle =
      orgTender.tender.title?.trim() ||
      orgTender.tender.referenceNumber ||
      attentionTitleFor(type, "CONFIRMED");
    const attention = await tx.organizationAttentionEvent.create({
      data: {
        organizationId: input.organizationId,
        organizationTenderId: orgTender.id,
        type,
        title: tenderTitle,
        dedupeKey,
        metadata: {
          submissionId: submission.id,
          method: input.submissionMethod,
          externalReference: input.externalReference ?? null,
          tenderTitle: orgTender.tender.title ?? null,
          referenceNumber: orgTender.tender.referenceNumber,
          recordType: orgTender.tender.recordType,
          authority: orgTender.tender.contractingAuthority ?? null,
        },
      },
    });

    return { submission, organizationTender, attentionId: attention.id };
  });

  await pruneAttentionEventsForOrg(prisma, input.organizationId);
  queueAttentionEmail(prisma, result.attentionId);
  return result;
};

/**
 * User-confirmed award outcome. Completes the procurement thread and stops
 * related-act monitoring (North Star: stop when completed).
 */
export const confirmSubmissionResult = async (
  prisma: PrismaClient,
  input: {
    userId: string;
    organizationId: string;
    submissionId: string;
    result: "WON" | "LOST";
    notes?: string | null;
  },
) => {
  await requireOrgMembership(prisma, input.userId, input.organizationId);

  const submission = await prisma.submission.findFirst({
    where: {
      id: input.submissionId,
      organizationId: input.organizationId,
    },
    include: {
      organizationTender: { include: { tender: true } },
    },
  });
  if (!submission) throw notFound("submission_not_found");

  const now = new Date();
  const pipelineStage = input.result === "WON" ? "WON" : "LOST";

  const updated = await prisma.$transaction(async (tx) => {
    const nextSubmission = await tx.submission.update({
      where: { id: submission.id },
      data: {
        result: input.result,
        ...(input.notes != null
          ? { notes: input.notes.trim() || null }
          : {}),
      },
    });

    const organizationTender = await tx.organizationTender.update({
      where: { id: submission.organizationTenderId },
      data: {
        pipelineStage,
        operationalStatus: input.result,
        following: false,
        monitoringActive: false,
        monitoringStoppedAt: now,
      },
    });

    await tx.tenderEvent.create({
      data: {
        organizationId: input.organizationId,
        organizationTenderId: submission.organizationTenderId,
        eventType: "RESULT_CONFIRMED",
        note: JSON.stringify({
          submissionId: submission.id,
          result: input.result,
          notes: input.notes?.trim() || null,
        }),
      },
    });

    return { submission: nextSubmission, organizationTender };
  });

  return updated;
};

export const listFormalSubmissions = async (
  prisma: PrismaClient,
  input: { userId: string; organizationId: string | null },
) => {
  const { organizationId } = await requireOrgMembership(
    prisma,
    input.userId,
    input.organizationId,
  );
  const rows = await prisma.submission.findMany({
    where: { organizationId },
    orderBy: { submittedAt: "desc" },
    include: {
      organizationTender: { include: { tender: true } },
    },
  });
  const userIds = [
    ...new Set(
      rows
        .map((row) => row.submittedByUserId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const users =
    userIds.length === 0
      ? []
      : await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true, email: true },
        });
  const userById = new Map(users.map((user) => [user.id, user]));

  return rows.map((row) => ({
    id: row.id,
    submittedAt: row.submittedAt,
    submissionMethod: row.submissionMethod,
    recipient: row.recipient,
    amountWithoutVat: row.amountWithoutVat,
    amountWithVat: row.amountWithVat,
    externalReference: row.externalReference,
    notes: row.notes,
    result: row.result,
    attachments: row.attachments,
    submittedByUserId: row.submittedByUserId,
    submittedBy: row.submittedByUserId
      ? (userById.get(row.submittedByUserId) ?? null)
      : null,
    tender: {
      id: row.organizationTender.tender.id,
      referenceNumber: row.organizationTender.tender.referenceNumber,
      recordType: row.organizationTender.tender.recordType,
      title: row.organizationTender.tender.title,
      contractingAuthority: row.organizationTender.tender.contractingAuthority,
    },
    monitoringActive: row.organizationTender.monitoringActive,
  }));
};
