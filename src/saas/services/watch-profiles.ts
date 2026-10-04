import {
  Prisma,
  type AttentionEventType,
  type PrismaClient,
  type Tender,
  type WatchProfile,
} from "@prisma/client";
import type { RecordType } from "../../kimdis/types.js";
import type { KimdisClient } from "../../kimdis/client.js";
import { formatDateOnly } from "../../kimdis/client.js";
import { requireOrgMembership } from "../auth/org-context.js";
import { badRequest, conflict, notFound } from "../errors.js";
import { attentionTitleFor } from "./attention.js";
import {
  searchKimdis,
  type KimdisSearchFilters,
  type KimdisSearchItem,
} from "./kimdis-search.js";
import { upsertTenderFromKimdisItem } from "./upsert-tender.js";
import {
  criteriaFromWatchProfile,
  mergeMatchMeta,
  parseMatchMeta,
  recordTypesForScan,
  scoreKimdisItemAgainstProfile,
  type MatchProfileEntry,
  type OpportunityMatchMeta,
  type WatchMatchResult,
} from "./watch-match.js";

/**
 * Where the saved search was created from. Recorded for diagnostics only —
 * every source must produce identical normalization, persistence and scanning.
 */
export const WATCH_PROFILE_SOURCES = [
  "MANUAL",
  "SAVED_FROM_SEARCH",
  "SETUP_RECOMMENDATION",
] as const;

export type WatchProfileSource = (typeof WATCH_PROFILE_SOURCES)[number];

export type WatchProfileInput = {
  name: string;
  keywords?: string[];
  negativeKeywords?: string[];
  cpvs?: string[];
  minBudget?: number | null;
  maxBudget?: number | null;
  scoreThreshold?: number;
  alertScoreThreshold?: number;
  enabled?: boolean;
  recordTypes?: string[];
  matchingMode?: string;
  notificationOverride?: string;
  authority?: string | null;
  contractType?: string | null;
  procedureType?: string | null;
  source?: WatchProfileSource;
  skipSimilarCheck?: boolean;
};

const trimStrings = (values: string[] | undefined): string[] =>
  (values ?? []).map((v) => v.trim()).filter(Boolean);

const asStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.map((v) => String(v).trim()).filter(Boolean) : [];

const normalizeToken = (value: string): string =>
  value.trim().toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");

const dedupeTokens = (values: string[]): string[] => {
  const seen = new Map<string, string>();
  for (const value of values) {
    const key = normalizeToken(value);
    if (!key || seen.has(key)) continue;
    seen.set(key, value.trim());
  }
  return [...seen.values()];
};

const ALL_RECORD_TYPES = ["REQ", "PROC"] as const;

const normalizeRecordTypes = (values: string[] | undefined): string[] => {
  const unique = new Set(
    (values ?? []).map((value) => value.trim().toUpperCase()),
  );
  const allowed = ALL_RECORD_TYPES.filter((rt) => unique.has(rt));
  // Stable order so the fingerprint and the scan agree regardless of input order.
  return allowed.length ? [...allowed] : [...ALL_RECORD_TYPES];
};

export type NormalizedWatchProfileCriteria = {
  keywords: string[];
  negativeKeywords: string[];
  cpvs: string[];
  minBudget: number | null;
  maxBudget: number | null;
  recordTypes: string[];
  matchingMode: string;
  authority: string | null;
  contractType: string | null;
  procedureType: string | null;
};

/**
 * Single canonical criteria normalizer. Every creation source (Saved Searches,
 * Search → Save Search, setup recommendations) and the similarity fingerprint
 * must go through this, otherwise equivalent criteria can scan differently.
 */
export const normalizeWatchProfileCriteria = (
  input: WatchProfileInput,
): NormalizedWatchProfileCriteria => ({
  keywords: dedupeTokens(trimStrings(input.keywords)),
  negativeKeywords: dedupeTokens(trimStrings(input.negativeKeywords)),
  cpvs: dedupeTokens(trimStrings(input.cpvs)),
  minBudget: input.minBudget ?? null,
  maxBudget: input.maxBudget ?? null,
  recordTypes: normalizeRecordTypes(input.recordTypes),
  matchingMode: (input.matchingMode ?? "BALANCED").toUpperCase(),
  authority: input.authority?.trim() || null,
  contractType: input.contractType?.trim() || null,
  procedureType: input.procedureType?.trim() || null,
});

const criteriaFingerprint = (criteria: NormalizedWatchProfileCriteria): string => {
  const sort = (arr: string[]) => [...arr].map(normalizeToken).sort();
  return JSON.stringify({
    keywords: sort(criteria.keywords),
    negativeKeywords: sort(criteria.negativeKeywords),
    cpvs: sort(criteria.cpvs),
    minBudget: criteria.minBudget,
    maxBudget: criteria.maxBudget,
    authority: criteria.authority?.toLowerCase() ?? null,
    contractType: criteria.contractType?.toLowerCase() ?? null,
    procedureType: criteria.procedureType?.toLowerCase() ?? null,
    recordTypes: sort(criteria.recordTypes),
  });
};

const criteriaFromPersisted = (
  profile: WatchProfile,
): NormalizedWatchProfileCriteria =>
  normalizeWatchProfileCriteria({
    name: profile.name,
    keywords: asStringArray(profile.keywords),
    negativeKeywords: asStringArray(profile.negativeKeywords),
    cpvs: asStringArray(profile.cpvs),
    minBudget: profile.minBudget,
    maxBudget: profile.maxBudget,
    recordTypes: asStringArray(profile.recordTypes),
    matchingMode: profile.matchingMode,
    authority: profile.authority,
    contractType: profile.contractType,
    procedureType: profile.procedureType,
  });

export const findSimilarWatchProfiles = async (
  prisma: PrismaClient,
  input: {
    organizationId: string;
    criteria: WatchProfileInput;
    excludeProfileId?: string;
  },
) => {
  const fingerprint = criteriaFingerprint(
    normalizeWatchProfileCriteria(input.criteria),
  );

  const profiles = await prisma.watchProfile.findMany({
    where: {
      organizationId: input.organizationId,
      ...(input.excludeProfileId ? { id: { not: input.excludeProfileId } } : {}),
    },
  });

  return profiles.filter(
    (profile) => criteriaFingerprint(criteriaFromPersisted(profile)) === fingerprint,
  );
};

/**
 * A scan only lives inside one request, so a restart can leave `RUNNING`
 * behind forever. Anything older than this is treated as interrupted.
 */
const STALE_SCAN_MS = 10 * 60 * 1000;

export const reclaimStaleWatchProfileScans = async (
  prisma: PrismaClient,
  organizationId?: string,
): Promise<number> => {
  const stale = await prisma.watchProfile.findMany({
    where: {
      ...(organizationId ? { organizationId } : {}),
      scanState: "RUNNING",
      updatedAt: { lt: new Date(Date.now() - STALE_SCAN_MS) },
    },
  });

  for (const profile of stale) {
    await prisma.watchProfile.update({
      where: { id: profile.id },
      data: {
        scanState: "FAILED",
        customFilters: mergeCustomFilters(profile, {
          lastScanError: "scan_interrupted",
        }),
      },
    });
  }
  return stale.length;
};

export const listWatchProfiles = async (
  prisma: PrismaClient,
  input: { userId: string; organizationId: string | null },
) => {
  const { organizationId } = await requireOrgMembership(
    prisma,
    input.userId,
    input.organizationId,
  );
  await reclaimStaleWatchProfileScans(prisma, organizationId);
  return prisma.watchProfile.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
  });
};

export const getWatchProfile = async (
  prisma: PrismaClient,
  input: { userId: string; organizationId: string | null; profileId: string },
) => {
  const { organizationId } = await requireOrgMembership(
    prisma,
    input.userId,
    input.organizationId,
  );
  const profile = await prisma.watchProfile.findFirst({
    where: { id: input.profileId, organizationId },
  });
  if (!profile) throw notFound("watch_profile_not_found");
  return profile;
};

const profileDataFromInput = (input: WatchProfileInput) => {
  const name = input.name.trim();
  if (!name) throw badRequest("watch_profile_name_required");
  const criteria = normalizeWatchProfileCriteria(input);
  if (criteria.keywords.length === 0 && criteria.cpvs.length === 0) {
    throw badRequest("watch_profile_requires_keywords_or_cpvs");
  }
  return {
    name,
    ...criteria,
    scoreThreshold: input.scoreThreshold ?? 45,
    alertScoreThreshold: input.alertScoreThreshold ?? 60,
    enabled: input.enabled ?? true,
    notificationOverride: input.notificationOverride ?? "INHERIT",
    scanState: "PENDING",
  };
};

const isMaterialCriteriaChange = (
  before: WatchProfile,
  after: NormalizedWatchProfileCriteria,
): boolean =>
  criteriaFingerprint(criteriaFromPersisted(before)) !== criteriaFingerprint(after);

export const createWatchProfile = async (
  prisma: PrismaClient,
  kimdis: KimdisClient | undefined,
  input: WatchProfileInput & {
    userId: string;
    organizationId: string | null;
  },
) => {
  const { organizationId } = await requireOrgMembership(
    prisma,
    input.userId,
    input.organizationId,
  );

  if (!input.skipSimilarCheck) {
    const similar = await findSimilarWatchProfiles(prisma, {
      organizationId,
      criteria: input,
    });
    if (similar.length > 0) {
      throw conflict("watch_profile_similar_exists");
    }
  }

  const data = profileDataFromInput(input);
  const profile = await prisma.watchProfile.create({
    data: {
      organizationId,
      ...data,
      customFilters: { source: input.source ?? "MANUAL" },
    },
  });

  await runWatchProfileScan(prisma, kimdis, profile.id);
  return prisma.watchProfile.findUniqueOrThrow({ where: { id: profile.id } });
};

export const updateWatchProfile = async (
  prisma: PrismaClient,
  kimdis: KimdisClient | undefined,
  input: WatchProfileInput & {
    userId: string;
    organizationId: string | null;
    profileId: string;
  },
) => {
  const { organizationId } = await requireOrgMembership(
    prisma,
    input.userId,
    input.organizationId,
  );
  const existing = await prisma.watchProfile.findFirst({
    where: { id: input.profileId, organizationId },
  });
  if (!existing) throw notFound("watch_profile_not_found");

  if (!input.skipSimilarCheck) {
    const similar = await findSimilarWatchProfiles(prisma, {
      organizationId,
      criteria: input,
      excludeProfileId: existing.id,
    });
    if (similar.length > 0) {
      throw conflict("watch_profile_similar_exists");
    }
  }

  const data = profileDataFromInput(input);
  const material = isMaterialCriteriaChange(existing, normalizeWatchProfileCriteria(input));

  const profile = await prisma.watchProfile.update({
    where: { id: existing.id },
    data: {
      ...data,
      scanState: material ? "PENDING" : existing.scanState,
    },
  });

  if (material && profile.enabled) {
    await runWatchProfileScan(prisma, kimdis, profile.id);
    return prisma.watchProfile.findUniqueOrThrow({ where: { id: profile.id } });
  }
  return profile;
};

export const setWatchProfileEnabled = async (
  prisma: PrismaClient,
  input: {
    userId: string;
    organizationId: string | null;
    profileId: string;
    enabled: boolean;
  },
) => {
  const { organizationId } = await requireOrgMembership(
    prisma,
    input.userId,
    input.organizationId,
  );
  const existing = await prisma.watchProfile.findFirst({
    where: { id: input.profileId, organizationId },
  });
  if (!existing) throw notFound("watch_profile_not_found");
  return prisma.watchProfile.update({
    where: { id: existing.id },
    data: { enabled: input.enabled },
  });
};

export const deleteWatchProfile = async (
  prisma: PrismaClient,
  input: {
    userId: string;
    organizationId: string | null;
    profileId: string;
  },
) => {
  const { organizationId } = await requireOrgMembership(
    prisma,
    input.userId,
    input.organizationId,
  );
  const existing = await prisma.watchProfile.findFirst({
    where: { id: input.profileId, organizationId },
  });
  if (!existing) throw notFound("watch_profile_not_found");
  await prisma.watchProfile.delete({ where: { id: existing.id } });
  return { deleted: true, id: existing.id };
};

const scanDateWindow = (): { dateFrom: string; dateTo: string } => {
  const now = new Date();
  const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { dateFrom: formatDateOnly(from), dateTo: formatDateOnly(now) };
};

const buildScanFilterVariants = (
  profile: WatchProfile,
): KimdisSearchFilters[] => {
  const dates = scanDateWindow();
  const criteria = criteriaFromWatchProfile(profile);
  const recordTypes = recordTypesForScan(criteria.recordTypes);
  const base = {
    page: 0,
    pageSize: 50,
    sort: "date_desc" as const,
    ...dates,
    ...(criteria.authority ? { organization: criteria.authority } : {}),
    ...(criteria.contractType ? { contractType: criteria.contractType } : {}),
    ...(criteria.procedureType ? { procedureType: criteria.procedureType } : {}),
    ...(criteria.minBudget != null ? { totalCostFrom: criteria.minBudget } : {}),
    ...(criteria.maxBudget != null ? { totalCostTo: criteria.maxBudget } : {}),
  };

  const variants: KimdisSearchFilters[] = [];

  for (const recordFamily of recordTypes) {
    if (criteria.cpvs.length > 0) {
      for (const cpv of criteria.cpvs) {
        variants.push({
          recordFamily,
          ...base,
          cpv,
          ...(criteria.keywords.length
            ? { title: criteria.keywords.join(" ") }
            : {}),
        });
      }
    } else if (criteria.keywords.length > 0) {
      variants.push({
        recordFamily,
        ...base,
        title: criteria.keywords.join(" "),
      });
    } else {
      variants.push({ recordFamily, ...base });
    }
  }

  return variants;
};

const MAX_SCAN_PAGES = 20;

/**
 * KIMDIS answers 404 for a page past the end, which the HTTP client retries
 * with exponential backoff (~40s) before it is mapped to "no results". Stop on
 * `last` and on the reported `totalPages` so a scan never pays that cost.
 */
const fetchAllKimdisItems = async (
  kimdis: KimdisClient,
  filters: KimdisSearchFilters,
): Promise<KimdisSearchItem[]> => {
  const items: KimdisSearchItem[] = [];
  let page = 0;
  while (page < MAX_SCAN_PAGES) {
    const result = await searchKimdis(kimdis, { ...filters, page });
    items.push(...result.items);
    if (result.last || result.items.length === 0) break;
    if (result.totalPages > 0 && page + 1 >= result.totalPages) break;
    page += 1;
  }
  return items;
};

const newOpportunityDedupeKey = (tenderId: string): string =>
  `NEW_OPPORTUNITY:${tenderId}`;

const ensureNewOpportunityAttention = async (
  prisma: PrismaClient,
  input: {
    organizationId: string;
    organizationTenderId: string;
    tenderId: string;
    profileName: string;
    score: number;
  },
) => {
  const dedupeKey = newOpportunityDedupeKey(input.tenderId);
  const type = "NEW_OPPORTUNITY" as AttentionEventType;
  // Upsert (not find-then-create) so concurrent scans of different profiles
  // matching the same tender can never produce a duplicate notification.
  return prisma.organizationAttentionEvent.upsert({
    where: {
      organizationId_dedupeKey: {
        organizationId: input.organizationId,
        dedupeKey,
      },
    },
    create: {
      organizationId: input.organizationId,
      organizationTenderId: input.organizationTenderId,
      type,
      title: attentionTitleFor(type, "CONFIRMED"),
      dedupeKey,
      metadata: {
        profileName: input.profileName,
        score: input.score,
      },
    },
    update: {},
  });
};

/**
 * Scoring works on the KIMDIS search shape, so canonical rows are adapted
 * instead of duplicating the matcher.
 */
const searchItemFromTender = (tender: Tender): KimdisSearchItem => ({
  adam: tender.referenceNumber,
  recordType: (tender.recordType === "PROC" ? "PROC" : "REQ") as RecordType,
  title: tender.title ?? "",
  contractingAuthority: tender.contractingAuthority ?? "",
  cpvs: Array.isArray(tender.cpvs)
    ? tender.cpvs.map((cpv) => String(cpv))
    : [],
  budgetWithoutVat: tender.budgetWithoutVat,
  budgetWithVat: tender.budgetWithVat,
  submissionDate: tender.submissionDate?.toISOString() ?? null,
  signedDate: tender.signedDate?.toISOString() ?? null,
  finalSubmissionDate: tender.finalSubmissionDate?.toISOString() ?? null,
  procedureType: null,
  contractTypeLabel: null,
  cancelled: false,
  publicKimdisUrl: tender.publicKimdisUrl ?? "",
  officialPdfUrl: tender.officialPdfUrl ?? "",
  openState: "UNKNOWN",
});

export const upsertOpportunityFromProfileMatch = async (
  prisma: PrismaClient,
  input: {
    organizationId: string;
    profile: WatchProfile;
    item: KimdisSearchItem;
    match: ReturnType<typeof scoreKimdisItemAgainstProfile>;
  },
): Promise<OpportunityLinkResult> => {
  const tender = await upsertTenderFromKimdisItem(prisma, input.item);
  return linkOpportunityToProfile(prisma, {
    organizationId: input.organizationId,
    profile: input.profile,
    tenderId: tender.id,
    match: input.match,
  });
};

type OpportunityLinkResult = {
  created: boolean;
  organizationTenderId: string;
  tenderId: string;
};

/**
 * One OrganizationTender per (organization, tender): extra profile matches are
 * merged into matchMeta so the same opportunity never shows up twice.
 */
const linkOpportunityToProfile = async (
  prisma: PrismaClient,
  input: {
    organizationId: string;
    profile: WatchProfile;
    tenderId: string;
    match: ReturnType<typeof scoreKimdisItemAgainstProfile>;
  },
): Promise<OpportunityLinkResult> => {
  const { tenderId } = input;
  const entry: MatchProfileEntry = {
    id: input.profile.id,
    name: input.profile.name,
    score: input.match.score,
    reasons: input.match.reasons,
  };

  const existing = await prisma.organizationTender.findUnique({
    where: {
      organizationId_tenderId: {
        organizationId: input.organizationId,
        tenderId,
      },
    },
  });

  if (!existing) {
    const matchMeta: OpportunityMatchMeta = mergeMatchMeta(null, entry);
    const row = await prisma.organizationTender.create({
      data: {
        organizationId: input.organizationId,
        tenderId,
        watchProfileId: input.profile.id,
        score: input.match.score,
        scoreReasons: input.match.reasons,
        matchedKeywords: input.match.matchedKeywords,
        matchedCpvs: input.match.matchedCpvs,
        matchMeta,
        relevanceStatus: "RELEVANT",
      },
    });
    await ensureNewOpportunityAttention(prisma, {
      organizationId: input.organizationId,
      organizationTenderId: row.id,
      tenderId,
      profileName: input.profile.name,
      score: input.match.score,
    });
    return { created: true, organizationTenderId: row.id, tenderId };
  }

  const prevMeta = parseMatchMeta(existing.matchMeta);
  const matchMeta = mergeMatchMeta(prevMeta, entry);
  const top = matchMeta.matchedProfiles[0];
  const watchProfileId = top?.id ?? existing.watchProfileId;

  await prisma.organizationTender.update({
    where: { id: existing.id },
    data: {
      watchProfileId,
      score: matchMeta.highestScore,
      scoreReasons: (top?.reasons ??
        existing.scoreReasons ??
        []) as Prisma.InputJsonValue,
      matchedKeywords: (input.match.matchedKeywords.length
        ? input.match.matchedKeywords
        : (existing.matchedKeywords ?? [])) as Prisma.InputJsonValue,
      matchedCpvs: (input.match.matchedCpvs.length
        ? input.match.matchedCpvs
        : (existing.matchedCpvs ?? [])) as Prisma.InputJsonValue,
      matchMeta: matchMeta as unknown as Prisma.InputJsonValue,
      ...(existing.relevanceStatus == null ? { relevanceStatus: "RELEVANT" } : {}),
    },
  });

  return { created: false, organizationTenderId: existing.id, tenderId };
};

const SCAN_WINDOW_DAYS = 30;

/**
 * Phase 1 of a scan: already-ingested canonical tenders. Keeps Opportunities
 * useful even when KIMDIS is slow, rate-limited or returns nothing.
 */
const scanCanonicalTenders = async (
  prisma: PrismaClient,
  profile: WatchProfile,
  onMatch: (tenderId: string, match: WatchMatchResult) => Promise<void>,
): Promise<Set<string>> => {
  const criteria = criteriaFromWatchProfile(profile);
  const since = new Date(Date.now() - SCAN_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const tenders = await prisma.tender.findMany({
    where: {
      recordType: { in: recordTypesForScan(criteria.recordTypes) },
      OR: [{ submissionDate: { gte: since } }, { firstSeenAt: { gte: since } }],
    },
    orderBy: { firstSeenAt: "desc" },
    take: 2000,
  });

  const seen = new Set<string>();
  for (const tender of tenders) {
    seen.add(tender.referenceNumber);
    const match = scoreKimdisItemAgainstProfile(
      criteria,
      searchItemFromTender(tender),
      { id: profile.id, name: profile.name },
    );
    if (!match.qualifies) continue;
    await onMatch(tender.id, match);
  }
  return seen;
};

export const runWatchProfileScan = async (
  prisma: PrismaClient,
  kimdis: KimdisClient | undefined,
  profileId: string,
): Promise<WatchProfile> => {
  const profile = await prisma.watchProfile.findUnique({
    where: { id: profileId },
  });
  if (!profile) throw notFound("watch_profile_not_found");

  if (!profile.enabled) {
    return profile;
  }

  const startedRecently =
    profile.scanState === "RUNNING" &&
    Date.now() - profile.updatedAt.getTime() < STALE_SCAN_MS;
  if (startedRecently) {
    return profile;
  }

  await prisma.watchProfile.update({
    where: { id: profileId },
    data: { scanState: "RUNNING" },
  });

  const criteria = criteriaFromWatchProfile(profile);
  const matchedTenderIds = new Set<string>();
  const upstreamErrors: string[] = [];

  try {
    const seenAdam = await scanCanonicalTenders(
      prisma,
      profile,
      async (tenderId, match) => {
        matchedTenderIds.add(tenderId);
        await linkOpportunityToProfile(prisma, {
          organizationId: profile.organizationId,
          profile,
          tenderId,
          match,
        });
      },
    );

    if (kimdis) {
      for (const filters of buildScanFilterVariants(profile)) {
        let items: KimdisSearchItem[] = [];
        try {
          items = await fetchAllKimdisItems(kimdis, filters);
        } catch (error) {
          upstreamErrors.push(
            error instanceof Error ? error.message : "kimdis_variant_failed",
          );
          continue;
        }
        for (const item of items) {
          if (seenAdam.has(item.adam)) continue;
          seenAdam.add(item.adam);
          const match = scoreKimdisItemAgainstProfile(criteria, item, {
            id: profile.id,
            name: profile.name,
          });
          if (!match.qualifies) continue;

          const result = await upsertOpportunityFromProfileMatch(prisma, {
            organizationId: profile.organizationId,
            profile,
            item,
            match,
          });
          matchedTenderIds.add(result.tenderId);
        }
      }
    } else {
      upstreamErrors.push("kimdis_not_configured");
    }

    const now = new Date();
    return prisma.watchProfile.update({
      where: { id: profileId },
      data: {
        scanState: "COMPLETED",
        lastScannedAt: now,
        initialScanCompletedAt: profile.initialScanCompletedAt ?? now,
        lastMatchAt: matchedTenderIds.size > 0 ? now : profile.lastMatchAt,
        matchCount: matchedTenderIds.size,
        customFilters: mergeCustomFilters(profile, {
          lastScanError: upstreamErrors[0] ?? null,
          lastScanPartial: upstreamErrors.length > 0,
        }),
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "watch_profile_scan_failed";
    return prisma.watchProfile.update({
      where: { id: profileId },
      data: {
        scanState: "FAILED",
        lastScannedAt: new Date(),
        customFilters: mergeCustomFilters(profile, { lastScanError: message }),
      },
    });
  }
};

const mergeCustomFilters = (
  profile: WatchProfile,
  patch: Record<string, unknown>,
): Prisma.InputJsonValue =>
  ({
    ...(typeof profile.customFilters === "object" && profile.customFilters
      ? (profile.customFilters as Record<string, unknown>)
      : {}),
    ...patch,
  }) as Prisma.InputJsonValue;

export const triggerWatchProfileScanForRoute = async (
  prisma: PrismaClient,
  kimdis: KimdisClient | undefined,
  input: {
    userId: string;
    organizationId: string | null;
    profileId: string;
  },
) => {
  await getWatchProfile(prisma, input);
  return runWatchProfileScan(prisma, kimdis, input.profileId);
};
