import type { AttentionEventType, PrismaClient } from "@prisma/client";
import {
  attentionEmailCopy,
  isEmailEnabled,
  resolveSaasAppUrl,
  sendMail,
} from "../mail/mail.js";
import { entitlementsForPlanKey } from "../plans/catalog.js";
import { normalizeNotifications } from "./org-settings.js";

const RELATED_TYPES = new Set<AttentionEventType>([
  "RELATED_PROC_DISCOVERED",
  "RELATED_APPROVED_REQUEST_DISCOVERED",
  "RELATED_AWARD_DISCOVERED",
  "RELATED_CONTRACT_DISCOVERED",
  "DEADLINE_CHANGED",
]);

const asMeta = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : {};

const metaString = (
  meta: Record<string, unknown>,
  key: string,
): string | null => {
  const raw = meta[key];
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
};

const metaNumber = (
  meta: Record<string, unknown>,
  key: string,
): number | null => {
  const raw = meta[key];
  return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
};

export const orgEmailMode = async (
  prisma: PrismaClient,
  organizationId: string,
): Promise<"DIGEST" | "IMMEDIATE"> => {
  const subscription = await prisma.subscription.findUnique({
    where: { organizationId },
    select: { planKey: true },
  });
  return entitlementsForPlanKey(subscription?.planKey ?? "trial").emailMode;
};

/**
 * Opportunity digests always email (one email per scan batch).
 * Related-act / deadline updates are NEVER sent one-by-one — they are grouped by
 * flushRelatedActEmailDigests runs in the hourly Athens wave for due orgs.
 * NEW_OPPORTUNITY stays in-app only. DEADLINE_APPROACHING uses Pro radar job.
 */
export const shouldEmailAttentionType = (
  type: AttentionEventType,
  _emailMode: "DIGEST" | "IMMEDIATE",
): boolean => {
  if (RELATED_TYPES.has(type)) return false;
  if (type === "NEW_OPPORTUNITY") return false;
  if (type === "DEADLINE_APPROACHING") return false; // Pro radar digest job
  if (type === "OPPORTUNITY_DIGEST") return true;
  if (type === "SUBMISSION_RECORDED" || type === "OUTREACH_RECORDED") {
    return true;
  }
  return false;
};

export const isRelatedAttentionType = (type: AttentionEventType): boolean =>
  RELATED_TYPES.has(type);

const eventPrefEnabled = (
  type: AttentionEventType,
  events: {
    newOpportunity: boolean;
    relatedActOnFollowed: boolean;
    postSubmissionUpdate: boolean;
    deadlineRadar: boolean;
  },
): boolean => {
  if (type === "NEW_OPPORTUNITY" || type === "OPPORTUNITY_DIGEST") {
    return events.newOpportunity;
  }
  if (RELATED_TYPES.has(type) || type === "DEADLINE_CHANGED") {
    return events.relatedActOnFollowed;
  }
  if (type === "DEADLINE_APPROACHING") return events.deadlineRadar;
  if (type === "SUBMISSION_RECORDED" || type === "OUTREACH_RECORDED") {
    return events.postSubmissionUpdate;
  }
  return false;
};

const resolveRecipients = async (
  prisma: PrismaClient,
  organizationId: string,
  configured: string[],
): Promise<string[]> => {
  if (configured.length > 0) {
    return [...new Set(configured.map((e) => e.trim().toLowerCase()))];
  }
  const members = await prisma.organizationMember.findMany({
    where: {
      organizationId,
      role: { in: ["OWNER", "ADMIN"] },
    },
    include: { user: { select: { email: true } } },
  });
  return [
    ...new Set(
      members
        .map((row) => row.user.email.trim().toLowerCase())
        .filter((email) => email.includes("@")),
    ),
  ];
};

const copyKindFor = (
  type: AttentionEventType,
): "new_opportunity" | "digest" | "related_act" | "related_act_digest" => {
  if (type === "OPPORTUNITY_DIGEST") return "digest";
  if (RELATED_TYPES.has(type)) return "related_act";
  return "new_opportunity";
};

const relatedEventInclude = {
  organizationTender: {
    include: {
      tender: {
        select: {
          id: true,
          referenceNumber: true,
          title: true,
          recordType: true,
          contractingAuthority: true,
        },
      },
    },
  },
  relatedTender: {
    select: {
      id: true,
      referenceNumber: true,
      title: true,
      recordType: true,
      contractingAuthority: true,
      budgetWithoutVat: true,
      submissionDate: true,
      finalSubmissionDate: true,
    },
  },
} as const;

const companyNameFromSettings = (
  company: unknown,
): string | null => {
  if (!company || typeof company !== "object") return null;
  const raw = company as Record<string, unknown>;
  if (typeof raw.legalName === "string" && raw.legalName.trim()) {
    return raw.legalName.trim();
  }
  if (typeof raw.distinctiveTitle === "string" && raw.distinctiveTitle.trim()) {
    return raw.distinctiveTitle.trim();
  }
  return null;
};

const relatedItemFromEvent = (event: {
  title: string;
  metadata: unknown;
  organizationTender?: {
    tender?: {
      referenceNumber: string;
      title: string | null;
      recordType: string;
      contractingAuthority: string | null;
    } | null;
  } | null;
  relatedTender?: {
    referenceNumber: string;
    title: string | null;
    recordType: string;
    contractingAuthority: string | null;
    budgetWithoutVat: number | null;
    submissionDate: Date | null;
    finalSubmissionDate: Date | null;
  } | null;
}) => {
  const meta = asMeta(event.metadata);
  const source = event.organizationTender?.tender ?? null;
  const related = event.relatedTender ?? null;
  return {
    title:
      metaString(meta, "relatedTenderTitle") ??
      related?.title ??
      event.title,
    referenceNumber:
      metaString(meta, "referenceNumber") ?? related?.referenceNumber ?? null,
    authority:
      metaString(meta, "authority") ??
      related?.contractingAuthority ??
      source?.contractingAuthority ??
      null,
    relatedRecordType:
      metaString(meta, "recordType") ?? related?.recordType ?? null,
    sourceReferenceNumber:
      metaString(meta, "sourceReferenceNumber") ??
      source?.referenceNumber ??
      null,
    sourceTenderTitle:
      metaString(meta, "sourceTenderTitle") ?? source?.title ?? null,
    sourceRecordType:
      metaString(meta, "sourceRecordType") ?? source?.recordType ?? null,
    confidence: metaString(meta, "confidence"),
    budgetWithoutVat:
      typeof related?.budgetWithoutVat === "number"
        ? related.budgetWithoutVat
        : metaNumber(meta, "budgetWithoutVat"),
    submissionDate: related?.submissionDate
      ? related.submissionDate.toISOString()
      : metaString(meta, "submissionDate"),
    finalSubmissionDate: related?.finalSubmissionDate
      ? related.finalSubmissionDate.toISOString()
      : metaString(meta, "finalSubmissionDate"),
  };
};

/**
 * Deliver Brevo email for a newly created attention event.
 * In-app attention remains source of truth — SMTP failures never block domain writes.
 */
export const deliverAttentionEmail = async (
  prisma: PrismaClient,
  attentionEventId: string,
): Promise<"sent" | "skipped" | "failed"> => {
  const event = await prisma.organizationAttentionEvent.findUnique({
    where: { id: attentionEventId },
    include: relatedEventInclude,
  });
  if (!event) return "skipped";

  const settings = await prisma.organizationSettings.findUnique({
    where: { organizationId: event.organizationId },
    select: { notifications: true, company: true },
  });
  const subscription = await prisma.subscription.findUnique({
    where: { organizationId: event.organizationId },
    select: { planKey: true },
  });
  const prefs = normalizeNotifications(
    settings?.notifications,
    subscription?.planKey ?? "trial",
  );
  if (!prefs.emailEnabled) return "skipped";
  if (!eventPrefEnabled(event.type, prefs.events)) return "skipped";

  const emailMode = await orgEmailMode(prisma, event.organizationId);
  if (!shouldEmailAttentionType(event.type, emailMode)) return "skipped";

  const recipients = await resolveRecipients(
    prisma,
    event.organizationId,
    prefs.recipients,
  );
  if (recipients.length === 0) return "skipped";

  const deliveryDedupe = `EMAIL:${event.id}`;
  const existing = await prisma.notificationDelivery.findUnique({
    where: {
      organizationId_dedupeKey: {
        organizationId: event.organizationId,
        dedupeKey: deliveryDedupe,
      },
    },
  });
  if (existing?.status === "SENT") return "sent";
  if (existing?.status === "SKIPPED") return "skipped";

  const delivery =
    existing ??
    (await prisma.notificationDelivery.create({
      data: {
        organizationId: event.organizationId,
        organizationAttentionEventId: event.id,
        organizationTenderId: event.organizationTenderId,
        channel: "EMAIL",
        templateKey: `attention.${event.type.toLowerCase()}`,
        dedupeKey: deliveryDedupe,
        status: "PENDING",
        payload: { recipients },
      },
    }));

  if (!isEmailEnabled()) {
    await prisma.notificationDelivery.update({
      where: { id: delivery.id },
      data: {
        status: "SKIPPED",
        error: "email_disabled",
        bodyPreview: event.title.slice(0, 180),
      },
    });
    return "skipped";
  }

  const meta = asMeta(event.metadata);
  const companyName = companyNameFromSettings(settings?.company);
  const topMatchesRaw = meta.topMatches;
  const topMatches = Array.isArray(topMatchesRaw)
    ? topMatchesRaw
        .filter((row): row is Record<string, unknown> => !!row && typeof row === "object")
        .map((row) => ({
          referenceNumber:
            typeof row.referenceNumber === "string" ? row.referenceNumber : null,
          title: typeof row.title === "string" ? row.title : null,
          score: typeof row.score === "number" ? row.score : null,
          authority: typeof row.authority === "string" ? row.authority : null,
          budgetWithoutVat:
            typeof row.budgetWithoutVat === "number" ? row.budgetWithoutVat : null,
          recordType: typeof row.recordType === "string" ? row.recordType : null,
          submissionDate:
            typeof row.submissionDate === "string" ? row.submissionDate : null,
          finalSubmissionDate:
            typeof row.finalSubmissionDate === "string"
              ? row.finalSubmissionDate
              : null,
        }))
    : [];
  const relatedItem = relatedItemFromEvent(event);
  const kind = copyKindFor(event.type);
  const copy = attentionEmailCopy({
    title: event.title,
    appUrl: resolveSaasAppUrl(),
    referenceNumber: relatedItem.referenceNumber,
    tenderTitle: relatedItem.title,
    authority: relatedItem.authority,
    score: metaNumber(meta, "score"),
    profileName: metaString(meta, "profileName"),
    companyName,
    matchCount: metaNumber(meta, "matchCount"),
    newCount: metaNumber(meta, "newCount"),
    topMatches,
    kind,
    sourceReferenceNumber: relatedItem.sourceReferenceNumber,
    sourceTenderTitle: relatedItem.sourceTenderTitle,
    sourceRecordType: relatedItem.sourceRecordType,
    relatedRecordType: relatedItem.relatedRecordType,
    confidence: relatedItem.confidence,
    relationType: metaString(meta, "relationType"),
    budgetWithoutVat: relatedItem.budgetWithoutVat,
    submissionDate: relatedItem.submissionDate,
    finalSubmissionDate: relatedItem.finalSubmissionDate,
  });

  try {
    for (const to of recipients) {
      await sendMail({
        to,
        subject: copy.subject,
        html: copy.html,
        text: copy.text,
      });
    }
    await prisma.notificationDelivery.update({
      where: { id: delivery.id },
      data: {
        status: "SENT",
        sentAt: new Date(),
        subject: copy.subject,
        bodyPreview: event.title.slice(0, 180),
        error: null,
        payload: { recipients },
      },
    });
    return "sent";
  } catch (error) {
    const message =
      error instanceof Error ? error.message.slice(0, 400) : "email_send_failed";
    await prisma.notificationDelivery.update({
      where: { id: delivery.id },
      data: {
        status: "FAILED",
        error: message,
        subject: copy.subject,
        bodyPreview: event.title.slice(0, 180),
      },
    });
    console.error("[email] attention delivery failed:", message);
    return "failed";
  }
};

export type FlushRelatedActModes = Array<"DIGEST" | "IMMEDIATE">;

/**
 * Group pending related-act / deadline updates into ONE email per organization.
 * - DIGEST (Basic/Trial): call at 08:00 & 18:00 Europe/Athens.
 * - IMMEDIATE (Pro): call after each monitor wave so Pro still gets sooner notice,
 *   but never N separate emails for N events in the same batch.
 */
export const flushRelatedActEmailDigests = async (
  prisma: PrismaClient,
  options?: { modes?: FlushRelatedActModes; organizationIds?: string[] },
): Promise<{ orgs: number; events: number; sent: number; skipped: number }> => {
  const modes = new Set<string>(
    options?.modes?.length ? options.modes : ["DIGEST", "IMMEDIATE"],
  );
  const orgFilter = options?.organizationIds?.length
    ? new Set(options.organizationIds)
    : null;
  const since = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
  const pending = await prisma.organizationAttentionEvent.findMany({
    where: {
      type: { in: [...RELATED_TYPES] },
      createdAt: { gte: since },
      ...(orgFilter
        ? { organizationId: { in: [...orgFilter] } }
        : {}),
      deliveries: {
        none: {
          channel: "EMAIL",
          status: "SENT",
        },
      },
    },
    include: relatedEventInclude,
    orderBy: { createdAt: "asc" },
  });

  const byOrg = new Map<string, typeof pending>();
  for (const event of pending) {
    const list = byOrg.get(event.organizationId) ?? [];
    list.push(event);
    byOrg.set(event.organizationId, list);
  }

  let sent = 0;
  let skipped = 0;

  for (const [organizationId, events] of byOrg) {
    if (orgFilter && !orgFilter.has(organizationId)) {
      skipped += events.length;
      continue;
    }
    const emailMode = await orgEmailMode(prisma, organizationId);
    if (!modes.has(emailMode)) {
      skipped += events.length;
      continue;
    }

    const settings = await prisma.organizationSettings.findUnique({
      where: { organizationId },
      select: { notifications: true, company: true },
    });
    const subscription = await prisma.subscription.findUnique({
      where: { organizationId },
      select: { planKey: true },
    });
    const prefs = normalizeNotifications(
      settings?.notifications,
      subscription?.planKey ?? "trial",
    );
    if (!prefs.emailEnabled || !prefs.events.relatedActOnFollowed) {
      skipped += events.length;
      continue;
    }

    const recipients = await resolveRecipients(
      prisma,
      organizationId,
      prefs.recipients,
    );
    if (recipients.length === 0) {
      skipped += events.length;
      continue;
    }

    if (!isEmailEnabled()) {
      skipped += events.length;
      continue;
    }

    const relatedItems = events.map((event) => relatedItemFromEvent(event));
    const copy = attentionEmailCopy({
      title: `${relatedItems.length} εξελίξεις σε παρακολουθήσεις`,
      appUrl: resolveSaasAppUrl(),
      companyName: companyNameFromSettings(settings?.company),
      kind: "related_act_digest",
      newCount: relatedItems.length,
      relatedItems,
    });

    try {
      for (const to of recipients) {
        await sendMail({
          to,
          subject: copy.subject,
          html: copy.html,
          text: copy.text,
        });
      }
      const now = new Date();
      for (const event of events) {
        const dedupeKey = `EMAIL:${event.id}`;
        await prisma.notificationDelivery.upsert({
          where: {
            organizationId_dedupeKey: {
              organizationId,
              dedupeKey,
            },
          },
          create: {
            organizationId,
            organizationAttentionEventId: event.id,
            organizationTenderId: event.organizationTenderId,
            channel: "EMAIL",
            templateKey: "attention.related_act_digest",
            dedupeKey,
            status: "SENT",
            sentAt: now,
            subject: copy.subject,
            bodyPreview: event.title.slice(0, 180),
            payload: { recipients, digest: true },
          },
          update: {
            status: "SENT",
            sentAt: now,
            subject: copy.subject,
            bodyPreview: event.title.slice(0, 180),
            error: null,
            templateKey: "attention.related_act_digest",
            payload: { recipients, digest: true },
          },
        });
      }
      sent += 1;
    } catch (error) {
      skipped += events.length;
      console.error(
        "[email] related-act digest failed:",
        organizationId,
        error instanceof Error ? error.message : error,
      );
    }
  }

  return {
    orgs: byOrg.size,
    events: pending.length,
    sent,
    skipped,
  };
};

/** Fire-and-forget so domain paths never await SMTP. */
export const queueAttentionEmail = (
  prisma: PrismaClient,
  attentionEventId: string,
): void => {
  void deliverAttentionEmail(prisma, attentionEventId).catch((error) => {
    console.error(
      "[email] queueAttentionEmail:",
      error instanceof Error ? error.message : error,
    );
  });
};
