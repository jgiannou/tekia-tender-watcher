import type { PrismaClient, SaasJobStatus } from "@prisma/client";
import { getOutboxMetrics } from "../jobs/outbox.js";
import { getHotWatchStatus } from "../jobs/priority-hot-watch.js";
import { getSharedIngestStatus } from "../jobs/shared-ingest.js";
import { resolveSaasStorageRoot } from "../storage/document-storage.js";

/** In-process PDF extract timings (no document content). */
type PdfTimingBucket = {
  count: number;
  totalMs: number;
  maxMs: number;
  lastMs: number | null;
  byStatus: Record<string, number>;
};

const pdfTimings: PdfTimingBucket = {
  count: 0,
  totalMs: 0,
  maxMs: 0,
  lastMs: null,
  byStatus: {},
};

export const recordPdfExtractTiming = (input: {
  durationMs: number;
  status: string;
}): void => {
  const ms = Math.max(0, Math.round(input.durationMs));
  pdfTimings.count += 1;
  pdfTimings.totalMs += ms;
  pdfTimings.maxMs = Math.max(pdfTimings.maxMs, ms);
  pdfTimings.lastMs = ms;
  pdfTimings.byStatus[input.status] =
    (pdfTimings.byStatus[input.status] ?? 0) + 1;
};

export const getPdfExtractTimingMetrics = () => ({
  count: pdfTimings.count,
  avgMs:
    pdfTimings.count > 0
      ? Math.round(pdfTimings.totalMs / pdfTimings.count)
      : null,
  maxMs: pdfTimings.maxMs || null,
  lastMs: pdfTimings.lastMs,
  byStatus: { ...pdfTimings.byStatus },
});

/** Test-only reset. */
export const __resetPdfExtractTimingForTests = (): void => {
  pdfTimings.count = 0;
  pdfTimings.totalMs = 0;
  pdfTimings.maxMs = 0;
  pdfTimings.lastMs = null;
  pdfTimings.byStatus = {};
};

const countBy = <T extends string>(
  rows: Array<{ key: T; _count: { _all: number } }>,
): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const row of rows) out[String(row.key)] = row._count._all;
  return out;
};

export type PipelineMetrics = {
  generatedAt: string;
  alerts: Array<{ level: "info" | "warn" | "error"; code: string; messageEl: string }>;
  outbox: {
    process: ReturnType<typeof getOutboxMetrics>;
    byStatus: Record<string, number>;
    byType: Record<string, number>;
    pending: number;
    running: number;
    failed: number;
    succeeded: number;
    cancelled: number;
    oldestPendingAgeMs: number | null;
    stuckRunning: number;
    dueNow: number;
    recentFailed: Array<{
      id: string;
      type: string;
      attempts: number;
      lastError: string | null;
      updatedAt: string;
    }>;
  };
  ingest: Awaited<ReturnType<typeof getSharedIngestStatus>> & {
    successAgeMs: number | null;
  };
  hotWatch: Awaited<ReturnType<typeof getHotWatchStatus>>;
  email: {
    last24h: Record<string, number>;
    last7d: Record<string, number>;
    sent24h: number;
    failed24h: number;
    pending24h: number;
    skipped24h: number;
  };
  storage: {
    root: string;
    totalBytesUsed: number;
    documentCount: number;
    orgsWithVault: number;
    noteEl: string;
  };
  pdf: {
    process: ReturnType<typeof getPdfExtractTimingMetrics>;
    tendersByPdfStatus: Record<string, number>;
  };
};

export const collectPipelineMetrics = async (
  prisma: PrismaClient,
): Promise<PipelineMetrics> => {
  const now = Date.now();
  const dayAgo = new Date(now - 24 * 60 * 60 * 1000);
  const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const stuckBefore = new Date(now - 3 * 60 * 1000);

  const [
    statusGroups,
    typeGroups,
    oldestPending,
    stuckRunning,
    dueNow,
    recentFailed,
    ingest,
    hotWatch,
    email24h,
    email7d,
    storageAgg,
    orgsWithVault,
    pdfStatusGroups,
  ] = await Promise.all([
    prisma.saasJob.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.saasJob.groupBy({
      by: ["type"],
      _count: { _all: true },
    }),
    prisma.saasJob.findFirst({
      where: { status: "PENDING" },
      orderBy: { availableAt: "asc" },
      select: { availableAt: true },
    }),
    prisma.saasJob.count({
      where: {
        status: "RUNNING",
        OR: [
          { leaseExpiresAt: { lt: new Date() } },
          { leaseExpiresAt: null, updatedAt: { lt: stuckBefore } },
        ],
      },
    }),
    prisma.saasJob.count({
      where: {
        status: "PENDING",
        availableAt: { lte: new Date() },
      },
    }),
    prisma.saasJob.findMany({
      where: { status: "FAILED" },
      orderBy: { updatedAt: "desc" },
      take: 15,
      select: {
        id: true,
        type: true,
        attempts: true,
        lastError: true,
        updatedAt: true,
      },
    }),
    getSharedIngestStatus(prisma),
    getHotWatchStatus(prisma),
    prisma.notificationDelivery.groupBy({
      by: ["status"],
      where: { createdAt: { gte: dayAgo }, channel: "EMAIL" },
      _count: { _all: true },
    }),
    prisma.notificationDelivery.groupBy({
      by: ["status"],
      where: { createdAt: { gte: weekAgo }, channel: "EMAIL" },
      _count: { _all: true },
    }),
    prisma.vaultDocument.aggregate({
      _sum: { fileSize: true },
      _count: { _all: true },
    }),
    prisma.vaultDocument.groupBy({
      by: ["organizationId"],
      _count: { _all: true },
    }),
    prisma.tender.groupBy({
      by: ["pdfTextStatus"],
      _count: { _all: true },
    }),
  ]);

  const byStatus = countBy(
    statusGroups.map((row) => ({
      key: row.status as SaasJobStatus,
      _count: row._count,
    })),
  );
  const byType = countBy(
    typeGroups.map((row) => ({ key: row.type, _count: row._count })),
  );
  const emailLast24h = countBy(
    email24h.map((row) => ({ key: row.status, _count: row._count })),
  );
  const emailLast7d = countBy(
    email7d.map((row) => ({ key: row.status, _count: row._count })),
  );
  const tendersByPdfStatus = countBy(
    pdfStatusGroups.map((row) => ({
      key: row.pdfTextStatus ?? "null",
      _count: row._count,
    })),
  );

  const successMs = ingest.lastSuccessAt
    ? Date.parse(ingest.lastSuccessAt)
    : NaN;
  const successAgeMs = Number.isFinite(successMs) ? now - successMs : null;
  const oldestPendingAgeMs = oldestPending
    ? Math.max(0, now - oldestPending.availableAt.getTime())
    : null;

  const alerts: PipelineMetrics["alerts"] = [];
  if (ingest.stale || ingest.health === "STALE") {
    alerts.push({
      level: "warn",
      code: "ingest_stale",
      messageEl:
        "Ο έλεγχος ΚΗΜΔΗΣ δεν ολοκληρώθηκε επιτυχώς τα τελευταία 5 λεπτά.",
    });
  } else if (ingest.health === "DEGRADED") {
    alerts.push({
      level: "info",
      code: "ingest_degraded",
      messageEl:
        "Ο έλεγχος ΚΗΜΔΗΣ είναι σε υποβαθμισμένη κατάσταση (όριο σελίδων ή μερική κάλυψη).",
    });
  }
  if (ingest.completeness?.pageBudgetExhausted) {
    alerts.push({
      level: "info",
      code: "ingest_page_budget",
      messageEl:
        ingest.completeness.noteEl ||
        "Ο ingest σταμάτησε λόγω ορίου σελίδων· υπάρχει πιθανή ουρά.",
    });
  }
  if ((byStatus.FAILED ?? 0) > 0) {
    alerts.push({
      level: "error",
      code: "outbox_failed_jobs",
      messageEl: `${byStatus.FAILED} αποτυχημένες εργασίες outbox.`,
    });
  }
  if (stuckRunning > 0) {
    alerts.push({
      level: "warn",
      code: "outbox_stuck_leases",
      messageEl: `${stuckRunning} εργασίες με ληγμένο/κολλημένο lease.`,
    });
  }
  if (oldestPendingAgeMs != null && oldestPendingAgeMs > 10 * 60 * 1000) {
    alerts.push({
      level: "warn",
      code: "outbox_lag",
      messageEl: `Η παλαιότερη pending εργασία έχει καθυστέρηση ${Math.round(oldestPendingAgeMs / 60000)} λεπτά.`,
    });
  }
  if ((emailLast24h.FAILED ?? 0) > 0) {
    alerts.push({
      level: "warn",
      code: "email_failed_24h",
      messageEl: `${emailLast24h.FAILED} αποτυχίες αποστολής email (24ωρο).`,
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    alerts,
    outbox: {
      process: getOutboxMetrics(),
      byStatus,
      byType,
      pending: byStatus.PENDING ?? 0,
      running: byStatus.RUNNING ?? 0,
      failed: byStatus.FAILED ?? 0,
      succeeded: byStatus.SUCCEEDED ?? 0,
      cancelled: byStatus.CANCELLED ?? 0,
      oldestPendingAgeMs,
      stuckRunning,
      dueNow,
      recentFailed: recentFailed.map((row) => ({
        id: row.id,
        type: row.type,
        attempts: row.attempts,
        lastError: row.lastError ? row.lastError.slice(0, 200) : null,
        updatedAt: row.updatedAt.toISOString(),
      })),
    },
    ingest: {
      ...ingest,
      successAgeMs,
    },
    hotWatch,
    email: {
      last24h: emailLast24h,
      last7d: emailLast7d,
      sent24h: emailLast24h.SENT ?? 0,
      failed24h: emailLast24h.FAILED ?? 0,
      pending24h: emailLast24h.PENDING ?? 0,
      skipped24h: emailLast24h.SKIPPED ?? 0,
    },
    storage: {
      root: resolveSaasStorageRoot(),
      totalBytesUsed: storageAgg._sum.fileSize ?? 0,
      documentCount: storageAgg._count._all,
      orgsWithVault: orgsWithVault.length,
      noteEl:
        "Σύνολα μεγεθών από τη βάση (χωρίς περιεχόμενο αρχείων). Ρίζα: SAAS_STORAGE_DIR.",
    },
    pdf: {
      process: getPdfExtractTimingMetrics(),
      tendersByPdfStatus,
    },
  };
};

export const pipelineHealthSummary = (pipeline: PipelineMetrics) => ({
  outboxPending: pipeline.outbox.pending,
  outboxFailed: pipeline.outbox.failed,
  outboxLagMs: pipeline.outbox.oldestPendingAgeMs,
  ingestFresh: pipeline.ingest.fresh,
  ingestHealth: pipeline.ingest.health,
  ingestSuccessAgeMs: pipeline.ingest.successAgeMs,
  hotWatchActive: pipeline.hotWatch?.activePriorityMonitors ?? 0,
  emailFailed24h: pipeline.email.failed24h,
  alertCount: pipeline.alerts.length,
  alertLevels: {
    error: pipeline.alerts.filter((a) => a.level === "error").length,
    warn: pipeline.alerts.filter((a) => a.level === "warn").length,
    info: pipeline.alerts.filter((a) => a.level === "info").length,
  },
});
