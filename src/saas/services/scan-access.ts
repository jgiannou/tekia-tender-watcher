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
  periodicScansPerDay: number;
  manualProfileScansPerDay: number;
  includedSeats: number;
  maxSeatsSelfService: number;
  advancedWatchProfileFilters: boolean;
  emailMode: PlanEntitlements["emailMode"];
};

export const limitsFromEntitlements = (plan: PlanEntitlements): PlanLimits => ({
  maxActiveWatchProfiles: plan.maxActiveWatchProfiles,
  maxActiveFollowedTenders: plan.maxActiveFollowedTenders,
  storageBytes: plan.storageBytes,
  periodicScansPerDay: plan.periodicScansPerDay,
  manualProfileScansPerDay: plan.manualProfileScansPerDay,
  includedSeats: plan.includedSeats,
  maxSeatsSelfService: plan.maxSeatsSelfService,
  advancedWatchProfileFilters: plan.advancedWatchProfileFilters,
  emailMode: plan.emailMode,
});

export const limitsForPlanKey = (planKey: string): PlanLimits =>
  limitsFromEntitlements(entitlementsForPlanKey(planKey));

const INACTIVE_LIMITS: PlanLimits = {
  maxActiveWatchProfiles: 3,
  maxActiveFollowedTenders: 0,
  storageBytes: 250_000_000,
  periodicScansPerDay: 0,
  manualProfileScansPerDay: 0,
  includedSeats: 1,
  maxSeatsSelfService: 1,
  advancedWatchProfileFilters: false,
  emailMode: "DIGEST",
};

export type ScanAccessStatus =
  | "unverified"
  | "trial"
  | "trial_expired"
  | "active"
  | "inactive";

export type ScanAccess = {
  emailVerified: boolean;
  status: ScanAccessStatus;
  planKey: string;
  plan: PlanEntitlements["plan"] | "INACTIVE";
  trialEndsAt: string | null;
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

const isTrialingActive = (sub: Subscription | null, now: Date): boolean => {
  if (!sub || sub.status !== "TRIALING") return false;
  if (!sub.trialEndsAt) return true;
  return sub.trialEndsAt.getTime() > now.getTime();
};

const isPaidActive = (status: SubscriptionStatus): boolean =>
  status === "ACTIVE";

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
      status: "TRIALING",
      planKey: PLAN_KEYS.trial,
      trialEndsAt: new Date(Date.now() + TRIAL_DURATION_MS),
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

  if (!emailVerified) {
    return {
      emailVerified: false,
      status: "unverified",
      planKey,
      plan: "INACTIVE",
      trialEndsAt,
      limits: { ...INACTIVE_LIMITS },
      usage,
      seats: seatsFor(PLAN_KEYS.basic),
      canManualKimdisSearch: true,
      canRunManualProfileScan: false,
      canRunPeriodicScan: false,
      blockCode: "email_not_verified",
    };
  }

  if (isPaidActive(subscription.status)) {
    const paidKey =
      planKey === PLAN_KEYS.trial ? PLAN_KEYS.basic : planKey;
    const limits = limitsForPlanKey(paidKey);
    const plan = entitlementsForPlanKey(paidKey);
    return {
      emailVerified: true,
      status: "active",
      planKey: paidKey,
      plan: plan.plan,
      trialEndsAt,
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

  if (isTrialingActive(subscription, now)) {
    const limits = limitsForPlanKey(PLAN_KEYS.trial);
    return {
      emailVerified: true,
      status: "trial",
      planKey: PLAN_KEYS.trial,
      plan: "TRIAL",
      trialEndsAt,
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
    return {
      emailVerified: true,
      status: "trial_expired",
      planKey: PLAN_KEYS.trial,
      plan: "INACTIVE",
      trialEndsAt,
      limits: { ...INACTIVE_LIMITS },
      usage,
      seats: seatsFor(PLAN_KEYS.basic),
      canManualKimdisSearch: true,
      canRunManualProfileScan: false,
      canRunPeriodicScan: false,
      blockCode: "trial_expired",
    };
  }

  return {
    emailVerified: true,
    status: "inactive",
    planKey,
    plan: "INACTIVE",
    trialEndsAt,
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
