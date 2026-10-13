import type { PrismaClient } from "@prisma/client";
import {
  discoverRelatedProcsFromPublicUi,
  type DiscoveredRelatedAct,
} from "../services/related-acts.js";
import { loadRelatedProcFlagsByTenderIds } from "../services/related-proc-flags.js";
import { upsertCanonicalTender } from "../services/tenders.js";

/**
 * Bounded public-UI check for opportunity REQs that are not yet followed.
 * Creates RelatedActLink rows so Search / Opportunities / Saved Searches can
 * show the «Έχει ήδη πρόσκληση» badge without requiring monitoring first.
 */
export const discoverOpportunityRelatedProcs = async (
  prisma: PrismaClient,
  options?: {
    limit?: number;
    discoverFromPublicUi?: typeof discoverRelatedProcsFromPublicUi;
  },
): Promise<{ checked: number; linksUpserted: number }> => {
  const limit = Math.max(1, Math.min(options?.limit ?? 25, 50));
  const discoverFromPublicUi =
    options?.discoverFromPublicUi ?? discoverRelatedProcsFromPublicUi;

  const candidates = await prisma.organizationTender.findMany({
    where: {
      pipelineStage: { not: "DISMISSED" },
      monitoringActive: false,
      tender: { recordType: "REQ" },
      OR: [
        { score: { not: null } },
        { watchProfileId: { not: null } },
      ],
    },
    select: { tenderId: true, lastRelatedCheckAt: true },
    orderBy: [{ lastRelatedCheckAt: "asc" }, { updatedAt: "asc" }],
    take: Math.max(limit * 8, 80),
  });

  const tenderIds: string[] = [];
  const seen = new Set<string>();
  for (const row of candidates) {
    if (seen.has(row.tenderId)) continue;
    seen.add(row.tenderId);
    tenderIds.push(row.tenderId);
  }
  if (tenderIds.length === 0) return { checked: 0, linksUpserted: 0 };

  const existingFlags = await loadRelatedProcFlagsByTenderIds(prisma, tenderIds);
  const pendingIds = tenderIds
    .filter((id) => !existingFlags.get(id)?.invitationIssued)
    .slice(0, limit);

  let linksUpserted = 0;
  const now = new Date();

  for (const tenderId of pendingIds) {
    const sourceTender = await prisma.tender.findUnique({
      where: { id: tenderId },
    });
    if (!sourceTender || sourceTender.recordType !== "REQ") continue;

    let discoveries: DiscoveredRelatedAct[] = [];
    try {
      discoveries = await discoverFromPublicUi(sourceTender);
    } catch {
      discoveries = [];
    }

    for (const discovery of discoveries) {
      const target = await upsertCanonicalTender(prisma, {
        referenceNumber: discovery.target.referenceNumber,
        recordType: discovery.target.recordType,
        title: discovery.target.title,
        contractingAuthority: discovery.target.contractingAuthority,
        parentTenderId: tenderId,
        now,
      });

      const existing = await prisma.relatedActLink.findUnique({
        where: {
          sourceTenderId_targetTenderId_relationType: {
            sourceTenderId: tenderId,
            targetTenderId: target.id,
            relationType: discovery.relationType,
          },
        },
      });
      if (existing?.confidence === "DISMISSED") continue;

      await prisma.relatedActLink.upsert({
        where: {
          sourceTenderId_targetTenderId_relationType: {
            sourceTenderId: tenderId,
            targetTenderId: target.id,
            relationType: discovery.relationType,
          },
        },
        create: {
          sourceTenderId: tenderId,
          targetTenderId: target.id,
          relationType: discovery.relationType,
          confidence: discovery.confidence,
          detectionMethod: discovery.detectionMethod,
          confirmedAt: discovery.confidence === "CONFIRMED" ? now : null,
        },
        update: {
          confidence: discovery.confidence,
          detectionMethod: discovery.detectionMethod,
          confirmedAt:
            discovery.confidence === "CONFIRMED"
              ? (existing?.confirmedAt ?? now)
              : existing?.confirmedAt ?? undefined,
        },
      });
      linksUpserted += 1;
    }

    await prisma.organizationTender.updateMany({
      where: { tenderId },
      data: {
        lastRelatedCheckAt: now,
        ...(discoveries.length
          ? { latestRelatedActAt: now }
          : {}),
      },
    });
  }

  return { checked: pendingIds.length, linksUpserted };
};
