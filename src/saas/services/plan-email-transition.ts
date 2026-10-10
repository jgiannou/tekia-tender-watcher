import type { Prisma, PrismaClient } from "@prisma/client";
import { PLAN_KEYS, entitlementsForPlanKey } from "../plans/catalog.js";
import { cancelPendingProductJobsForOrg } from "../jobs/outbox.js";
import { normalizeNotifications } from "./org-settings.js";
import { assignWeeklyDigestSlot } from "./weekly-digest-schedule.js";

/**
 * When an org moves to Free (trial expiry / cancel / downgrade):
 * cancel pending daily/immediate product emails and ensure weekly slot exists.
 * Does not delete in-app attention events.
 */
export const onTransitionToFreeEmailPolicy = async (
  prisma: PrismaClient,
  organizationId: string,
): Promise<{ cancelledJobs: number }> => {
  const cancelledJobs = await cancelPendingProductJobsForOrg(
    prisma,
    organizationId,
  );
  const settings = await prisma.organizationSettings.findUnique({
    where: { organizationId },
    select: { notifications: true },
  });
  if (!settings) return { cancelledJobs };

  const prefs = normalizeNotifications(
    settings.notifications,
    PLAN_KEYS.free,
    organizationId,
  );
  const weekly =
    typeof prefs.weeklyDigestWeekday === "number" && prefs.weeklyDigestHour
      ? {
          weeklyDigestWeekday: prefs.weeklyDigestWeekday,
          weeklyDigestHour: prefs.weeklyDigestHour,
        }
      : assignWeeklyDigestSlot(organizationId);

  const next = {
    ...prefs,
    digestHours: [],
    emailDeliveryMode: "DIGEST" as const,
    weeklyDigestWeekday: weekly.weeklyDigestWeekday,
    weeklyDigestHour: weekly.weeklyDigestHour,
  };

  await prisma.organizationSettings.update({
    where: { organizationId },
    data: { notifications: next as unknown as Prisma.InputJsonValue },
  });

  return { cancelledJobs };
};

/** After upgrade: do not replay backlog as immediates — cancel stale pending only. */
export const onUpgradeFromFreeEmailPolicy = async (
  prisma: PrismaClient,
  organizationId: string,
  planKey: string,
): Promise<void> => {
  const plan = entitlementsForPlanKey(planKey);
  if (plan.emailCadence === "WEEKLY") return;
  await cancelPendingProductJobsForOrg(prisma, organizationId, [
    "WEEKLY_DIGEST",
  ]);
};
