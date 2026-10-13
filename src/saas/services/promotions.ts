import type {
  OrganizationPromotionRedemption,
  OrganizationPromotionStatus,
  PrismaClient,
  Subscription,
} from "@prisma/client";
import { Prisma } from "@prisma/client";
import { requireOrgMembership } from "../auth/org-context.js";
import {
  badRequest,
  conflict,
  forbidden,
  SaasError,
  serviceUnavailable,
} from "../errors.js";
import {
  ARC_PRO_LAUNCH_30_KEY,
  loadArcProLaunchConfig,
  type ArcProLaunchConfig,
} from "../promotions/arc-pro-launch.js";
import { trackProductEventSafe } from "../ops/product-events.js";
import { PLAN_KEYS, normalizePlanKey } from "../plans/catalog.js";
import { isTrialingActiveSubscription } from "./scan-access.js";
import { ensureOrganizationSubscription } from "./scan-access.js";
import {
  assertCapacityAvailable,
  countConsumedPromotionSlots,
  getPromotionCapacitySnapshot,
} from "./promotion-capacity.js";
import {
  promoActivationEmailCopy,
  promoExpiredEmailCopy,
  promoReminderEmailCopy,
  resolveSaasAppUrl,
  sendMail,
} from "../mail/mail.js";

const isPrismaSerializationFailure = (error: unknown): boolean => {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2034"
  ) {
    return true;
  }
  // Prisma sometimes surfaces commit races as a generic Error message.
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return (
      msg.includes("could not serialize") ||
      msg.includes("write conflict") ||
      msg.includes("serialization failure") ||
      msg.includes("transaction failed to commit")
    );
  }
  return false;
};

export type PromoEligibilityReason =
  | "ok"
  | "promo_disabled"
  | "promo_deadline_passed"
  | "promo_cap_reached"
  | "paid_plan_active"
  | "active_pro_trial"
  | "already_redeemed"
  | "not_on_free"
  | "insufficient_role"
  | "email_not_verified";

export type PromoSlotAvailability = {
  promotionKey: typeof ARC_PRO_LAUNCH_30_KEY;
  promotionActive: boolean;
  acceptingRedemptions: boolean;
  totalSlots: number;
  redeemedSlots: number;
  remainingSlots: number;
  durationDays: 30;
  requiresCard: false;
  autoBilling: false;
  returnsTo: "free";
  proMonthlyEur: number | null;
  redeemBy: string | null;
};

export type PromoPublicState = {
  promotionKey: typeof ARC_PRO_LAUNCH_30_KEY;
  enabled: boolean;
  durationDays: 30;
  canActivate: boolean;
  reason: PromoEligibilityReason;
  totalSlots: number;
  redeemedSlots: number;
  remainingSlots: number;
  acceptingRedemptions: boolean;
  redemption: {
    status: OrganizationPromotionStatus;
    activatedAt: string;
    expiresAt: string;
    daysRemaining: number | null;
  } | null;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export const daysRemainingUtc = (expiresAt: Date, now = new Date()): number => {
  const ms = expiresAt.getTime() - now.getTime();
  if (ms <= 0) return 0;
  return Math.max(1, Math.ceil(ms / MS_PER_DAY));
};

export const hasPaidStripeOrPaidPlan = (subscription: Subscription): boolean => {
  if (subscription.stripeSubscriptionId) return true;
  const planKey = normalizePlanKey(subscription.planKey);
  if (subscription.status === "ACTIVE" || subscription.status === "PAST_DUE") {
    return planKey === PLAN_KEYS.basic || planKey === PLAN_KEYS.pro;
  }
  return false;
};

export const findPromotionRedemption = (
  prisma: PrismaClient,
  organizationId: string,
  promotionKey: string = ARC_PRO_LAUNCH_30_KEY,
) =>
  prisma.organizationPromotionRedemption.findUnique({
    where: {
      organizationId_promotionKey: { organizationId, promotionKey },
    },
  });

export const findActivePromotionRedemption = async (
  prisma: PrismaClient,
  organizationId: string,
  now = new Date(),
  promotionKey: string = ARC_PRO_LAUNCH_30_KEY,
): Promise<OrganizationPromotionRedemption | null> => {
  const row = await findPromotionRedemption(prisma, organizationId, promotionKey);
  if (!row || row.status !== "ACTIVE") return null;
  if (row.expiresAt.getTime() <= now.getTime()) return null;
  return row;
};

/**
 * Lazy expiry: mark ACTIVE → EXPIRED when expiresAt has passed.
 * Entitlement checks must call this (or findActive…) so expiry does not
 * depend exclusively on a cron job.
 */
export const expirePromotionIfNeeded = async (
  prisma: PrismaClient,
  organizationId: string,
  now = new Date(),
  promotionKey: string = ARC_PRO_LAUNCH_30_KEY,
): Promise<OrganizationPromotionRedemption | null> => {
  const row = await findPromotionRedemption(prisma, organizationId, promotionKey);
  if (!row || row.status !== "ACTIVE") return row;
  if (row.expiresAt.getTime() > now.getTime()) return row;

  const expired = await prisma.organizationPromotionRedemption.update({
    where: { id: row.id },
    data: { status: "EXPIRED" },
  });

  trackProductEventSafe(prisma, {
    type: "pro_trial_expired",
    organizationId,
    metadata: {
      promotionKey,
      expiresAt: expired.expiresAt.toISOString(),
      source: "lazy_access",
    },
  });

  const { enforceFreePlanCapacityAfterDowngrade } = await import(
    "./plan-capacity.js"
  );
  await enforceFreePlanCapacityAfterDowngrade(prisma, organizationId);

  const { onTransitionToFreeEmailPolicy } = await import(
    "./plan-email-transition.js"
  );
  await onTransitionToFreeEmailPolicy(prisma, organizationId);

  return expired;
};

/** When a paid Stripe subscription becomes active, keep history but stop promo access. */
export const supersedeActivePromotions = async (
  prisma: PrismaClient,
  organizationId: string,
  now = new Date(),
): Promise<number> => {
  const result = await prisma.organizationPromotionRedemption.updateMany({
    where: {
      organizationId,
      status: "ACTIVE",
      expiresAt: { gt: now },
    },
    data: { status: "SUPERSEDED" },
  });
  if (result.count > 0) {
    trackProductEventSafe(prisma, {
      type: "pro_trial_upgraded",
      organizationId,
      metadata: { superseded: result.count, at: now.toISOString() },
    });
  }
  return result.count;
};

/** @deprecated Prefer countConsumedPromotionSlots — kept for callers. */
export const countPromotionRedemptions = (
  prisma: PrismaClient,
  promotionKey: string = ARC_PRO_LAUNCH_30_KEY,
) => countConsumedPromotionSlots(prisma, promotionKey);

/** Public campaign availability — slots from slotConsumed=true only. */
export const getArcProLaunchAvailability = async (
  prisma: PrismaClient,
  env: NodeJS.ProcessEnv = process.env,
): Promise<PromoSlotAvailability> => {
  const config = loadArcProLaunchConfig(env);
  const { PRO_PLAN } = await import("../plans/catalog.js");
  const snap = await getPromotionCapacitySnapshot(
    prisma,
    config.promotionKey,
    env,
  );
  const withinDeadline =
    !config.redeemBy || Date.now() <= config.redeemBy.getTime();
  const acceptingRedemptions =
    config.enabled && withinDeadline && snap.remainingSlots > 0;

  return {
    promotionKey: ARC_PRO_LAUNCH_30_KEY,
    promotionActive: config.enabled && withinDeadline,
    acceptingRedemptions,
    totalSlots: snap.capacity,
    redeemedSlots: snap.consumedSlots,
    remainingSlots: snap.remainingSlots,
    durationDays: 30,
    requiresCard: false,
    autoBilling: false,
    returnsTo: "free",
    proMonthlyEur: PRO_PLAN.priceMonthlyEur,
    redeemBy: config.redeemBy?.toISOString() ?? null,
  };
};

export const evaluateArcProLaunchEligibility = async (
  prisma: PrismaClient,
  input: {
    organizationId: string;
    role: string;
    subscription: Subscription;
    emailVerified?: boolean;
    now?: Date;
    config?: ArcProLaunchConfig;
  },
): Promise<{ canActivate: boolean; reason: PromoEligibilityReason }> => {
  const now = input.now ?? new Date();
  const config = input.config ?? loadArcProLaunchConfig();

  if (!config.enabled) {
    return { canActivate: false, reason: "promo_disabled" };
  }
  if (config.redeemBy && now.getTime() > config.redeemBy.getTime()) {
    return { canActivate: false, reason: "promo_deadline_passed" };
  }
  if (input.role !== "OWNER" && input.role !== "ADMIN") {
    return { canActivate: false, reason: "insufficient_role" };
  }
  if (input.emailVerified === false) {
    return { canActivate: false, reason: "email_not_verified" };
  }
  if (hasPaidStripeOrPaidPlan(input.subscription)) {
    return { canActivate: false, reason: "paid_plan_active" };
  }
  if (isTrialingActiveSubscription(input.subscription, now)) {
    return { canActivate: false, reason: "active_pro_trial" };
  }

  const existing = await findPromotionRedemption(
    prisma,
    input.organizationId,
    config.promotionKey,
  );
  if (existing) {
    return { canActivate: false, reason: "already_redeemed" };
  }

  const planKey = normalizePlanKey(input.subscription.planKey);
  if (planKey !== PLAN_KEYS.free || input.subscription.status !== "ACTIVE") {
    // Permanent Free is ACTIVE + free. Anything else is not promo-eligible.
    if (planKey !== PLAN_KEYS.free) {
      return { canActivate: false, reason: "not_on_free" };
    }
  }

  const snap = await getPromotionCapacitySnapshot(
    prisma,
    config.promotionKey,
  );
  if (snap.remainingSlots <= 0) {
    return { canActivate: false, reason: "promo_cap_reached" };
  }

  return { canActivate: true, reason: "ok" };
};

export const getArcProLaunchPublicState = async (
  prisma: PrismaClient,
  input: {
    userId: string;
    organizationId: string | null;
    now?: Date;
  },
): Promise<PromoPublicState> => {
  const now = input.now ?? new Date();
  const config = loadArcProLaunchConfig();
  const { organizationId, membership } = await requireOrgMembership(
    prisma,
    input.userId,
    input.organizationId,
  );
  await expirePromotionIfNeeded(prisma, organizationId, now, config.promotionKey);
  const [subscription, user, availability] = await Promise.all([
    ensureOrganizationSubscription(prisma, organizationId),
    prisma.user.findUnique({
      where: { id: input.userId },
      select: { emailVerified: true },
    }),
    getArcProLaunchAvailability(prisma),
  ]);
  const eligibility = await evaluateArcProLaunchEligibility(prisma, {
    organizationId,
    role: membership.role,
    subscription,
    emailVerified: Boolean(user?.emailVerified),
    now,
    config,
  });
  const redemption = await findPromotionRedemption(
    prisma,
    organizationId,
    config.promotionKey,
  );

  return {
    promotionKey: ARC_PRO_LAUNCH_30_KEY,
    enabled: config.enabled,
    durationDays: 30,
    canActivate: eligibility.canActivate,
    reason: eligibility.reason,
    totalSlots: availability.totalSlots,
    redeemedSlots: availability.redeemedSlots,
    remainingSlots: availability.remainingSlots,
    acceptingRedemptions: availability.acceptingRedemptions,
    redemption: redemption
      ? {
          status: redemption.status,
          activatedAt: redemption.activatedAt.toISOString(),
          expiresAt: redemption.expiresAt.toISOString(),
          daysRemaining:
            redemption.status === "ACTIVE" &&
            redemption.expiresAt.getTime() > now.getTime()
              ? daysRemainingUtc(redemption.expiresAt, now)
              : null,
        }
      : null,
  };
};

export const activateArcProLaunch = async (
  prisma: PrismaClient,
  input: {
    userId: string;
    organizationId: string | null;
    attribution?: Record<string, unknown> | null;
    now?: Date;
  },
) => {
  const now = input.now ?? new Date();
  const config = loadArcProLaunchConfig();
  if (!config.enabled) {
    throw serviceUnavailable("promo_disabled");
  }
  if (config.redeemBy && now.getTime() > config.redeemBy.getTime()) {
    throw badRequest("promo_deadline_passed");
  }

  const { organizationId, membership } = await requireOrgMembership(
    prisma,
    input.userId,
    input.organizationId,
  );
  if (membership.role !== "OWNER" && membership.role !== "ADMIN") {
    throw forbidden("insufficient_role");
  }

  const activator = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { emailVerified: true },
  });
  if (!activator?.emailVerified) {
    throw forbidden("email_not_verified");
  }

  const existing = await findPromotionRedemption(
    prisma,
    organizationId,
    config.promotionKey,
  );
  if (existing?.status === "ACTIVE" && existing.expiresAt.getTime() > now.getTime()) {
    return {
      ok: true as const,
      already: true as const,
      promotionKey: config.promotionKey,
      activatedAt: existing.activatedAt.toISOString(),
      expiresAt: existing.expiresAt.toISOString(),
      daysRemaining: daysRemainingUtc(existing.expiresAt, now),
    };
  }
  if (existing) {
    throw conflict("already_redeemed");
  }

  const subscription = await ensureOrganizationSubscription(prisma, organizationId);
  const eligibility = await evaluateArcProLaunchEligibility(prisma, {
    organizationId,
    role: membership.role,
    subscription,
    emailVerified: true,
    now,
    config,
  });
  if (!eligibility.canActivate) {
    throw badRequest(eligibility.reason);
  }

  const expiresAt = new Date(now.getTime() + config.durationMs);
  const attribution =
    input.attribution && typeof input.attribution === "object"
      ? (input.attribution as Prisma.InputJsonValue)
      : Prisma.JsonNull;

  // Serializable count-before-insert + retries: never exceed capacity under concurrency,
  // but do not treat a serialization conflict as "cap reached" while slots remain.
  const maxAttempts = 6;
  let created: OrganizationPromotionRedemption | null = null;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      created = await prisma.$transaction(
        async (tx) => {
          await assertCapacityAvailable(tx, config.promotionKey);
          // Re-check paid / active trial inside the transaction boundary.
          const sub = await tx.subscription.findUnique({
            where: { organizationId },
          });
          if (!sub || hasPaidStripeOrPaidPlan(sub)) {
            throw badRequest("paid_plan_active");
          }
          if (isTrialingActiveSubscription(sub, now)) {
            throw badRequest("active_pro_trial");
          }

          return tx.organizationPromotionRedemption.create({
            data: {
              organizationId,
              promotionKey: config.promotionKey,
              activatedByUserId: input.userId,
              activatedAt: now,
              expiresAt,
              status: "ACTIVE",
              source: "SELF_SERVICE",
              slotConsumed: true,
              attribution,
            },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      break;
    } catch (error) {
      if (error instanceof SaasError) throw error;
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const raced = await findPromotionRedemption(
          prisma,
          organizationId,
          config.promotionKey,
        );
        if (
          raced?.status === "ACTIVE" &&
          raced.expiresAt.getTime() > now.getTime()
        ) {
          return {
            ok: true as const,
            already: true as const,
            promotionKey: config.promotionKey,
            activatedAt: raced.activatedAt.toISOString(),
            expiresAt: raced.expiresAt.toISOString(),
            daysRemaining: daysRemainingUtc(raced.expiresAt, now),
          };
        }
        throw conflict("already_redeemed");
      }
      if (isPrismaSerializationFailure(error) && attempt < maxAttempts - 1) {
        await new Promise((resolve) =>
          setTimeout(resolve, 15 * (attempt + 1) + Math.floor(Math.random() * 20)),
        );
        continue;
      }
      if (isPrismaSerializationFailure(error)) {
        const snap = await getPromotionCapacitySnapshot(
          prisma,
          config.promotionKey,
        );
        if (snap.remainingSlots <= 0) {
          throw conflict("promo_cap_reached");
        }
        throw serviceUnavailable("promo_activation_busy");
      }
      throw error;
    }
  }
  if (!created) {
    throw conflict("promo_cap_reached");
  }

  trackProductEventSafe(prisma, {
    type: "pro_trial_started",
    userId: input.userId,
    organizationId,
    metadata: {
      promotionKey: config.promotionKey,
      activatedAt: created.activatedAt.toISOString(),
      expiresAt: created.expiresAt.toISOString(),
      source: "arc_pro_launch_30",
      activationSource: "SELF_SERVICE",
    },
  });

  const { maybeEmitPromotionSlotThresholdAlerts } = await import(
    "./promotion-capacity.js"
  );
  void maybeEmitPromotionSlotThresholdAlerts(prisma, config.promotionKey);

  void sendPromoActivationEmail(prisma, {
    organizationId,
    userId: input.userId,
    expiresAt: created.expiresAt,
    redemptionId: created.id,
  });

  return {
    ok: true as const,
    already: false as const,
    promotionKey: config.promotionKey,
    activatedAt: created.activatedAt.toISOString(),
    expiresAt: created.expiresAt.toISOString(),
    daysRemaining: daysRemainingUtc(created.expiresAt, now),
  };
};

const sendPromoActivationEmail = async (
  prisma: PrismaClient,
  input: {
    organizationId: string;
    userId: string;
    expiresAt: Date;
    redemptionId: string;
  },
) => {
  try {
    const [user, organization] = await Promise.all([
      prisma.user.findUnique({
        where: { id: input.userId },
        select: { email: true, name: true },
      }),
      prisma.organization.findUnique({
        where: { id: input.organizationId },
        select: { name: true },
      }),
    ]);
    if (!user?.email) return;
    const copy = promoActivationEmailCopy({
      name: user.name || "",
      organizationName: organization?.name ?? "",
      expiresAt: input.expiresAt,
      upgradeUrl: `${resolveSaasAppUrl()}/app/subscription`,
    });
    const sent = await sendMail({
      to: user.email,
      subject: copy.subject,
      html: copy.html,
      text: copy.text,
    });
    if (sent) {
      await prisma.organizationPromotionRedemption.update({
        where: { id: input.redemptionId },
        data: { activationEmailSentAt: new Date() },
      });
    }
  } catch (error) {
    console.error(
      "[promo] activation email failed",
      error instanceof Error ? error.message : error,
    );
  }
};

export const processPromotionLifecycleEmails = async (
  prisma: PrismaClient,
  input: { now?: Date; limit?: number } = {},
) => {
  const now = input.now ?? new Date();
  const limit = input.limit ?? 50;
  const summary = {
    reminded7d: 0,
    reminded2d: 0,
    expiredNotified: 0,
    expiredMarked: 0,
  };

  // Lazy-mark expired ACTIVE rows (entitlement already rejects them by expiresAt).
  const dueExpire = await prisma.organizationPromotionRedemption.findMany({
    where: { status: "ACTIVE", expiresAt: { lte: now } },
    take: limit,
    orderBy: { expiresAt: "asc" },
  });
  for (const row of dueExpire) {
    await expirePromotionIfNeeded(
      prisma,
      row.organizationId,
      now,
      row.promotionKey,
    );
    summary.expiredMarked += 1;
  }

  const in7d = new Date(now.getTime() + 7 * MS_PER_DAY);
  const in2d = new Date(now.getTime() + 2 * MS_PER_DAY);

  const need7d = await prisma.organizationPromotionRedemption.findMany({
    where: {
      status: "ACTIVE",
      reminder7dSentAt: null,
      expiresAt: { gt: now, lte: in7d },
    },
    take: limit,
    include: {
      activatedBy: { select: { email: true, name: true } },
      organization: { select: { name: true } },
    },
  });
  for (const row of need7d) {
    if (!row.activatedBy.email) continue;
    const copy = promoReminderEmailCopy({
      name: row.activatedBy.name || "",
      organizationName: row.organization.name,
      expiresAt: row.expiresAt,
      daysRemaining: daysRemainingUtc(row.expiresAt, now),
      upgradeUrl: `${resolveSaasAppUrl()}/app/subscription`,
      kind: "7d",
    });
    const sent = await sendMail({
      to: row.activatedBy.email,
      subject: copy.subject,
      html: copy.html,
      text: copy.text,
    });
    if (sent) {
      await prisma.organizationPromotionRedemption.update({
        where: { id: row.id },
        data: { reminder7dSentAt: now },
      });
      summary.reminded7d += 1;
    }
  }

  const need2d = await prisma.organizationPromotionRedemption.findMany({
    where: {
      status: "ACTIVE",
      reminder2dSentAt: null,
      expiresAt: { gt: now, lte: in2d },
    },
    take: limit,
    include: {
      activatedBy: { select: { email: true, name: true } },
      organization: { select: { name: true } },
    },
  });
  for (const row of need2d) {
    if (!row.activatedBy.email) continue;
    const copy = promoReminderEmailCopy({
      name: row.activatedBy.name || "",
      organizationName: row.organization.name,
      expiresAt: row.expiresAt,
      daysRemaining: daysRemainingUtc(row.expiresAt, now),
      upgradeUrl: `${resolveSaasAppUrl()}/app/subscription`,
      kind: "2d",
    });
    const sent = await sendMail({
      to: row.activatedBy.email,
      subject: copy.subject,
      html: copy.html,
      text: copy.text,
    });
    if (sent) {
      await prisma.organizationPromotionRedemption.update({
        where: { id: row.id },
        data: { reminder2dSentAt: now },
      });
      summary.reminded2d += 1;
    }
  }

  const needExpiredMail = await prisma.organizationPromotionRedemption.findMany({
    where: {
      status: "EXPIRED",
      expiredNotifiedAt: null,
    },
    take: limit,
    include: {
      activatedBy: { select: { email: true, name: true } },
      organization: { select: { name: true } },
    },
  });
  for (const row of needExpiredMail) {
    if (!row.activatedBy.email) continue;
    const copy = promoExpiredEmailCopy({
      name: row.activatedBy.name || "",
      organizationName: row.organization.name,
      expiresAt: row.expiresAt,
      upgradeUrl: `${resolveSaasAppUrl()}/app/subscription`,
    });
    const sent = await sendMail({
      to: row.activatedBy.email,
      subject: copy.subject,
      html: copy.html,
      text: copy.text,
    });
    if (sent) {
      await prisma.organizationPromotionRedemption.update({
        where: { id: row.id },
        data: { expiredNotifiedAt: now },
      });
      summary.expiredNotified += 1;
    }
  }

  return summary;
};
