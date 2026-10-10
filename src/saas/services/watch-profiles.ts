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
import { normalizeRegionCodes } from "../geo/nuts.js";
import { SaasError, badRequest, conflict, forbidden, notFound } from "../errors.js";
import {
  assertCanActivateWatchProfile,
  getOrganizationEntitlements,
} from "./entitlements.js";
import {
  assertCanRunWatchProfileScan,
  consumeScanQuota,
} from "./scan-access.js";
import {
  normalizeDataSources,
  parseDataSources,
} from "./source-provenance.js";

/** Fields gated by Pro `advancedWatchProfileFilters`. */
const hasAdvancedWatchProfileFilters = (input: {
  authority?: string | null;
  contractType?: string | null;
  procedureType?: string | null;
  minBudget?: number | null;
  maxBudget?: number | null;
  notificationOverride?: string | null;
}): boolean =>
  Boolean(
    input.authority?.trim() ||
      input.contractType?.trim() ||
      input.procedureType?.trim() ||
      input.minBudget != null ||
      input.maxBudget != null ||
      input.notificationOverride === "IMMEDIATE",
  );

const assertAdvancedFiltersAllowed = async (
  prisma: PrismaClient,
  input: {
    userId: string;
    organizationId: string;
    authority?: string | null;
    contractType?: string | null;
    procedureType?: string | null;
    minBudget?: number | null;
    maxBudget?: number | null;
    notificationOverride?: string | null;
  },
) => {
  if (!hasAdvancedWatchProfileFilters(input)) return;
  const { entitlements } = await getOrganizationEntitlements(prisma, {
    userId: input.userId,
    organizationId: input.organizationId,
  });
  if (!entitlements.advancedWatchProfileFilters) {
    throw forbidden("advanced_watch_filters_requires_pro");
  }
};

const scanBlockCodeFromError = (error: unknown): string | null => {
  if (!(error instanceof SaasError) || error.status !== 403) return null;
  return error.message || error.code || "manual_scan_blocked";
};
import {
  attentionTitleFor,
  pruneAttentionEventsForOrg,
} from "./attention.js";
import { queueAttentionEmail } from "./notify.js";
import {
  kimdisItemFromTender,
  searchKimdis,
  type KimdisSearchFilters,
  type KimdisSearchItem,
} from "./kimdis-search.js";
import { upsertTenderFromKimdisItem } from "./upsert-tender.js";
import { normalizeActivities } from "./org-settings.js";
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
  type WatchProfileCriteria,
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
  regions?: string[];
  includeUnclassifiedRegion?: boolean;
  source?: WatchProfileSource;
  skipSimilarCheck?: boolean;
  /** Data registries to query on each scan. Default: kimdis only. */
  dataSources?: Array<"kimdis" | "ted" | "diavgeia">;
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
  regions: string[];
  includeUnclassifiedRegion: boolean;
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
    regions: normalizeRegionCodes(input.regions),
    includeUnclassifiedRegion: Boolean(input.includeUnclassifiedRegion),
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
    regions: [...criteria.regions].sort(),
    includeUnclassifiedRegion: criteria.includeUnclassifiedRegion,
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
    regions: asStringArray(profile.regions),
    includeUnclassifiedRegion: profile.includeUnclassifiedRegion,
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
 * Hard wall-clock budget for an active scan. After this the scan fails with
 * `scan_timeout` and the user retries. Orphan RUNNING (no live worker in this
 * process) is reclaimed within seconds — not minutes.
 *
 * Important: cooperative `assertScanBudget` alone is NOT enough — a single
 * hung/slow `fetchAllKimdisItems` never returns to the loop. We also race the
 * whole scan body against this deadline and flip a cancel flag so the loser
 * stops starting new KIMDIS pages / DB upserts.
 *
 * Override with SAAS_SCAN_HARD_TIMEOUT_MS (tests / emergency ops).
 */
const DEFAULT_SCAN_HARD_TIMEOUT_MS = 3 * 60 * 1000;
/** Orphan RUNNING (no live worker in this process) — reclaim quickly. */
const ORPHAN_RECLAIM_GRACE_MS = 8_000;

export const scanHardTimeoutMs = (): number => {
  const raw = Number(process.env.SAAS_SCAN_HARD_TIMEOUT_MS);
  if (Number.isFinite(raw) && raw > 0) return raw;
  return DEFAULT_SCAN_HARD_TIMEOUT_MS;
};

const inflightScans = new Map<string, Promise<WatchProfile>>();
/** Per-profile cancel bits so a timed-out race stops background work ASAP. */
const scanCancelFlags = new Map<string, { cancelled: boolean }>();

const assertScanBudget = (
  startedAtMs: number,
  cancel?: { cancelled: boolean },
): void => {
  if (cancel?.cancelled) throw new Error("scan_timeout");
  if (Date.now() - startedAtMs >= scanHardTimeoutMs()) {
    throw new Error("scan_timeout");
  }
};

const raceWithScanTimeout = async <T>(
  work: Promise<T>,
  startedAtMs: number,
  cancel: { cancelled: boolean },
): Promise<T> => {
  const remaining = scanHardTimeoutMs() - (Date.now() - startedAtMs);
  if (remaining <= 0) {
    cancel.cancelled = true;
    throw new Error("scan_timeout");
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          cancel.cancelled = true;
          reject(new Error("scan_timeout"));
        }, remaining);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

const scanStartedAtMs = (profile: WatchProfile): number => {
  const meta =
    typeof profile.customFilters === "object" && profile.customFilters
      ? (profile.customFilters as Record<string, unknown>)
      : {};
  const raw = meta.scanStartedAt;
  if (typeof raw === "string") {
    const ms = new Date(raw).getTime();
    if (!Number.isNaN(ms)) return ms;
  }
  return profile.updatedAt.getTime();
};

/** Persist FAILED only if this runner still owns the RUNNING slot. */
const failScanIfOwner = async (
  prisma: PrismaClient,
  input: {
    profileId: string;
    scanToken: string;
    error: string;
    matchCount?: number;
    lastMatchAt?: Date | null;
    patch?: Record<string, unknown>;
  },
): Promise<WatchProfile> => {
  const current = await prisma.watchProfile.findUnique({
    where: { id: input.profileId },
  });
  if (!current) throw notFound("watch_profile_not_found");
  const meta = readCustomFilters(current);
  if (
    current.scanState !== "RUNNING" ||
    meta.scanStartedAt !== input.scanToken
  ) {
    return current;
  }
  const now = new Date();
  return prisma.watchProfile.update({
    where: { id: input.profileId },
    data: {
      scanState: "FAILED",
      lastScannedAt: now,
      ...(input.matchCount != null && input.matchCount > 0
        ? { matchCount: input.matchCount, lastMatchAt: input.lastMatchAt ?? now }
        : {}),
      customFilters: mergeCustomFilters(current, {
        lastScanError: input.error,
        scanStartedAt: null,
        ...(input.patch ?? {}),
      }),
    },
  });
};

export const reclaimStaleWatchProfileScans = async (
  prisma: PrismaClient,
  organizationId?: string,
  options?: { forceAll?: boolean },
): Promise<number> => {
  const candidates = await prisma.watchProfile.findMany({
    where: {
      ...(organizationId ? { organizationId } : {}),
      scanState: "RUNNING",
    },
  });

  let reclaimed = 0;
  const now = Date.now();
  const hard = scanHardTimeoutMs();
  for (const profile of candidates) {
    const ageMs = now - scanStartedAtMs(profile);
    const inflight = inflightScans.has(profile.id);
    // forceAll = boot: every RUNNING row is orphan (empty inflight map).
    // Orphans: reclaim after a short grace (covers enqueue→RUNNING gap).
    // Live workers: hard timeout race should win first; reclaim as backstop.
    const shouldReclaim = options?.forceAll
      ? !inflight
      : inflight
        ? ageMs >= hard
        : ageMs >= ORPHAN_RECLAIM_GRACE_MS;
    if (!shouldReclaim) continue;
    scanCancelFlags.get(profile.id) &&
      (scanCancelFlags.get(profile.id)!.cancelled = true);
    await prisma.watchProfile.update({
      where: { id: profile.id },
      data: {
        scanState: "FAILED",
        customFilters: mergeCustomFilters(profile, {
          lastScanError: inflight ? "scan_timeout" : "scan_interrupted",
          scanStartedAt: null,
        }),
      },
    });
    reclaimed += 1;
  }
  return reclaimed;
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

  await assertAdvancedFiltersAllowed(prisma, {
    userId: input.userId,
    organizationId,
    authority: input.authority,
    contractType: input.contractType,
    procedureType: input.procedureType,
    minBudget: input.minBudget,
    maxBudget: input.maxBudget,
    notificationOverride: input.notificationOverride,
  });

  const data = profileDataFromInput(input);
  if (data.enabled) {
    await assertCanActivateWatchProfile(prisma, {
      userId: input.userId,
      organizationId,
    });
  }

  let scanBlock: string | null = null;
  if (data.enabled) {
    try {
      await assertCanRunWatchProfileScan(prisma, {
        userId: input.userId,
        organizationId,
        kind: "manual",
      });
    } catch (error) {
      scanBlock = scanBlockCodeFromError(error);
      if (!scanBlock) throw error;
    }
  }

  const dataSources = normalizeDataSources(input.dataSources);
  const profile = await prisma.watchProfile.create({
    data: {
      organizationId,
      ...data,
      customFilters: {
        source: input.source ?? "MANUAL",
        dataSources,
        ...(scanBlock ? { lastScanError: scanBlock } : {}),
      },
      scanState: scanBlock ? "FAILED" : data.scanState,
    },
  });

  const { trackProductEventSafe } = await import("../ops/product-events.js");
  trackProductEventSafe(prisma, {
    type: "watch_profile_created",
    userId: input.userId,
    organizationId,
    entityType: "watch_profile",
    entityId: profile.id,
    metadata: { name: profile.name, source: input.source ?? "MANUAL" },
  });

  // The route returns as soon as the profile is PENDING. Creation enqueues a
  // scan only when verification + plan quota allow it.
  if (!scanBlock && profile.enabled) {
    await consumeScanQuota(prisma, {
      organizationId,
      kind: "manual",
    });
    enqueueWatchProfileScan(prisma, kimdis, profile.id);
  }
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

  await assertAdvancedFiltersAllowed(prisma, {
    userId: input.userId,
    organizationId,
    authority: input.authority,
    contractType: input.contractType,
    procedureType: input.procedureType,
    minBudget: input.minBudget,
    maxBudget: input.maxBudget,
    notificationOverride: input.notificationOverride,
  });

  const data = profileDataFromInput(input);
  if (data.enabled) {
    await assertCanActivateWatchProfile(prisma, {
      userId: input.userId,
      organizationId,
      excludeProfileId: existing.id,
    });
  }
  const material = isMaterialCriteriaChange(existing, normalizeWatchProfileCriteria(input));

  let scanBlock: string | null = null;
  if (material && data.enabled) {
    try {
      await assertCanRunWatchProfileScan(prisma, {
        userId: input.userId,
        organizationId,
        kind: "manual",
      });
    } catch (error) {
      scanBlock = scanBlockCodeFromError(error);
      if (!scanBlock) throw error;
    }
  }

  const existingMeta = readCustomFilters(existing);
  const nextDataSources = normalizeDataSources(
    input.dataSources ??
      (Array.isArray(existingMeta.dataSources)
        ? (existingMeta.dataSources as string[])
        : ["kimdis"]),
  );
  const dataSourcesChanged =
    JSON.stringify(normalizeDataSources(existingMeta.dataSources as string[])) !==
    JSON.stringify(nextDataSources);
  const profile = await prisma.watchProfile.update({
    where: { id: existing.id },
    data: {
      ...data,
      scanState:
        material || dataSourcesChanged
          ? scanBlock
            ? "FAILED"
            : "PENDING"
          : existing.scanState,
      customFilters: {
        ...existingMeta,
        dataSources: nextDataSources,
        ...(scanBlock ? { lastScanError: scanBlock } : {}),
      },
    },
  });

  if ((material || dataSourcesChanged) && profile.enabled && !scanBlock) {
    await consumeScanQuota(prisma, {
      organizationId,
      kind: "manual",
    });
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
  if (input.enabled) {
    await assertCanActivateWatchProfile(prisma, {
      userId: input.userId,
      organizationId,
      excludeProfileId: existing.id,
    });
  }
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

const MAX_SCAN_PAGES = 8;

/**
 * KIMDIS answers 404 for a page past the end, which the HTTP client retries
 * with exponential backoff (~40s) before it is mapped to "no results". Stop on
 * `last` and on the reported `totalPages` so a scan never pays that cost.
 */
const fetchAllKimdisItems = async (
  kimdis: KimdisClient,
  filters: KimdisSearchFilters,
  startedAtMs: number,
  cancel?: { cancelled: boolean },
): Promise<KimdisSearchItem[]> => {
  const items: KimdisSearchItem[] = [];
  let page = 0;
  while (page < MAX_SCAN_PAGES) {
    assertScanBudget(startedAtMs, cancel);
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
  const existing = await prisma.organizationAttentionEvent.findUnique({
    where: {
      organizationId_dedupeKey: {
        organizationId: input.organizationId,
        dedupeKey,
      },
    },
  });
  if (existing) return existing;

  try {
    const event = await prisma.organizationAttentionEvent.create({
      data: {
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
    });
    await pruneAttentionEventsForOrg(prisma, input.organizationId);
    queueAttentionEmail(prisma, event.id);
    return event;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const raced = await prisma.organizationAttentionEvent.findUnique({
        where: {
          organizationId_dedupeKey: {
            organizationId: input.organizationId,
            dedupeKey,
          },
        },
      });
      if (raced) return raced;
    }
    throw error;
  }
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
      authority?: string | null;
      budgetWithoutVat?: number | null;
      recordType?: string | null;
      submissionDate?: string | null;
      finalSubmissionDate?: string | null;
    }>;
  },
) => {
  if (input.matchCount <= 0) return null;
  const dedupeKey = opportunityDigestDedupeKey(input.profileId, input.scannedAt);
  const type = "OPPORTUNITY_DIGEST" as AttentionEventType;
  const fresh = Math.max(0, input.newCount);
  const title =
    fresh > 0
      ? fresh === 1
        ? `1 νέα ευκαιρία από την αναζήτηση «${input.profileName}»`
        : `${fresh} νέες ευκαιρίες από την αναζήτηση «${input.profileName}»`
      : input.matchCount === 1
        ? `Καμία νέα · 1 ενεργή από «${input.profileName}»`
        : `Καμία νέα · ${input.matchCount} ενεργές από «${input.profileName}»`;
  const metadata = {
    profileId: input.profileId,
    profileName: input.profileName,
    matchCount: input.matchCount,
    newCount: input.newCount,
    // Keep enough rows for a DDA-style digest email (UI still shows a short list).
    topMatches: input.topMatches.slice(0, 25),
  };
  const existing = await prisma.organizationAttentionEvent.findUnique({
    where: {
      organizationId_dedupeKey: {
        organizationId: input.organizationId,
        dedupeKey,
      },
    },
  });
  if (existing) {
    return prisma.organizationAttentionEvent.update({
      where: { id: existing.id },
      data: { title, metadata },
    });
  }

  const event = await prisma.organizationAttentionEvent.create({
    data: {
      organizationId: input.organizationId,
      organizationTenderId: input.organizationTenderId,
      type,
      title,
      dedupeKey,
      metadata,
    },
  });
  await pruneAttentionEventsForOrg(prisma, input.organizationId);
  // Product email for opportunity digests is coalesced per org/hour in the
  // hourly wave (flushOpportunityEmailDigests). In-app event stays here.
  return event;
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
  authority: string | null;
  budgetWithoutVat: number | null;
  recordType: string | null;
  submissionDate: string | null;
  finalSubmissionDate: string | null;
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
    breakdown: input.match.breakdown,
  };

  const tender = await prisma.tender.findUnique({ where: { id: tenderId } });
  const referenceNumber = tender?.referenceNumber ?? null;
  const tenderTitle = tender?.title ?? null;
  const recordType = tender?.recordType ?? null;
  const authority = tender?.contractingAuthority ?? null;
  const budgetWithoutVat = tender?.budgetWithoutVat ?? null;
  const submissionDate = tender?.submissionDate?.toISOString() ?? null;
  const finalSubmissionDate = tender?.finalSubmissionDate?.toISOString() ?? null;

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
      authority,
      budgetWithoutVat,
      recordType,
      submissionDate,
      finalSubmissionDate,
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
      authority,
      budgetWithoutVat,
      recordType,
      submissionDate,
      finalSubmissionDate,
    };
  }

  const prevMeta = parseMatchMeta(existing.matchMeta);
  const mergedMeta = mergeMatchMeta(prevMeta, entry);
  // Drop deleted profile ids from matchMeta so later scans cannot FK-crash.
  const livingIds = new Set(
    (
      await prisma.watchProfile.findMany({
        where: {
          organizationId: input.organizationId,
          id: { in: mergedMeta.matchedProfiles.map((row) => row.id) },
        },
        select: { id: true },
      })
    ).map((row) => row.id),
  );
  livingIds.add(input.profile.id);
  const matchedProfiles = mergedMeta.matchedProfiles.filter((row) =>
    livingIds.has(row.id),
  );
  const matchMeta: OpportunityMatchMeta = {
    matchedProfiles,
    highestScore: matchedProfiles.reduce(
      (max, row) => Math.max(max, row.score),
      input.match.score,
    ),
  };
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
    authority,
    budgetWithoutVat,
    recordType,
    submissionDate,
    finalSubmissionDate,
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
  criteria: WatchProfileCriteria,
  onMatch: (tenderId: string, match: WatchMatchResult) => Promise<void>,
): Promise<Set<string>> => {
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

  // Dedup is handled by enqueueWatchProfileScan (inflight map). Never early-
  // return on RUNNING here: enqueue sets inflight before this async body
  // resumes after its first await, which would falsely skip takeover of a
  // stale RUNNING row left by a dead process.

  const scanStartedAt = new Date().toISOString();
  const scanStartedMs = Date.now();
  const cancel = { cancelled: false };
  scanCancelFlags.set(profileId, cancel);
  await prisma.watchProfile.update({
    where: { id: profileId },
    data: {
      scanState: "RUNNING",
      customFilters: mergeCustomFilters(profile, {
        scanStartedAt,
        lastScanError: null,
      }),
    },
  });

  const settingsRow = await prisma.organizationSettings.findUnique({
    where: { organizationId: profile.organizationId },
    select: { activities: true },
  });
  const companyActivities = normalizeActivities(settingsRow?.activities);
  const criteria = criteriaFromWatchProfile(profile, { companyActivities });
  const isInitialScan = !profile.initialScanCompletedAt;
  const emitPerMatchAttention = !isInitialScan;
  const matchedTenderIds = new Set<string>();
  const newMatchIds = new Set<string>();
  const matchSummaries: Array<{
    organizationTenderId: string;
    referenceNumber: string | null;
    tenderTitle: string | null;
    score: number;
    authority: string | null;
    budgetWithoutVat: number | null;
    recordType: string | null;
    submissionDate: string | null;
    finalSubmissionDate: string | null;
    tenderId: string;
  }> = [];
  const upstreamErrors: string[] = [];
  const previousMatchCount = profile.matchCount ?? 0;

  const runBody = async (): Promise<WatchProfile> => {
    assertScanBudget(scanStartedMs, cancel);
    const seenAdam = await scanCanonicalTenders(
      prisma,
      profile,
      criteria,
      async (tenderId, match) => {
        assertScanBudget(scanStartedMs, cancel);
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
          authority: result.authority,
          budgetWithoutVat: result.budgetWithoutVat,
          recordType: result.recordType,
          submissionDate: result.submissionDate,
          finalSubmissionDate: result.finalSubmissionDate,
          tenderId: result.tenderId,
        });
      },
    );

    const {
      dataSourcesForProfile,
      scanTedForWatchProfile,
      scanDiavgeiaForWatchProfile,
      upsertMatchedSourceItem,
    } = await import("./watch-scan-sources.js");
    const dataSources = dataSourcesForProfile(profile);
    let tedPages = 0;
    let diavgeiaPages = 0;
    let sourceLastFetchedAt: string | null = null;

    let variantsAttempted = 0;
    if (dataSources.includes("kimdis") && kimdis) {
      for (const filters of buildScanFilterVariants(profile)) {
        assertScanBudget(scanStartedMs, cancel);
        variantsAttempted += 1;
        let items: KimdisSearchItem[] = [];
        try {
          items = await fetchAllKimdisItems(
            kimdis,
            filters,
            scanStartedMs,
            cancel,
          );
        } catch (error) {
          if (error instanceof Error && error.message === "scan_timeout") {
            throw error;
          }
          upstreamErrors.push(
            error instanceof Error ? error.message : "kimdis_variant_failed",
          );
          continue;
        }
        for (const item of items) {
          assertScanBudget(scanStartedMs, cancel);
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
            authority: result.authority,
            budgetWithoutVat: result.budgetWithoutVat,
            recordType: result.recordType,
            submissionDate: result.submissionDate,
            finalSubmissionDate: result.finalSubmissionDate,
            tenderId: result.tenderId,
          });
        }
      }
      // Every upstream query failed. COMPLETED with zero matches would claim
      // "nothing matched" when we never saw the registry.
      if (variantsAttempted > 0 && upstreamErrors.length === variantsAttempted) {
        throw new Error(upstreamErrors[0] ?? "kimdis_scan_failed");
      }
    } else if (dataSources.includes("kimdis")) {
      upstreamErrors.push("kimdis_not_configured");
    }

    if (dataSources.includes("ted")) {
      const tedPhase = await scanTedForWatchProfile({
        profile,
        criteria,
        seenRefs: seenAdam,
        assertBudget: () => assertScanBudget(scanStartedMs, cancel),
      });
      tedPages = tedPhase.pagesFetched;
      if (tedPhase.lastFetchedAt) sourceLastFetchedAt = tedPhase.lastFetchedAt;
      for (const err of tedPhase.errors) upstreamErrors.push(err);
      for (const row of tedPhase.matches) {
        assertScanBudget(scanStartedMs, cancel);
        const tender = await upsertMatchedSourceItem(
          prisma,
          row.item,
          "ted",
        );
        const result = await linkOpportunityToProfile(prisma, {
          organizationId: profile.organizationId,
          profile,
          tenderId: tender.id,
          match: row.match,
          emitAttention: emitPerMatchAttention,
        });
        matchedTenderIds.add(result.tenderId);
        if (result.created) newMatchIds.add(result.tenderId);
        matchSummaries.push({
          organizationTenderId: result.organizationTenderId,
          referenceNumber: result.referenceNumber,
          tenderTitle: result.tenderTitle,
          score: result.score,
          authority: result.authority,
          budgetWithoutVat: result.budgetWithoutVat,
          recordType: result.recordType,
          submissionDate: result.submissionDate,
          finalSubmissionDate: result.finalSubmissionDate,
          tenderId: result.tenderId,
        });
      }
    }

    if (dataSources.includes("diavgeia")) {
      const diavgeiaPhase = await scanDiavgeiaForWatchProfile({
        profile,
        criteria,
        seenRefs: seenAdam,
        assertBudget: () => assertScanBudget(scanStartedMs, cancel),
      });
      diavgeiaPages = diavgeiaPhase.pagesFetched;
      if (diavgeiaPhase.lastFetchedAt) {
        sourceLastFetchedAt = diavgeiaPhase.lastFetchedAt;
      }
      for (const err of diavgeiaPhase.errors) upstreamErrors.push(err);
      for (const row of diavgeiaPhase.matches) {
        assertScanBudget(scanStartedMs, cancel);
        const tender = await upsertMatchedSourceItem(
          prisma,
          row.item,
          "diavgeia",
        );
        const result = await linkOpportunityToProfile(prisma, {
          organizationId: profile.organizationId,
          profile,
          tenderId: tender.id,
          match: row.match,
          emitAttention: emitPerMatchAttention,
        });
        matchedTenderIds.add(result.tenderId);
        if (result.created) newMatchIds.add(result.tenderId);
        matchSummaries.push({
          organizationTenderId: result.organizationTenderId,
          referenceNumber: result.referenceNumber,
          tenderTitle: result.tenderTitle,
          score: result.score,
          authority: result.authority,
          budgetWithoutVat: result.budgetWithoutVat,
          recordType: result.recordType,
          submissionDate: result.submissionDate,
          finalSubmissionDate: result.finalSubmissionDate,
          tenderId: result.tenderId,
        });
      }
    }

    const now = new Date();
    const partial = upstreamErrors.length > 0;
    let reconciledStale = 0;
    // Never reconcile on partial/failed upstream — that would drop real matches.
    if (!partial) {
      assertScanBudget(scanStartedMs, cancel);
      reconciledStale = await reconcileStaleProfileMatches(prisma, {
        organizationId: profile.organizationId,
        profileId: profile.id,
        activeTenderIds: matchedTenderIds,
      });
    }

    // DDA-style digest email once per profile per hour:
    // - New matches → highlight those (newCount > 0)
    // - No new matches but active ones remain → status summary with the same list
    //   so customers still get a heartbeat email at their digest hour
    // - Zero matches total → no email (nothing useful to summarize)
    if (matchSummaries.length > 0) {
      const newCount = isInitialScan
        ? matchSummaries.length
        : newMatchIds.size;
      const digestSource =
        newCount > 0 && !isInitialScan
          ? matchSummaries.filter((row) => newMatchIds.has(row.tenderId))
          : matchSummaries;
      const topMatches = [...digestSource]
        .sort((a, b) => b.score - a.score)
        .slice(0, 25)
        .map((row) => ({
          referenceNumber: row.referenceNumber ?? "—",
          title: row.tenderTitle,
          score: row.score,
          authority: row.authority,
          budgetWithoutVat: row.budgetWithoutVat,
          recordType: row.recordType,
          submissionDate: row.submissionDate,
          finalSubmissionDate: row.finalSubmissionDate,
        }));
      await ensureOpportunityDigestAttention(prisma, {
        organizationId: profile.organizationId,
        organizationTenderId: digestSource[0]!.organizationTenderId,
        profileId: profile.id,
        profileName: profile.name,
        matchCount: matchedTenderIds.size,
        newCount,
        scannedAt: now,
        topMatches,
      });
    }

    // Timed-out/reclaimed runners may have already left RUNNING — do not
    // resurrect a FAILED row as COMPLETED from a late background fetch.
    const latest = await prisma.watchProfile.findUnique({
      where: { id: profileId },
    });
    if (!latest) throw notFound("watch_profile_not_found");
    const latestMeta = readCustomFilters(latest);
    if (
      latest.scanState !== "RUNNING" ||
      latestMeta.scanStartedAt !== scanStartedAt
    ) {
      return latest;
    }

    return prisma.watchProfile.update({
      where: { id: profileId },
      data: {
        scanState: "COMPLETED",
        lastScannedAt: now,
        initialScanCompletedAt: profile.initialScanCompletedAt ?? now,
        lastMatchAt: matchedTenderIds.size > 0 ? now : profile.lastMatchAt,
        matchCount: matchedTenderIds.size,
        customFilters: mergeCustomFilters(latest, {
          lastScanError: partial ? (upstreamErrors[0] ?? null) : null,
          lastScanPartial: partial,
          lastScanNewCount: newMatchIds.size,
          lastScanPreviousMatchCount: previousMatchCount,
          lastScanEvaluatedCount: matchedTenderIds.size,
          lastScanReconciledStale: reconciledStale,
          lastScanVariantCount: variantsAttempted,
          lastScanTedPages: tedPages,
          lastScanDiavgeiaPages: diavgeiaPages,
          lastSourceFetchedAt: sourceLastFetchedAt,
          scanStartedAt: null,
        }),
      },
    });
  };

  try {
    return await raceWithScanTimeout(runBody(), scanStartedMs, cancel);
  } catch (error) {
    cancel.cancelled = true;
    const message =
      error instanceof Error ? error.message : "watch_profile_scan_failed";
    return failScanIfOwner(prisma, {
      profileId,
      scanToken: scanStartedAt,
      error: message,
      matchCount: matchedTenderIds.size,
      lastMatchAt: matchedTenderIds.size > 0 ? new Date() : null,
      patch: {
        lastScanPartial: upstreamErrors.length > 0,
        lastScanNewCount: newMatchIds.size,
        lastScanPreviousMatchCount: previousMatchCount,
        lastScanEvaluatedCount: matchedTenderIds.size,
      },
    });
  } finally {
    if (scanCancelFlags.get(profileId) === cancel) {
      scanCancelFlags.delete(profileId);
    }
  }
};

/** Starts a scan without awaiting it. A second call for the same profile joins it. */
export const enqueueWatchProfileScan = (
  prisma: PrismaClient,
  kimdis: KimdisClient | undefined,
  profileId: string,
  options?: { force?: boolean },
): Promise<WatchProfile> => {
  if (!options?.force) {
    const existing = inflightScans.get(profileId);
    if (existing) return existing;
  } else {
    // Drop the join handle so a new owner token can start. The old promise may
    // still finish in the background; ownership guards discard its writes.
    inflightScans.delete(profileId);
  }
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
  dataSources: Array<"kimdis" | "ted" | "diavgeia">;
  lastSourceFetchedAt: string | null;
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
    dataSources: parseDataSources(meta.dataSources),
    lastSourceFetchedAt:
      typeof meta.lastSourceFetchedAt === "string"
        ? meta.lastSourceFetchedAt
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
    force?: boolean;
  },
) => {
  const profile = await getWatchProfile(prisma, input);
  if (!profile.enabled) {
    return profile;
  }

  const ageMs = Date.now() - scanStartedAtMs(profile);
  const stuckPastBudget =
    profile.scanState === "RUNNING" && ageMs >= scanHardTimeoutMs();
  const force = Boolean(input.force || stuckPastBudget);

  // Live short-running scan: join without burning another quota unit.
  if (!force && inflightScans.has(profile.id)) {
    return profile;
  }

  await assertCanRunWatchProfileScan(prisma, {
    userId: input.userId,
    organizationId: profile.organizationId,
    kind: "manual",
  });
  await consumeScanQuota(prisma, {
    organizationId: profile.organizationId,
    kind: "manual",
  });
  enqueueWatchProfileScan(prisma, kimdis, profile.id, { force });
  return prisma.watchProfile.findUniqueOrThrow({ where: { id: profile.id } });
};
