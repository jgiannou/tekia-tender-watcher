import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient, SaasJob } from "@prisma/client";

export const SAAS_JOB_TYPES = {
  attentionEmail: "ATTENTION_EMAIL",
  relatedDigest: "RELATED_DIGEST",
  weeklyDigest: "WEEKLY_DIGEST",
  deadlineRadar: "DEADLINE_RADAR",
  slackAttention: "SLACK_ATTENTION",
  slackOpportunityBatch: "SLACK_OPPORTUNITY_BATCH",
  googleCalendarFullSync: "GOOGLE_CALENDAR_FULL_SYNC",
  googleCalendarUpsertEvent: "GOOGLE_CALENDAR_UPSERT_EVENT",
  googleCalendarDeleteEvent: "GOOGLE_CALENDAR_DELETE_EVENT",
  googleSheetsFullSync: "GOOGLE_SHEETS_FULL_SYNC",
  googleDriveImport: "GOOGLE_DRIVE_IMPORT",
  googleDriveCreateFolder: "GOOGLE_DRIVE_CREATE_FOLDER",
} as const;

export const SLACK_SAAS_JOB_TYPES = [
  SAAS_JOB_TYPES.slackAttention,
  SAAS_JOB_TYPES.slackOpportunityBatch,
] as const;

export const GOOGLE_SAAS_JOB_TYPES = [
  SAAS_JOB_TYPES.googleCalendarFullSync,
  SAAS_JOB_TYPES.googleCalendarUpsertEvent,
  SAAS_JOB_TYPES.googleCalendarDeleteEvent,
  SAAS_JOB_TYPES.googleSheetsFullSync,
] as const;

/** Drive import + folder jobs are cancelled separately so Calendar pause never touches them. */
export const GOOGLE_DRIVE_SAAS_JOB_TYPES = [
  SAAS_JOB_TYPES.googleDriveImport,
  SAAS_JOB_TYPES.googleDriveCreateFolder,
] as const;

export type SaasJobType = (typeof SAAS_JOB_TYPES)[keyof typeof SAAS_JOB_TYPES];

const LEASE_MS = 90_000;
const BACKOFF_BASE_MS = 30_000;
const BACKOFF_MAX_MS = 60 * 60 * 1000;

export type OutboxMetrics = {
  enqueued: number;
  claimed: number;
  succeeded: number;
  failed: number;
  retried: number;
  cancelled: number;
  lastLagMs: number | null;
};

const metrics: OutboxMetrics = {
  enqueued: 0,
  claimed: 0,
  succeeded: 0,
  failed: 0,
  retried: 0,
  cancelled: 0,
  lastLagMs: null,
};

export const getOutboxMetrics = (): OutboxMetrics => ({ ...metrics });

export const enqueueSaasJob = async (
  prisma: PrismaClient,
  input: {
    type: SaasJobType | string;
    deliveryKey: string;
    organizationId?: string | null;
    payload?: Record<string, unknown> | null;
    priority?: number;
    availableAt?: Date;
    maxAttempts?: number;
  },
): Promise<{ job: SaasJob; created: boolean }> => {
  try {
    const job = await prisma.saasJob.create({
      data: {
        type: input.type,
        deliveryKey: input.deliveryKey,
        organizationId: input.organizationId ?? null,
        payload: (input.payload ?? undefined) as Prisma.InputJsonValue | undefined,
        priority: input.priority ?? 100,
        availableAt: input.availableAt ?? new Date(),
        maxAttempts: input.maxAttempts ?? 8,
        status: "PENDING",
      },
    });
    metrics.enqueued += 1;
    return { job, created: true };
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
    ) {
      const existing = await prisma.saasJob.findUniqueOrThrow({
        where: { deliveryKey: input.deliveryKey },
      });
      return { job: existing, created: false };
    }
    throw error;
  }
};

export const cancelPendingProductJobsForOrg = async (
  prisma: PrismaClient,
  organizationId: string,
  types: string[] = [
    SAAS_JOB_TYPES.attentionEmail,
    SAAS_JOB_TYPES.relatedDigest,
    SAAS_JOB_TYPES.deadlineRadar,
  ],
  reason = "plan_downgrade_to_free",
): Promise<number> => {
  const result = await prisma.saasJob.updateMany({
    where: {
      organizationId,
      type: { in: types },
      status: { in: ["PENDING", "RUNNING"] },
    },
    data: {
      status: "CANCELLED",
      leaseOwner: null,
      leaseExpiresAt: null,
      completedAt: new Date(),
      lastError: reason,
    },
  });
  metrics.cancelled += result.count;
  return result.count;
};

/** Cancel pending customer Slack delivery jobs (disconnect / downgrade / replace). */
export const cancelPendingSlackJobsForOrg = async (
  prisma: PrismaClient,
  organizationId: string,
  reason = "slack_connection_stopped",
): Promise<number> =>
  cancelPendingProductJobsForOrg(
    prisma,
    organizationId,
    [...SLACK_SAAS_JOB_TYPES],
    reason,
  );

/** Cancel Google jobs for one connection (payload.connectionId). */
export const cancelPendingGoogleJobsForConnection = async (
  prisma: PrismaClient,
  connectionId: string,
  reason = "google_connection_stopped",
  types: readonly string[] = GOOGLE_SAAS_JOB_TYPES,
): Promise<number> => {
  const jobs = await prisma.saasJob.findMany({
    where: {
      type: { in: [...types] },
      status: { in: ["PENDING", "RUNNING"] },
    },
    select: { id: true, payload: true },
  });
  const ids = jobs
    .filter((j) => {
      const p = j.payload as { connectionId?: string } | null;
      return p?.connectionId === connectionId;
    })
    .map((j) => j.id);
  if (ids.length === 0) return 0;
  const result = await prisma.saasJob.updateMany({
    where: { id: { in: ids } },
    data: {
      status: "CANCELLED",
      leaseOwner: null,
      leaseExpiresAt: null,
      completedAt: new Date(),
      lastError: reason,
    },
  });
  metrics.cancelled += result.count;
  return result.count;
};

/** Cancel Google jobs for org (optionally scoped to userId in payload). */
export const cancelPendingGoogleJobsForUserOrg = async (
  prisma: PrismaClient,
  organizationId: string,
  userId: string | null,
  reason = "google_connection_stopped",
  types: readonly string[] = GOOGLE_SAAS_JOB_TYPES,
): Promise<number> => {
  const jobs = await prisma.saasJob.findMany({
    where: {
      organizationId,
      type: { in: [...types] },
      status: { in: ["PENDING", "RUNNING"] },
    },
    select: { id: true, payload: true },
  });
  const ids = jobs
    .filter((j) => {
      if (!userId) return true;
      const p = j.payload as { userId?: string } | null;
      return p?.userId === userId;
    })
    .map((j) => j.id);
  if (ids.length === 0) return 0;
  const result = await prisma.saasJob.updateMany({
    where: { id: { in: ids } },
    data: {
      status: "CANCELLED",
      leaseOwner: null,
      leaseExpiresAt: null,
      completedAt: new Date(),
      lastError: reason,
    },
  });
  metrics.cancelled += result.count;
  return result.count;
};

/**
 * Atomically claim due jobs with a lease (Postgres SKIP LOCKED).
 * Safe across multiple API replicas.
 */
export const claimSaasJobs = async (
  prisma: PrismaClient,
  input?: { limit?: number; workerId?: string },
): Promise<SaasJob[]> => {
  const limit = Math.min(50, Math.max(1, input?.limit ?? 10));
  const workerId = input?.workerId ?? `worker-${randomUUID().slice(0, 8)}`;
  const leaseUntil = new Date(Date.now() + LEASE_MS);

  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    UPDATE "saas_jobs" AS j
    SET
      "status" = 'RUNNING'::"SaasJobStatus",
      "leaseOwner" = ${workerId},
      "leaseExpiresAt" = ${leaseUntil},
      "attempts" = j."attempts" + 1,
      "updatedAt" = NOW()
    WHERE j."id" IN (
      SELECT id FROM "saas_jobs"
      WHERE
        (
          ("status" = 'PENDING'::"SaasJobStatus" AND "availableAt" <= NOW())
          OR (
            "status" = 'RUNNING'::"SaasJobStatus"
            AND "leaseExpiresAt" IS NOT NULL
            AND "leaseExpiresAt" < NOW()
          )
        )
      ORDER BY "priority" ASC, "availableAt" ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING j."id"
  `;

  if (rows.length === 0) return [];
  metrics.claimed += rows.length;
  const jobs = await prisma.saasJob.findMany({
    where: { id: { in: rows.map((r) => r.id) } },
  });
  const oldest = jobs.reduce(
    (min, job) => Math.min(min, job.availableAt.getTime()),
    Date.now(),
  );
  metrics.lastLagMs = Math.max(0, Date.now() - oldest);
  return jobs;
};

export const markSaasJobSucceeded = async (
  prisma: PrismaClient,
  jobId: string,
): Promise<void> => {
  await prisma.saasJob.update({
    where: { id: jobId },
    data: {
      status: "SUCCEEDED",
      leaseOwner: null,
      leaseExpiresAt: null,
      completedAt: new Date(),
      lastError: null,
    },
  });
  metrics.succeeded += 1;
};

export const markSaasJobFailedOrRetry = async (
  prisma: PrismaClient,
  job: SaasJob,
  errorMessage: string,
  options?: { retryAfterMs?: number },
): Promise<"retry" | "failed"> => {
  const message = errorMessage.slice(0, 400);
  if (job.attempts >= job.maxAttempts) {
    await prisma.saasJob.update({
      where: { id: job.id },
      data: {
        status: "FAILED",
        leaseOwner: null,
        leaseExpiresAt: null,
        lastError: message,
        completedAt: new Date(),
      },
    });
    metrics.failed += 1;
    return "failed";
  }
  const backoff =
    typeof options?.retryAfterMs === "number" && options.retryAfterMs >= 0
      ? Math.min(BACKOFF_MAX_MS, options.retryAfterMs)
      : Math.min(
          BACKOFF_MAX_MS,
          BACKOFF_BASE_MS * 2 ** Math.max(0, job.attempts - 1),
        );
  await prisma.saasJob.update({
    where: { id: job.id },
    data: {
      status: "PENDING",
      leaseOwner: null,
      leaseExpiresAt: null,
      availableAt: new Date(Date.now() + backoff),
      lastError: message,
    },
  });
  metrics.retried += 1;
  return "retry";
};

export type SaasJobHandler = (
  prisma: PrismaClient,
  job: SaasJob,
) => Promise<"ok" | "skip" | "retry">;

export const processSaasOutbox = async (
  prisma: PrismaClient,
  handlers: Record<string, SaasJobHandler>,
  options?: { limit?: number },
): Promise<{ processed: number; succeeded: number; failed: number }> => {
  const jobs = await claimSaasJobs(prisma, { limit: options?.limit });
  let succeeded = 0;
  let failed = 0;
  for (const job of jobs) {
    const handler = handlers[job.type];
    if (!handler) {
      await markSaasJobFailedOrRetry(prisma, job, `unknown_job_type:${job.type}`);
      failed += 1;
      continue;
    }
    try {
      const result = await handler(prisma, job);
      if (result === "retry") {
        await markSaasJobFailedOrRetry(prisma, job, "handler_requested_retry");
        continue;
      }
      await markSaasJobSucceeded(prisma, job.id);
      succeeded += 1;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "job_handler_failed";
      const retryAfterMs =
        error &&
        typeof error === "object" &&
        "retryAfterMs" in error &&
        typeof (error as { retryAfterMs?: unknown }).retryAfterMs === "number"
          ? (error as { retryAfterMs: number }).retryAfterMs
          : undefined;
      const outcome = await markSaasJobFailedOrRetry(prisma, job, message, {
        retryAfterMs,
      });
      if (outcome === "failed") failed += 1;
      console.error("[outbox] job failed:", job.type, job.deliveryKey, message);
    }
  }
  return { processed: jobs.length, succeeded, failed };
};
