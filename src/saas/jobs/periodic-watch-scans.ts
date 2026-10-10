import type { PrismaClient } from "@prisma/client";
import type { KimdisClient } from "../../kimdis/client.js";
import type { EmailMode } from "../plans/catalog.js";
import {
  athensHourKey,
  orgIsDueAtHour,
} from "../services/digest-hours.js";
import { normalizeNotifications } from "../services/org-settings.js";
import {
  consumeScanQuota,
  organizationHasVerifiedOperator,
  resolveOrganizationScanAccess,
} from "../services/scan-access.js";
import { enqueueWatchProfileScan } from "../services/watch-profiles.js";

export type PeriodicScanWaveOptions = {
  /** When set, only orgs whose plan emailMode is in this list are scanned. */
  emailModes?: EmailMode[];
  /** Europe/Athens HH:00 — only orgs with this digest hour run. */
  dueHour?: string;
  /** Optional hard filter of org ids. */
  organizationIds?: string[];
};

/**
 * Org-level periodic wave: enqueue all enabled profiles, cost = 1 quota unit.
 * Cadence = user-selected digest hours, capped by plan periodicScansPerDay.
 */
export const runPeriodicWatchProfileScans = async (
  prisma: PrismaClient,
  kimdis: KimdisClient | undefined,
  options?: PeriodicScanWaveOptions,
): Promise<{
  orgsConsidered: number;
  orgsScanned: number;
  profilesEnqueued: number;
  scannedOrganizationIds: string[];
}> => {
  const emailModes = options?.emailModes;
  const dueHour = options?.dueHour ?? athensHourKey();
  const orgAllow = options?.organizationIds?.length
    ? new Set(options.organizationIds)
    : null;

  const enabled = await prisma.watchProfile.findMany({
    where: {
      enabled: true,
      ...(orgAllow ? { organizationId: { in: [...orgAllow] } } : {}),
    },
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
  const scannedOrganizationIds: string[] = [];

  for (const [organizationId, profileIds] of byOrg) {
    const verified = await organizationHasVerifiedOperator(prisma, organizationId);
    if (!verified) continue;

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
    if (emailModes?.length && !emailModes.includes(access.limits.emailMode)) {
      continue;
    }

    const settings = await prisma.organizationSettings.findUnique({
      where: { organizationId },
      select: { notifications: true },
    });
    const prefs = normalizeNotifications(
      settings?.notifications,
      access.planKey,
      organizationId,
    );
    if (
      !orgIsDueAtHour({
        digestHours: prefs.digestHours,
        hourKey: dueHour,
      })
    ) {
      continue;
    }

    await consumeScanQuota(prisma, { organizationId, kind: "periodic" });
    for (const profileId of profileIds) {
      enqueueWatchProfileScan(prisma, kimdis, profileId);
      profilesEnqueued += 1;
    }
    orgsScanned += 1;
    scannedOrganizationIds.push(organizationId);
  }

  return {
    orgsConsidered: byOrg.size,
    orgsScanned,
    profilesEnqueued,
    scannedOrganizationIds,
  };
};

/** Orgs due at this Athens hour (even without watch profiles) — for related/radar flush. */
export const listOrganizationsDueAtHour = async (
  prisma: PrismaClient,
  dueHour: string,
): Promise<string[]> => {
  const settings = await prisma.organizationSettings.findMany({
    select: {
      organizationId: true,
      notifications: true,
      organization: {
        select: {
          subscription: { select: { planKey: true } },
        },
      },
    },
  });
  const due: string[] = [];
  for (const row of settings) {
    const planKey = row.organization.subscription?.planKey ?? "trial";
    const prefs = normalizeNotifications(
      row.notifications,
      planKey,
      row.organizationId,
    );
    if (prefs.digestHours.length === 0) continue;
    if (orgIsDueAtHour({ digestHours: prefs.digestHours, hourKey: dueHour })) {
      due.push(row.organizationId);
    }
  }
  return due;
};
