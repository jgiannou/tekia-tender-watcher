import type { PrismaClient, RelationConfidence } from "@prisma/client";

export type RelatedProcFlag = {
  /** True when an official PROC invitation is already linked to this REQ. */
  invitationIssued: boolean;
  relatedProcAdam: string | null;
  confidence: RelationConfidence | null;
};

const EMPTY_FLAG: RelatedProcFlag = {
  invitationIssued: false,
  relatedProcAdam: null,
  confidence: null,
};

const confidenceRank = (value: RelationConfidence | null): number => {
  switch (value) {
    case "CONFIRMED":
      return 3;
    case "LIKELY":
      return 2;
    case "POSSIBLE":
      return 1;
    default:
      return 0;
  }
};

const betterFlag = (
  current: RelatedProcFlag | undefined,
  next: RelatedProcFlag,
): RelatedProcFlag => {
  if (!current?.invitationIssued) return next;
  if (!next.invitationIssued) return current;
  return confidenceRank(next.confidence) > confidenceRank(current.confidence)
    ? next
    : current;
};

/**
 * Batch lookup: which REQ tenders already have a published related PROC.
 * Uses RelatedActLink + canonical parentTenderId children (shared globally).
 */
export const loadRelatedProcFlagsByTenderIds = async (
  prisma: PrismaClient,
  tenderIds: string[],
): Promise<Map<string, RelatedProcFlag>> => {
  const map = new Map<string, RelatedProcFlag>();
  const ids = [...new Set(tenderIds.filter(Boolean))];
  if (ids.length === 0) return map;

  const reqs = await prisma.tender.findMany({
    where: { id: { in: ids }, recordType: "REQ" },
    select: { id: true },
  });
  const reqIds = reqs.map((row) => row.id);
  for (const id of ids) map.set(id, EMPTY_FLAG);
  if (reqIds.length === 0) return map;

  const [links, children] = await Promise.all([
    prisma.relatedActLink.findMany({
      where: {
        sourceTenderId: { in: reqIds },
        confidence: { not: "DISMISSED" },
        targetTender: { recordType: "PROC" },
      },
      select: {
        sourceTenderId: true,
        confidence: true,
        targetTender: { select: { referenceNumber: true } },
      },
    }),
    prisma.tender.findMany({
      where: {
        parentTenderId: { in: reqIds },
        recordType: "PROC",
      },
      select: {
        parentTenderId: true,
        referenceNumber: true,
      },
    }),
  ]);

  for (const link of links) {
    const next: RelatedProcFlag = {
      invitationIssued: true,
      relatedProcAdam: link.targetTender.referenceNumber,
      confidence: link.confidence,
    };
    map.set(link.sourceTenderId, betterFlag(map.get(link.sourceTenderId), next));
  }

  for (const child of children) {
    if (!child.parentTenderId) continue;
    const next: RelatedProcFlag = {
      invitationIssued: true,
      relatedProcAdam: child.referenceNumber,
      confidence: "CONFIRMED",
    };
    map.set(child.parentTenderId, betterFlag(map.get(child.parentTenderId), next));
  }

  return map;
};

export const loadRelatedProcFlagsByAdams = async (
  prisma: PrismaClient,
  adams: string[],
): Promise<Map<string, RelatedProcFlag>> => {
  const normalized = [
    ...new Set(
      adams
        .map((adam) => adam.trim().toUpperCase())
        .filter(Boolean),
    ),
  ];
  const byAdam = new Map<string, RelatedProcFlag>();
  if (normalized.length === 0) return byAdam;

  const tenders = await prisma.tender.findMany({
    where: {
      referenceNumber: { in: normalized, mode: "insensitive" },
      recordType: "REQ",
    },
    select: { id: true, referenceNumber: true },
  });
  if (tenders.length === 0) {
    for (const adam of normalized) byAdam.set(adam, EMPTY_FLAG);
    return byAdam;
  }

  const byId = await loadRelatedProcFlagsByTenderIds(
    prisma,
    tenders.map((row) => row.id),
  );
  for (const adam of normalized) byAdam.set(adam, EMPTY_FLAG);
  for (const tender of tenders) {
    byAdam.set(
      tender.referenceNumber.toUpperCase(),
      byId.get(tender.id) ?? EMPTY_FLAG,
    );
  }
  return byAdam;
};

/** Count invitation-issued opportunity matches per watch profile. */
export const countInvitationIssuedByWatchProfile = async (
  prisma: PrismaClient,
  input: { organizationId: string; watchProfileIds: string[] },
): Promise<Map<string, number>> => {
  const counts = new Map<string, number>();
  const profileIds = [...new Set(input.watchProfileIds.filter(Boolean))];
  if (profileIds.length === 0) return counts;

  const rows = await prisma.organizationTender.findMany({
    where: {
      organizationId: input.organizationId,
      watchProfileId: { in: profileIds },
      pipelineStage: { not: "DISMISSED" },
      tender: { recordType: "REQ" },
    },
    select: { id: true, watchProfileId: true, tenderId: true },
  });
  if (rows.length === 0) return counts;

  const flags = await loadRelatedProcFlagsByTenderIds(
    prisma,
    rows.map((row) => row.tenderId),
  );
  for (const row of rows) {
    if (!row.watchProfileId) continue;
    if (!flags.get(row.tenderId)?.invitationIssued) continue;
    counts.set(row.watchProfileId, (counts.get(row.watchProfileId) ?? 0) + 1);
  }
  return counts;
};
