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

export const expiringWindow = (now = new Date()): { from: Date; to: Date } => ({
  from: new Date(now.getTime() + 3 * MONTH_MS),
  to: new Date(now.getTime() + 9 * MONTH_MS),
});

const cpvOf = (cpvs: unknown): string | null => {
  if (!Array.isArray(cpvs) || cpvs.length === 0) return null;
  const value = String(cpvs[0] ?? "").trim();
  return value || null;
};

const cpvMatches = (cpv: string | null, wanted: string[]): boolean => {
  if (wanted.length === 0) return true;
  if (!cpv) return false;
  const compact = cpv.replace(/\s/g, "");
  return wanted.some((code) => {
    const prefix = code.replace(/\s/g, "").slice(0, 5);
    return prefix.length >= 2 && compact.startsWith(prefix);
  });
};

export const loadExpiringContracts = async (
  prisma: PrismaClient,
  input: {
    organizationId: string;
    list: boolean;
  },
): Promise<{ count: number; items: ExpiringContractRow[] }> => {
  const settings = await prisma.organizationSettings.findUnique({
    where: { organizationId: input.organizationId },
    select: { activities: true },
  });
  const activities = Array.isArray(settings?.activities)
    ? (settings.activities as Array<{ code?: string; description?: string }>)
        .map((row) => ({
          code: String(row.code ?? "").trim(),
          description:
            typeof row.description === "string" ? row.description : undefined,
        }))
        .filter((row) => row.code)
    : [];
  const suggestion = suggestWatchInterestsFromKads(activities);
  const wantedCpvs = suggestion.cpvs.map((row) => row.code);

  const profile = await prisma.watchProfile.findFirst({
    where: { organizationId: input.organizationId, enabled: true },
    select: { regions: true, includeUnclassifiedRegion: true },
    orderBy: { createdAt: "asc" },
  });
  const regions = Array.isArray(profile?.regions)
    ? profile.regions.map((value) => String(value))
    : [];
  const includeUnclassified = Boolean(profile?.includeUnclassifiedRegion);

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

  return { count: matched.length, items };
};

export const regionOfNuts = toNuts2;
