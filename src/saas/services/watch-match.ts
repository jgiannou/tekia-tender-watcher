import type { KimdisSearchItem } from "./kimdis-search.js";
import type { RecordType } from "../../kimdis/types.js";
import {
  resolveContractTypeCode,
  resolveProcedureTypeCode,
} from "./kimdis-search.js";

export type MatchingMode = "STRICT" | "BALANCED" | "BROAD";

export type WatchProfileCriteria = {
  keywords: string[];
  negativeKeywords: string[];
  cpvs: string[];
  minBudget: number | null;
  maxBudget: number | null;
  matchingMode: string;
  scoreThreshold: number;
  recordTypes: string[];
  authority: string | null;
  contractType: string | null;
  procedureType: string | null;
};

export type MatchProfileEntry = {
  id: string;
  name: string;
  score: number;
  reasons: string[];
};

export type OpportunityMatchMeta = {
  matchedProfiles: MatchProfileEntry[];
  highestScore: number;
};

export type WatchMatchResult = {
  score: number;
  reasons: string[];
  matchedKeywords: string[];
  matchedCpvs: string[];
  qualifies: boolean;
  rejected: boolean;
};

const MODE_THRESHOLDS: Record<MatchingMode, number> = {
  STRICT: 70,
  BALANCED: 45,
  BROAD: 30,
};

export const effectiveScoreThreshold = (criteria: WatchProfileCriteria): number => {
  const mode = (criteria.matchingMode?.toUpperCase() ?? "BALANCED") as MatchingMode;
  if (mode in MODE_THRESHOLDS) return MODE_THRESHOLDS[mode];
  return criteria.scoreThreshold ?? MODE_THRESHOLDS.BALANCED;
};

const normalize = (value: string): string =>
  value.trim().toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");

const cpvPrefix = (cpv: string): string => cpv.replace(/\D/g, "").slice(0, 8);

const cpvMatches = (profileCpv: string, tenderCpvs: string[]): boolean => {
  const prefix = cpvPrefix(profileCpv);
  if (!prefix) return false;
  return tenderCpvs.some((t) => {
    const tp = cpvPrefix(t);
    return tp.startsWith(prefix) || prefix.startsWith(tp.slice(0, prefix.length));
  });
};

export const scoreKimdisItemAgainstProfile = (
  criteria: WatchProfileCriteria,
  item: KimdisSearchItem,
  profileLabel?: { id: string; name: string },
): WatchMatchResult => {
  const reasons: string[] = [];
  const matchedKeywords: string[] = [];
  const matchedCpvs: string[] = [];
  let score = 0;

  const recordTypes = criteria.recordTypes.length
    ? criteria.recordTypes
    : ["REQ", "PROC"];
  if (!recordTypes.includes(item.recordType)) {
    return {
      score: 0,
      reasons: [],
      matchedKeywords: [],
      matchedCpvs: [],
      qualifies: false,
      rejected: true,
    };
  }

  const haystack = normalize(`${item.title} ${item.contractingAuthority}`);

  for (const neg of criteria.negativeKeywords) {
    const needle = normalize(neg);
    if (!needle) continue;
    if (haystack.includes(needle)) {
      return {
        score: 0,
        reasons: [`Αποκλείστηκε: αρνητική λέξη «${neg.trim()}»`],
        matchedKeywords: [],
        matchedCpvs: [],
        qualifies: false,
        rejected: true,
      };
    }
  }

  if (criteria.authority?.trim()) {
    const authNeedle = normalize(criteria.authority);
    const authHay = normalize(item.contractingAuthority);
    if (!authHay.includes(authNeedle)) {
      return {
        score: 0,
        reasons: [],
        matchedKeywords: [],
        matchedCpvs: [],
        qualifies: false,
        rejected: true,
      };
    }
    score += 10;
    reasons.push(`Αναθέτουσα: ${criteria.authority.trim()}`);
  }

  if (criteria.contractType?.trim()) {
    const code = resolveContractTypeCode(criteria.contractType);
    const label = item.contractTypeLabel?.trim() ?? "";
    const labelCode = resolveContractTypeCode(label);
    if (code && labelCode && code !== labelCode) {
      return {
        score: 0,
        reasons: [],
        matchedKeywords: [],
        matchedCpvs: [],
        qualifies: false,
        rejected: true,
      };
    }
    if (code || criteria.contractType.trim()) {
      score += 8;
      reasons.push(`Τύπος σύμβασης: ${item.contractTypeLabel ?? criteria.contractType}`);
    }
  }

  if (criteria.procedureType?.trim() && item.recordType === "PROC") {
    const code = resolveProcedureTypeCode(criteria.procedureType);
    const procLabel = item.procedureType?.trim() ?? "";
    const procCode = resolveProcedureTypeCode(procLabel);
    if (code && procCode && code !== procCode) {
      return {
        score: 0,
        reasons: [],
        matchedKeywords: [],
        matchedCpvs: [],
        qualifies: false,
        rejected: true,
      };
    }
    if (item.procedureType) {
      score += 8;
      reasons.push(`Διαδικασία: ${item.procedureType}`);
    }
  }

  const budget = item.budgetWithoutVat ?? item.budgetWithVat;
  if (criteria.minBudget != null && budget != null && budget < criteria.minBudget) {
    return {
      score: 0,
      reasons: [],
      matchedKeywords: [],
      matchedCpvs: [],
      qualifies: false,
      rejected: true,
    };
  }
  if (criteria.maxBudget != null && budget != null && budget > criteria.maxBudget) {
    return {
      score: 0,
      reasons: [],
      matchedKeywords: [],
      matchedCpvs: [],
      qualifies: false,
      rejected: true,
    };
  }
  if (budget != null && (criteria.minBudget != null || criteria.maxBudget != null)) {
    score += 5;
    reasons.push("Προϋπολογισμός εντός ορίων");
  }

  // A single strong signal (title keyword or CPV) must be enough to qualify in
  // BALANCED mode; extra signals add less so scores stay comparable.
  const titleNorm = normalize(item.title);
  for (const kw of criteria.keywords) {
    const needle = normalize(kw);
    if (!needle) continue;
    const first = matchedKeywords.length === 0;
    if (titleNorm.includes(needle)) {
      matchedKeywords.push(kw.trim());
      score += first ? 45 : 12;
      reasons.push(`λέξη-κλειδί «${kw.trim()}» στον τίτλο`);
    } else if (haystack.includes(needle)) {
      matchedKeywords.push(kw.trim());
      score += first ? 30 : 8;
      reasons.push(`λέξη-κλειδί «${kw.trim()}» στο κείμενο`);
    }
  }

  for (const cpv of criteria.cpvs) {
    if (cpvMatches(cpv, item.cpvs)) {
      const first = matchedCpvs.length === 0;
      matchedCpvs.push(cpv.trim());
      score += first ? 50 : 12;
      reasons.push(`CPV ${cpv.trim()}`);
    }
  }

  score = Math.min(100, score);

  if (criteria.keywords.length === 0 && criteria.cpvs.length === 0) {
    return {
      score: 0,
      reasons: [],
      matchedKeywords: [],
      matchedCpvs: [],
      qualifies: false,
      rejected: true,
    };
  }

  const threshold = effectiveScoreThreshold(criteria);
  const qualifies = score >= threshold && (matchedKeywords.length > 0 || matchedCpvs.length > 0);

  if (profileLabel && qualifies && reasons.length === 0) {
    reasons.push(`Προφίλ «${profileLabel.name}»`);
  }

  return {
    score,
    reasons,
    matchedKeywords,
    matchedCpvs,
    qualifies,
    rejected: false,
  };
};

export const criteriaFromWatchProfile = (profile: {
  keywords: unknown;
  negativeKeywords: unknown;
  cpvs: unknown;
  minBudget: number | null;
  maxBudget: number | null;
  matchingMode: string;
  scoreThreshold: number;
  recordTypes: unknown;
  authority: string | null;
  contractType: string | null;
  procedureType: string | null;
}): WatchProfileCriteria => {
  const asStrings = (value: unknown): string[] =>
    Array.isArray(value)
      ? value.map((v) => String(v).trim()).filter(Boolean)
      : [];

  const recordTypes = asStrings(profile.recordTypes);
  return {
    keywords: asStrings(profile.keywords),
    negativeKeywords: asStrings(profile.negativeKeywords),
    cpvs: asStrings(profile.cpvs),
    minBudget: profile.minBudget,
    maxBudget: profile.maxBudget,
    matchingMode: profile.matchingMode,
    scoreThreshold: profile.scoreThreshold,
    recordTypes: recordTypes.length ? recordTypes : ["REQ", "PROC"],
    authority: profile.authority,
    contractType: profile.contractType,
    procedureType: profile.procedureType,
  };
};

export const mergeMatchMeta = (
  existing: OpportunityMatchMeta | null | undefined,
  entry: MatchProfileEntry,
): OpportunityMatchMeta => {
  const prev = existing?.matchedProfiles ?? [];
  const without = prev.filter((p) => p.id !== entry.id);
  const matchedProfiles = [...without, entry].sort((a, b) => b.score - a.score);
  const highestScore = Math.max(
    existing?.highestScore ?? 0,
    entry.score,
    ...matchedProfiles.map((p) => p.score),
  );
  return { matchedProfiles, highestScore };
};

/** Drop a profile association after a successful full rescan no longer qualifies it. */
export const removeProfileFromMatchMeta = (
  existing: OpportunityMatchMeta | null | undefined,
  profileId: string,
): OpportunityMatchMeta => {
  const matchedProfiles = (existing?.matchedProfiles ?? []).filter(
    (profile) => profile.id !== profileId,
  );
  const highestScore = matchedProfiles.reduce(
    (max, profile) => Math.max(max, profile.score),
    0,
  );
  return { matchedProfiles, highestScore };
};

export const parseMatchMeta = (value: unknown): OpportunityMatchMeta | null => {
  if (!value || typeof value !== "object") return null;
  const raw = value as OpportunityMatchMeta;
  if (!Array.isArray(raw.matchedProfiles)) return null;
  return raw;
};

export const recordTypesForScan = (recordTypes: string[]): RecordType[] => {
  const allowed: RecordType[] = [];
  for (const rt of recordTypes) {
    if (rt === "REQ" || rt === "PROC") allowed.push(rt);
  }
  return allowed.length ? allowed : ["REQ", "PROC"];
};
