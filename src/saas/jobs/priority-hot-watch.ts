import type { PrismaClient } from "@prisma/client";
import { trackProductEventSafe } from "../ops/product-events.js";
import { PRIORITY_CHECK_INTERVAL_MS } from "../services/priority-monitoring.js";
import { monitorFollowedThreads } from "./monitor-followed-threads.js";

const HOT_WATCH_META_KEY = "saas.hotWatch.lastCycle";
let hotWatchRunning = false;

const writeMeta = async (prisma: PrismaClient, key: string, value: string) => {
  await prisma.ingestionMeta.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
};

/**
 * Shared Hot Watch worker for Pro Priority Monitoring.
 *
 * Dedupes by tender ID: many orgs following the same REQ → one relation check,
 * then existing monitorFollowedThreads fans out attention per org.
 *
 * Interval target: ~60s. Does not replace shared KIMDIS ingest.
 */
export const runPriorityHotWatch = async (
  prisma: PrismaClient,
): Promise<{
  ok: boolean;
  dueMonitors: number;
  distinctTenders: number;
  relatedLinksUpserted: number;
  attentionEventsCreated: number;
  skipped?: string;
  durationMs: number;
}> => {
  const started = Date.now();
  if (hotWatchRunning) {
    return {
      ok: false,
      dueMonitors: 0,
      distinctTenders: 0,
      relatedLinksUpserted: 0,
      attentionEventsCreated: 0,
      skipped: "already_running",
      durationMs: 0,
    };
  }
  hotWatchRunning = true;
  try {
    const now = new Date();
    const due = await prisma.organizationTender.findMany({
      where: {
        monitoringPriority: "PRIORITY",
        monitoringActive: true,
        pipelineStage: { notIn: ["WON", "LOST", "CLOSED", "DISMISSED"] },
        OR: [
          { nextPriorityCheckAt: null },
          { nextPriorityCheckAt: { lte: now } },
        ],
      },
      select: {
        id: true,
        organizationId: true,
        tenderId: true,
      },
      take: 200,
      orderBy: [{ nextPriorityCheckAt: "asc" }, { updatedAt: "asc" }],
    });

    const tenderIds = [...new Set(due.map((row) => row.tenderId))];
    let relatedLinksUpserted = 0;
    let attentionEventsCreated = 0;

    if (tenderIds.length > 0) {
      // Restrict monitorFollowedThreads to these source tenders via loading
      // only matching active rows — pass discoveries empty and rely on the
      // job's internal query. Narrow by temporarily checking only due tender IDs:
      const result = await monitorFollowedThreads(prisma, {
        enableLocalDiscovery: true,
        enablePublicUiDiscovery: true,
        // Only evaluate due priority sources (filter inside by tender id set).
        sourceTenderIds: tenderIds,
      });
      relatedLinksUpserted = result.relatedLinksUpserted;
      attentionEventsCreated = result.attentionEventsCreated;
    }

    const nextAt = new Date(now.getTime() + PRIORITY_CHECK_INTERVAL_MS);
    if (due.length > 0) {
      await prisma.organizationTender.updateMany({
        where: { id: { in: due.map((row) => row.id) } },
        data: {
          lastPriorityCheckAt: now,
          nextPriorityCheckAt: nextAt,
          lastRelatedCheckAt: now,
          priorityMonitoringLastError: null,
        },
      });
    }

    const durationMs = Date.now() - started;
    await writeMeta(
      prisma,
      HOT_WATCH_META_KEY,
      JSON.stringify({
        at: new Date().toISOString(),
        dueMonitors: due.length,
        distinctTenders: tenderIds.length,
        relatedLinksUpserted,
        attentionEventsCreated,
        durationMs,
      }),
    );

    if (attentionEventsCreated > 0) {
      trackProductEventSafe(prisma, {
        type: "related_proc_detected",
        metadata: {
          attentionEventsCreated,
          distinctTenders: tenderIds.length,
          detectionMethod: "priority_hot_watch",
        },
      });
    }

    return {
      ok: true,
      dueMonitors: due.length,
      distinctTenders: tenderIds.length,
      relatedLinksUpserted,
      attentionEventsCreated,
      durationMs,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "hot_watch_failed";
    await writeMeta(
      prisma,
      HOT_WATCH_META_KEY,
      JSON.stringify({ at: new Date().toISOString(), error: message }),
    );
    return {
      ok: false,
      dueMonitors: 0,
      distinctTenders: 0,
      relatedLinksUpserted: 0,
      attentionEventsCreated: 0,
      skipped: message,
      durationMs: Date.now() - started,
    };
  } finally {
    hotWatchRunning = false;
  }
};

export const getHotWatchStatus = async (prisma: PrismaClient) => {
  const row = await prisma.ingestionMeta.findUnique({
    where: { key: HOT_WATCH_META_KEY },
  });
  const active = await prisma.organizationTender.count({
    where: {
      monitoringPriority: "PRIORITY",
      monitoringActive: true,
    },
  });
  let lastCycle: Record<string, unknown> | null = null;
  if (row?.value) {
    try {
      lastCycle = JSON.parse(row.value) as Record<string, unknown>;
    } catch {
      lastCycle = null;
    }
  }
  return { activePriorityMonitors: active, lastCycle };
};
