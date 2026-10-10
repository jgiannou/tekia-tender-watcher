import type { PrismaClient } from "@prisma/client";
import type { KimdisClient } from "../../kimdis/client.js";
import {
  flushOpportunityEmailDigests,
  flushRelatedActEmailDigests,
} from "../services/notify.js";
import { athensHourKey } from "../services/digest-hours.js";
import { monitorFollowedThreads } from "./monitor-followed-threads.js";
import { runDeadlineRadarForOrganizations } from "./deadline-radar.js";
import {
  listOrganizationsDueAtHour,
  runPeriodicWatchProfileScans,
} from "./periodic-watch-scans.js";

/**
 * Hourly Athens wave: orgs whose selected digest hour matches now.
 * Respects plan slot caps via normalizeDigestHours + periodic quota.
 * Free weekly cadence is excluded (empty digestHours).
 */
export const runHourlyNotificationWave = async (
  prisma: PrismaClient,
  kimdis: KimdisClient | undefined,
  now = new Date(),
): Promise<{
  hour: string;
  dueOrgs: number;
  scans: Awaited<ReturnType<typeof runPeriodicWatchProfileScans>>;
  opportunityFlush: Awaited<ReturnType<typeof flushOpportunityEmailDigests>>;
  relatedFlush: Awaited<ReturnType<typeof flushRelatedActEmailDigests>>;
  deadlineRadar: Awaited<ReturnType<typeof runDeadlineRadarForOrganizations>>;
}> => {
  const hour = athensHourKey(now);
  const dueOrgIds = await listOrganizationsDueAtHour(prisma, hour);

  const scans = await runPeriodicWatchProfileScans(prisma, kimdis, {
    dueHour: hour,
    organizationIds: dueOrgIds,
  });

  // Discover related acts globally, then email only orgs due this hour.
  await monitorFollowedThreads(prisma);

  const opportunityFlush = await flushOpportunityEmailDigests(prisma, {
    organizationIds: dueOrgIds,
  });

  const relatedFlush = await flushRelatedActEmailDigests(prisma, {
    organizationIds: dueOrgIds,
  });

  const deadlineRadar = await runDeadlineRadarForOrganizations(
    prisma,
    dueOrgIds,
  );

  return {
    hour,
    dueOrgs: dueOrgIds.length,
    scans,
    opportunityFlush,
    relatedFlush,
    deadlineRadar,
  };
};
