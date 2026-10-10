import type { PrismaClient, WatchProfile } from "@prisma/client";
import type { KimdisClient } from "../../kimdis/client.js";
import { evaluateRegionGate } from "../geo/nuts.js";
import { athensDateKey } from "../services/digest-hours.js";
import {
  dedupeKimdisItems,
  fetchRecentActs,
  type KimdisFetchCheckpoint,
} from "../services/kimdis-acts.js";
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
const CHECKPOINT_KEY = "saas.ingest.kimdisCheckpoints";
const COMPLETENESS_KEY = "saas.ingest.completeness";

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
  const [lastSuccessAt, lastError, lastStartedAt, completenessRaw] =
    await Promise.all([
      readMeta(prisma, SUCCESS_KEY),
      readMeta(prisma, ERROR_KEY),
      readMeta(prisma, STARTED_KEY),
      readMeta(prisma, COMPLETENESS_KEY),
    ]);
  const successMs = lastSuccessAt ? Date.parse(lastSuccessAt) : NaN;
  const fresh = Number.isFinite(successMs) && Date.now() - successMs < 10 * 60 * 1000;
  let completeness: {
    pageBudgetExhausted: boolean;
    noteEl: string;
  } | null = null;
  if (completenessRaw) {
    try {
      completeness = JSON.parse(completenessRaw) as {
        pageBudgetExhausted: boolean;
        noteEl: string;
      };
    } catch {
      completeness = null;
    }
  }
  return { lastSuccessAt, lastError, lastStartedAt, fresh, completeness };
};

const persistCheckpoints = async (
  prisma: PrismaClient,
  checkpoints: KimdisFetchCheckpoint[],
  pageBudgetExhausted: boolean,
) => {
  await writeMeta(prisma, CHECKPOINT_KEY, JSON.stringify(checkpoints));
  await writeMeta(
    prisma,
    COMPLETENESS_KEY,
    JSON.stringify({
      pageBudgetExhausted,
      noteEl: pageBudgetExhausted
        ? "Ο έλεγχος ΚΗΜΔΗΣ ολοκληρώθηκε με όριο σελίδων· μπορεί να υπάρχει ουρά προς κάλυψη στον επόμενο κύκλο."
        : "Ο έλεγχος ΚΗΜΔΗΣ έφτασε στο τέλος των διαθέσιμων σελίδων για το τρέχον παράθυρο ημερομηνιών.",
      at: new Date().toISOString(),
    }),
  );
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

  if (rows.length === 0) return;

  const dedupeKeys = rows.map(
    (row) => `DEADLINE_APPROACHING:${row.id}:${dateKey}`,
  );
  const existing = await prisma.organizationAttentionEvent.findMany({
    where: { dedupeKey: { in: dedupeKeys } },
    select: { dedupeKey: true },
  });
  const seen = new Set(existing.map((row) => row.dedupeKey));

  for (const row of rows) {
    const dedupeKey = `DEADLINE_APPROACHING:${row.id}:${dateKey}`;
    if (seen.has(dedupeKey)) continue;
    try {
      const created = await prisma.organizationAttentionEvent.create({
        data: {
          organizationId: row.organizationId,
          organizationTenderId: row.id,
          type: "DEADLINE_APPROACHING",
          title: `Προθεσμία εντός 48 ωρών · ${row.tender.referenceNumber}`,
          dedupeKey,
          metadata: {
            referenceNumber: row.tender.referenceNumber,
            finalSubmissionDate:
              row.tender.finalSubmissionDate?.toISOString() ?? null,
            urgent: true,
          },
        },
      });
      seen.add(dedupeKey);
      queueAttentionPush(prisma, created.id);
    } catch {
      // Concurrent ingest cycles may race on the unique dedupe key.
    }
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
  // Reset counters each cycle so stale "χωρίς περιοχή" numbers do not linger.
  if (profiles.length > 0) {
    await prisma.watchProfile.updateMany({
      where: { id: { in: profiles.map((profile) => profile.id) } },
      data: { unclassifiedRegionCount: 0 },
    });
  }

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
    // Catch-up: if last success is older than the 2-day window, widen slightly
    // but keep a hard page budget (never claim pages:N = full history).
    const lastSuccess = await readMeta(prisma, SUCCESS_KEY);
    const lagMs = lastSuccess ? Date.now() - Date.parse(lastSuccess) : 0;
    const catchUp = Number.isFinite(lagMs) && lagMs > 2 * 24 * 60 * 60 * 1000;
    const recent = await fetchRecentActs(kimdis, {
      days: catchUp ? 5 : 2,
      pages: catchUp ? 4 : 2,
    });
    const items = dedupeKimdisItems(recent.items);
    await persistActs(prisma, items);
    await matchNewActs(prisma, items);
    await monitorFollowedThreads(prisma);
    const { monitorTedFollowedNotices } = await import("./monitor-ted-notices.js");
    await monitorTedFollowedNotices(prisma);
    await notifyUrgentDeadlines(prisma);
    await persistCheckpoints(
      prisma,
      recent.checkpoints,
      recent.pageBudgetExhausted,
    );

    const lastSweep = await readMeta(prisma, SWEEP_KEY);
    const sweepMs = lastSweep ? Date.parse(lastSweep) : 0;
    if (!Number.isFinite(sweepMs) || Date.now() - sweepMs > 20 * 60 * 60 * 1000) {
      const contracts = await fetchRecentActs(kimdis, {
        days: 180,
        pages: 4,
        recordTypes: ["CONTRACT"],
      });
      await persistActs(prisma, dedupeKimdisItems(contracts.items));
      await writeMeta(prisma, SWEEP_KEY, new Date().toISOString());
      // Bounded contract sweep is not a complete 180-day history guarantee.
      await persistCheckpoints(
        prisma,
        [...recent.checkpoints, ...contracts.checkpoints],
        recent.pageBudgetExhausted || contracts.pageBudgetExhausted,
      );
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
