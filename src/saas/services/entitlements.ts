import type { PrismaClient } from "@prisma/client";
import { requireOrgMembership } from "../auth/org-context.js";
import { conflict } from "../errors.js";

/**
 * Organization commercial entitlements.
 * Today: MVP defaults. Later: map from Stripe/Subscription plan.
 */
export type OrganizationEntitlements = {
  maxActiveWatchProfiles: number;
};

const MVP_ENTITLEMENTS: OrganizationEntitlements = {
  maxActiveWatchProfiles: 20,
};

/** Near-limit guidance threshold (not a hard block). */
export const WATCH_PROFILE_NEAR_LIMIT_RATIO = 0.9;

export const getOrganizationEntitlements = async (
  _prisma: PrismaClient,
  organizationId: string,
): Promise<OrganizationEntitlements> => {
  // Future: load subscription/plan for organizationId and map limits.
  void organizationId;
  return { ...MVP_ENTITLEMENTS };
};

export const getWatchProfileUsage = async (
  prisma: PrismaClient,
  organizationId: string,
) => {
  const [activeWatchProfiles, totalWatchProfiles] = await Promise.all([
    prisma.watchProfile.count({
      where: { organizationId, enabled: true },
    }),
    prisma.watchProfile.count({ where: { organizationId } }),
  ]);
  return { activeWatchProfiles, totalWatchProfiles };
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
  const [entitlements, usage] = await Promise.all([
    getOrganizationEntitlements(prisma, organizationId),
    getWatchProfileUsage(prisma, organizationId),
  ]);
  return { entitlements, usage };
};

/**
 * Enforce active WatchProfile entitlement.
 * Paused profiles do not count.
 */
export const assertCanActivateWatchProfile = async (
  prisma: PrismaClient,
  input: {
    organizationId: string;
    /** When re-enabling an existing profile, exclude it from the active count. */
    excludeProfileId?: string;
  },
) => {
  const entitlements = await getOrganizationEntitlements(
    prisma,
    input.organizationId,
  );
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
