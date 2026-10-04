import type {
  AttentionEventType,
  PrismaClient,
  RecordType,
  RelationConfidence,
  Tender,
} from "@prisma/client";
import {
  attentionDedupeKey,
  attentionTitleFor,
} from "../services/attention.js";
import { upsertCanonicalTender } from "../services/tenders.js";

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

export type MonitorFollowedThreadsResult = {
  activeOrganizationTenders: number;
  canonicalSourcesChecked: number;
  relatedLinksUpserted: number;
  attentionEventsCreated: number;
  /** Counts how many source tenders were processed once (dedupe proof). */
  upstreamOperations: number;
};

const attentionTypeForTarget = (
  recordType: RecordType,
  relationType: string,
): AttentionEventType => {
  if (recordType === "AWRD" || relationType === "REQ_TO_AWRD" || relationType === "PROC_TO_AWRD") {
    return "RELATED_AWARD_DISCOVERED";
  }
  if (recordType === "PROC" || relationType === "REQ_TO_PROC") {
    return "RELATED_PROC_DISCOVERED";
  }
  if (relationType === "REQ_TO_APPROVED_REQ") {
    return "RELATED_APPROVED_REQUEST_DISCOVERED";
  }
  if (relationType === "PROC_TO_CONTRACT") {
    return "RELATED_CONTRACT_DISCOVERED";
  }
  return "RELATED_PROC_DISCOVERED";
};

/**
 * Continuous monitoring for followed / outreach / preparing / submitted threads.
 *
 * Scalability rule: dedupe work by canonical Tender.
 * N OrganizationTenders on the same REQ → 1 upstream check → 1 RelatedActLink → N attention events.
 *
 * No Slack. No Brevo. NotificationDelivery is not written here.
 */
export const monitorFollowedThreads = async (
  prisma: PrismaClient,
  options?: {
    discoveries?: DiscoveredRelatedAct[];
  },
): Promise<MonitorFollowedThreadsResult> => {
  const active = await prisma.organizationTender.findMany({
    where: {
      monitoringActive: true,
      monitoringStoppedAt: null,
    },
    select: {
      id: true,
      organizationId: true,
      tenderId: true,
    },
  });

  const sourceIds = [...new Set(active.map((row) => row.tenderId))];
  const now = new Date();
  let relatedLinksUpserted = 0;
  let attentionEventsCreated = 0;
  let upstreamOperations = 0;

  for (const sourceTenderId of sourceIds) {
    upstreamOperations += 1;
    const sourceTender = await prisma.tender.findUnique({
      where: { id: sourceTenderId },
    });

    const candidates: Array<{
      targetTender: Tender;
      relationType: string;
      confidence: RelationConfidence;
      detectionMethod: string;
    }> = [];

    // 1) Existing canonical parent/child links already ingested
    const children = await prisma.tender.findMany({
      where: { parentTenderId: sourceTenderId },
    });
    for (const child of children) {
      candidates.push({
        targetTender: child,
        relationType:
          child.recordType === "PROC"
            ? "REQ_TO_PROC"
            : child.recordType === "AWRD"
              ? "PROC_TO_AWRD"
              : "RELATED",
        confidence: "CONFIRMED",
        detectionMethod: "canonical_parent_link",
      });
    }

    // 2) Existing RelatedActLink rows for this source
    const existingLinks = await prisma.relatedActLink.findMany({
      where: {
        sourceTenderId,
        confidence: { not: "DISMISSED" },
      },
      include: { targetTender: true },
    });
    for (const link of existingLinks) {
      candidates.push({
        targetTender: link.targetTender,
        relationType: link.relationType,
        confidence: link.confidence,
        detectionMethod: link.detectionMethod,
      });
    }

    // 3) Injected discoveries (tests / future official KIMDIS relation fetch)
    for (const discovery of options?.discoveries ?? []) {
      if (discovery.sourceTenderId !== sourceTenderId) continue;
      const target = await upsertCanonicalTender(prisma, {
        referenceNumber: discovery.target.referenceNumber,
        recordType: discovery.target.recordType,
        title: discovery.target.title,
        contractingAuthority: discovery.target.contractingAuthority,
        parentTenderId: discovery.target.parentTenderId ?? sourceTenderId,
        now,
      });
      candidates.push({
        targetTender: target,
        relationType: discovery.relationType,
        confidence: discovery.confidence,
        detectionMethod: discovery.detectionMethod,
      });
    }

    // Dedupe candidate targets for this source
    const seenTargets = new Set<string>();
    for (const candidate of candidates) {
      if (seenTargets.has(candidate.targetTender.id)) continue;
      seenTargets.add(candidate.targetTender.id);

      const link = await prisma.relatedActLink.upsert({
        where: {
          sourceTenderId_targetTenderId_relationType: {
            sourceTenderId,
            targetTenderId: candidate.targetTender.id,
            relationType: candidate.relationType,
          },
        },
        create: {
          sourceTenderId,
          targetTenderId: candidate.targetTender.id,
          relationType: candidate.relationType,
          confidence: candidate.confidence,
          detectionMethod: candidate.detectionMethod,
          confirmedAt:
            candidate.confidence === "CONFIRMED" ? now : null,
        },
        update: {
          confidence: candidate.confidence,
          detectionMethod: candidate.detectionMethod,
          confirmedAt:
            candidate.confidence === "CONFIRMED" ? now : undefined,
        },
      });
      relatedLinksUpserted += 1;

      // Skip dismissed / do not treat DISMISSED as attention
      if (link.confidence === "DISMISSED") continue;

      const type = attentionTypeForTarget(
        candidate.targetTender.recordType,
        candidate.relationType,
      );
      const dedupeKey = attentionDedupeKey(
        type,
        sourceTenderId,
        candidate.targetTender.id,
      );

      const affected = active.filter((row) => row.tenderId === sourceTenderId);
      const relatedTitle =
        candidate.targetTender.title?.trim() ||
        candidate.targetTender.referenceNumber ||
        attentionTitleFor(type, link.confidence);
      const createResult = await prisma.organizationAttentionEvent.createMany({
        data: affected.map((orgTender) => ({
          organizationId: orgTender.organizationId,
          organizationTenderId: orgTender.id,
          relatedTenderId: candidate.targetTender.id,
          relatedActLinkId: link.id,
          type,
          title: relatedTitle,
          dedupeKey,
          metadata: {
            sourceTenderId,
            relatedTenderId: candidate.targetTender.id,
            relationType: candidate.relationType,
            confidence: link.confidence,
            detectionMethod: candidate.detectionMethod,
            referenceNumber: candidate.targetTender.referenceNumber,
            recordType: candidate.targetTender.recordType,
            relatedTenderTitle: candidate.targetTender.title ?? null,
            authority: candidate.targetTender.contractingAuthority ?? null,
            sourceTenderTitle: sourceTender?.title ?? null,
          },
        })),
        skipDuplicates: true,
      });
      attentionEventsCreated += createResult.count;

      await prisma.organizationTender.updateMany({
        where: {
          id: { in: affected.map((row) => row.id) },
        },
        data: {
          lastRelatedCheckAt: now,
          latestRelatedActAt: now,
        },
      });
    }

    // Always stamp lastRelatedCheckAt for sources even when no new acts
    if (candidates.length === 0) {
      await prisma.organizationTender.updateMany({
        where: {
          tenderId: sourceTenderId,
          monitoringActive: true,
        },
        data: { lastRelatedCheckAt: now },
      });
    }
  }

  return {
    activeOrganizationTenders: active.length,
    canonicalSourcesChecked: sourceIds.length,
    relatedLinksUpserted,
    attentionEventsCreated,
    upstreamOperations,
  };
};
