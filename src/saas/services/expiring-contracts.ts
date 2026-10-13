import type { PrismaClient } from "@prisma/client";
import { evaluateRegionGate, toNuts2 } from "../geo/nuts.js";
import { suggestWatchInterestsFromKads } from "../recommendations/kad-to-watch.js";

const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

export type ExpiringContractRow = {
  tenderId: string;
  referenceNumber: string;
  title: string | null;
  authority: string | null;
  cpv: string | null;
  endsAt: string;
  publicKimdisUrl: string | null;
};

export type ExpiringMatchBasis = "activities" | "watch_profiles" | "both" | "none";

export type ExpiringContractsResult = {
  count: number;
  items: ExpiringContractRow[];
  /** True only when org has CPV criteria derived from KAD and/or saved searches. */
  matchingReady: boolean;
  matchBasis: ExpiringMatchBasis;
};

export const expiringWindow = (now = new Date()): { from: Date; to: Date } => ({
  from: new Date(now.getTime() + 3 * MONTH_MS),
  to: new Date(now.getTime() + 9 * MONTH_MS),
});

const cpvOf = (cpvs: unknown): string | null => {
  if (!Array.isArray(cpvs) || cpvs.length === 0) return null;
  const value = String(cpvs[0] ?? "").trim();
  return value || null;
};

const normalizeCpvList = (values: unknown): string[] => {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  for (const value of values) {
    const code = String(value ?? "")
      .trim()
      .replace(/\s/g, "");
    if (code) seen.add(code);
  }
  return [...seen];
};

/**
 * Empty wanted list must NOT match everything — that falsely personalizes a global count.
 */
export const cpvMatches = (cpv: string | null, wanted: string[]): boolean => {
  if (wanted.length === 0) return false;
  if (!cpv) return false;
  const compact = cpv.replace(/\s/g, "");
  return wanted.some((code) => {
    const prefix = code.replace(/\s/g, "").slice(0, 5);
    return prefix.length >= 2 && compact.startsWith(prefix);
  });
};

export const resolveExpiringMatchCriteria = (input: {
  activities: Array<{ code?: string; description?: string }>;
  watchProfileCpvs: string[];
}): { wantedCpvs: string[]; matchingReady: boolean; matchBasis: ExpiringMatchBasis } => {
  const activities = input.activities
    .map((row) => ({
      code: String(row.code ?? "").trim(),
      description:
        typeof row.description === "string" ? row.description : undefined,
    }))
    .filter((row) => row.code);
  const fromActivities = suggestWatchInterestsFromKads(activities).cpvs.map(
    (row) => row.code,
  );
  const fromProfiles = input.watchProfileCpvs
    .map((code) => code.trim().replace(/\s/g, ""))
    .filter(Boolean);

  const wanted = new Set<string>([...fromActivities, ...fromProfiles]);
  const wantedCpvs = [...wanted];
  const hasActivities = fromActivities.length > 0;
  const hasProfiles = fromProfiles.length > 0;
  const matchBasis: ExpiringMatchBasis =
    hasActivities && hasProfiles
      ? "both"
      : hasActivities
        ? "activities"
        : hasProfiles
          ? "watch_profiles"
          : "none";

  return {
    wantedCpvs,
    matchingReady: wantedCpvs.length > 0,
    matchBasis,
  };
};

export const loadExpiringContracts = async (
  prisma: PrismaClient,
  input: {
    organizationId: string;
    list: boolean;
  },
): Promise<ExpiringContractsResult> => {
  const settings = await prisma.organizationSettings.findUnique({
    where: { organizationId: input.organizationId },
    select: { activities: true },
  });
  const activities = Array.isArray(settings?.activities)
    ? (settings.activities as Array<{ code?: string; description?: string }>)
    : [];

  const profiles = await prisma.watchProfile.findMany({
    where: { organizationId: input.organizationId, enabled: true },
    select: {
      cpvs: true,
      regions: true,
      includeUnclassifiedRegion: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  const watchProfileCpvs = profiles.flatMap((profile) =>
    normalizeCpvList(profile.cpvs),
  );
  const { wantedCpvs, matchingReady, matchBasis } = resolveExpiringMatchCriteria({
    activities,
    watchProfileCpvs,
  });

  if (!matchingReady) {
    return { count: 0, items: [], matchingReady: false, matchBasis: "none" };
  }

  const regionSource = profiles[0];
  const regions = Array.isArray(regionSource?.regions)
    ? regionSource.regions.map((value) => String(value))
    : [];
  const includeUnclassified = Boolean(regionSource?.includeUnclassifiedRegion);

  const window = expiringWindow();
  const rows = await prisma.tender.findMany({
    where: {
      recordType: "CONTRACT",
      contractEndsAt: { gte: window.from, lte: window.to },
    },
    orderBy: { contractEndsAt: "asc" },
    take: 400,
  });

  const matched = rows.filter((row) => {
    if (!cpvMatches(cpvOf(row.cpvs), wantedCpvs)) return false;
    const gate = evaluateRegionGate(
      row.nutsCode,
      regions,
      includeUnclassified,
    );
    return gate === "ok";
  });

  const items: ExpiringContractRow[] = input.list
    ? matched.slice(0, 50).map((row) => ({
        tenderId: row.id,
        referenceNumber: row.referenceNumber,
        title: row.title,
        authority: row.contractingAuthority,
        cpv: cpvOf(row.cpvs),
        endsAt: row.contractEndsAt!.toISOString(),
        publicKimdisUrl: row.publicKimdisUrl,
      }))
    : [];

  return { count: matched.length, items, matchingReady: true, matchBasis };
};

export const regionOfNuts = toNuts2;
