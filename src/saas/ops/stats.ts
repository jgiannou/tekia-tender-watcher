import type { PrismaClient } from "@prisma/client";
import { getLogStats } from "./logger.js";

const PAID_PLAN_KEYS = ["basic", "pro"] as const;

export const collectOpsStats = async (prisma: PrismaClient) => {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [users, organizations, memberships, subs, usersLast7d, usersLast24h, orgsLast7d, unverifiedUsers] =
    await Promise.all([
      prisma.user.count(),
      prisma.organization.count(),
      prisma.organizationMember.count(),
      prisma.subscription.findMany({
        select: { planKey: true, status: true, organizationId: true },
      }),
      prisma.user.count({ where: { createdAt: { gte: weekAgo } } }),
      prisma.user.count({ where: { createdAt: { gte: dayAgo } } }),
      prisma.organization.count({ where: { createdAt: { gte: weekAgo } } }),
      prisma.user.count({ where: { emailVerified: false } }),
    ]);

  const byPlan = { free: 0, trial: 0, basic: 0, pro: 0 };
  const byBillingStatus = {
    trialing: 0,
    active: 0,
    past_due: 0,
    canceled: 0,
    incomplete: 0,
  };

  for (const sub of subs) {
    if (sub.planKey in byPlan) {
      byPlan[sub.planKey as keyof typeof byPlan] += 1;
    }
    const statusKey = sub.status.toLowerCase() as keyof typeof byBillingStatus;
    if (statusKey in byBillingStatus) {
      byBillingStatus[statusKey] += 1;
    }
  }

  const payingOrgIds = new Set(
    subs
      .filter(
        (s) =>
          PAID_PLAN_KEYS.includes(s.planKey as (typeof PAID_PLAN_KEYS)[number]) &&
          (s.status === "ACTIVE" || s.status === "PAST_DUE"),
      )
      .map((s) => s.organizationId),
  );

  const payingUsers =
    payingOrgIds.size === 0
      ? 0
      : await prisma.organizationMember.count({
          where: { organizationId: { in: [...payingOrgIds] } },
        });

  return {
    generatedAt: new Date().toISOString(),
    users,
    organizations,
    memberships,
    usersLast7d,
    usersLast24h,
    orgsLast7d,
    unverifiedUsers,
    byPlan,
    byBillingStatus,
    payingOrgs: payingOrgIds.size,
    payingUsers,
    logs: getLogStats(),
  };
};

export { PAID_PLAN_KEYS };
