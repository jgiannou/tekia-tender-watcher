import type { AttentionEventType, PrismaClient } from "@prisma/client";
import { normalizeNotifications } from "./org-settings.js";

type ExpoPushMessage = {
  to: string;
  title: string;
  body: string;
  sound: "default";
  priority: "high";
  channelId: "arc-tenders-alerts";
  data?: Record<string, unknown>;
};

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
  if (
    type === "RELATED_PROC_DISCOVERED" ||
    type === "RELATED_APPROVED_REQUEST_DISCOVERED" ||
    type === "RELATED_AWARD_DISCOVERED" ||
    type === "RELATED_CONTRACT_DISCOVERED" ||
    type === "DEADLINE_CHANGED"
  ) {
    return events.relatedActOnFollowed;
  }
  if (type === "DEADLINE_APPROACHING") return events.deadlineRadar;
  if (type === "SUBMISSION_RECORDED" || type === "OUTREACH_RECORDED") {
    return events.postSubmissionUpdate;
  }
  return true;
};

const bodyForEvent = (title: string, type: AttentionEventType): string => {
  if (type === "NEW_OPPORTUNITY" || type === "OPPORTUNITY_DIGEST") {
    return "Νέα ευκαιρία στο inbox σας.";
  }
  if (type.startsWith("RELATED_")) {
    return "Νέα εξέλιξη σε παρακολουθούμενο διαγωνισμό.";
  }
  if (type === "DEADLINE_APPROACHING" || type === "DEADLINE_CHANGED") {
    return "Ενημέρωση προθεσμίας.";
  }
  if (type === "SUBMISSION_RECORDED") return "Καταχωρήθηκε υποβολή.";
  if (type === "OUTREACH_RECORDED") return "Καταχωρήθηκε outreach.";
  return title;
};

export const upsertPushDevice = async (
  prisma: PrismaClient,
  input: {
    userId: string;
    token: string;
    platform: string;
    enabled?: boolean;
  },
) => {
  const token = input.token.trim();
  if (!token) throw new Error("missing_push_token");
  return prisma.pushDevice.upsert({
    where: { token },
    create: {
      userId: input.userId,
      token,
      platform: input.platform || "unknown",
      enabled: input.enabled ?? true,
      lastSeenAt: new Date(),
    },
    update: {
      userId: input.userId,
      platform: input.platform || "unknown",
      enabled: input.enabled ?? true,
      lastSeenAt: new Date(),
    },
  });
};

export const disablePushDevice = async (
  prisma: PrismaClient,
  input: { userId: string; token: string },
) => {
  const existing = await prisma.pushDevice.findUnique({
    where: { token: input.token.trim() },
  });
  if (!existing || existing.userId !== input.userId) return { ok: true as const };
  await prisma.pushDevice.update({
    where: { id: existing.id },
    data: { enabled: false },
  });
  return { ok: true as const };
};

export const setMobilePushEnabled = async (
  prisma: PrismaClient,
  input: { userId: string; enabled: boolean },
) =>
  prisma.userPreference.upsert({
    where: { userId: input.userId },
    create: {
      userId: input.userId,
      theme: "DARK",
      mobilePushEnabled: input.enabled,
    },
    update: { mobilePushEnabled: input.enabled },
  });

const sendExpoPush = async (messages: ExpoPushMessage[]) => {
  if (messages.length === 0) return { sent: 0, tickets: [] as unknown[] };
  const response = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Accept-Encoding": "gzip, deflate",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(messages),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`expo_push_http_${response.status}:${text.slice(0, 200)}`);
  }
  const payload = (await response.json().catch(() => null)) as {
    data?: unknown;
  } | null;
  return { sent: messages.length, tickets: payload?.data ?? [] };
};

/** Send a direct test push to all enabled devices for a user. */
export const sendTestPushToUser = async (
  prisma: PrismaClient,
  userId: string,
): Promise<{ sent: number; skipped: number; tickets: unknown }> => {
  const preference = await prisma.userPreference.findUnique({
    where: { userId },
    select: { mobilePushEnabled: true },
  });
  if (preference && preference.mobilePushEnabled === false) {
    return { sent: 0, skipped: 1, tickets: [] };
  }

  const devices = await prisma.pushDevice.findMany({
    where: { userId, enabled: true },
    select: { token: true },
  });
  if (devices.length === 0) return { sent: 0, skipped: 1, tickets: [] };

  const messages: ExpoPushMessage[] = devices.map((device) => ({
    to: device.token,
    title: "ARC Tenders",
    body: "Δοκιμαστική ειδοποίηση — push με ήχο στην οθόνη κλειδώματος.",
    sound: "default",
    priority: "high",
    channelId: "arc-tenders-alerts",
    data: {
      test: true,
      url: "arctenders://notifications",
    },
  }));

  const result = await sendExpoPush(messages);
  return { sent: result.sent, skipped: 0, tickets: result.tickets };
};

export const deliverAttentionPush = async (
  prisma: PrismaClient,
  attentionEventId: string,
): Promise<{ sent: number; skipped: number }> => {
  const event = await prisma.organizationAttentionEvent.findUnique({
    where: { id: attentionEventId },
    select: {
      id: true,
      organizationId: true,
      type: true,
      title: true,
      organizationTender: {
        select: {
          tender: {
            select: {
              referenceNumber: true,
              recordType: true,
            },
          },
        },
      },
    },
  });
  if (!event) return { sent: 0, skipped: 1 };

  const settings = await prisma.organizationSettings.findUnique({
    where: { organizationId: event.organizationId },
    select: { notifications: true },
  });
  const prefs = normalizeNotifications(settings?.notifications);
  if (!eventPrefEnabled(event.type, prefs.events)) {
    return { sent: 0, skipped: 1 };
  }

  const members = await prisma.organizationMember.findMany({
    where: { organizationId: event.organizationId },
    select: { userId: true },
  });
  const userIds = members.map((m) => m.userId);
  if (userIds.length === 0) return { sent: 0, skipped: 1 };

  const preferences = await prisma.userPreference.findMany({
    where: { userId: { in: userIds }, mobilePushEnabled: true },
    select: { userId: true },
  });
  // Users without a preference row default to enabled (schema default).
  const enabledSet = new Set(preferences.map((p) => p.userId));
  const missingPrefs = userIds.filter(
    (id) => !preferences.some((p) => p.userId === id),
  );
  for (const id of missingPrefs) enabledSet.add(id);

  const devices = await prisma.pushDevice.findMany({
    where: {
      userId: { in: [...enabledSet] },
      enabled: true,
    },
    select: { token: true },
  });
  if (devices.length === 0) return { sent: 0, skipped: 1 };

  const ref = event.organizationTender.tender.referenceNumber;
  const recordType = event.organizationTender.tender.recordType;
  const messages: ExpoPushMessage[] = devices.map((device) => ({
    to: device.token,
    title: "ARC Tenders",
    body: `${event.title}\n${bodyForEvent(event.title, event.type)}`,
    sound: "default",
    priority: "high",
    channelId: "arc-tenders-alerts",
    data: {
      attentionEventId: event.id,
      type: event.type,
      referenceNumber: ref,
      recordType,
      url: `arctenders://tenders/${recordType}/${encodeURIComponent(ref)}`,
    },
  }));

  await sendExpoPush(messages);
  return { sent: messages.length, skipped: 0 };
};

/** Fire-and-forget push so domain paths never await Expo network. */
export const queueAttentionPush = (
  prisma: PrismaClient,
  attentionEventId: string,
): void => {
  void deliverAttentionPush(prisma, attentionEventId).catch((error) => {
    console.error(
      "[push] queueAttentionPush:",
      error instanceof Error ? error.message : error,
    );
  });
};
