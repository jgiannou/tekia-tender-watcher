import type { PrismaClient, WatchProfile } from "@prisma/client";
import type { KimdisClient } from "../../kimdis/client.js";
import { evaluateRegionGate } from "../geo/nuts.js";
import { athensDateKey } from "../services/digest-hours.js";
import { fetchRecentActs } from "../services/kimdis-acts.js";
import type { KimdisSearchItem } from "../services/kimdis-search.js";
import { queueAttentionPush } from "../services/push.js";
import {
  criteriaFromWatchProfile,
  scoreKimdisItemAgainstProfile,
} from "../services/watch-match.js";
import { upsertOpportunityFromProfileMatch } from "../services/watch-profiles.js";
import { upsertTenderFromKimdisItem } from "../services/upsert-tender.js";
import { monitorFollowedThreads } from "./monitor-followed-threads.js";

const SUCCESS_KEY = "saas.ingest.lastSuccessAt";
const ERROR_KEY = "saas.ingest.lastError";
const STARTED_KEY = "saas.ingest.lastStartedAt";
const SWEEP_KEY = "saas.ingest.lastContractSweepAt";

let ingestRunning = false;

const writeMeta = async (prisma: PrismaClient, key: string, value: string) => {
  await prisma.ingestionMeta.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
};

const readMeta = async (prisma: PrismaClient, key: string): Promise<string | null> => {
  const row = await prisma.ingestionMeta.findUnique({ where: { key } });
  return row?.value ?? null;
};

export const getSharedIngestStatus = async (prisma: PrismaClient) => {
  const [lastSuccessAt, lastError, lastStartedAt] = await Promise.all([
    readMeta(prisma, SUCCESS_KEY),
    readMeta(prisma, ERROR_KEY),
    readMeta(prisma, STARTED_KEY),
  ]);
  const successMs = lastSuccessAt ? Date.parse(lastSuccessAt) : NaN;
  const fresh = Number.isFinite(successMs) && Date.now() - successMs < 10 * 60 * 1000;
  return { lastSuccessAt, lastError, lastStartedAt, fresh };
};

const linkParents = async (
  prisma: PrismaClient,
  tenderId: string,
  parentAdams: string[],
) => {
  for (const adam of parentAdams) {
    const parent = await prisma.tender.findUnique({
      where: { referenceNumber: adam },
      select: { id: true },
    });
    if (!parent || parent.id === tenderId) continue;
    await prisma.tender.update({
      where: { id: tenderId },
      data: { parentTenderId: parent.id },
    });
    return;
  }
};

const notifyUrgentDeadlines = async (prisma: PrismaClient) => {
  const now = new Date();
  const horizon = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
  const dateKey = athensDateKey(now);
  const rows = await prisma.organizationTender.findMany({
    where: {
      OR: [{ following: true }, { monitoringActive: true }],
      tender: { finalSubmissionDate: { gte: now, lte: horizon } },
    },
    select: {
      id: true,
      organizationId: true,
      tender: { select: { referenceNumber: true, title: true, finalSubmissionDate: true } },
    },
  });

  for (const row of rows) {
    const dedupeKey = `DEADLINE_APPROACHING:${row.id}:${dateKey}`;
    const existing = await prisma.organizationAttentionEvent.findUnique({
      where: {
        organizationId_dedupeKey: {
          organizationId: row.organizationId,
          dedupeKey,
        },
      },
      select: { id: true },
    });
    if (existing) continue;
    const created = await prisma.organizationAttentionEvent.create({
      data: {
        organizationId: row.organizationId,
        organizationTenderId: row.id,
        type: "DEADLINE_APPROACHING",
        title: `Προθεσμία εντός 48 ωρών · ${row.tender.referenceNumber}`,
        dedupeKey,
        metadata: {
          referenceNumber: row.tender.referenceNumber,
          finalSubmissionDate: row.tender.finalSubmissionDate?.toISOString() ?? null,
          urgent: true,
        },
      },
    });
    queueAttentionPush(prisma, created.id);
  }
};

const matchNewActs = async (
  prisma: PrismaClient,
  items: KimdisSearchItem[],
) => {
  const profiles = await prisma.watchProfile.findMany({
    where: { enabled: true },
  });
  const unclassified = new Map<string, number>();

  for (const item of items) {
    if (item.recordType !== "REQ" && item.recordType !== "PROC") continue;
    for (const profile of profiles) {
      const criteria = criteriaFromWatchProfile(profile);
      const gate = evaluateRegionGate(
        item.nutsCode,
        criteria.regions ?? [],
        criteria.includeUnclassifiedRegion ?? false,
      );
      if (gate === "unclassified") {
        unclassified.set(profile.id, (unclassified.get(profile.id) ?? 0) + 1);
        continue;
      }
      if (gate === "out_of_region") continue;
      const recordTypes = criteria.recordTypes.length
        ? criteria.recordTypes
        : ["REQ", "PROC"];
      if (!recordTypes.includes(item.recordType)) continue;
      const match = scoreKimdisItemAgainstProfile(criteria, item, {
        id: profile.id,
        name: profile.name,
      });
      if (!match.qualifies) continue;
      await upsertOpportunityFromProfileMatch(prisma, {
        organizationId: profile.organizationId,
        profile,
        item,
        match,
        emitAttention: true,
      });
    }
  }

  await Promise.all(
    [...unclassified.entries()].map(([id, count]) =>
      prisma.watchProfile.update({
        where: { id },
        data: { unclassifiedRegionCount: count },
      }),
    ),
  );
};

const persistActs = async (prisma: PrismaClient, items: KimdisSearchItem[]) => {
  for (const item of items) {
    const tender = await upsertTenderFromKimdisItem(prisma, item);
    if (item.parentAdams?.length) {
      await linkParents(prisma, tender.id, item.parentAdams);
    }
  }
};

/**
 * One shared KIMDIS read for every organization.
 * New matches and followed-thread checks happen on this cycle.
 */
export const runSharedKimdisIngest = async (
  prisma: PrismaClient,
  kimdis: KimdisClient | undefined,
): Promise<{ ok: boolean; fetched: number; skipped?: string }> => {
  if (!kimdis) return { ok: false, fetched: 0, skipped: "kimdis_unconfigured" };
  if (ingestRunning) return { ok: false, fetched: 0, skipped: "already_running" };
  ingestRunning = true;
  await writeMeta(prisma, STARTED_KEY, new Date().toISOString());
  try {
    const items = await fetchRecentActs(kimdis, { days: 2, pages: 2 });
    await persistActs(prisma, items);
    await matchNewActs(prisma, items);
    await monitorFollowedThreads(prisma);
    await notifyUrgentDeadlines(prisma);

    const lastSweep = await readMeta(prisma, SWEEP_KEY);
    const sweepMs = lastSweep ? Date.parse(lastSweep) : 0;
    if (!Number.isFinite(sweepMs) || Date.now() - sweepMs > 20 * 60 * 60 * 1000) {
      const contracts = await fetchRecentActs(kimdis, {
        days: 180,
        pages: 4,
        recordTypes: ["CONTRACT"],
      });
      await persistActs(prisma, contracts);
      await writeMeta(prisma, SWEEP_KEY, new Date().toISOString());
    }

    await writeMeta(prisma, SUCCESS_KEY, new Date().toISOString());
    await writeMeta(prisma, ERROR_KEY, "");
    return { ok: true, fetched: items.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : "ingest_failed";
    await writeMeta(prisma, ERROR_KEY, message);
    return { ok: false, fetched: 0, skipped: message };
  } finally {
    ingestRunning = false;
  }
};

export type { WatchProfile };
