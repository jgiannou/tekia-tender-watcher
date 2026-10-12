import type {
  AttentionEventType,
  PrismaClient,
  SaasJob,
} from "@prisma/client";
import { decryptSecret } from "../crypto/secrets.js";
import {
  enqueueSaasJob,
  SAAS_JOB_TYPES,
  type SaasJobHandler,
} from "../jobs/outbox.js";
import { resolveSaasAppUrl } from "../mail/mail.js";
import { decideSlackSend } from "./slack-channel-policy.js";
import {
  SLACK_OPPORTUNITY_BATCH_MAX_ITEMS,
  SLACK_OPPORTUNITY_BATCH_MS,
  isSaasSlackNotificationsConfigured,
  isValidSlackIncomingWebhookUrl,
} from "./slack-config.js";
import {
  buildDeadlineSlackMessage,
  buildOpportunityBatchSlackMessage,
  buildRelatedActSlackMessage,
  type SlackMessagePayload,
  type SlackTenderLine,
} from "./slack-messages.js";
import { normalizeSlackPreferences } from "./slack-preferences.js";
import {
  sourceLabelEl,
  sourceSystemFromReference,
} from "./source-provenance.js";

const tenderSourceLabel = (
  referenceNumber: string | null | undefined,
): string => sourceLabelEl(sourceSystemFromReference(referenceNumber));

const parseCpvList = (raw: unknown): string[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (item && typeof item === "object" && "code" in item) {
        const code = (item as { code?: unknown }).code;
        return typeof code === "string" ? code.trim() : "";
      }
      return "";
    })
    .filter(Boolean);
};

const tenderSelectForSlack = {
  id: true,
  title: true,
  referenceNumber: true,
  recordType: true,
  contractingAuthority: true,
  budgetWithoutVat: true,
  finalSubmissionDate: true,
  submissionDate: true,
  cpvs: true,
  stage: true,
  publicKimdisUrl: true,
  officialPdfUrl: true,
} as const;

type SlackTenderRow = {
  id: string;
  title: string | null;
  referenceNumber: string;
  recordType: string;
  contractingAuthority: string | null;
  budgetWithoutVat: number | null;
  finalSubmissionDate: Date | null;
  submissionDate: Date | null;
  cpvs: unknown;
  stage: string | null;
  publicKimdisUrl: string | null;
  officialPdfUrl: string | null;
};

const toSlackTenderLine = (input: {
  title: string;
  tender: SlackTenderRow | null;
  score?: number | null;
  arcUrl: string;
  deadlineIso?: string | null;
}): SlackTenderLine => {
  const tender = input.tender;
  return {
    title: input.title,
    authority: tender?.contractingAuthority ?? null,
    valueEur: tender?.budgetWithoutVat ?? null,
    deadlineIso:
      input.deadlineIso ??
      tender?.finalSubmissionDate?.toISOString() ??
      null,
    submissionDateIso: tender?.submissionDate?.toISOString() ?? null,
    source: tenderSourceLabel(tender?.referenceNumber),
    recordType: tender?.recordType ?? null,
    referenceNumber: tender?.referenceNumber ?? null,
    cpvs: parseCpvList(tender?.cpvs),
    score: input.score ?? null,
    stageLabel: tender?.stage ?? null,
    publicUrl: tender?.publicKimdisUrl ?? null,
    pdfUrl: tender?.officialPdfUrl ?? null,
    arcUrl: input.arcUrl,
  };
};

export class SlackRetryAfterError extends Error {
  readonly retryAfterMs: number;
  constructor(retryAfterMs: number, message: string) {
    super(message);
    this.name = "SlackRetryAfterError";
    this.retryAfterMs = retryAfterMs;
  }
}

export type SlackPostResult =
  | { ok: true }
  | {
      ok: false;
      permanent: boolean;
      status: number;
      errorSafe: string;
      retryAfterMs?: number;
    };

const PERMANENT_STATUS = new Set([404, 410]);
const PERMANENT_BODY = /no_service|channel_not_found|invalid_token|account_inactive/i;

const asPayload = (job: SaasJob): Record<string, unknown> =>
  job.payload && typeof job.payload === "object"
    ? (job.payload as Record<string, unknown>)
    : {};

const safeError = (status: number, body: string): string => {
  const snippet = body.replace(/\s+/g, " ").trim().slice(0, 120);
  return `http_${status}:${snippet || "empty"}`;
};

/**
 * Post to the encrypted webhook for a connection.
 * Never accepts arbitrary URLs from callers.
 *
 * Residual risk: if Slack accepts the message but the HTTP client times out
 * before we record success, a retry may produce a duplicate message
 * (at-least-once, not exactly-once).
 */
export const postSlackIncomingWebhook = async (
  prisma: PrismaClient,
  input: {
    connectionId: string;
    payload: SlackMessagePayload;
    markSuccess?: boolean;
  },
): Promise<SlackPostResult> => {
  const row = await prisma.organizationSlackConnection.findUnique({
    where: { id: input.connectionId },
  });
  if (!row) {
    return {
      ok: false,
      permanent: true,
      status: 0,
      errorSafe: "connection_missing",
    };
  }

  let webhookUrl: string;
  try {
    webhookUrl = decryptSecret({
      ciphertext: row.webhookUrlCiphertext,
      nonce: row.webhookUrlNonce,
    });
  } catch {
    await prisma.organizationSlackConnection.update({
      where: { id: row.id },
      data: {
        status: "NEEDS_RECONNECT",
        lastErrorAt: new Date(),
        lastErrorSafe: "decrypt_failed",
      },
    });
    return {
      ok: false,
      permanent: true,
      status: 0,
      errorSafe: "decrypt_failed",
    };
  }

  if (!isValidSlackIncomingWebhookUrl(webhookUrl)) {
    await prisma.organizationSlackConnection.update({
      where: { id: row.id },
      data: {
        status: "NEEDS_RECONNECT",
        lastErrorAt: new Date(),
        lastErrorSafe: "invalid_webhook_stored",
      },
    });
    return {
      ok: false,
      permanent: true,
      status: 0,
      errorSafe: "invalid_webhook_stored",
    };
  }

  let res: Response;
  try {
    res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input.payload),
    });
  } catch (error) {
    const msg =
      error instanceof Error ? error.message.slice(0, 80) : "network_error";
    return {
      ok: false,
      permanent: false,
      status: 0,
      errorSafe: `network:${msg}`,
    };
  }

  const bodyText = await res.text().catch(() => "");
  if (res.ok) {
    if (input.markSuccess !== false) {
      await prisma.organizationSlackConnection.update({
        where: { id: row.id },
        data: {
          lastSuccessAt: new Date(),
          lastErrorAt: null,
          lastErrorSafe: null,
        },
      });
    }
    return { ok: true };
  }

  const retryAfterHeader = res.headers.get("retry-after");
  let retryAfterMs: number | undefined;
  if (retryAfterHeader) {
    const asInt = Number(retryAfterHeader);
    if (Number.isFinite(asInt) && asInt >= 0) {
      retryAfterMs = Math.min(3600, asInt) * 1000;
    } else {
      const when = Date.parse(retryAfterHeader);
      if (Number.isFinite(when)) {
        retryAfterMs = Math.max(0, Math.min(3600_000, when - Date.now()));
      }
    }
  }

  const permanent =
    PERMANENT_STATUS.has(res.status) || PERMANENT_BODY.test(bodyText);
  const errorSafe = safeError(res.status, bodyText);

  if (permanent) {
    await prisma.organizationSlackConnection.update({
      where: { id: row.id },
      data: {
        status: "NEEDS_RECONNECT",
        lastErrorAt: new Date(),
        lastErrorSafe: errorSafe,
      },
    });
  } else {
    await prisma.organizationSlackConnection.update({
      where: { id: row.id },
      data: {
        lastErrorAt: new Date(),
        lastErrorSafe: errorSafe,
      },
    });
  }

  return {
    ok: false,
    permanent,
    status: res.status,
    errorSafe,
    retryAfterMs: res.status === 429 ? retryAfterMs ?? 60_000 : retryAfterMs,
  };
};

const opportunityBatchWindowKey = (at = new Date()): string => {
  const ms = SLACK_OPPORTUNITY_BATCH_MS;
  return String(Math.floor(at.getTime() / ms) * ms);
};

const tenderArcUrl = (
  appUrl: string,
  recordType: string | null | undefined,
  referenceNumber: string | null | undefined,
  tenderId: string,
): string => {
  const base = appUrl.replace(/\/+$/, "");
  if (recordType && referenceNumber) {
    return `${base}/app/tenders/${encodeURIComponent(recordType)}/${encodeURIComponent(referenceNumber)}`;
  }
  return `${base}/app/opportunities`;
};

const loadOrgPlanKey = async (
  prisma: PrismaClient,
  organizationId: string,
): Promise<string> => {
  const sub = await prisma.subscription.findUnique({
    where: { organizationId },
    select: { planKey: true },
  });
  return sub?.planKey ?? "free";
};

/**
 * Enqueue Slack delivery for an attention event (independent of email).
 */
export const queueAttentionSlack = (
  prisma: PrismaClient,
  attentionEventId: string,
): void => {
  void (async () => {
    if (!isSaasSlackNotificationsConfigured()) return;
    const event = await prisma.organizationAttentionEvent.findUnique({
      where: { id: attentionEventId },
      select: {
        id: true,
        organizationId: true,
        type: true,
        organizationTenderId: true,
      },
    });
    if (!event) return;

    const connection = await prisma.organizationSlackConnection.findUnique({
      where: { organizationId: event.organizationId },
    });
    if (!connection) return;

    const planKey = await loadOrgPlanKey(prisma, event.organizationId);
    const decision = decideSlackSend({
      planKey,
      connectionStatus: connection.status,
      notificationsArmed: connection.notificationsArmed,
      preferences: connection.preferences,
      type: event.type,
    });
    if (!decision.allow) return;

    if (event.type === "NEW_OPPORTUNITY") {
      const windowKey = opportunityBatchWindowKey();
      const availableAt = new Date(Number(windowKey) + SLACK_OPPORTUNITY_BATCH_MS);
      await enqueueSaasJob(prisma, {
        type: SAAS_JOB_TYPES.slackOpportunityBatch,
        deliveryKey: `SLACK_OPP_BATCH:${connection.id}:${windowKey}`,
        organizationId: event.organizationId,
        payload: {
          connectionId: connection.id,
          windowKey,
        },
        availableAt,
        priority: 60,
        maxAttempts: 8,
      });
      return;
    }

    if (
      event.type === "DEADLINE_APPROACHING" ||
      decision.prefKind === "relatedActOnFollowed"
    ) {
      await enqueueSaasJob(prisma, {
        type: SAAS_JOB_TYPES.slackAttention,
        deliveryKey: `SLACK:${connection.id}:${event.id}`,
        organizationId: event.organizationId,
        payload: {
          connectionId: connection.id,
          attentionEventId: event.id,
        },
        priority: 55,
        maxAttempts: 8,
      });
    }
  })().catch((error) => {
    console.error(
      "[slack] queueAttentionSlack enqueue:",
      error instanceof Error ? error.message : error,
    );
  });
};

const markSlackDelivery = async (
  prisma: PrismaClient,
  input: {
    organizationId: string;
    attentionEventId: string;
    organizationTenderId: string | null;
    dedupeKey: string;
    templateKey: string;
    status: "SENT" | "FAILED" | "SKIPPED";
    error?: string | null;
    bodyPreview?: string | null;
  },
) => {
  await prisma.notificationDelivery.upsert({
    where: {
      organizationId_dedupeKey: {
        organizationId: input.organizationId,
        dedupeKey: input.dedupeKey,
      },
    },
    create: {
      organizationId: input.organizationId,
      organizationAttentionEventId: input.attentionEventId,
      organizationTenderId: input.organizationTenderId,
      channel: "SLACK",
      templateKey: input.templateKey,
      dedupeKey: input.dedupeKey,
      status: input.status,
      sentAt: input.status === "SENT" ? new Date() : null,
      bodyPreview: input.bodyPreview?.slice(0, 180) ?? null,
      error: input.error ?? null,
      payload: { connectionScoped: true },
    },
    update: {
      status: input.status,
      sentAt: input.status === "SENT" ? new Date() : null,
      error: input.error ?? null,
      bodyPreview: input.bodyPreview?.slice(0, 180) ?? null,
    },
  });
};

export const processSlackAttentionJob: SaasJobHandler = async (prisma, job) => {
  const payload = asPayload(job);
  const connectionId =
    typeof payload.connectionId === "string" ? payload.connectionId : null;
  const attentionEventId =
    typeof payload.attentionEventId === "string"
      ? payload.attentionEventId
      : null;
  if (!connectionId || !attentionEventId) return "skip";

  const connection = await prisma.organizationSlackConnection.findUnique({
    where: { id: connectionId },
  });
  if (!connection || connection.organizationId !== job.organizationId) {
    return "skip";
  }

  const event = await prisma.organizationAttentionEvent.findUnique({
    where: { id: attentionEventId },
    include: {
      organizationTender: {
        select: {
          score: true,
          tender: { select: tenderSelectForSlack },
        },
      },
      relatedTender: { select: tenderSelectForSlack },
    },
  });
  if (!event) return "skip";

  const planKey = await loadOrgPlanKey(prisma, connection.organizationId);
  const decision = decideSlackSend({
    planKey,
    connectionStatus: connection.status,
    notificationsArmed: connection.notificationsArmed,
    preferences: connection.preferences,
    type: event.type,
  });
  if (!decision.allow) return "skip";

  const dedupeKey = `SLACK:${connection.id}:${event.id}`;
  const already = await prisma.notificationDelivery.findUnique({
    where: {
      organizationId_dedupeKey: {
        organizationId: connection.organizationId,
        dedupeKey,
      },
    },
    select: { status: true },
  });
  if (already?.status === "SENT") return "skip";

  const appUrl = resolveSaasAppUrl();
  const tender = event.relatedTender ?? event.organizationTender?.tender ?? null;
  const meta =
    event.metadata && typeof event.metadata === "object"
      ? (event.metadata as Record<string, unknown>)
      : {};
  const deadlineIso =
    tender?.finalSubmissionDate?.toISOString() ??
    (typeof meta.finalSubmissionDate === "string"
      ? meta.finalSubmissionDate
      : null);
  const daysRemaining =
    typeof meta.daysRemaining === "number" ? meta.daysRemaining : null;
  const score =
    typeof meta.score === "number"
      ? meta.score
      : event.organizationTender?.score ?? null;

  const arcUrl = tenderArcUrl(
    appUrl,
    tender?.recordType,
    tender?.referenceNumber,
    tender?.id ?? event.organizationTenderId ?? event.id,
  );

  const line = toSlackTenderLine({
    title: event.title,
    tender,
    score,
    arcUrl,
    deadlineIso,
  });

  const message =
    event.type === "DEADLINE_APPROACHING"
      ? buildDeadlineSlackMessage({ ...line, daysRemaining })
      : buildRelatedActSlackMessage(line);

  const result = await postSlackIncomingWebhook(prisma, {
    connectionId: connection.id,
    payload: message,
  });

  if (result.ok) {
    await markSlackDelivery(prisma, {
      organizationId: connection.organizationId,
      attentionEventId: event.id,
      organizationTenderId: event.organizationTenderId,
      dedupeKey,
      templateKey:
        event.type === "DEADLINE_APPROACHING"
          ? "slack.deadline"
          : "slack.related",
      status: "SENT",
      bodyPreview: message.text,
    });
    return "ok";
  }

  if (result.permanent) {
    await markSlackDelivery(prisma, {
      organizationId: connection.organizationId,
      attentionEventId: event.id,
      organizationTenderId: event.organizationTenderId,
      dedupeKey,
      templateKey: "slack.related",
      status: "FAILED",
      error: result.errorSafe,
    });
    return "skip";
  }
  if (result.status === 429 || result.retryAfterMs) {
    throw new SlackRetryAfterError(
      result.retryAfterMs ?? 60_000,
      result.errorSafe,
    );
  }
  throw new Error(result.errorSafe);
};

export const processSlackOpportunityBatchJob: SaasJobHandler = async (
  prisma,
  job,
) => {
  const payload = asPayload(job);
  const connectionId =
    typeof payload.connectionId === "string" ? payload.connectionId : null;
  const windowKey =
    typeof payload.windowKey === "string" ? payload.windowKey : null;
  if (!connectionId || !windowKey || !job.organizationId) return "skip";

  const connection = await prisma.organizationSlackConnection.findUnique({
    where: { id: connectionId },
  });
  if (!connection || connection.organizationId !== job.organizationId) {
    return "skip";
  }

  const planKey = await loadOrgPlanKey(prisma, connection.organizationId);
  const decision = decideSlackSend({
    planKey,
    connectionStatus: connection.status,
    notificationsArmed: connection.notificationsArmed,
    preferences: connection.preferences,
    type: "NEW_OPPORTUNITY",
  });
  if (!decision.allow) return "skip";

  const windowStart = new Date(Number(windowKey));
  const windowEnd = new Date(Number(windowKey) + SLACK_OPPORTUNITY_BATCH_MS);

  const events = await prisma.organizationAttentionEvent.findMany({
    where: {
      organizationId: connection.organizationId,
      type: "NEW_OPPORTUNITY",
      createdAt: { gte: windowStart, lt: windowEnd },
    },
    orderBy: { createdAt: "asc" },
    take: 40,
    include: {
      organizationTender: {
        select: {
          score: true,
          tender: { select: tenderSelectForSlack },
        },
      },
    },
  });

  const undelivered = [];
  for (const event of events) {
    const dedupeKey = `SLACK:${connection.id}:${event.id}`;
    const already = await prisma.notificationDelivery.findUnique({
      where: {
        organizationId_dedupeKey: {
          organizationId: connection.organizationId,
          dedupeKey,
        },
      },
      select: { status: true },
    });
    if (already?.status === "SENT") continue;
    undelivered.push(event);
  }

  if (undelivered.length === 0) return "skip";

  const prefs = normalizeSlackPreferences(connection.preferences);
  if (!prefs.newOpportunity) return "skip";

  const appUrl = resolveSaasAppUrl();
  const shown = undelivered.slice(0, SLACK_OPPORTUNITY_BATCH_MAX_ITEMS);
  const items = shown.map((event) => {
    const tender = event.organizationTender?.tender ?? null;
    const meta =
      event.metadata && typeof event.metadata === "object"
        ? (event.metadata as Record<string, unknown>)
        : {};
    const score =
      typeof meta.score === "number"
        ? meta.score
        : event.organizationTender?.score ?? null;
    return toSlackTenderLine({
      title:
        (typeof meta.tenderTitle === "string" && meta.tenderTitle.trim()
          ? meta.tenderTitle
          : null) ||
        tender?.title ||
        event.title,
      tender,
      score,
      arcUrl: tenderArcUrl(
        appUrl,
        tender?.recordType,
        tender?.referenceNumber,
        tender?.id ?? event.id,
      ),
    });
  });

  const message = buildOpportunityBatchSlackMessage({
    items,
    totalCount: undelivered.length,
    moreUrl: `${appUrl.replace(/\/+$/, "")}/app/opportunities`,
  });

  const result = await postSlackIncomingWebhook(prisma, {
    connectionId: connection.id,
    payload: message,
  });

  if (!result.ok) {
    if (result.permanent) return "skip";
    if (result.status === 429 || result.retryAfterMs) {
      throw new SlackRetryAfterError(
        result.retryAfterMs ?? 60_000,
        result.errorSafe,
      );
    }
    throw new Error(result.errorSafe);
  }

  const now = new Date();
  for (const event of undelivered) {
    await markSlackDelivery(prisma, {
      organizationId: connection.organizationId,
      attentionEventId: event.id,
      organizationTenderId: event.organizationTenderId,
      dedupeKey: `SLACK:${connection.id}:${event.id}`,
      templateKey: "slack.opportunity_batch",
      status: "SENT",
      bodyPreview: message.text,
    });
  }
  // Anchor batch delivery for metrics (optional second key)
  await prisma.notificationDelivery.upsert({
    where: {
      organizationId_dedupeKey: {
        organizationId: connection.organizationId,
        dedupeKey: `SLACK_OPP_BATCH:${connection.id}:${windowKey}`,
      },
    },
    create: {
      organizationId: connection.organizationId,
      organizationAttentionEventId: shown[0]!.id,
      organizationTenderId: shown[0]!.organizationTenderId,
      channel: "SLACK",
      templateKey: "slack.opportunity_batch",
      dedupeKey: `SLACK_OPP_BATCH:${connection.id}:${windowKey}`,
      status: "SENT",
      sentAt: now,
      bodyPreview: message.text.slice(0, 180),
      payload: {
        connectionId: connection.id,
        count: undelivered.length,
        shown: shown.length,
      },
    },
    update: {
      status: "SENT",
      sentAt: now,
      error: null,
    },
  });

  return "ok";
};

/** Throttled enqueue for deadline radar (same outbox as related). */
export const enqueueSlackDeadlineEvents = async (
  prisma: PrismaClient,
  input: {
    organizationId: string;
    attentionEventIds: string[];
  },
): Promise<number> => {
  if (!isSaasSlackNotificationsConfigured()) return 0;
  const connection = await prisma.organizationSlackConnection.findUnique({
    where: { organizationId: input.organizationId },
  });
  if (!connection) return 0;
  const planKey = await loadOrgPlanKey(prisma, input.organizationId);
  let enqueued = 0;
  for (const attentionEventId of input.attentionEventIds) {
    const decision = decideSlackSend({
      planKey,
      connectionStatus: connection.status,
      notificationsArmed: connection.notificationsArmed,
      preferences: connection.preferences,
      type: "DEADLINE_APPROACHING" as AttentionEventType,
    });
    if (!decision.allow) continue;
    const result = await enqueueSaasJob(prisma, {
      type: SAAS_JOB_TYPES.slackAttention,
      deliveryKey: `SLACK:${connection.id}:${attentionEventId}`,
      organizationId: input.organizationId,
      payload: { connectionId: connection.id, attentionEventId },
      priority: 55,
    });
    if (result.created) enqueued += 1;
  }
  return enqueued;
};
