import type { PrismaClient } from "@prisma/client";
import { requireOrgMembership } from "../auth/org-context.js";
import { conflict, forbidden } from "../errors.js";
import {
  CONTACT_FOR_MORE_SEATS_EL,
  entitlementsForPlanKey,
  publicPlans,
  type PlanEntitlements,
} from "../plans/catalog.js";
import {
  resolveOrganizationScanAccess,
  type ScanAccess,
} from "./scan-access.js";

/**
 * Organization commercial entitlements + scan access.
 * Catalog: trial / basic / pro (+ Pro seat add-ons). Stripe UI later.
 */
export type OrganizationEntitlements = {
  maxActiveWatchProfiles: number;
  maxActiveFollowedTenders: number;
  storageBytes: number;
  maxDigestHoursPerDay: number;
  periodicScansPerDay: number;
  manualProfileScansPerDay: number;
  includedSeats: number;
  maxSeatsSelfService: number;
  advancedWatchProfileFilters: boolean;
  emailMode: PlanEntitlements["emailMode"];
  emailCadence: PlanEntitlements["emailCadence"];
  deadlineRadar: boolean;
  participationChecklist: boolean;
  expiringContractList: boolean;
  awardHistory: boolean;
  priceMemory: boolean;
  companyVault: boolean;
  outreachWorkflow: boolean;
  submissionWorkflow: boolean;
  tenderWorkspace: boolean;
};

/** Near-limit guidance threshold (not a hard block). */
export const WATCH_PROFILE_NEAR_LIMIT_RATIO = 0.9;

export const getOrganizationEntitlements = async (
  prisma: PrismaClient,
  input: { userId: string; organizationId: string },
): Promise<{
  entitlements: OrganizationEntitlements;
  plan: PlanEntitlements;
  scanAccess: ScanAccess;
}> => {
  const scanAccess = await resolveOrganizationScanAccess(prisma, input);
  const plan = entitlementsForPlanKey(
    scanAccess.status === "active" || scanAccess.status === "trial"
      ? scanAccess.planKey
      : scanAccess.planKey,
  );
  return {
    entitlements: {
      maxActiveWatchProfiles: scanAccess.limits.maxActiveWatchProfiles,
      maxActiveFollowedTenders: scanAccess.limits.maxActiveFollowedTenders,
      storageBytes: scanAccess.limits.storageBytes,
      maxDigestHoursPerDay: scanAccess.limits.maxDigestHoursPerDay,
      periodicScansPerDay: scanAccess.limits.periodicScansPerDay,
      manualProfileScansPerDay: scanAccess.limits.manualProfileScansPerDay,
      includedSeats: scanAccess.limits.includedSeats,
      maxSeatsSelfService: scanAccess.limits.maxSeatsSelfService,
      advancedWatchProfileFilters: scanAccess.limits.advancedWatchProfileFilters,
      emailMode: scanAccess.limits.emailMode,
      emailCadence: plan.emailCadence,
      deadlineRadar: plan.deadlineRadar,
      participationChecklist: plan.participationChecklist,
      expiringContractList: plan.expiringContractList,
      awardHistory: plan.awardHistory,
      priceMemory: plan.priceMemory,
      companyVault: plan.companyVault,
      outreachWorkflow: plan.outreachWorkflow,
      submissionWorkflow: plan.submissionWorkflow,
      tenderWorkspace: plan.tenderWorkspace,
    },
    plan,
    scanAccess,
  };
};

export const getWatchProfileUsage = async (
  prisma: PrismaClient,
  organizationId: string,
) => {
  const [activeWatchProfiles, totalWatchProfiles, activeFollowedTenders, members] =
    await Promise.all([
      prisma.watchProfile.count({
        where: { organizationId, enabled: true },
      }),
      prisma.watchProfile.count({ where: { organizationId } }),
      prisma.organizationTender.count({
        where: { organizationId, following: true },
      }),
      prisma.organizationMember.count({ where: { organizationId } }),
    ]);
  return {
    activeWatchProfiles,
    totalWatchProfiles,
    activeFollowedTenders,
    members,
  };
};

export const getEntitlementsView = async (
  prisma: PrismaClient,
  input: { userId: string; organizationId: string | null },
) => {
  const { organizationId } = await requireOrgMembership(
    prisma,
    input.userId,
    input.organizationId,
  );
  const [{ entitlements, plan, scanAccess }, usage] = await Promise.all([
    getOrganizationEntitlements(prisma, {
      userId: input.userId,
      organizationId,
    }),
    getWatchProfileUsage(prisma, organizationId),
  ]);
  return {
    entitlements,
    usage,
    scanAccess,
    plan: {
      key: plan.planKey,
      code: plan.plan,
      label: plan.label,
      labelEl: plan.labelEl,
      positioning: plan.positioning,
      priceMonthlyEur: plan.priceMonthlyEur,
      priceYearlyEur: plan.priceYearlyEur,
      extraSeatPriceMonthlyEur: plan.extraSeatPriceMonthlyEur,
      features: {
        opportunityMatching: plan.opportunityMatching,
        matchScore: plan.matchScore,
        matchReasons: plan.matchReasons,
        kimdisSearch: plan.kimdisSearch,
        procurementMonitoring: plan.procurementMonitoring,
        relatedActMonitoring: plan.relatedActMonitoring,
        outreachWorkflow: plan.outreachWorkflow,
        submissionWorkflow: plan.submissionWorkflow,
        companyVault: plan.companyVault,
        tenderWorkspace: plan.tenderWorkspace,
        documentVersioning: plan.documentVersioning,
        inAppNotifications: plan.inAppNotifications,
        advancedWatchProfileFilters: plan.advancedWatchProfileFilters,
        prioritySupport: plan.prioritySupport,
        emailMode: plan.emailMode,
        emailCadence: plan.emailCadence,
        immediateFollowedDevelopments: plan.immediateFollowedDevelopments,
        immediateNewOpportunity: plan.immediateNewOpportunity,
        deadlineRadar: plan.deadlineRadar,
        participationChecklist: plan.participationChecklist,
        expiringContractList: plan.expiringContractList,
        awardHistory: plan.awardHistory,
        priceMemory: plan.priceMemory,
      },
      positioningEl: plan.positioningEl,
      featuresEl: plan.featuresEl,
    },
    catalog: publicPlans().map((entry) => ({
      key: entry.planKey,
      code: entry.plan,
      label: entry.label,
      labelEl: entry.labelEl,
      positioning: entry.positioning,
      positioningEl: entry.positioningEl,
      priceMonthlyEur: entry.priceMonthlyEur,
      priceYearlyEur: entry.priceYearlyEur,
      includedSeats: entry.includedSeats,
      maxSeatsSelfService: entry.maxSeatsSelfService,
      extraSeatPriceMonthlyEur: entry.extraSeatPriceMonthlyEur,
      maxActiveWatchProfiles: entry.maxActiveWatchProfiles,
      maxActiveFollowedTenders: entry.maxActiveFollowedTenders,
      periodicScansPerDay: entry.maxDigestHoursPerDay,
      maxDigestHoursPerDay: entry.maxDigestHoursPerDay,
      emailCadence: entry.emailCadence,
      featuresEl: entry.featuresEl,
    })),
    contactForMoreSeatsMessage: CONTACT_FOR_MORE_SEATS_EL,
  };
};

/**
 * Enforce active WatchProfile entitlement.
 * Paused profiles do not count.
 */
export const assertCanActivateWatchProfile = async (
  prisma: PrismaClient,
  input: {
    userId: string;
    organizationId: string;
    /** When re-enabling an existing profile, exclude it from the active count. */
    excludeProfileId?: string;
  },
) => {
  const { entitlements, scanAccess } = await getOrganizationEntitlements(prisma, {
    userId: input.userId,
    organizationId: input.organizationId,
  });
  // Plan limits (e.g. Free=1) are separate from verify/automation gating.
  if (!scanAccess.emailVerified || scanAccess.status === "unverified") {
    throw forbidden("email_not_verified");
  }
  if (scanAccess.status === "inactive") {
    throw forbidden("subscription_inactive");
  }
  const active = await prisma.watchProfile.count({
    where: {
      organizationId: input.organizationId,
      enabled: true,
      ...(input.excludeProfileId
        ? { id: { not: input.excludeProfileId } }
        : {}),
    },
  });
  if (active >= entitlements.maxActiveWatchProfiles) {
    throw conflict("watch_profile_active_limit_reached");
  }
  return { entitlements, active };
};

export const assertCanFollowTender = async (
  prisma: PrismaClient,
  input: { userId: string; organizationId: string; tenderId: string },
) => {
  const existing = await prisma.organizationTender.findUnique({
    where: {
      organizationId_tenderId: {
        organizationId: input.organizationId,
        tenderId: input.tenderId,
      },
    },
    select: { following: true },
  });
  if (existing?.following) return;

  const { entitlements } = await getOrganizationEntitlements(prisma, input);
  const activeFollowed = await prisma.organizationTender.count({
    where: { organizationId: input.organizationId, following: true },
  });
  if (activeFollowed >= entitlements.maxActiveFollowedTenders) {
    throw conflict("followed_tender_limit_reached");
  }
};

export const assertCanAddOrganizationMember = async (
  prisma: PrismaClient,
  input: { userId: string; organizationId: string },
) => {
  const { scanAccess } = await getOrganizationEntitlements(prisma, input);
  const members = await prisma.organizationMember.count({
    where: { organizationId: input.organizationId },
  });
  if (members >= scanAccess.seats.seatLimit) {
    if (members >= scanAccess.seats.selfServiceCap) {
      throw forbidden("seat_limit_contact_sales");
    }
    throw conflict("seat_limit_reached");
  }
  return { members, seats: scanAccess.seats };
};

export const assertPlanFeature = async (
  prisma: PrismaClient,
  input: { userId: string; organizationId: string },
  feature:
    | "companyVault"
    | "outreachWorkflow"
    | "submissionWorkflow"
    | "tenderWorkspace"
    | "participationChecklist"
    | "expiringContractList"
    | "priceMemory"
    | "awardHistory",
) => {
  const { plan } = await getOrganizationEntitlements(prisma, input);
  if (!plan[feature]) {
    throw forbidden("plan_feature_locked");
  }
  return plan;
};
