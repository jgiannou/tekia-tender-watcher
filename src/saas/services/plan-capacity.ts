import type { PrismaClient } from "@prisma/client";
import { PLAN_KEYS, entitlementsForPlanKey } from "../plans/catalog.js";

/**
 * Soft Free capacity after promotional/paid → Free downgrade.
 * Never deletes data. Excess saved searches are disabled; excess followed
 * threads keep `following=true` but stop active monitoring beyond Free caps.
 */
export const enforceFreePlanCapacityAfterDowngrade = async (
  prisma: PrismaClient,
  organizationId: string,
): Promise<{
  disabledWatchProfiles: number;
  pausedFollowedMonitoring: number;
}> => {
  const free = entitlementsForPlanKey(PLAN_KEYS.free);
  const maxProfiles = free.maxActiveWatchProfiles;
  const maxFollowed = free.maxActiveFollowedTenders;

  const enabledProfiles = await prisma.watchProfile.findMany({
    where: { organizationId, enabled: true },
    orderBy: [{ lastMatchAt: "desc" }, { createdAt: "asc" }],
    select: { id: true },
  });

  let disabledWatchProfiles = 0;
  if (enabledProfiles.length > maxProfiles) {
    const toDisable = enabledProfiles.slice(maxProfiles).map((row) => row.id);
    const result = await prisma.watchProfile.updateMany({
      where: { id: { in: toDisable } },
      data: { enabled: false },
    });
    disabledWatchProfiles = result.count;
  }

  const followed = await prisma.organizationTender.findMany({
    where: { organizationId, following: true, monitoringActive: true },
    orderBy: [{ followedAt: "desc" }, { createdAt: "asc" }],
    select: { id: true },
  });

  let pausedFollowedMonitoring = 0;
  if (followed.length > maxFollowed) {
    const toPause = followed.slice(maxFollowed).map((row) => row.id);
    const result = await prisma.organizationTender.updateMany({
      where: { id: { in: toPause } },
      data: { monitoringActive: false },
    });
    pausedFollowedMonitoring = result.count;
  }

  return { disabledWatchProfiles, pausedFollowedMonitoring };
};
