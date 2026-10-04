import type { AttentionEventType, PrismaClient } from "@prisma/client";
import { requireOrgMembership } from "../auth/org-context.js";
import { notFound } from "../errors.js";
import { attentionTitleFor } from "./attention.js";

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
  });
  if (!orgTender) throw notFound("organization_tender_not_found");

  const documents = await resolveSubmissionDocuments(prisma, {
    organizationId: input.organizationId,
    documentIds: input.documentIds ?? [],
  });

  const submittedAt = input.submittedAt ?? new Date();
  const now = new Date();

  return prisma.$transaction(async (tx) => {
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
        note: "Formal submission recorded",
      },
    });

    const type = "SUBMISSION_RECORDED" as AttentionEventType;
    const dedupeKey = `SUBMISSION_RECORDED:${submission.id}`;
    await tx.organizationAttentionEvent.create({
      data: {
        organizationId: input.organizationId,
        organizationTenderId: orgTender.id,
        type,
        title: attentionTitleFor(type, "CONFIRMED"),
        dedupeKey,
        metadata: {
          submissionId: submission.id,
          method: input.submissionMethod,
        },
      },
    });

    return { submission, organizationTender };
  });
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
