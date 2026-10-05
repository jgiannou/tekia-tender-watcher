import type { AttentionEventType, PrismaClient } from "@prisma/client";
import {
  deadlineRadarEmailCopy,
  isEmailEnabled,
  resolveSaasAppUrl,
  sendMail,
} from "../mail/mail.js";
import { entitlementsForPlanKey, PLAN_KEYS } from "../plans/catalog.js";
import { pruneAttentionEventsForOrg } from "../services/attention.js";
import { athensDateKey } from "../services/digest-hours.js";
import { normalizeNotifications } from "../services/org-settings.js";
import { queueAttentionPush } from "../services/push.js";

const daysUntil = (iso: string, now = new Date()): number | null => {
  const target = new Date(iso);
  if (Number.isNaN(target.getTime())) return null;
  const ms = target.getTime() - now.getTime();
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
};

const companyNameFromSettings = (company: unknown): string | null => {
  if (!company || typeof company !== "object") return null;
  const obj = company as Record<string, unknown>;
  if (typeof obj.legalName === "string" && obj.legalName.trim()) {
    return obj.legalName.trim();
  }
  if (typeof obj.distinctiveTitle === "string" && obj.distinctiveTitle.trim()) {
    return obj.distinctiveTitle.trim();
  }
  return null;
};

export type DeadlineRadarItem = {
  organizationTenderId: string;
  tenderId: string;
  referenceNumber: string;
  title: string | null;
  finalSubmissionDate: string;
  daysRemaining: number;
};

/**
 * Pro-only: create in-app attention + one grouped email for approaching deadlines
 * (0–2 days urgent; email also lists up to 7 days).
 */
export const runDeadlineRadarForOrganizations = async (
  prisma: PrismaClient,
  organizationIds: string[],
): Promise<{ orgs: number; events: number; emailsSent: number }> => {
  if (organizationIds.length === 0) {
    return { orgs: 0, events: 0, emailsSent: 0 };
  }

  let eventsCreated = 0;
  let emailsSent = 0;
  const dateKey = athensDateKey();

  for (const organizationId of organizationIds) {
    const subscription = await prisma.subscription.findUnique({
      where: { organizationId },
      select: { planKey: true },
    });
    const planKey = subscription?.planKey ?? PLAN_KEYS.trial;
    const plan = entitlementsForPlanKey(planKey);
    if (!plan.deadlineRadar) continue;

    const settings = await prisma.organizationSettings.findUnique({
      where: { organizationId },
      select: { notifications: true, company: true },
    });
    const prefs = normalizeNotifications(settings?.notifications, planKey);
    if (!prefs.events.deadlineRadar) continue;

    const followed = await prisma.organizationTender.findMany({
      where: {
        organizationId,
        OR: [{ following: true }, { monitoringActive: true }],
      },
      select: {
        id: true,
        tenderId: true,
        tender: {
          select: {
            referenceNumber: true,
            title: true,
            finalSubmissionDate: true,
          },
        },
      },
    });

    const items: DeadlineRadarItem[] = [];
    for (const row of followed) {
      const finalDate = row.tender.finalSubmissionDate;
      if (!finalDate) continue;
      const finalIso =
        finalDate instanceof Date ? finalDate.toISOString() : String(finalDate);
      const remaining = daysUntil(finalIso);
      if (remaining == null || remaining < 0 || remaining > 7) continue;
      items.push({
        organizationTenderId: row.id,
        tenderId: row.tenderId,
        referenceNumber: row.tender.referenceNumber,
        title: row.tender.title,
        finalSubmissionDate: finalIso,
        daysRemaining: remaining,
      });
    }
    if (items.length === 0) continue;
    items.sort((a, b) => a.daysRemaining - b.daysRemaining);

    const urgent = items.filter((item) => item.daysRemaining <= 2);
    const seedItems = urgent.length > 0 ? urgent : items.slice(0, 5);

    let anchorEventId: string | null = null;
    let anchorOrgTenderId: string | null = null;

    for (const item of seedItems) {
      const type = "DEADLINE_APPROACHING" as AttentionEventType;
      const dedupeKey = `DEADLINE_APPROACHING:${item.organizationTenderId}:${dateKey}`;
      const title =
        item.daysRemaining <= 0
          ? `Προθεσμία σήμερα · ${item.referenceNumber}`
          : item.daysRemaining === 1
            ? `Προθεσμία αύριο · ${item.referenceNumber}`
            : `Προθεσμία σε ${item.daysRemaining} ημέρες · ${item.referenceNumber}`;
      const existing = await prisma.organizationAttentionEvent.findUnique({
        where: {
          organizationId_dedupeKey: { organizationId, dedupeKey },
        },
        select: { id: true, organizationTenderId: true },
      });
      if (existing) {
        anchorEventId = existing.id;
        anchorOrgTenderId = existing.organizationTenderId;
        continue;
      }
      const created = await prisma.organizationAttentionEvent.create({
        data: {
          organizationId,
          organizationTenderId: item.organizationTenderId,
          type,
          title,
          dedupeKey,
          metadata: {
            daysRemaining: item.daysRemaining,
            finalSubmissionDate: item.finalSubmissionDate,
            referenceNumber: item.referenceNumber,
            radar: true,
          },
        },
      });
      eventsCreated += 1;
      anchorEventId = created.id;
      anchorOrgTenderId = created.organizationTenderId;
      queueAttentionPush(prisma, created.id);
    }
    await pruneAttentionEventsForOrg(prisma, organizationId);

    if (!prefs.emailEnabled || !isEmailEnabled() || !anchorEventId) continue;

    const members = await prisma.organizationMember.findMany({
      where: {
        organizationId,
        role: { in: ["OWNER", "ADMIN"] },
      },
      include: { user: { select: { email: true } } },
    });
    const recipients =
      prefs.recipients.length > 0
        ? prefs.recipients
        : [
            ...new Set(
              members
                .map((m) => m.user.email.trim().toLowerCase())
                .filter((e) => e.includes("@")),
            ),
          ];
    if (recipients.length === 0) continue;

    const emailDedupe = `DEADLINE_RADAR_EMAIL:${organizationId}:${dateKey}`;
    const already = await prisma.notificationDelivery.findUnique({
      where: {
        organizationId_dedupeKey: {
          organizationId,
          dedupeKey: emailDedupe,
        },
      },
      select: { id: true, status: true },
    });
    if (already?.status === "SENT") continue;

    const copy = deadlineRadarEmailCopy({
      appUrl: resolveSaasAppUrl(),
      companyName: companyNameFromSettings(settings?.company),
      items,
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
      await prisma.notificationDelivery.upsert({
        where: {
          organizationId_dedupeKey: {
            organizationId,
            dedupeKey: emailDedupe,
          },
        },
        create: {
          organizationId,
          organizationAttentionEventId: anchorEventId,
          organizationTenderId: anchorOrgTenderId,
          channel: "EMAIL",
          templateKey: "attention.deadline_radar",
          dedupeKey: emailDedupe,
          status: "SENT",
          sentAt: new Date(),
          subject: copy.subject,
          bodyPreview: copy.subject.slice(0, 180),
          payload: { recipients, count: items.length },
        },
        update: {
          status: "SENT",
          sentAt: new Date(),
          subject: copy.subject,
          error: null,
        },
      });
      emailsSent += 1;
    } catch (error) {
      console.error(
        "[email] deadline radar failed:",
        organizationId,
        error instanceof Error ? error.message : error,
      );
    }
  }

  return {
    orgs: organizationIds.length,
    events: eventsCreated,
    emailsSent,
  };
};
