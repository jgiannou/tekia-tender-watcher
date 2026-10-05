import type { AttentionEventType, PrismaClient } from "@prisma/client";
import { requireOrgMembership } from "../auth/org-context.js";
import { notFound } from "../errors.js";
import { attentionTitleFor, pruneAttentionEventsForOrg } from "./attention.js";

export type OutreachDocumentRef = {
  documentId: string;
  documentVersionId: string | null;
  name: string;
  version: number | null;
};

/**
 * Resolves the Company Vault documents referenced by an outreach so the
 * recorded event keeps the exact document identity (name + version).
 */
export const resolveOutreachDocuments = async (
  prisma: PrismaClient,
  input: { organizationId: string; documentIds: string[] },
): Promise<OutreachDocumentRef[]> => {
  if (input.documentIds.length === 0) return [];
  const documents = await prisma.vaultDocument.findMany({
    where: { id: { in: input.documentIds }, organizationId: input.organizationId },
    include: {
      versions: { orderBy: { version: "desc" }, take: 1 },
    },
  });
  if (documents.length !== new Set(input.documentIds).size) {
    throw notFound("vault_document_not_found");
  }
  return documents.map((doc) => ({
    documentId: doc.id,
    documentVersionId: doc.versions[0]?.id ?? null,
    name: doc.name,
    version: doc.versions[0]?.version ?? doc.version,
  }));
};

/**
 * Records early «Εκδήλωση Ενδιαφέροντος».
 * Does NOT create a formal Submission and does NOT set pipeline SUBMITTED.
 */
export const recordOutreachSent = async (
  prisma: PrismaClient,
  input: {
    userId: string;
    organizationId: string;
    tenderId: string;
    sentAt?: Date;
    method?: string | null;
    recipient?: string | null;
    subject?: string | null;
    notes?: string | null;
    externalReference?: string | null;
    documentIds?: string[];
  },
) => {
  await requireOrgMembership(prisma, input.userId, input.organizationId);

  const tender = await prisma.tender.findUnique({
    where: { id: input.tenderId },
  });
  if (!tender) throw notFound("tender_not_found");

  const documents = await resolveOutreachDocuments(prisma, {
    organizationId: input.organizationId,
    documentIds: input.documentIds ?? [],
  });

  const sentAt = input.sentAt ?? new Date();
  const now = new Date();

  const updated = await prisma.$transaction(async (tx) => {
    // Outreach implies following + monitoring, but is NOT submission.
    const orgTender = await tx.organizationTender.upsert({
      where: {
        organizationId_tenderId: {
          organizationId: input.organizationId,
          tenderId: input.tenderId,
        },
      },
      create: {
        organizationId: input.organizationId,
        tenderId: input.tenderId,
        following: true,
        followedAt: now,
        followedByUserId: input.userId,
        pipelineStage: "OUTREACH_SENT",
        operationalStatus: "REVIEW",
        monitoringActive: true,
        monitoringReason: "OUTREACH_SENT",
        monitoringStartedAt: now,
      },
      update: {
        pipelineStage: "OUTREACH_SENT",
        operationalStatus: "REVIEW",
        following: true,
        followedAt: now,
        followedByUserId: input.userId,
        monitoringActive: true,
        monitoringReason: "OUTREACH_SENT",
        monitoringStartedAt: now,
        monitoringStoppedAt: null,
      },
    });

    await tx.outreachLedger.upsert({
      where: { organizationTenderId: orgTender.id },
      create: {
        organizationId: input.organizationId,
        organizationTenderId: orgTender.id,
        status: "SENT",
        subject: input.subject ?? null,
        notes: input.notes ?? null,
        recipient: input.recipient ?? null,
        sentAt,
        payload: {
          method: input.method ?? null,
          recordedByUserId: input.userId,
          externalReference: input.externalReference ?? null,
          documents,
        },
      },
      update: {
        status: "SENT",
        subject: input.subject ?? null,
        notes: input.notes ?? null,
        recipient: input.recipient ?? null,
        sentAt,
        payload: {
          method: input.method ?? null,
          recordedByUserId: input.userId,
          externalReference: input.externalReference ?? null,
          documents,
        },
      },
    });

    await tx.tenderEvent.create({
      data: {
        organizationId: input.organizationId,
        organizationTenderId: orgTender.id,
        eventType: "OUTREACH_SENT",
        note: "Early expression of interest recorded",
      },
    });

    const type = "OUTREACH_RECORDED" as AttentionEventType;
    const dedupeKey = `OUTREACH_RECORDED:${orgTender.id}:${sentAt.toISOString()}`;
    await tx.organizationAttentionEvent.upsert({
      where: {
        organizationId_dedupeKey: {
          organizationId: input.organizationId,
          dedupeKey,
        },
      },
      create: {
        organizationId: input.organizationId,
        organizationTenderId: orgTender.id,
        type,
        title: attentionTitleFor(type, "CONFIRMED"),
        dedupeKey,
        metadata: {
          method: input.method ?? null,
          recipient: input.recipient ?? null,
          documentCount: documents.length,
        },
      },
      update: {},
    });

    return orgTender;
  });

  await pruneAttentionEventsForOrg(prisma, input.organizationId);
  return updated;
};
