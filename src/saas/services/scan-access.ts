import {
  Prisma,
  type PrismaClient,
  type Subscription,
  type SubscriptionStatus,
} from "@prisma/client";
import { forbidden } from "../errors.js";
import {
  PLAN_KEYS,
  TRIAL_DURATION_MS,
  entitlementsForPlanKey,
  normalizePlanKey,
  type PlanEntitlements,
} from "../plans/catalog.js";

export { PLAN_KEYS, TRIAL_DURATION_MS };

export type PlanLimits = {
  maxActiveWatchProfiles: number;
  maxActiveFollowedTenders: number;
  storageBytes: number;
  maxDigestHoursPerDay: number;
  /** @deprecated Alias of maxDigestHoursPerDay */
  periodicScansPerDay: number;
  manualProfileScansPerDay: number;
  includedSeats: number;
  maxSeatsSelfService: number;
  advancedWatchProfileFilters: boolean;
  emailMode: PlanEntitlements["emailMode"];
  emailCadence: PlanEntitlements["emailCadence"];
  immediateFollowedDevelopments: boolean;
  immediateNewOpportunity: boolean;
};

export const limitsFromEntitlements = (plan: PlanEntitlements): PlanLimits => ({
  maxActiveWatchProfiles: plan.maxActiveWatchProfiles,
  maxActiveFollowedTenders: plan.maxActiveFollowedTenders,
  storageBytes: plan.storageBytes,
  maxDigestHoursPerDay: plan.maxDigestHoursPerDay,
  periodicScansPerDay: plan.maxDigestHoursPerDay,
  manualProfileScansPerDay: plan.manualProfileScansPerDay,
  includedSeats: plan.includedSeats,
  maxSeatsSelfService: plan.maxSeatsSelfService,
  advancedWatchProfileFilters: plan.advancedWatchProfileFilters,
  emailMode: plan.emailMode,
  emailCadence: plan.emailCadence,
  immediateFollowedDevelopments: plan.immediateFollowedDevelopments,
  immediateNewOpportunity: plan.immediateNewOpportunity,
});

export const limitsForPlanKey = (planKey: string): PlanLimits =>
  limitsFromEntitlements(entitlementsForPlanKey(planKey));

const INACTIVE_LIMITS: PlanLimits = {
  maxActiveWatchProfiles: 0,
  maxActiveFollowedTenders: 0,
  storageBytes: 0,
  maxDigestHoursPerDay: 0,
  periodicScansPerDay: 0,
  manualProfileScansPerDay: 0,
  includedSeats: 1,
  maxSeatsSelfService: 1,
  advancedWatchProfileFilters: false,
  emailMode: "DIGEST",
  emailCadence: "WEEKLY",
  immediateFollowedDevelopments: false,
  immediateNewOpportunity: false,
};

export type ScanAccessStatus =
  | "unverified"
  | "trial"
  | "promo"
  | "trial_expired"
  | "active"
  | "inactive";

export type ScanAccessPromo = {
  promotionKey: string;
  activatedAt: string;
  expiresAt: string;
  daysRemaining: number;
};

export type ScanAccess = {
  emailVerified: boolean;
  status: ScanAccessStatus;
  planKey: string;
  plan: PlanEntitlements["plan"] | "INACTIVE";
  trialEndsAt: string | null;
  /** Active cardless launch promo, when present. */
  promo: ScanAccessPromo | null;
  limits: PlanLimits;
  usage: { day: string; periodic: number; manual: number };
  seats: {
    includedSeats: number;
    extraSeats: number;
    seatLimit: number;
    selfServiceCap: number;
  };
  canManualKimdisSearch: boolean;
  canRunManualProfileScan: boolean;
  canRunPeriodicScan: boolean;
  blockCode: string | null;
};

type ScanUsage = { day: string; periodic: number; manual: number };

const utcDayKey = (now = new Date()): string => now.toISOString().slice(0, 10);

const readScanUsage = (meta: unknown, now = new Date()): ScanUsage => {
  const day = utcDayKey(now);
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
    return { day, periodic: 0, manual: 0 };
  }
  const scanUsage = (meta as Record<string, unknown>).scanUsage;
  if (!scanUsage || typeof scanUsage !== "object" || Array.isArray(scanUsage)) {
    return { day, periodic: 0, manual: 0 };
  }
  const raw = scanUsage as Record<string, unknown>;
  if (raw.day !== day) return { day, periodic: 0, manual: 0 };
  return {
    day,
    periodic: typeof raw.periodic === "number" ? raw.periodic : 0,
    manual: typeof raw.manual === "number" ? raw.manual : 0,
  };
};

export const isTrialingActiveSubscription = (
  sub: Subscription | null,
  now: Date,
): boolean => {
  if (!sub || sub.status !== "TRIALING") return false;
  if (!sub.trialEndsAt) return true;
  return sub.trialEndsAt.getTime() > now.getTime();
};

const isTrialingActive = isTrialingActiveSubscription;

const isPaidActive = (status: SubscriptionStatus): boolean =>
  status === "ACTIVE";

const isPaidCommercialPlan = (sub: Subscription): boolean => {
  if (!isPaidActive(sub.status) && sub.status !== "PAST_DUE") return false;
  const key = normalizePlanKey(sub.planKey);
  return key === PLAN_KEYS.basic || key === PLAN_KEYS.pro;
};

/** Legacy orgs created before trial rows existed get a fresh 7-day trial once. */
export const ensureOrganizationSubscription = async (
  prisma: PrismaClient,
  organizationId: string,
): Promise<Subscription> => {
  const existing = await prisma.subscription.findUnique({
    where: { organizationId },
  });
  if (existing) {
    const normalized = normalizePlanKey(existing.planKey);
    if (normalized !== existing.planKey) {
      return prisma.subscription.update({
        where: { id: existing.id },
        data: { planKey: normalized },
      });
    }
    return existing;
  }
  return prisma.subscription.create({
    data: {
      organizationId,
      status: "ACTIVE",
      planKey: PLAN_KEYS.free,
      trialEndsAt: null,
      extraSeats: 0,
    },
  });
};

export const resolveOrganizationScanAccess = async (
  prisma: PrismaClient,
  input: { userId: string; organizationId: string; now?: Date },
): Promise<ScanAccess> => {
  const now = input.now ?? new Date();
  const [user, subscription, settings] = await Promise.all([
    prisma.user.findUnique({
      where: { id: input.userId },
      select: { emailVerified: true },
    }),
    ensureOrganizationSubscription(prisma, input.organizationId),
    prisma.organizationSettings.findUnique({
      where: { organizationId: input.organizationId },
      select: { onboardingMeta: true },
    }),
  ]);

  const emailVerified = Boolean(user?.emailVerified);
  const usage = readScanUsage(settings?.onboardingMeta, now);
  const planKey = normalizePlanKey(subscription.planKey);
  const trialEndsAt = subscription.trialEndsAt?.toISOString() ?? null;
  const extraSeats = subscription.extraSeats ?? 0;

  const seatsFor = (key: string) => {
    const plan = entitlementsForPlanKey(key);
    const seatLimit = Math.min(
      plan.includedSeats + Math.max(0, extraSeats),
      plan.maxSeatsSelfService,
    );
    return {
      includedSeats: plan.includedSeats,
      extraSeats: Math.max(0, extraSeats),
      seatLimit,
      selfServiceCap: plan.maxSeatsSelfService,
    };
  };

  const emptyPromo = null as ScanAccessPromo | null;

  if (!emailVerified) {
    // Plan limits stay visible (e.g. Free = 1 active search). Automation stays
    // gated until verify — do not collapse commercial limits to zero.
    const plan = entitlementsForPlanKey(planKey);
    const limits = limitsForPlanKey(planKey);
    return {
      emailVerified: false,
      status: "unverified",
      planKey,
      plan: plan.plan,
      trialEndsAt,
      promo: emptyPromo,
      limits,
      usage,
      seats: seatsFor(planKey),
      canManualKimdisSearch: true,
      canRunManualProfileScan: false,
      canRunPeriodicScan: false,
      blockCode: "email_not_verified",
    };
  }

  // Paid Basic/Pro always wins over promotional Pro.
  if (isPaidCommercialPlan(subscription)) {
    const paidKey = planKey === PLAN_KEYS.trial ? PLAN_KEYS.basic : planKey;
    const limits = limitsForPlanKey(paidKey);
    const plan = entitlementsForPlanKey(paidKey);
    return {
      emailVerified: true,
      status: "active",
      planKey: paidKey,
      plan: plan.plan,
      trialEndsAt,
      promo: emptyPromo,
      limits,
      usage,
      seats: seatsFor(paidKey),
      canManualKimdisSearch: true,
      canRunManualProfileScan: usage.manual < limits.manualProfileScansPerDay,
      canRunPeriodicScan: usage.periodic < limits.periodicScansPerDay,
      blockCode:
        usage.periodic >= limits.periodicScansPerDay
          ? "periodic_scan_quota_exceeded"
          : usage.manual >= limits.manualProfileScansPerDay
            ? "manual_scan_quota_exceeded"
            : null,
    };
  }

  // Cardless launch promo — Pro entitlements without Stripe. Expiry is
  // enforced via expiresAt even if the lifecycle job is delayed.
  {
    const { expirePromotionIfNeeded, findActivePromotionRedemption, daysRemainingUtc } =
      await import("./promotions.js");
    await expirePromotionIfNeeded(prisma, input.organizationId, now);
    const activePromo = await findActivePromotionRedemption(
      prisma,
      input.organizationId,
      now,
    );
    if (activePromo) {
      const limits = limitsForPlanKey(PLAN_KEYS.trial);
      return {
        emailVerified: true,
        status: "promo",
        planKey: PLAN_KEYS.trial,
        plan: "TRIAL",
        trialEndsAt: activePromo.expiresAt.toISOString(),
        promo: {
          promotionKey: activePromo.promotionKey,
          activatedAt: activePromo.activatedAt.toISOString(),
          expiresAt: activePromo.expiresAt.toISOString(),
          daysRemaining: daysRemainingUtc(activePromo.expiresAt, now),
        },
        limits,
        usage,
        seats: seatsFor(PLAN_KEYS.trial),
        canManualKimdisSearch: true,
        canRunManualProfileScan: usage.manual < limits.manualProfileScansPerDay,
        canRunPeriodicScan: usage.periodic < limits.periodicScansPerDay,
        blockCode:
          usage.periodic >= limits.periodicScansPerDay
            ? "periodic_scan_quota_exceeded"
            : usage.manual >= limits.manualProfileScansPerDay
              ? "manual_scan_quota_exceeded"
              : null,
      };
    }
  }

  if (isTrialingActive(subscription, now)) {
    const limits = limitsForPlanKey(PLAN_KEYS.trial);
    return {
      emailVerified: true,
      status: "trial",
      planKey: PLAN_KEYS.trial,
      plan: "TRIAL",
      trialEndsAt,
      promo: emptyPromo,
      limits,
      usage,
      seats: seatsFor(PLAN_KEYS.trial),
      canManualKimdisSearch: true,
      canRunManualProfileScan: usage.manual < limits.manualProfileScansPerDay,
      canRunPeriodicScan: usage.periodic < limits.periodicScansPerDay,
      blockCode:
        usage.periodic >= limits.periodicScansPerDay
          ? "periodic_scan_quota_exceeded"
          : usage.manual >= limits.manualProfileScansPerDay
            ? "manual_scan_quota_exceeded"
            : null,
    };
  }

  if (subscription.status === "TRIALING") {
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { status: "ACTIVE", planKey: PLAN_KEYS.free },
    });
    const { onTransitionToFreeEmailPolicy } = await import(
      "./plan-email-transition.js"
    );
    await onTransitionToFreeEmailPolicy(prisma, subscription.organizationId);
    const { enforceFreePlanCapacityAfterDowngrade } = await import(
      "./plan-capacity.js"
    );
    await enforceFreePlanCapacityAfterDowngrade(
      prisma,
      subscription.organizationId,
    );
    const limits = limitsForPlanKey(PLAN_KEYS.free);
    const plan = entitlementsForPlanKey(PLAN_KEYS.free);
    return {
      emailVerified: true,
      status: "active",
      planKey: PLAN_KEYS.free,
      plan: plan.plan,
      trialEndsAt,
      promo: emptyPromo,
      limits,
      usage,
      seats: seatsFor(PLAN_KEYS.free),
      canManualKimdisSearch: true,
      canRunManualProfileScan: usage.manual < limits.manualProfileScansPerDay,
      canRunPeriodicScan: usage.periodic < limits.periodicScansPerDay,
      blockCode: null,
    };
  }

  // Permanent Free (ACTIVE + free) and other ACTIVE non-commercial rows.
  if (isPaidActive(subscription.status)) {
    const freeKey =
      planKey === PLAN_KEYS.trial ? PLAN_KEYS.free : planKey;
    const limits = limitsForPlanKey(freeKey);
    const plan = entitlementsForPlanKey(freeKey);
    return {
      emailVerified: true,
      status: "active",
      planKey: freeKey,
      plan: plan.plan,
      trialEndsAt,
      promo: emptyPromo,
      limits,
      usage,
      seats: seatsFor(freeKey),
      canManualKimdisSearch: true,
      canRunManualProfileScan: usage.manual < limits.manualProfileScansPerDay,
      canRunPeriodicScan: usage.periodic < limits.periodicScansPerDay,
      blockCode:
        usage.periodic >= limits.periodicScansPerDay
          ? "periodic_scan_quota_exceeded"
          : usage.manual >= limits.manualProfileScansPerDay
            ? "manual_scan_quota_exceeded"
            : null,
    };
  }

  return {
    emailVerified: true,
    status: "inactive",
    planKey,
    plan: "INACTIVE",
    trialEndsAt,
    promo: emptyPromo,
    limits: { ...INACTIVE_LIMITS },
    usage,
    seats: seatsFor(planKey),
    canManualKimdisSearch: true,
    canRunManualProfileScan: false,
    canRunPeriodicScan: false,
    blockCode: "subscription_inactive",
  };
};

/** Org has a verified owner/admin — used by the periodic cron (no acting user). */
export const organizationHasVerifiedOperator = async (
  prisma: PrismaClient,
  organizationId: string,
): Promise<boolean> => {
  const member = await prisma.organizationMember.findFirst({
    where: {
      organizationId,
      role: { in: ["OWNER", "ADMIN"] },
      user: { emailVerified: true },
    },
    select: { id: true },
  });
  return Boolean(member);
};

export const assertCanRunWatchProfileScan = async (
  prisma: PrismaClient,
  input: {
    userId: string;
    organizationId: string;
    kind: "manual" | "periodic";
  },
): Promise<ScanAccess> => {
  const access = await resolveOrganizationScanAccess(prisma, input);
  if (input.kind === "periodic") {
    if (!access.canRunPeriodicScan) {
      throw forbidden(access.blockCode ?? "periodic_scan_blocked");
    }
    return access;
  }
  if (!access.canRunManualProfileScan) {
    throw forbidden(access.blockCode ?? "manual_scan_blocked");
  }
  return access;
};

export const consumeScanQuota = async (
  prisma: PrismaClient,
  input: {
    organizationId: string;
    kind: "manual" | "periodic";
    now?: Date;
  },
): Promise<ScanUsage> => {
  const now = input.now ?? new Date();
  const day = utcDayKey(now);
  const settings = await prisma.organizationSettings.findUnique({
    where: { organizationId: input.organizationId },
    select: { id: true, onboardingMeta: true },
  });
  if (!settings) {
    return { day, periodic: 0, manual: 0 };
  }

  const meta =
    settings.onboardingMeta &&
    typeof settings.onboardingMeta === "object" &&
    !Array.isArray(settings.onboardingMeta)
      ? { ...(settings.onboardingMeta as Record<string, unknown>) }
      : {};
  const usage = readScanUsage(meta, now);
  const next: ScanUsage = {
    day,
    periodic: usage.periodic + (input.kind === "periodic" ? 1 : 0),
    manual: usage.manual + (input.kind === "manual" ? 1 : 0),
  };
  meta.scanUsage = next;
  await prisma.organizationSettings.update({
    where: { id: settings.id },
    data: { onboardingMeta: meta as Prisma.InputJsonValue },
  });
  return next;
};
