import type {
  PrismaClient,
  RecordType,
  RelationConfidence,
  Tender,
} from "@prisma/client";
import {
  matchProcToReqs,
  type RelationCandidate,
} from "../../relations/req-proc-match.js";
import { requireOrgMembership } from "../auth/org-context.js";
import { badRequest, notFound } from "../errors.js";

export type DiscoveredRelatedAct = {
  sourceTenderId: string;
  target: {
    referenceNumber: string;
    recordType: RecordType;
    title?: string | null;
    contractingAuthority?: string | null;
    parentTenderId?: string | null;
  };
  relationType: string;
  confidence: RelationConfidence;
  detectionMethod: string;
};

const asStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.map((v) => String(v)).filter(Boolean) : [];

export const tenderToRelationCandidate = (
  tender: Tender,
  opts?: { watched?: boolean },
): RelationCandidate => ({
  referenceNumber: tender.referenceNumber,
  recordType: tender.recordType,
  title: tender.title,
  organization: tender.contractingAuthority,
  budgetWithoutVat: tender.budgetWithoutVat,
  cpvs: asStringArray(tender.cpvs),
  description: "",
  submissionDate: tender.submissionDate?.toISOString() ?? null,
  watched: opts?.watched,
});

const mapMatchToSaasConfidence = (
  method: string | null,
  confidence: "HIGH" | "MEDIUM" | "LOW" | null,
): RelationConfidence | null => {
  if (method === "EXPLICIT_REFERENCE") return "CONFIRMED";
  if (confidence === "HIGH") return "LIKELY";
  if (confidence === "MEDIUM") return "POSSIBLE";
  return null;
};

/**
 * Heuristic discovery: among local PROC tenders, find likely children of a
 * monitored REQ using the shared REQ↔PROC scorer (no AI).
 */
export const discoverRelatedProcsFromLocalDb = async (
  prisma: PrismaClient,
  sourceTender: Tender,
  opts?: { watched?: boolean },
): Promise<DiscoveredRelatedAct[]> => {
  if (sourceTender.recordType !== "REQ") return [];
  const authority = sourceTender.contractingAuthority?.trim();
  if (!authority) return [];

  const procs = await prisma.tender.findMany({
    where: {
      recordType: "PROC",
      id: { not: sourceTender.id },
      contractingAuthority: { equals: authority, mode: "insensitive" },
    },
    take: 80,
    orderBy: [{ submissionDate: "desc" }, { firstSeenAt: "desc" }],
  });
  if (procs.length === 0) return [];

  const reqCandidate = tenderToRelationCandidate(sourceTender, {
    watched: opts?.watched,
  });
  const out: DiscoveredRelatedAct[] = [];

  for (const proc of procs) {
    const result = matchProcToReqs(
      tenderToRelationCandidate(proc),
      [reqCandidate],
      { corpusText: `${proc.title ?? ""}\n${proc.referenceNumber}` },
    );
    if (result.decision === "NO_LINK" || !result.parentAdam) continue;
    if (
      result.parentAdam.toUpperCase() !==
      sourceTender.referenceNumber.toUpperCase()
    ) {
      continue;
    }
    const confidence = mapMatchToSaasConfidence(
      result.method,
      result.confidence,
    );
    if (!confidence) continue;

    out.push({
      sourceTenderId: sourceTender.id,
      target: {
        referenceNumber: proc.referenceNumber,
        recordType: "PROC",
        title: proc.title,
        contractingAuthority: proc.contractingAuthority,
        parentTenderId:
          confidence === "CONFIRMED" ? sourceTender.id : proc.parentTenderId,
      },
      relationType: "REQ_TO_PROC",
      confidence,
      detectionMethod:
        result.method === "EXPLICIT_REFERENCE"
          ? "explicit_reference"
          : "inferred_local_scorer",
    });
  }

  return out;
};

const assertOrgOwnsSourceThread = async (
  prisma: PrismaClient,
  input: { organizationId: string; sourceTenderId: string },
) => {
  const orgTender = await prisma.organizationTender.findUnique({
    where: {
      organizationId_tenderId: {
        organizationId: input.organizationId,
        tenderId: input.sourceTenderId,
      },
    },
  });
  if (!orgTender) throw notFound("organization_tender_not_found");
  return orgTender;
};

/**
 * User confirms a possible/likely related act for their monitored thread.
 * Canonical link becomes CONFIRMED (shared globally — intentional).
 */
export const confirmRelatedActLink = async (
  prisma: PrismaClient,
  input: {
    userId: string;
    organizationId: string | null;
    relatedActLinkId: string;
  },
) => {
  const { organizationId, userId } = await requireOrgMembership(
    prisma,
    input.userId,
    input.organizationId,
  );

  const link = await prisma.relatedActLink.findUnique({
    where: { id: input.relatedActLinkId },
    include: { sourceTender: true, targetTender: true },
  });
  if (!link) throw notFound("related_act_link_not_found");
  if (link.confidence === "DISMISSED") {
    throw badRequest("related_act_already_dismissed");
  }

  const orgTender = await assertOrgOwnsSourceThread(prisma, {
    organizationId,
    sourceTenderId: link.sourceTenderId,
  });

  const now = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.relatedActLink.update({
      where: { id: link.id },
      data: {
        confidence: "CONFIRMED",
        confirmedAt: now,
      },
      include: { targetTender: true, sourceTender: true },
    });

    if (!next.targetTender.parentTenderId) {
      await tx.tender.update({
        where: { id: next.targetTenderId },
        data: { parentTenderId: next.sourceTenderId },
      });
    }

    await tx.tenderEvent.create({
      data: {
        organizationId,
        organizationTenderId: orgTender.id,
        eventType: "RELATED_ACT_CONFIRMED",
        note: JSON.stringify({
          relatedActLinkId: link.id,
          targetAdam: link.targetTender.referenceNumber,
          targetRecordType: link.targetTender.recordType,
        }),
      },
    });

    return next;
  });

  void userId;
  return updated;
};

/**
 * User dismisses a suggested related act — excluded from future attention.
 */
export const dismissRelatedActLink = async (
  prisma: PrismaClient,
  input: {
    userId: string;
    organizationId: string | null;
    relatedActLinkId: string;
  },
) => {
  const { organizationId, userId } = await requireOrgMembership(
    prisma,
    input.userId,
    input.organizationId,
  );

  const link = await prisma.relatedActLink.findUnique({
    where: { id: input.relatedActLinkId },
    include: { targetTender: true },
  });
  if (!link) throw notFound("related_act_link_not_found");

  const orgTender = await assertOrgOwnsSourceThread(prisma, {
    organizationId,
    sourceTenderId: link.sourceTenderId,
  });

  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.relatedActLink.update({
      where: { id: link.id },
      data: { confidence: "DISMISSED", confirmedAt: null },
      include: { targetTender: true, sourceTender: true },
    });

    await tx.tenderEvent.create({
      data: {
        organizationId,
        organizationTenderId: orgTender.id,
        eventType: "RELATED_ACT_DISMISSED",
        note: JSON.stringify({
          relatedActLinkId: link.id,
          targetAdam: link.targetTender.referenceNumber,
          targetRecordType: link.targetTender.recordType,
        }),
      },
    });

    return next;
  });

  void userId;
  return updated;
};
