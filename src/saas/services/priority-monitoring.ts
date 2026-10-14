import type {
  PrismaClient,
  PriorityMonitoringReason,
} from "@prisma/client";
import { requireOrgMembership } from "../auth/org-context.js";
import { badRequest, forbidden } from "../errors.js";
import { trackProductEventSafe } from "../ops/product-events.js";
import {
  entitlementsForPlanKey,
  normalizePlanKey,
  PLAN_KEYS,
} from "../plans/catalog.js";

const TERMINAL_STAGES = new Set([
  "WON",
  "LOST",
  "CLOSED",
  "DISMISSED",
]);

/** Align with shared ingest cadence so Hot Watch does not starve the API. */
export const PRIORITY_CHECK_INTERVAL_MS = 120_000;

export const orgHasPriorityMonitoring = async (
  prisma: PrismaClient,
  organizationId: string,
): Promise<{ allowed: boolean; planKey: string }> => {
  const [subscription, promo] = await Promise.all([
    prisma.subscription.findUnique({
      where: { organizationId },
      select: { planKey: true, trialEndsAt: true },
    }),
    prisma.organizationPromotionRedemption.findFirst({
      where: {
        organizationId,
        status: "ACTIVE",
        expiresAt: { gt: new Date() },
      },
      select: { id: true },
    }),
  ]);
  let planKey = normalizePlanKey(subscription?.planKey ?? PLAN_KEYS.free);
  if (
    promo ||
    (subscription?.trialEndsAt && subscription.trialEndsAt.getTime() > Date.now())
  ) {
    // Active promo / trial mirrors Pro entitlements for Priority Monitoring.
    if (planKey === PLAN_KEYS.free || planKey === PLAN_KEYS.basic) {
      planKey = promo ? PLAN_KEYS.pro : PLAN_KEYS.trial;
    }
  }
  const plan = entitlementsForPlanKey(planKey);
  return { allowed: plan.priorityMonitoring === true, planKey };
};

export const enablePriorityMonitoring = async (
  prisma: PrismaClient,
  input: {
    organizationId: string;
    organizationTenderId: string;
    reason: PriorityMonitoringReason;
    userId?: string | null;
  },
): Promise<{ enabled: boolean; skipped?: string }> => {
  const orgTender = await prisma.organizationTender.findFirst({
    where: {
      id: input.organizationTenderId,
      organizationId: input.organizationId,
    },
  });
  if (!orgTender) return { enabled: false, skipped: "not_found" };
  if (TERMINAL_STAGES.has(orgTender.pipelineStage)) {
    return { enabled: false, skipped: "terminal" };
  }

  const { allowed, planKey } = await orgHasPriorityMonitoring(
    prisma,
    input.organizationId,
  );
  if (!allowed) {
    return { enabled: false, skipped: "plan" };
  }

  if (orgTender.monitoringPriority === "PRIORITY") {
    return { enabled: true };
  }

  const now = new Date();
  await prisma.organizationTender.update({
    where: { id: orgTender.id },
    data: {
      monitoringActive: true,
      monitoringPriority: "PRIORITY",
      priorityMonitoringSince: now,
      priorityMonitoringReason: input.reason,
      nextPriorityCheckAt: now,
      priorityMonitoringLastError: null,
      priorityMonitoringErrorCount: 0,
      monitoringStoppedAt: null,
      ...(orgTender.monitoringStartedAt
        ? {}
        : {
            monitoringStartedAt: now,
            monitoringReason:
              input.reason === "OUTREACH" ? "OUTREACH_SENT" : "USER_FOLLOWING",
          }),
    },
  });

  trackProductEventSafe(prisma, {
    type: "priority_monitoring_started",
    organizationId: input.organizationId,
    userId: input.userId ?? null,
    entityType: "organization_tender",
    entityId: orgTender.id,
    metadata: {
      tenderId: orgTender.tenderId,
      reason: input.reason,
      planKey,
    },
  });

  return { enabled: true };
};

export const disablePriorityMonitoring = async (
  prisma: PrismaClient,
  input: {
    userId: string;
    organizationId: string;
    organizationTenderId: string;
  },
): Promise<void> => {
  await requireOrgMembership(prisma, input.userId, input.organizationId);
  const orgTender = await prisma.organizationTender.findFirst({
    where: {
      id: input.organizationTenderId,
      organizationId: input.organizationId,
    },
  });
  if (!orgTender) throw badRequest("organization_tender_not_found");

  if (orgTender.monitoringPriority !== "PRIORITY") return;

  await prisma.organizationTender.update({
    where: { id: orgTender.id },
    data: {
      monitoringPriority: "NORMAL",
      nextPriorityCheckAt: null,
      priorityMonitoringReason: null,
    },
  });

  trackProductEventSafe(prisma, {
    type: "priority_monitoring_stopped",
    organizationId: input.organizationId,
    userId: input.userId,
    entityType: "organization_tender",
    entityId: orgTender.id,
    metadata: { tenderId: orgTender.tenderId },
  });
};

export const setPriorityMonitoringManual = async (
  prisma: PrismaClient,
  input: {
    userId: string;
    organizationId: string;
    organizationTenderId: string;
    enabled: boolean;
  },
) => {
  await requireOrgMembership(prisma, input.userId, input.organizationId);
  if (!input.enabled) {
    await disablePriorityMonitoring(prisma, input);
    return { enabled: false };
  }

  const { allowed } = await orgHasPriorityMonitoring(
    prisma,
    input.organizationId,
  );
  if (!allowed) {
    throw forbidden("priority_monitoring_requires_pro");
  }

  const orgTender = await prisma.organizationTender.findFirst({
    where: {
      id: input.organizationTenderId,
      organizationId: input.organizationId,
    },
  });
  if (!orgTender) throw badRequest("organization_tender_not_found");
  if (!orgTender.following && !orgTender.monitoringActive) {
    throw badRequest("follow_required_for_priority_monitoring");
  }

  return enablePriorityMonitoring(prisma, {
    organizationId: input.organizationId,
    organizationTenderId: orgTender.id,
    reason: "MANUAL",
    userId: input.userId,
  });
};

/**
 * On Pro→Basic/Free downgrade: keep follow/history, drop Priority intensity.
 */
export const downgradePriorityMonitoringForOrg = async (
  prisma: PrismaClient,
  organizationId: string,
): Promise<number> => {
  const result = await prisma.organizationTender.updateMany({
    where: {
      organizationId,
      monitoringPriority: "PRIORITY",
    },
    data: {
      monitoringPriority: "NORMAL",
      nextPriorityCheckAt: null,
    },
  });
  if (result.count > 0) {
    trackProductEventSafe(prisma, {
      type: "priority_monitoring_downgraded",
      organizationId,
      metadata: { count: result.count, toPlan: PLAN_KEYS.basic },
    });
  }
  return result.count;
};
