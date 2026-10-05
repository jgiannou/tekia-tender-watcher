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
  pruneAttentionEventsForOrg,
} from "../services/attention.js";
import { queueAttentionEmail } from "../services/notify.js";
import {
  discoverRelatedProcsFromLocalDb,
  type DiscoveredRelatedAct,
} from "../services/related-acts.js";
import { upsertCanonicalTender } from "../services/tenders.js";

export type { DiscoveredRelatedAct };

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

const confidenceRank = (value: RelationConfidence): number => {
  switch (value) {
    case "CONFIRMED":
      return 3;
    case "LIKELY":
      return 2;
    case "POSSIBLE":
      return 1;
    case "DISMISSED":
      return 0;
    default:
      return 0;
  }
};

/**
 * Continuous monitoring for followed / outreach / preparing / submitted threads.
 *
 * Scalability rule: dedupe work by canonical Tender.
 * N OrganizationTenders on the same REQ → 1 upstream check → 1 RelatedActLink → N attention events.
 *
 * No Slack. Brevo email is queued via NotificationDelivery when a new
 * attention event is created (see queueAttentionEmail).
 */
export const monitorFollowedThreads = async (
  prisma: PrismaClient,
  options?: {
    discoveries?: DiscoveredRelatedAct[];
    /** When false, skip local heuristic discovery (tests that inject discoveries only). */
    enableLocalDiscovery?: boolean;
  },
): Promise<MonitorFollowedThreadsResult> => {
  const enableLocalDiscovery = options?.enableLocalDiscovery !== false;
  const active = await prisma.organizationTender.findMany({
    where: {
      monitoringActive: true,
      monitoringStoppedAt: null,
    },
    select: {
      id: true,
      organizationId: true,
      tenderId: true,
      following: true,
      pipelineStage: true,
      outreachLedger: { select: { status: true } },
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

    // 3) Local heuristic discovery (REQ → PROC) from tenders already in DB
    if (enableLocalDiscovery && sourceTender?.recordType === "REQ") {
      const watched = active.some(
        (row) =>
          row.tenderId === sourceTenderId &&
          (row.outreachLedger?.status === "SENT" ||
            row.pipelineStage === "OUTREACH_SENT" ||
            row.following),
      );
      const local = await discoverRelatedProcsFromLocalDb(prisma, sourceTender, {
        watched,
      });
      for (const discovery of local) {
        const target = await upsertCanonicalTender(prisma, {
          referenceNumber: discovery.target.referenceNumber,
          recordType: discovery.target.recordType,
          title: discovery.target.title,
          contractingAuthority: discovery.target.contractingAuthority,
          parentTenderId:
            discovery.confidence === "CONFIRMED"
              ? (discovery.target.parentTenderId ?? sourceTenderId)
              : discovery.target.parentTenderId ?? undefined,
          now,
        });
        candidates.push({
          targetTender: target,
          relationType: discovery.relationType,
          confidence: discovery.confidence,
          detectionMethod: discovery.detectionMethod,
        });
      }
    }

    // 4) Injected discoveries (tests / future official KIMDIS relation fetch)
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

    // Dedupe candidate targets for this source (keep strongest confidence)
    const bestByTarget = new Map<
      string,
      {
        targetTender: Tender;
        relationType: string;
        confidence: RelationConfidence;
        detectionMethod: string;
      }
    >();
    for (const candidate of candidates) {
      const prev = bestByTarget.get(candidate.targetTender.id);
      if (
        !prev ||
        confidenceRank(candidate.confidence) > confidenceRank(prev.confidence)
      ) {
        bestByTarget.set(candidate.targetTender.id, candidate);
      }
    }

    for (const candidate of bestByTarget.values()) {
      const existing = await prisma.relatedActLink.findUnique({
        where: {
          sourceTenderId_targetTenderId_relationType: {
            sourceTenderId,
            targetTenderId: candidate.targetTender.id,
            relationType: candidate.relationType,
          },
        },
      });

      // Never resurrect a user-dismissed link via auto discovery.
      if (existing?.confidence === "DISMISSED") continue;

      const nextConfidence =
        existing &&
        confidenceRank(existing.confidence) > confidenceRank(candidate.confidence)
          ? existing.confidence
          : candidate.confidence;

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
          confidence: nextConfidence,
          detectionMethod: candidate.detectionMethod,
          confirmedAt: nextConfidence === "CONFIRMED" ? now : null,
        },
        update: {
          confidence: nextConfidence,
          detectionMethod: candidate.detectionMethod,
          confirmedAt:
            nextConfidence === "CONFIRMED"
              ? (existing?.confirmedAt ?? now)
              : existing?.confirmedAt ?? undefined,
        },
      });
      relatedLinksUpserted += 1;

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
      const touchedOrgs = new Set<string>();
      for (const orgTender of affected) {
        try {
          const event = await prisma.organizationAttentionEvent.create({
            data: {
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
                sourceReferenceNumber: sourceTender?.referenceNumber ?? null,
                sourceRecordType: sourceTender?.recordType ?? null,
              },
            },
          });
          attentionEventsCreated += 1;
          touchedOrgs.add(orgTender.organizationId);
          queueAttentionEmail(prisma, event.id);
        } catch (error) {
          if (
            error &&
            typeof error === "object" &&
            "code" in error &&
            (error as { code?: string }).code === "P2002"
          ) {
            continue;
          }
          throw error;
        }
      }
      for (const organizationId of touchedOrgs) {
        await pruneAttentionEventsForOrg(prisma, organizationId);
      }

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

    if (bestByTarget.size === 0) {
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
