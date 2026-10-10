import { evaluateRegionGate } from "../geo/nuts.js";
import type { KimdisSearchItem } from "./kimdis-search.js";
import type { RecordType } from "../../kimdis/types.js";
import {
  resolveContractTypeCode,
  resolveProcedureTypeCode,
} from "./kimdis-search.js";
import { softenGreekInflection } from "../../filters/web-relevance.js";
import { suggestWatchInterestsFromKads } from "../recommendations/kad-to-watch.js";

export type MatchingMode = "STRICT" | "BALANCED" | "BROAD";

export type CompanyActivityHint = {
  code: string;
  description?: string;
};

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
  /** Greek NUTS 2 codes. Empty = all of Greece. */
  regions?: string[];
  includeUnclassifiedRegion?: boolean;
  /** Org ΚΑΔ / activities — soft company-fit boost, not a hard filter. */
  companyActivities?: CompanyActivityHint[];
};

export type MatchScoreBreakdown = {
  keywords: number;
  cpvs: number;
  company: number;
  filters: number;
  penalties: number;
  signals: string[];
  capped: boolean;
};

export type MatchProfileEntry = {
  id: string;
  name: string;
  score: number;
  reasons: string[];
  breakdown?: MatchScoreBreakdown;
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
  breakdown: MatchScoreBreakdown;
};

/** Recalled slightly so user keyword searches surface more real opportunities. */
const MODE_THRESHOLDS: Record<MatchingMode, number> = {
  STRICT: 70,
  BALANCED: 35,
  BROAD: 25,
};

/**
 * Points — calibrated for search intent, not "company bid fit".
 *
 * If the user searches only for «ιστοσελίδα» and it hits the title, that IS a
 * strong match for their query (~48% keyword component). Extra CPV / company-ΚΑΔ
 * / stage / budget signals boost further for ranking among good hits — they must
 * not punish keyword-only profiles that already surface the right opportunities.
 *
 * Selected Slack TEKIA scorer ideas (early REQ, mid-range budget) apply as soft
 * boosts only. No hard web-relevance gate: SaaS clients are not all web shops.
 */
const POINTS = {
  titleFirstCluster: 48,
  bodyFirstCluster: 35,
  titleExtraCluster: 10,
  bodyExtraCluster: 6,
  maxExtraClusters: 2,
  cpvFirst: 38,
  cpvExtra: 8,
  /** Soft boost when org ΚΑΔ suggests a CPV that appears on the tender. */
  companyKadCpv: 14,
  companyKadKeywordTitle: 10,
  companyKadKeywordBody: 6,
  authority: 8,
  contractType: 5,
  procedureType: 5,
  budgetInRange: 4,
  /**
   * Slack-style: budget in the middle half of the profile's own min–max range
   * (not TEKIA's absolute €3k–€20k sweet spot — that is industry-specific).
   */
  budgetMidRange: 6,
  /** Slack-style early-stage: REQ is usually more actionable than PROC. */
  earlyReq: 8,
  /** Slack-style early REQ + title keyword (without TEKIA web-only gate). */
  earlyReqTitleKeyword: 8,
  /**
   * Title describes a buy (works, supplies, services, studies) rather than
   * only naming the topic. Sector-neutral verbs, not a product list.
   */
  actionableWork: 8,
  /**
   * Soft size rank among equal text matches. Wide bands, capped, so a large
   * contract rises without an industry-specific sweet spot and without
   * outranking a precise keyword or CPV hit.
   */
  budgetScaleLow: 4,
  budgetScaleMid: 8,
  budgetScaleHigh: 12,
  /**
   * Credit certificates and budget commitments are internal acts, not a call
   * for offers. Same pattern in every trade. Still shown, ranked lower.
   */
  fundingActPenalty: 20,
  /** Directed / closed invitations are not actionable for an uninvited firm. */
  targetedPenalty: 55,
  targetedScoreCap: 22,
} as const;

const emptyBreakdown = (): MatchScoreBreakdown => ({
  keywords: 0,
  cpvs: 0,
  company: 0,
  filters: 0,
  penalties: 0,
  signals: [],
  capped: false,
});

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

/**
 * Internal budget acts (πίστωση / δέσμευση / ανάληψη υποχρέωσης).
 * Patterns run on matchNorm text. They are not trade-specific.
 */
const FUNDING_ACT_PATTERNS: readonly RegExp[] = [
  /βεβαιωσ\p{L}{0,4}\s+(?:υπαρξ\p{L}{0,4}\s+)?πιστωσ\p{L}{0,4}/u,
  /πολυετ\p{L}{0,4}\s+δεσμευσ\p{L}{0,4}/u,
  /εκδοσ\p{L}{0,4}\s+δεσμευσ\p{L}{0,4}/u,
  /δεσμευσ\p{L}{0,4}\s+πιστωσ\p{L}{0,4}/u,
  /πιστωσ\p{L}{0,4}\s+δεσμευσ\p{L}{0,4}/u,
  /αναληψ\p{L}{0,4}\s+υποχρεωσ\p{L}{0,4}/u,
  /αναληψ\p{L}{0,4}\s+δεσμευσ\p{L}{0,4}/u,
  /διαθεσ\p{L}{0,4}\s+πιστωσ\p{L}{0,4}/u,
  /εγκρισ\p{L}{0,4}\s+(?:διαθεσ\p{L}{0,4}\s+)?πιστωσ\p{L}{0,4}/u,
];

/** Procurement verbs shared by works, supplies, services and studies. */
const ACTIONABLE_WORK =
  /παροχ\p{L}{0,4}\s+υπηρεσι|προμηθει|κατασκευ|συντηρησ|επισκευ|αναβαθμ|εγκαταστ|μισθωσ|αναπτυξ|ανακαινισ|εκτελεσ|εκπονησ|μελετ|καθαρισμ/u;

const FUNDING_ACT_REASON =
  "Εσωτερική πράξη πίστωσης ή δέσμευσης, όχι ανάθεση εργασίας";
const ACTIONABLE_WORK_REASON =
  "Ο τίτλος περιγράφει συγκεκριμένη εργασία ή προμήθεια";

const detectFundingAct = (titleNorm: string): boolean =>
  FUNDING_ACT_PATTERNS.some((pattern) => pattern.test(titleNorm));

const detectActionableWork = (titleNorm: string): boolean =>
  ACTIONABLE_WORK.test(titleNorm);

const budgetScalePoints = (budget: number | null | undefined): number => {
  if (budget == null || !Number.isFinite(budget) || budget < 2000) return 0;
  if (budget < 6000) return POINTS.budgetScaleLow;
  if (budget < 20000) return POINTS.budgetScaleMid;
  return POINTS.budgetScaleHigh;
};

const budgetScaleReason = (points: number): string | null => {
  if (points >= POINTS.budgetScaleHigh) return "Υψηλό οικονομικό αντικείμενο";
  if (points >= POINTS.budgetScaleMid) {
    return "Μεσαίο προς υψηλό οικονομικό αντικείμενο";
  }
  if (points >= POINTS.budgetScaleLow) return "Οικονομικό αντικείμενο άνω των 2.000 €";
  return null;
};

export const scoreKimdisItemAgainstProfile = (
  criteria: WatchProfileCriteria,
  item: KimdisSearchItem,
  profileLabel?: {
    id: string;
    name: string;
    /** Non-KIMDIS items skip NUTS hard-fail and use source-aware recordTypes. */
    sourceSystem?: "kimdis" | "ted" | "diavgeia";
  },
): WatchMatchResult => {
  const reasons: string[] = [];
  const matchedKeywords: string[] = [];
  const matchedCpvs: string[] = [];
  const breakdown = emptyBreakdown();
  let score = 0;
  const sourceSystem = profileLabel?.sourceSystem ?? "kimdis";

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
    breakdown: emptyBreakdown(),
    ...overrides,
  });

  const recordTypes = criteria.recordTypes.length
    ? criteria.recordTypes
    : ["REQ", "PROC"];
  if (sourceSystem === "ted" || sourceSystem === "diavgeia") {
    // External notices are scored as PROC-shaped; allow when profile watches PROC.
    if (!recordTypes.includes("PROC") && !recordTypes.includes(item.recordType)) {
      return empty();
    }
  } else if (!recordTypes.includes(item.recordType)) {
    return empty();
  }
  // TED / Διαύγεια lack official NUTS — do not hard-reject on region filters.
  if (sourceSystem === "kimdis") {
    const regionGate = evaluateRegionGate(
      item.nutsCode,
      criteria.regions ?? [],
      criteria.includeUnclassifiedRegion ?? false,
    );
    if (regionGate !== "ok") return empty();
  } else if (sourceSystem === "ted" || sourceSystem === "diavgeia") {
    reasons.push(
      sourceSystem === "ted"
        ? "Πηγή: TED (χωρίς NUTS ΚΗΜΔΗΣ)"
        : "Πηγή: Διαύγεια",
    );
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
    breakdown.filters += POINTS.authority;
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
      breakdown.filters += POINTS.contractType;
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
      breakdown.filters += POINTS.procedureType;
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
    breakdown.filters += POINTS.budgetInRange;
    reasons.push("Προϋπολογισμός εντός ορίων");

    if (criteria.minBudget != null && criteria.maxBudget != null) {
      const span = criteria.maxBudget - criteria.minBudget;
      if (span > 0) {
        const midLo = criteria.minBudget + span * 0.25;
        const midHi = criteria.minBudget + span * 0.75;
        if (budget >= midLo && budget <= midHi) {
          score += POINTS.budgetMidRange;
          breakdown.filters += POINTS.budgetMidRange;
          reasons.push("Προϋπολογισμός στο μεσαίο εύρος του προφίλ");
        }
      }
    }
  }

  // One score per synonym cluster — profile ["ιστοσελίδα","website"] must not
  // stack to 100% on a single topical hit.
  const scoredClusters = new Set<string>();
  let extraClusters = 0;
  let keywordPoints = 0;
  let firstKeywordInTitle = false;

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
      firstKeywordInTitle = inTitle;
      const pts = inTitle ? POINTS.titleFirstCluster : POINTS.bodyFirstCluster;
      keywordPoints += pts;
      reasons.push(
        inTitle
          ? `Ο τίτλος περιέχει τον όρο «${kw.trim()}».`
          : `Το κείμενο περιέχει τον όρο «${kw.trim()}».`,
      );
    } else if (extraClusters < POINTS.maxExtraClusters) {
      extraClusters += 1;
      const pts = inTitle ? POINTS.titleExtraCluster : POINTS.bodyExtraCluster;
      keywordPoints += pts;
      reasons.push(
        inTitle
          ? `Ο τίτλος περιέχει επίσης τον όρο «${kw.trim()}».`
          : `Το κείμενο περιέχει επίσης τον όρο «${kw.trim()}».`,
      );
    }
  }
  score += keywordPoints;
  breakdown.keywords = keywordPoints;

  let cpvPoints = 0;
  for (const cpv of criteria.cpvs) {
    if (!cpvMatches(cpv, item.cpvs)) continue;
    const first = matchedCpvs.length === 0;
    matchedCpvs.push(cpv.trim());
    const pts = first ? POINTS.cpvFirst : POINTS.cpvExtra;
    cpvPoints += pts;
    reasons.push(`CPV ${cpv.trim()}`);
  }
  score += cpvPoints;
  breakdown.cpvs = cpvPoints;

  // Company fit from org ΚΑΔ → suggested CPVs / keywords (soft boost only).
  let companyPoints = 0;
  const activities = criteria.companyActivities ?? [];
  if (activities.length > 0) {
    const companyHints = suggestWatchInterestsFromKads(activities);
    const companyCpvHit = companyHints.cpvs.find((row) =>
      cpvMatches(row.code, item.cpvs),
    );
    if (companyCpvHit) {
      companyPoints += POINTS.companyKadCpv;
      reasons.push(
        `CPV συμβατό με δραστηριότητες (ΚΑΔ → ${companyCpvHit.code})`,
      );
    } else {
      for (const hintKw of companyHints.keywords) {
        const needles = expandKeywordNeedles(hintKw);
        if (needles.length === 0) continue;
        const clusterId = keywordClusterId(hintKw);
        // Skip if already counted as a user-profile keyword cluster.
        if (clusterId && scoredClusters.has(clusterId)) continue;
        const inTitle = textIncludesAny(titleNorm, needles);
        const inBody = !inTitle && textIncludesAny(haystack, needles);
        if (!inTitle && !inBody) continue;
        const pts = inTitle
          ? POINTS.companyKadKeywordTitle
          : POINTS.companyKadKeywordBody;
        companyPoints += pts;
        reasons.push(
          inTitle
            ? `Ο τίτλος σχετίζεται με δραστηριότητα της εταιρείας («${hintKw}»).`
            : `Το κείμενο σχετίζεται με δραστηριότητα της εταιρείας («${hintKw}»).`,
        );
        break;
      }
    }
  }
  score += companyPoints;
  breakdown.company = companyPoints;

  const targeted = detectTargetedInvitation(item);
  const fundingAct = detectFundingAct(titleNorm);
  // A credit certificate that quotes the project name is still paperwork.
  const actionableWork = !fundingAct && detectActionableWork(titleNorm);

  if (actionableWork) {
    score += POINTS.actionableWork;
    breakdown.filters += POINTS.actionableWork;
  }

  const scale = budgetScalePoints(budget);
  if (scale > 0) {
    score += scale;
    breakdown.filters += scale;
  }

  // Slack-style stage boosts — soft ranking only, never a web gate.
  const hasCoreMatch = matchedKeywords.length > 0 || matchedCpvs.length > 0;
  if (
    !targeted.targeted &&
    item.recordType === "REQ" &&
    hasCoreMatch &&
    !item.cancelled
  ) {
    score += POINTS.earlyReq;
    breakdown.filters += POINTS.earlyReq;
    reasons.push("Πρώιμο αίτημα (REQ)");
    breakdown.signals.push("early");

    if (firstKeywordInTitle) {
      score += POINTS.earlyReqTitleKeyword;
      breakdown.filters += POINTS.earlyReqTitleKeyword;
      reasons.push("Αίτημα με όρο αναζήτησης στον τίτλο");
    }
  }

  if (matchedKeywords.length > 0) breakdown.signals.push("keywords");
  if (matchedCpvs.length > 0) breakdown.signals.push("cpv");
  if (companyPoints > 0) breakdown.signals.push("company");
  if (actionableWork) breakdown.signals.push("work");

  // Explainability only — never punish a correct keyword-only hit.
  // Funding acts are not "strong" even when a CPV happens to match.
  const positiveSignals = breakdown.signals.filter((signal) => signal !== "early");
  if (!fundingAct && positiveSignals.length >= 2) {
    reasons.unshift(`Ισχυρό match · ${positiveSignals.join(" + ")}`);
  }

  if (fundingAct) {
    score -= POINTS.fundingActPenalty;
    breakdown.penalties += POINTS.fundingActPenalty;
  }

  const scaleReason = budgetScaleReason(scale);
  if (scaleReason) reasons.unshift(scaleReason);
  if (fundingAct) reasons.unshift(FUNDING_ACT_REASON);
  else if (actionableWork) reasons.unshift(ACTIONABLE_WORK_REASON);

  if (targeted.targeted) {
    score -= POINTS.targetedPenalty;
    breakdown.penalties += POINTS.targetedPenalty;
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
        breakdown,
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
    breakdown,
  };
};

export const criteriaFromWatchProfile = (
  profile: {
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
    regions?: unknown;
    includeUnclassifiedRegion?: boolean | null;
  },
  options?: { companyActivities?: CompanyActivityHint[] },
): WatchProfileCriteria => {
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
    regions: asStrings(profile.regions),
    includeUnclassifiedRegion: Boolean(profile.includeUnclassifiedRegion),
    companyActivities: options?.companyActivities,
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
