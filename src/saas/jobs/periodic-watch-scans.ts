import type { PrismaClient } from "@prisma/client";
import type { KimdisClient } from "../../kimdis/client.js";
import {
  consumeScanQuota,
  organizationHasVerifiedOperator,
  resolveOrganizationScanAccess,
} from "../services/scan-access.js";
import { enqueueWatchProfileScan } from "../services/watch-profiles.js";

/**
 * Org-level periodic wave: enqueue all enabled profiles, cost = 1 quota unit.
 * Cadence is controlled by cron + plan limits (trial 1/day, paid ~6/day).
 */
export const runPeriodicWatchProfileScans = async (
  prisma: PrismaClient,
  kimdis: KimdisClient | undefined,
): Promise<{ orgsConsidered: number; orgsScanned: number; profilesEnqueued: number }> => {
  const enabled = await prisma.watchProfile.findMany({
    where: { enabled: true },
    select: { id: true, organizationId: true },
    orderBy: { lastScannedAt: "asc" },
  });

  const byOrg = new Map<string, string[]>();
  for (const profile of enabled) {
    const list = byOrg.get(profile.organizationId) ?? [];
    list.push(profile.id);
    byOrg.set(profile.organizationId, list);
  }

  let orgsScanned = 0;
  let profilesEnqueued = 0;

  for (const [organizationId, profileIds] of byOrg) {
    const verified = await organizationHasVerifiedOperator(prisma, organizationId);
    if (!verified) continue;

    // Resolve access using the first verified owner/admin as the acting user.
    const operator = await prisma.organizationMember.findFirst({
      where: {
        organizationId,
        role: { in: ["OWNER", "ADMIN"] },
        user: { emailVerified: true },
      },
      select: { userId: true },
    });
    if (!operator) continue;

    const access = await resolveOrganizationScanAccess(prisma, {
      userId: operator.userId,
      organizationId,
    });
    if (!access.canRunPeriodicScan) continue;

    await consumeScanQuota(prisma, { organizationId, kind: "periodic" });
    for (const profileId of profileIds) {
      enqueueWatchProfileScan(prisma, kimdis, profileId);
      profilesEnqueued += 1;
    }
    orgsScanned += 1;
  }

  return {
    orgsConsidered: byOrg.size,
    orgsScanned,
    profilesEnqueued,
  };
};
