import type { Prisma, PrismaClient } from "@prisma/client";
import {
  isEmailEnabled,
  resolveSaasAppUrl,
  sendMail,
  weeklyFreeDigestEmailCopy,
} from "../mail/mail.js";
import { PLAN_KEYS, entitlementsForPlanKey } from "../plans/catalog.js";
import { enqueueSaasJob, SAAS_JOB_TYPES } from "./outbox.js";
import { normalizeNotifications } from "../services/org-settings.js";
import {
  isWeeklySlotDue,
  weeklyCycleId,
} from "../services/weekly-digest-schedule.js";

type DigestItem = {
  title: string;
  authority: string | null;
  kind: string;
  deadline: string | null;
  href: string;
};

const RELATED_TYPES = [
  "RELATED_PROC_DISCOVERED",
  "RELATED_APPROVED_REQUEST_DISCOVERED",
  "RELATED_AWARD_DISCOVERED",
  "RELATED_CONTRACT_DISCOVERED",
  "DEADLINE_CHANGED",
] as const;

const resolveWeeklyRecipient = async (
  prisma: PrismaClient,
  organizationId: string,
  prefs: ReturnType<typeof normalizeNotifications>,
): Promise<string | null> => {
  if (prefs.weeklyRecipient?.includes("@")) {
    return prefs.weeklyRecipient.trim().toLowerCase();
  }
  if (prefs.recipients[0]?.includes("@")) {
    return prefs.recipients[0]!.trim().toLowerCase();
  }
  const owner = await prisma.organizationMember.findFirst({
    where: { organizationId, role: { in: ["OWNER", "ADMIN"] } },
    include: { user: { select: { email: true, emailVerified: true } } },
    orderBy: { createdAt: "asc" },
  });
  const email = owner?.user.email?.trim().toLowerCase();
  if (!email || !email.includes("@")) return null;
  // Prefer verified owners; if Better Auth leaves emailVerified null, still allow.
  if (owner?.user.emailVerified === false) return null;
  return email;
};

const buildWeeklyPayload = async (
  prisma: PrismaClient,
  organizationId: string,
  since: Date,
): Promise<{
  opportunities: DigestItem[];
  developments: DigestItem[];
  deadlines: DigestItem[];
  hasNew: boolean;
}> => {
  const appUrl = resolveSaasAppUrl().replace(/\/+$/, "");
  const now = new Date();
  const events = await prisma.organizationAttentionEvent.findMany({
    where: {
      organizationId,
      createdAt: { gt: since },
      type: {
        in: [
          "NEW_OPPORTUNITY",
          "OPPORTUNITY_DIGEST",
          ...RELATED_TYPES,
          "DEADLINE_APPROACHING",
        ],
      },
    },
    include: {
      organizationTender: {
        include: {
          tender: {
            select: {
              title: true,
              contractingAuthority: true,
              finalSubmissionDate: true,
              submissionDate: true,
              id: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 80,
  });

  const seenTender = new Set<string>();
  const opportunities: DigestItem[] = [];
  const developments: DigestItem[] = [];
  const deadlines: DigestItem[] = [];

  for (const event of events) {
    const tender = event.organizationTender.tender;
    const tenderKey = event.organizationTenderId;
    if (seenTender.has(`${event.type}:${tenderKey}`)) continue;
    seenTender.add(`${event.type}:${tenderKey}`);

    const deadlineRaw =
      tender.finalSubmissionDate ?? tender.submissionDate ?? null;
    const expired = deadlineRaw ? deadlineRaw.getTime() < now.getTime() : false;
    const item: DigestItem = {
      title: tender.title || event.title,
      authority: tender.contractingAuthority,
      kind: event.type,
      deadline: deadlineRaw ? deadlineRaw.toISOString() : null,
      href: `${appUrl}/app/tenders/${event.organizationTenderId}`,
    };

    if (event.type === "NEW_OPPORTUNITY" || event.type === "OPPORTUNITY_DIGEST") {
      if (!expired) opportunities.push(item);
      continue;
    }
    if (event.type === "DEADLINE_APPROACHING") {
      if (!expired) deadlines.push(item);
      continue;
    }
    developments.push({
      ...item,
      kind: expired ? `${event.type}:EXPIRED` : event.type,
    });
  }

  const hasNew =
    opportunities.length > 0 ||
    developments.length > 0 ||
    deadlines.length > 0;

  return { opportunities, developments, deadlines, hasNew };
};

/** Enqueue due Free weekly digests (one job per org/cycle). */
export const scheduleDueWeeklyFreeDigests = async (
  prisma: PrismaClient,
  now = new Date(),
): Promise<{ due: number; enqueued: number }> => {
  const freeOrgs = await prisma.subscription.findMany({
    where: { planKey: PLAN_KEYS.free, status: { in: ["ACTIVE", "CANCELED"] } },
    select: { organizationId: true },
  });

  const cycle = weeklyCycleId(now);
  let due = 0;
  let enqueued = 0;

  for (const { organizationId } of freeOrgs) {
    const settings = await prisma.organizationSettings.findUnique({
      where: { organizationId },
      select: { notifications: true },
    });
    const prefs = normalizeNotifications(
      settings?.notifications,
      PLAN_KEYS.free,
      organizationId,
    );
    if (!prefs.emailEnabled || !prefs.weeklyEmailEnabled) continue;
    if (
      !isWeeklySlotDue({
        weeklyDigestWeekday: prefs.weeklyDigestWeekday,
        weeklyDigestHour: prefs.weeklyDigestHour,
        now,
      })
    ) {
      continue;
    }
    due += 1;
    const result = await enqueueSaasJob(prisma, {
      type: SAAS_JOB_TYPES.weeklyDigest,
      deliveryKey: `WEEKLY_DIGEST:${organizationId}:${cycle}`,
      organizationId,
      payload: { cycleId: cycle },
      priority: 80,
    });
    if (result.created) enqueued += 1;
  }

  return { due, enqueued };
};

export const processWeeklyFreeDigestJob = async (
  prisma: PrismaClient,
  organizationId: string,
): Promise<"ok" | "skip" | "retry"> => {
  const subscription = await prisma.subscription.findUnique({
    where: { organizationId },
    select: { planKey: true },
  });
  const plan = entitlementsForPlanKey(subscription?.planKey ?? PLAN_KEYS.free);
  if (plan.emailCadence !== "WEEKLY") return "skip";

  const settings = await prisma.organizationSettings.findUnique({
    where: { organizationId },
    select: { notifications: true, company: true },
  });
  const prefs = normalizeNotifications(
    settings?.notifications,
    PLAN_KEYS.free,
    organizationId,
  );
  if (!prefs.emailEnabled || !prefs.weeklyEmailEnabled) return "skip";

  const recipient = await resolveWeeklyRecipient(prisma, organizationId, prefs);
  if (!recipient) return "skip";

  const since = prefs.weeklyLastSentAt
    ? new Date(prefs.weeklyLastSentAt)
    : new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);

  const payload = await buildWeeklyPayload(prisma, organizationId, since);
  if (!payload.hasNew) return "skip";

  if (!isEmailEnabled()) return "skip";

  const companyRaw =
    settings?.company && typeof settings.company === "object"
      ? (settings.company as Record<string, unknown>)
      : {};
  const companyName =
    (typeof companyRaw.legalName === "string" && companyRaw.legalName) ||
    (typeof companyRaw.distinctiveTitle === "string" &&
      companyRaw.distinctiveTitle) ||
    null;

  const copy = weeklyFreeDigestEmailCopy({
    appUrl: resolveSaasAppUrl(),
    companyName,
    opportunities: payload.opportunities,
    developments: payload.developments,
    deadlines: payload.deadlines,
  });

  try {
    await sendMail({
      to: recipient,
      subject: copy.subject,
      html: copy.html,
      text: copy.text,
    });
  } catch {
    return "retry";
  }

  const nextPrefs = {
    ...prefs,
    weeklyLastSentAt: new Date().toISOString(),
  };
  await prisma.organizationSettings.update({
    where: { organizationId },
    data: { notifications: nextPrefs as unknown as Prisma.InputJsonValue },
  });

  return "ok";
};
