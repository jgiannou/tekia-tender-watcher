import type { PrismaClient, SaasJob } from "@prisma/client";
import { deliverAttentionEmail } from "../services/notify.js";
import {
  processSlackAttentionJob,
  processSlackOpportunityBatchJob,
} from "../services/slack-delivery.js";
import {
  processGoogleCalendarDeleteEventJob,
  processGoogleCalendarFullSyncJob,
  processGoogleCalendarUpsertEventJob,
} from "../services/google-calendar-sync.js";
import { processGoogleDriveFolderJob } from "../services/google-drive-folder.js";
import { processGoogleDriveImportJob } from "../services/google-drive-import.js";
import type { KimdisClient } from "../../kimdis/client.js";
import {
  processSaasOutbox,
  SAAS_JOB_TYPES,
  type SaasJobHandler,
} from "./outbox.js";
import { processWeeklyFreeDigestJob } from "./weekly-free-digest.js";

const asPayload = (job: SaasJob): Record<string, unknown> =>
  job.payload && typeof job.payload === "object"
    ? (job.payload as Record<string, unknown>)
    : {};

const attentionHandler: SaasJobHandler = async (prisma, job) => {
  const payload = asPayload(job);
  const attentionEventId =
    typeof payload.attentionEventId === "string"
      ? payload.attentionEventId
      : null;
  if (!attentionEventId) return "skip";
  const result = await deliverAttentionEmail(prisma, attentionEventId);
  if (result === "failed") return "retry";
  return "ok";
};

const weeklyHandler: SaasJobHandler = async (prisma, job) => {
  if (!job.organizationId) return "skip";
  return processWeeklyFreeDigestJob(prisma, job.organizationId);
};

export const runSaasOutboxWorker = async (
  prisma: PrismaClient,
  options?: { limit?: number; kimdis?: KimdisClient },
) =>
  processSaasOutbox(
    prisma,
    {
      [SAAS_JOB_TYPES.attentionEmail]: attentionHandler,
      [SAAS_JOB_TYPES.weeklyDigest]: weeklyHandler,
      [SAAS_JOB_TYPES.slackAttention]: processSlackAttentionJob,
      [SAAS_JOB_TYPES.slackOpportunityBatch]: processSlackOpportunityBatchJob,
      [SAAS_JOB_TYPES.googleCalendarFullSync]: processGoogleCalendarFullSyncJob,
      [SAAS_JOB_TYPES.googleCalendarUpsertEvent]:
        processGoogleCalendarUpsertEventJob,
      [SAAS_JOB_TYPES.googleCalendarDeleteEvent]:
        processGoogleCalendarDeleteEventJob,
      [SAAS_JOB_TYPES.googleDriveImport]: processGoogleDriveImportJob,
      [SAAS_JOB_TYPES.googleDriveCreateFolder]: (client, job) =>
        processGoogleDriveFolderJob(client, job, { kimdis: options?.kimdis }),
    },
    options ? { limit: options.limit } : undefined,
  );
