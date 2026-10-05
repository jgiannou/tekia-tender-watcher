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
 * Plan email policy:
 * - IMMEDIATE (Pro): per NEW_OPPORTUNITY + related acts.
 *   Initial Pro scans only emit OPPORTUNITY_DIGEST → that digest is emailed.
 * - DIGEST (Basic/Trial): OPPORTUNITY_DIGEST + related acts (not each match).
 * Digest *creation* is gated in watch-profiles so Pro does not double-email.
 */
export const shouldEmailAttentionType = (
  type: AttentionEventType,
  emailMode: "DIGEST" | "IMMEDIATE",
): boolean => {
  if (RELATED_TYPES.has(type)) return true;
  if (type === "NEW_OPPORTUNITY") return emailMode === "IMMEDIATE";
  if (type === "OPPORTUNITY_DIGEST") return true;
  if (type === "SUBMISSION_RECORDED" || type === "OUTREACH_RECORDED") {
    return true;
  }
  return false;
};

const eventPrefEnabled = (
  type: AttentionEventType,
  events: {
    newOpportunity: boolean;
    relatedActOnFollowed: boolean;
    postSubmissionUpdate: boolean;
  },
): boolean => {
  if (type === "NEW_OPPORTUNITY" || type === "OPPORTUNITY_DIGEST") {
    return events.newOpportunity;
  }
  if (RELATED_TYPES.has(type)) return events.relatedActOnFollowed;
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
): "new_opportunity" | "digest" | "related_act" => {
  if (type === "OPPORTUNITY_DIGEST") return "digest";
  if (RELATED_TYPES.has(type)) return "related_act";
  return "new_opportunity";
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
  });
  if (!event) return "skipped";

  const settings = await prisma.organizationSettings.findUnique({
    where: { organizationId: event.organizationId },
    select: { notifications: true },
  });
  const prefs = normalizeNotifications(settings?.notifications);
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
  const copy = attentionEmailCopy({
    title: event.title,
    appUrl: resolveSaasAppUrl(),
    referenceNumber: metaString(meta, "referenceNumber"),
    tenderTitle:
      metaString(meta, "tenderTitle") ??
      metaString(meta, "relatedTenderTitle") ??
      metaString(meta, "sourceTenderTitle"),
    authority: metaString(meta, "authority"),
    score: metaNumber(meta, "score"),
    profileName: metaString(meta, "profileName"),
    matchCount: metaNumber(meta, "matchCount"),
    newCount: metaNumber(meta, "newCount"),
    kind: copyKindFor(event.type),
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
