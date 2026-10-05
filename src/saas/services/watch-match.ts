import type { KimdisSearchItem } from "./kimdis-search.js";
import type { RecordType } from "../../kimdis/types.js";
import {
  resolveContractTypeCode,
  resolveProcedureTypeCode,
} from "./kimdis-search.js";
import { softenGreekInflection } from "../../filters/web-relevance.js";

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
  /** True when title/procedure signals a directed invite (not open competition). */
  targetedInvitation: boolean;
};

/** Recalled slightly so user keyword searches surface more real opportunities. */
const MODE_THRESHOLDS: Record<MatchingMode, number> = {
  STRICT: 70,
  BALANCED: 35,
  BROAD: 25,
};

/** Points — calibrated so a single title hit is ~mid band, not 100%. */
const POINTS = {
  titleFirstCluster: 48,
  bodyFirstCluster: 35,
  titleExtraCluster: 10,
  bodyExtraCluster: 6,
  maxExtraClusters: 2,
  cpvFirst: 38,
  cpvExtra: 8,
  authority: 8,
  contractType: 5,
  procedureType: 5,
  budgetInRange: 4,
  /** Directed / closed invitations are not actionable for an uninvited firm. */
  targetedPenalty: 55,
  targetedScoreCap: 22,
} as const;

/** Procedure codes that usually mean invited/closed — not open competition. */
const TARGETED_PROCEDURE_CODES = new Set(["2", "6", "12"]);

/**
 * Title/description patterns that indicate a directed invitation to submit an
 * offer (often to a named/shortlist supplier), not an open tender.
 * Patterns run on matchNorm (accent-stripped + inflection-softened) text.
 * Deliberately excludes vague "Πρόσκληση για παροχή υπηρεσιών…" alone.
 */
const STRONG_TARGETED_TITLE_PATTERNS: readonly RegExp[] = [
  /προσκληση\s+καταθεση\s+προσφορα/,
  /προσκληση\s+υποβολη\s+(οικ\.?\s*)?προσφορα/,
  /προσκληση\s+υποβολη\s+οικονομικη\s+προσφορα/,
  /προσκληση\s+για\s+καταθεση\s+προσφορα/,
  /καλειται\s+(η\s+)?εταιρεια/,
  /καλειται\s+ο\s+οικονομικος\s+φορεας/,
  /στους\s+(κατωθι|ακολουθους)\s+οικονομικους\s+φορεις/,
  /μονο\s+(απο|στους)\s+προσκεκλημενους/,
  /δεν\s+(λαμβανονται|γινονται)\s+.{0,60}?δεν\s+προσκληθ/,
];

export const effectiveScoreThreshold = (criteria: WatchProfileCriteria): number => {
  const mode = (criteria.matchingMode?.toUpperCase() ?? "BALANCED") as MatchingMode;
  if (mode in MODE_THRESHOLDS) return MODE_THRESHOLDS[mode];
  return criteria.scoreThreshold ?? MODE_THRESHOLDS.BALANCED;
};

const normalize = (value: string): string =>
  value.trim().toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");

/** Match-time normalize + Greek inflection softener (+ genitive -ου). */
const matchNorm = (value: string): string =>
  softenGreekInflection(normalize(value)).replace(
    /(^|[^\p{L}])([\p{L}]+?)ου(?=[^\p{L}]|$)/gu,
    "$1$2ο",
  );

/**
 * Synonym clusters for SaaS keyword expansion (match-only; does not rewrite profiles).
 * Any member expands to the full cluster.
 */
const KEYWORD_SYNONYM_CLUSTERS: readonly (readonly string[])[] = [
  [
    "ιστοσελίδα",
    "ιστότοπος",
    "ιστοτόπος",
    "ιστοχώρος",
    "δικτυακός τόπος",
    "website",
    "web site",
    "web",
  ],
  [
    "φιλοξενία",
    "φιλοξενια",
    "hosting",
    "web hosting",
  ],
  [
    "cms",
    "wordpress",
    "joomla",
    "drupal",
  ],
  [
    "διαδικτυακή πύλη",
    "ψηφιακή πλατφόρμα",
    "πλατφόρμα",
    "portal",
    "platform",
  ],
  [
    "web εφαρμογή",
    "διαδικτυακή εφαρμογή",
    "εφαρμογή web",
    "web application",
  ],
];

const synonymLookup = new Map<string, string[]>();
const clusterIdByTerm = new Map<string, string>();

for (const cluster of KEYWORD_SYNONYM_CLUSTERS) {
  const expanded = cluster.map((term) => matchNorm(term)).filter(Boolean);
  if (expanded.length === 0) continue;
  const clusterId = [...expanded].sort()[0]!;
  for (const term of expanded) {
    clusterIdByTerm.set(term, clusterId);
    const prev = synonymLookup.get(term) ?? [];
    synonymLookup.set(term, [...new Set([...prev, ...expanded])]);
  }
}

/** Stable id so "ιστοσελίδα" + "website" count as one topical hit. */
export const keywordClusterId = (keyword: string): string => {
  const base = matchNorm(keyword);
  if (!base) return "";
  return clusterIdByTerm.get(base) ?? base;
};

/** Expand a user keyword to itself + known synonyms (normalized for matching). */
export const expandKeywordNeedles = (keyword: string): string[] => {
  const base = matchNorm(keyword);
  if (!base) return [];
  const extras = synonymLookup.get(base) ?? [];
  return [...new Set([base, ...extras])];
};

const textIncludesAny = (haystack: string, needles: string[]): boolean =>
  needles.some((needle) => needle.length > 0 && haystack.includes(needle));

const cpvPrefix = (cpv: string): string => cpv.replace(/\D/g, "").slice(0, 8);

const cpvMatches = (profileCpv: string, tenderCpvs: string[]): boolean => {
  const prefix = cpvPrefix(profileCpv);
  if (!prefix) return false;
  return tenderCpvs.some((t) => {
    const tp = cpvPrefix(t);
    return tp.startsWith(prefix) || prefix.startsWith(tp.slice(0, prefix.length));
  });
};

export type TargetedInvitationSignal = {
  targeted: boolean;
  reason: string | null;
};

/**
 * Heuristic (no PDF): directed invite / closed procedure → firm cannot bid.
 */
export const detectTargetedInvitation = (
  item: Pick<KimdisSearchItem, "title" | "description" | "procedureType">,
): TargetedInvitationSignal => {
  const hay = matchNorm(`${item.title} ${item.description ?? ""}`);
  for (const pattern of STRONG_TARGETED_TITLE_PATTERNS) {
    if (pattern.test(hay)) {
      return {
        targeted: true,
        reason:
          "Φαίνεται πρόσκληση σε συγκεκριμένους φορείς (όχι ανοιχτός διαγωνισμός)",
      };
    }
  }

  const procCode =
    resolveProcedureTypeCode(item.procedureType ?? undefined) ??
    item.procedureType?.trim() ??
    "";
  if (TARGETED_PROCEDURE_CODES.has(procCode)) {
    const label = item.procedureType?.trim() || procCode;
    return {
      targeted: true,
      reason: `Κλειστή / απευθείας διαδικασία («${label}») — δεν είναι ανοιχτή συμμετοχή`,
    };
  }

  return { targeted: false, reason: null };
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

  const empty = (
    overrides: Partial<WatchMatchResult> = {},
  ): WatchMatchResult => ({
    score: 0,
    reasons: [],
    matchedKeywords: [],
    matchedCpvs: [],
    qualifies: false,
    rejected: true,
    targetedInvitation: false,
    ...overrides,
  });

  const recordTypes = criteria.recordTypes.length
    ? criteria.recordTypes
    : ["REQ", "PROC"];
  if (!recordTypes.includes(item.recordType)) {
    return empty();
  }

  const description = item.description?.trim() ?? "";
  const haystackRaw = `${item.title} ${item.contractingAuthority} ${description}`;
  const haystack = matchNorm(haystackRaw);
  const titleNorm = matchNorm(item.title);

  for (const neg of criteria.negativeKeywords) {
    const needles = expandKeywordNeedles(neg);
    if (needles.length === 0) continue;
    if (textIncludesAny(haystack, needles)) {
      return empty({
        reasons: [`Αποκλείστηκε: αρνητική λέξη «${neg.trim()}»`],
      });
    }
  }

  if (criteria.authority?.trim()) {
    const authNeedle = matchNorm(criteria.authority);
    const authHay = matchNorm(item.contractingAuthority);
    if (!authHay.includes(authNeedle)) {
      return empty();
    }
    score += POINTS.authority;
    reasons.push(`Αναθέτουσα: ${criteria.authority.trim()}`);
  }

  if (criteria.contractType?.trim()) {
    const code = resolveContractTypeCode(criteria.contractType);
    const label = item.contractTypeLabel?.trim() ?? "";
    const labelCode = resolveContractTypeCode(label);
    if (code && labelCode && code !== labelCode) {
      return empty();
    }
    if (code || criteria.contractType.trim()) {
      score += POINTS.contractType;
      reasons.push(`Τύπος σύμβασης: ${item.contractTypeLabel ?? criteria.contractType}`);
    }
  }

  if (criteria.procedureType?.trim() && item.recordType === "PROC") {
    const code = resolveProcedureTypeCode(criteria.procedureType);
    const procLabel = item.procedureType?.trim() ?? "";
    const procCode = resolveProcedureTypeCode(procLabel);
    if (code && procCode && code !== procCode) {
      return empty();
    }
    if (item.procedureType) {
      score += POINTS.procedureType;
      reasons.push(`Διαδικασία: ${item.procedureType}`);
    }
  }

  const budget = item.budgetWithoutVat ?? item.budgetWithVat;
  if (criteria.minBudget != null && budget != null && budget < criteria.minBudget) {
    return empty();
  }
  if (criteria.maxBudget != null && budget != null && budget > criteria.maxBudget) {
    return empty();
  }
  if (budget != null && (criteria.minBudget != null || criteria.maxBudget != null)) {
    score += POINTS.budgetInRange;
    reasons.push("Προϋπολογισμός εντός ορίων");
  }

  // One score per synonym cluster — profile ["ιστοσελίδα","website"] must not
  // stack to 100% on a single topical hit.
  const scoredClusters = new Set<string>();
  let extraClusters = 0;

  for (const kw of criteria.keywords) {
    const needles = expandKeywordNeedles(kw);
    if (needles.length === 0) continue;
    const clusterId = keywordClusterId(kw);
    if (!clusterId || scoredClusters.has(clusterId)) continue;

    const inTitle = textIncludesAny(titleNorm, needles);
    const inBody = !inTitle && textIncludesAny(haystack, needles);
    if (!inTitle && !inBody) continue;

    scoredClusters.add(clusterId);
    matchedKeywords.push(kw.trim());
    const isFirst = scoredClusters.size === 1;

    if (isFirst) {
      score += inTitle ? POINTS.titleFirstCluster : POINTS.bodyFirstCluster;
      reasons.push(
        inTitle
          ? `λέξη-κλειδί «${kw.trim()}» στον τίτλο`
          : `λέξη-κλειδί «${kw.trim()}» στο κείμενο`,
      );
    } else if (extraClusters < POINTS.maxExtraClusters) {
      extraClusters += 1;
      score += inTitle ? POINTS.titleExtraCluster : POINTS.bodyExtraCluster;
      reasons.push(
        inTitle
          ? `επιπλέον θέμα «${kw.trim()}» στον τίτλο`
          : `επιπλέον θέμα «${kw.trim()}» στο κείμενο`,
      );
    }
  }

  for (const cpv of criteria.cpvs) {
    if (!cpvMatches(cpv, item.cpvs)) continue;
    const first = matchedCpvs.length === 0;
    matchedCpvs.push(cpv.trim());
    score += first ? POINTS.cpvFirst : POINTS.cpvExtra;
    reasons.push(`CPV ${cpv.trim()}`);
  }

  const targeted = detectTargetedInvitation(item);
  if (targeted.targeted) {
    score -= POINTS.targetedPenalty;
    if (targeted.reason) reasons.push(targeted.reason);
    score = Math.min(score, POINTS.targetedScoreCap);
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  if (criteria.keywords.length === 0 && criteria.cpvs.length === 0) {
    return empty({ targetedInvitation: targeted.targeted });
  }

  // Directed invites: still surface at a low score only in BROAD; otherwise drop.
  if (targeted.targeted) {
    const mode = (criteria.matchingMode?.toUpperCase() ?? "BALANCED") as MatchingMode;
    if (mode !== "BROAD") {
      return empty({
        score,
        reasons,
        matchedKeywords,
        matchedCpvs,
        qualifies: false,
        rejected: true,
        targetedInvitation: true,
      });
    }
  }

  const threshold = effectiveScoreThreshold(criteria);
  const qualifies =
    score >= threshold && (matchedKeywords.length > 0 || matchedCpvs.length > 0);

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
    targetedInvitation: targeted.targeted,
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
