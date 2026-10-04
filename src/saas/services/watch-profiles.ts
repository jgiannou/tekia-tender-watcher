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
  kimdisItemFromTender,
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
  removeProfileFromMatchMeta,
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
  /** Inclusive KIMDIS publication window (YYYY-MM-DD). Both or neither. */
  dateFrom?: string | null;
  dateTo?: string | null;
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

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

const normalizeDateOnly = (value: string | null | undefined): string | null => {
  if (value == null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!DATE_ONLY.test(trimmed)) {
    throw badRequest("watch_profile_date_must_be_yyyy_mm_dd");
  }
  const ms = Date.parse(`${trimmed}T00:00:00.000Z`);
  if (Number.isNaN(ms)) throw badRequest("watch_profile_date_invalid");
  return trimmed;
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
  dateFrom: string | null;
  dateTo: string | null;
};

/**
 * Single canonical criteria normalizer. Every creation source (Saved Searches,
 * Search → Save Search, setup recommendations) and the similarity fingerprint
 * must go through this, otherwise equivalent criteria can scan differently.
 */
export const normalizeWatchProfileCriteria = (
  input: WatchProfileInput,
): NormalizedWatchProfileCriteria => {
  const dateFrom = normalizeDateOnly(input.dateFrom);
  const dateTo = normalizeDateOnly(input.dateTo);
  // dateFrom-only and dateTo-only are both valid; the scan window fills the open end.
  if (dateFrom && dateTo && dateFrom > dateTo) {
    throw badRequest("watch_profile_date_from_after_date_to");
  }
  return {
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
    dateFrom,
    dateTo,
  };
};

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
    dateFrom: criteria.dateFrom,
    dateTo: criteria.dateTo,
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
    dateFrom: profile.dateFrom,
    dateTo: profile.dateTo,
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

  // The route returns as soon as the profile is PENDING. Every creation source
  // enqueues this same scan; none of them wait for KIMDIS.
  enqueueWatchProfileScan(prisma, kimdis, profile.id);
  return profile;
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
    enqueueWatchProfileScan(prisma, kimdis, profile.id);
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

const DEFAULT_SCAN_LOOKBACK_DAYS = 30;

/** Profile date window when set; otherwise a rolling lookback for continuous scans. */
export const scanDateWindowForProfile = (
  profile: Pick<WatchProfile, "dateFrom" | "dateTo">,
): { dateFrom: string; dateTo: string } => {
  const today = formatDateOnly(new Date());
  if (profile.dateFrom && profile.dateTo) {
    return { dateFrom: profile.dateFrom, dateTo: profile.dateTo };
  }
  if (profile.dateFrom) {
    return { dateFrom: profile.dateFrom, dateTo: today };
  }
  if (profile.dateTo) {
    const until = new Date(`${profile.dateTo}T00:00:00.000Z`);
    const from = new Date(
      until.getTime() - DEFAULT_SCAN_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
    );
    return { dateFrom: formatDateOnly(from), dateTo: profile.dateTo };
  }
  const now = new Date();
  const from = new Date(
    now.getTime() - DEFAULT_SCAN_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
  );
  return { dateFrom: formatDateOnly(from), dateTo: today };
};

/** Cap union variants so construction-style profiles stay within a practical scan budget. */
const MAX_KEYWORD_VARIANTS = 6;
const MAX_CPV_VARIANTS = 6;

/**
 * Candidate retrieval is a union of alternatives: each keyword alone and each
 * CPV alone. Do not AND all keywords into one title with every CPV — that
 * over-constrains upstream collection (e.g. construction KAD suggestions).
 */
export const buildScanFilterVariants = (
  profile: WatchProfile,
): KimdisSearchFilters[] => {
  const dates = scanDateWindowForProfile(profile);
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
  const keywords = criteria.keywords.slice(0, MAX_KEYWORD_VARIANTS);
  const cpvs = criteria.cpvs.slice(0, MAX_CPV_VARIANTS);

  for (const recordFamily of recordTypes) {
    for (const keyword of keywords) {
      variants.push({
        recordFamily,
        ...base,
        title: keyword,
      });
    }
    for (const cpv of cpvs) {
      variants.push({
        recordFamily,
        ...base,
        cpv,
      });
    }
    if (keywords.length === 0 && cpvs.length === 0) {
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

const opportunityDigestDedupeKey = (profileId: string, scannedAt: Date): string =>
  `OPPORTUNITY_DIGEST:${profileId}:${scannedAt.toISOString().slice(0, 13)}`;

const ensureNewOpportunityAttention = async (
  prisma: PrismaClient,
  input: {
    organizationId: string;
    organizationTenderId: string;
    tenderId: string;
    profileId: string;
    profileName: string;
    score: number;
    tenderTitle?: string | null;
    referenceNumber?: string | null;
    recordType?: string | null;
    authority?: string | null;
  },
) => {
  const dedupeKey = newOpportunityDedupeKey(input.tenderId);
  const type = "NEW_OPPORTUNITY" as AttentionEventType;
  const title = (input.tenderTitle?.trim() ||
    input.referenceNumber?.trim() ||
    attentionTitleFor(type, "CONFIRMED")) as string;
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
      title,
      dedupeKey,
      metadata: {
        profileId: input.profileId,
        profileName: input.profileName,
        score: input.score,
        referenceNumber: input.referenceNumber ?? null,
        tenderTitle: input.tenderTitle ?? null,
        recordType: input.recordType ?? null,
        authority: input.authority ?? null,
      },
    },
    update: {},
  });
};

const ensureOpportunityDigestAttention = async (
  prisma: PrismaClient,
  input: {
    organizationId: string;
    organizationTenderId: string;
    profileId: string;
    profileName: string;
    matchCount: number;
    newCount: number;
    scannedAt: Date;
    topMatches: Array<{
      referenceNumber: string;
      title: string | null;
      score: number;
    }>;
  },
) => {
  if (input.matchCount <= 0) return null;
  const dedupeKey = opportunityDigestDedupeKey(input.profileId, input.scannedAt);
  const type = "OPPORTUNITY_DIGEST" as AttentionEventType;
  const fresh = Math.max(0, input.newCount);
  const count = fresh > 0 ? fresh : input.matchCount;
  const title =
    count === 1
      ? `1 ευκαιρία από την αναζήτηση «${input.profileName}»`
      : `${count} ευκαιρίες από την αναζήτηση «${input.profileName}»`;
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
      title,
      dedupeKey,
      metadata: {
        profileId: input.profileId,
        profileName: input.profileName,
        matchCount: input.matchCount,
        newCount: input.newCount,
        topMatches: input.topMatches.slice(0, 5),
      },
    },
    update: {
      title,
      metadata: {
        profileId: input.profileId,
        profileName: input.profileName,
        matchCount: input.matchCount,
        newCount: input.newCount,
        topMatches: input.topMatches.slice(0, 5),
      },
    },
  });
};

/** Scoring works on the KIMDIS search shape — reuse the shared adapter. */
const searchItemFromTender = kimdisItemFromTender;

/** Pick the first candidate profile id that still exists for this org. */
const resolveExistingWatchProfileId = async (
  prisma: PrismaClient,
  input: {
    organizationId: string;
    candidateIds: Array<string | null | undefined>;
  },
): Promise<string | null> => {
  for (const candidateId of input.candidateIds) {
    if (!candidateId) continue;
    const found = await prisma.watchProfile.findFirst({
      where: { id: candidateId, organizationId: input.organizationId },
      select: { id: true },
    });
    if (found) return found.id;
  }
  return null;
};

export const upsertOpportunityFromProfileMatch = async (
  prisma: PrismaClient,
  input: {
    organizationId: string;
    profile: WatchProfile;
    item: KimdisSearchItem;
    match: ReturnType<typeof scoreKimdisItemAgainstProfile>;
    emitAttention?: boolean;
  },
): Promise<OpportunityLinkResult> => {
  const tender = await upsertTenderFromKimdisItem(prisma, input.item);
  return linkOpportunityToProfile(prisma, {
    organizationId: input.organizationId,
    profile: input.profile,
    tenderId: tender.id,
    match: input.match,
    emitAttention: input.emitAttention ?? true,
  });
};

type OpportunityLinkResult = {
  created: boolean;
  organizationTenderId: string;
  tenderId: string;
  score: number;
  referenceNumber: string | null;
  tenderTitle: string | null;
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
    /** Initial scan uses a digest instead of per-match notifications. */
    emitAttention: boolean;
  },
): Promise<OpportunityLinkResult> => {
  const { tenderId } = input;
  const entry: MatchProfileEntry = {
    id: input.profile.id,
    name: input.profile.name,
    score: input.match.score,
    reasons: input.match.reasons,
  };

  const tender = await prisma.tender.findUnique({ where: { id: tenderId } });
  const referenceNumber = tender?.referenceNumber ?? null;
  const tenderTitle = tender?.title ?? null;
  const recordType = tender?.recordType ?? null;
  const authority = tender?.contractingAuthority ?? null;

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
    if (input.emitAttention) {
      await ensureNewOpportunityAttention(prisma, {
        organizationId: input.organizationId,
        organizationTenderId: row.id,
        tenderId,
        profileId: input.profile.id,
        profileName: input.profile.name,
        score: input.match.score,
        tenderTitle,
        referenceNumber,
        recordType,
        authority,
      });
    }
    return {
      created: true,
      organizationTenderId: row.id,
      tenderId,
      score: input.match.score,
      referenceNumber,
      tenderTitle,
    };
  }

  // User-hidden / expired rows must not reappear after a later scan match.
  if (
    existing.pipelineStage === "DISMISSED" ||
    existing.relevanceStatus === "EXPIRED" ||
    existing.ignoreReason === "user_marked_expired" ||
    existing.ignoreReason === "user_dismissed"
  ) {
    return {
      created: false,
      organizationTenderId: existing.id,
      tenderId,
      score: existing.score ?? input.match.score,
      referenceNumber,
      tenderTitle,
    };
  }

  const prevMeta = parseMatchMeta(existing.matchMeta);
  const matchMeta = mergeMatchMeta(prevMeta, entry);
  const top = matchMeta.matchedProfiles[0];
  // Never write a deleted/stale profile id — FK would 500 the scan/update path.
  const watchProfileId = await resolveExistingWatchProfileId(prisma, {
    organizationId: input.organizationId,
    candidateIds: [top?.id, existing.watchProfileId, input.profile.id],
  });

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

  return {
    created: false,
    organizationTenderId: existing.id,
    tenderId,
    score: matchMeta.highestScore,
    referenceNumber,
    tenderTitle,
  };
};

/**
 * After a successful non-partial full scan, drop this profile from org tenders
 * that no longer qualify. Keeps follows and other profile associations intact.
 */
const reconcileStaleProfileMatches = async (
  prisma: PrismaClient,
  input: {
    organizationId: string;
    profileId: string;
    activeTenderIds: Set<string>;
  },
): Promise<number> => {
  const candidates = await prisma.organizationTender.findMany({
    where: { organizationId: input.organizationId },
    select: {
      id: true,
      tenderId: true,
      watchProfileId: true,
      matchMeta: true,
      matchedKeywords: true,
      matchedCpvs: true,
    },
  });

  let removed = 0;
  for (const row of candidates) {
    if (input.activeTenderIds.has(row.tenderId)) continue;
    const meta = parseMatchMeta(row.matchMeta);
    const linked =
      row.watchProfileId === input.profileId ||
      Boolean(meta?.matchedProfiles.some((profile) => profile.id === input.profileId));
    if (!linked) continue;

    const nextMeta = removeProfileFromMatchMeta(meta, input.profileId);
    const top = nextMeta.matchedProfiles[0];
    const watchProfileId = await resolveExistingWatchProfileId(prisma, {
      organizationId: input.organizationId,
      candidateIds: [top?.id],
    });
    await prisma.organizationTender.update({
      where: { id: row.id },
      data: {
        matchMeta: nextMeta as unknown as Prisma.InputJsonValue,
        watchProfileId,
        score: top?.score ?? null,
        scoreReasons: (top?.reasons ?? []) as Prisma.InputJsonValue,
        ...(top
          ? {}
          : {
              matchedKeywords: [] as Prisma.InputJsonValue,
              matchedCpvs: [] as Prisma.InputJsonValue,
            }),
      },
    });
    removed += 1;
  }
  return removed;
};

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
  const dates = scanDateWindowForProfile(profile);
  const since = new Date(`${dates.dateFrom}T00:00:00.000Z`);
  const until = new Date(`${dates.dateTo}T23:59:59.999Z`);
  // Date window is publication/submission semantics — never firstSeenAt alone,
  // or recently ingested old acts would qualify outside the Καταχώριση range.
  const tenders = await prisma.tender.findMany({
    where: {
      recordType: { in: recordTypesForScan(criteria.recordTypes) },
      OR: [
        { submissionDate: { gte: since, lte: until } },
        {
          AND: [
            { submissionDate: null },
            { signedDate: { gte: since, lte: until } },
          ],
        },
      ],
    },
    orderBy: [{ submissionDate: "desc" }, { signedDate: "desc" }],
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
  const isInitialScan = !profile.initialScanCompletedAt;
  const emitPerMatchAttention = !isInitialScan;
  const matchedTenderIds = new Set<string>();
  const newMatchIds = new Set<string>();
  const matchSummaries: Array<{
    organizationTenderId: string;
    referenceNumber: string | null;
    tenderTitle: string | null;
    score: number;
  }> = [];
  const upstreamErrors: string[] = [];
  const previousMatchCount = profile.matchCount ?? 0;

  try {
    const seenAdam = await scanCanonicalTenders(
      prisma,
      profile,
      async (tenderId, match) => {
        matchedTenderIds.add(tenderId);
        const result = await linkOpportunityToProfile(prisma, {
          organizationId: profile.organizationId,
          profile,
          tenderId,
          match,
          emitAttention: emitPerMatchAttention,
        });
        if (result.created) newMatchIds.add(result.tenderId);
        matchSummaries.push({
          organizationTenderId: result.organizationTenderId,
          referenceNumber: result.referenceNumber,
          tenderTitle: result.tenderTitle,
          score: result.score,
        });
      },
    );

    let variantsAttempted = 0;
    if (kimdis) {
      for (const filters of buildScanFilterVariants(profile)) {
        variantsAttempted += 1;
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
            emitAttention: emitPerMatchAttention,
          });
          matchedTenderIds.add(result.tenderId);
          if (result.created) newMatchIds.add(result.tenderId);
          matchSummaries.push({
            organizationTenderId: result.organizationTenderId,
            referenceNumber: result.referenceNumber,
            tenderTitle: result.tenderTitle,
            score: result.score,
          });
        }
      }
      // Every upstream query failed. COMPLETED with zero matches would claim
      // "nothing matched" when we never saw the registry.
      if (variantsAttempted > 0 && upstreamErrors.length === variantsAttempted) {
        throw new Error(upstreamErrors[0] ?? "kimdis_scan_failed");
      }
    } else {
      upstreamErrors.push("kimdis_not_configured");
    }

    const now = new Date();
    const partial = upstreamErrors.length > 0;
    let reconciledStale = 0;
    // Never reconcile on partial/failed upstream — that would drop real matches.
    if (!partial) {
      reconciledStale = await reconcileStaleProfileMatches(prisma, {
        organizationId: profile.organizationId,
        profileId: profile.id,
        activeTenderIds: matchedTenderIds,
      });
    }

    if (isInitialScan && matchSummaries.length > 0) {
      const topMatches = [...matchSummaries]
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)
        .map((row) => ({
          referenceNumber: row.referenceNumber ?? "—",
          title: row.tenderTitle,
          score: row.score,
        }));
      await ensureOpportunityDigestAttention(prisma, {
        organizationId: profile.organizationId,
        organizationTenderId: matchSummaries[0]!.organizationTenderId,
        profileId: profile.id,
        profileName: profile.name,
        matchCount: matchedTenderIds.size,
        newCount: newMatchIds.size,
        scannedAt: now,
        topMatches,
      });
    }

    return prisma.watchProfile.update({
      where: { id: profileId },
      data: {
        scanState: "COMPLETED",
        lastScannedAt: now,
        initialScanCompletedAt: profile.initialScanCompletedAt ?? now,
        lastMatchAt: matchedTenderIds.size > 0 ? now : profile.lastMatchAt,
        matchCount: matchedTenderIds.size,
        customFilters: mergeCustomFilters(profile, {
          lastScanError: partial ? (upstreamErrors[0] ?? null) : null,
          lastScanPartial: partial,
          lastScanNewCount: newMatchIds.size,
          lastScanPreviousMatchCount: previousMatchCount,
          lastScanEvaluatedCount: matchedTenderIds.size,
          lastScanReconciledStale: reconciledStale,
          lastScanVariantCount: variantsAttempted,
        }),
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "watch_profile_scan_failed";
    const now = new Date();
    return prisma.watchProfile.update({
      where: { id: profileId },
      data: {
        scanState: "FAILED",
        lastScannedAt: now,
        ...(matchedTenderIds.size > 0
          ? { matchCount: matchedTenderIds.size, lastMatchAt: now }
          : {}),
        customFilters: mergeCustomFilters(profile, {
          lastScanError: message,
          lastScanPartial: upstreamErrors.length > 0,
          lastScanNewCount: newMatchIds.size,
          lastScanPreviousMatchCount: previousMatchCount,
          lastScanEvaluatedCount: matchedTenderIds.size,
        }),
      },
    });
  }
};

const inflightScans = new Map<string, Promise<WatchProfile>>();

/** Starts a scan without awaiting it. A second call for the same profile joins it. */
export const enqueueWatchProfileScan = (
  prisma: PrismaClient,
  kimdis: KimdisClient | undefined,
  profileId: string,
): Promise<WatchProfile> => {
  const existing = inflightScans.get(profileId);
  if (existing) return existing;
  const job = runWatchProfileScan(prisma, kimdis, profileId).finally(() => {
    if (inflightScans.get(profileId) === job) inflightScans.delete(profileId);
  });
  inflightScans.set(profileId, job);
  return job;
};

/** Used by tests so a database reset cannot race an in-flight scan. */
export const waitForWatchProfileScans = async (): Promise<void> => {
  while (inflightScans.size > 0) {
    await Promise.allSettled([...inflightScans.values()]);
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

export type WatchProfileDto = WatchProfile & {
  source: WatchProfileSource;
  scanError: string | null;
  scanPartial: boolean;
  scanNewCount: number | null;
  scanEvaluatedCount: number | null;
};

const readCustomFilters = (profile: WatchProfile): Record<string, unknown> =>
  typeof profile.customFilters === "object" && profile.customFilters
    ? (profile.customFilters as Record<string, unknown>)
    : {};

/** Scan diagnostics the Saved Searches card renders. Source never changes scoring. */
export const toWatchProfileDto = (profile: WatchProfile): WatchProfileDto => {
  const meta = readCustomFilters(profile);
  const source = String(meta.source ?? "MANUAL") as WatchProfileSource;
  return {
    ...profile,
    source: WATCH_PROFILE_SOURCES.includes(source) ? source : "MANUAL",
    scanError: typeof meta.lastScanError === "string" ? meta.lastScanError : null,
    scanPartial: meta.lastScanPartial === true,
    scanNewCount:
      typeof meta.lastScanNewCount === "number" ? meta.lastScanNewCount : null,
    scanEvaluatedCount:
      typeof meta.lastScanEvaluatedCount === "number"
        ? meta.lastScanEvaluatedCount
        : null,
  };
};

export const triggerWatchProfileScanForRoute = async (
  prisma: PrismaClient,
  kimdis: KimdisClient | undefined,
  input: {
    userId: string;
    organizationId: string | null;
    profileId: string;
  },
) => {
  const profile = await getWatchProfile(prisma, input);
  if (profile.enabled) {
    enqueueWatchProfileScan(prisma, kimdis, profile.id);
  }
  return prisma.watchProfile.findUniqueOrThrow({ where: { id: profile.id } });
};
