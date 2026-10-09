import type { PrismaClient } from "@prisma/client";
import { requireOrgMembership } from "../auth/org-context.js";
import { badRequest, forbidden } from "../errors.js";
import { trackProductEventSafe } from "../ops/product-events.js";
import { PLAN_KEYS, TRIAL_DURATION_MS, normalizePlanKey } from "../plans/catalog.js";
import { ensureOrganizationSubscription } from "./scan-access.js";

export const canStartProTrial = (subscription: {
  planKey: string;
  status: string;
  trialEndsAt: Date | null;
  stripeSubscriptionId: string | null;
}): boolean => {
  if (subscription.stripeSubscriptionId) return false;
  const planKey = normalizePlanKey(subscription.planKey);
  if (planKey !== PLAN_KEYS.free) return false;
  // A past trialEndsAt means the org already used the separate Pro preview.
  if (subscription.trialEndsAt) return false;
  return true;
};

/** Separate 7-day Pro preview. Does not replace Free signup. Once per org. */
export const startProTrial = async (
  prisma: PrismaClient,
  input: { userId: string; organizationId: string | null },
) => {
  const { organizationId, membership } = await requireOrgMembership(
    prisma,
    input.userId,
    input.organizationId,
  );
  if (membership.role !== "OWNER" && membership.role !== "ADMIN") {
    throw forbidden("insufficient_role");
  }

  const subscription = await ensureOrganizationSubscription(prisma, organizationId);
  if (subscription.stripeSubscriptionId) {
    throw badRequest("paid_plan_active");
  }

  const planKey = normalizePlanKey(subscription.planKey);
  if (planKey === PLAN_KEYS.trial && subscription.status === "TRIALING") {
    const stillActive =
      !subscription.trialEndsAt ||
      subscription.trialEndsAt.getTime() > Date.now();
    if (stillActive) {
      return {
        ok: true as const,
        already: true as const,
        trialEndsAt: subscription.trialEndsAt?.toISOString() ?? null,
        planKey: PLAN_KEYS.trial,
      };
    }
  }

  if (!canStartProTrial(subscription)) {
    if (planKey !== PLAN_KEYS.free) {
      throw badRequest("trial_only_from_free");
    }
    throw badRequest("pro_trial_already_used");
  }

  const trialEndsAt = new Date(Date.now() + TRIAL_DURATION_MS);
  const updated = await prisma.subscription.update({
    where: { organizationId },
    data: {
      planKey: PLAN_KEYS.trial,
      status: "TRIALING",
      trialEndsAt,
      cancelAtPeriodEnd: false,
    },
  });

  trackProductEventSafe(prisma, {
    type: "pro_trial_started",
    userId: input.userId,
    organizationId,
    metadata: { trialEndsAt: trialEndsAt.toISOString() },
  });

  return {
    ok: true as const,
    already: false as const,
    trialEndsAt: updated.trialEndsAt?.toISOString() ?? null,
    planKey: PLAN_KEYS.trial,
  };
};
