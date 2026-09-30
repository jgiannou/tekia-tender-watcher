import { classifyCpvs } from "./cpvs.js";
import {
  findKeywordHits,
  HARDWARE_KEYWORDS,
  SOCIAL_MEDIA_KEYWORDS,
} from "./keywords.js";
import type { RecordType } from "../kimdis/types.js";
import type { WebCategory } from "./web-relevance.js";
import { STRONG_WEB_SIGNALS, softenGreekInflection } from "./web-relevance.js";

export const EARLY_WEB_REQ_BONUS = 20;
export const MIXED_MARKETING_PENALTY = 25;

export type ScoreInput = {
  recordType: RecordType;
  title: string;
  description: string;
  cpvs: string[];
  budgetWithoutVat: number | null;
  minBudget: number;
  maxBudget: number;
  hasNoticeRef: boolean;
  isPrimaryRequest: boolean;
  webCategory?: WebCategory;
  mixedMarketing?: boolean;
  pdf?: {
    alreadyAdvanced: boolean;
    targetedSupplier: boolean;
    nonInvitedOffersRejected: boolean;
  };
};

export type ScoreResult = {
  score: number;
  reasons: string[];
  flags: {
    stronglyRelevantCpv: boolean;
    highConfidenceWebCpv: boolean;
    relevantKeywordInTitle: boolean;
    relevantKeywordInDescription: boolean;
    earlyStage: boolean;
    earlyWebReqBonus: boolean;
    hardwareDominant: boolean;
    socialMediaDominant: boolean;
    mixedMarketing: boolean;
    alreadyAdvanced: boolean;
    targetedSupplier: boolean;
    nonInvitedOffersRejected: boolean;
    hasLinkedNotice: boolean;
  };
};

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const findStrongWebHits = (title: string, description: string) => {
  const t = softenGreekInflection(title);
  const d = softenGreekInflection(description);
  const hits: Array<{ keyword: string; inTitle: boolean; inDescription: boolean }> =
    [];
  for (const keyword of STRONG_WEB_SIGNALS) {
    const needle = softenGreekInflection(keyword);
    if (!needle) continue;
    const inTitle = t.includes(needle);
    const inDescription = d.includes(needle);
    if (inTitle || inDescription) hits.push({ keyword, inTitle, inDescription });
  }
  return hits;
};

/**
 * Score ONLY after isWebRelevant === true.
 * Broad IT CPVs alone must never produce high notify scores.
 */
export const scoreOpportunity = (input: ScoreInput): ScoreResult => {
  let score = 0;
  const reasons: string[] = [];

  const cpv = classifyCpvs(input.cpvs);
  const webHits = findStrongWebHits(input.title, input.description);
  const hardwareHits = findKeywordHits(
    input.title,
    input.description,
    HARDWARE_KEYWORDS,
  );
  const socialHits = findKeywordHits(
    input.title,
    input.description,
    SOCIAL_MEDIA_KEYWORDS,
  );

  const relevantKeywordInTitle = webHits.some((hit) => hit.inTitle);
  const relevantKeywordInDescription = webHits.some((hit) => hit.inDescription);

  if (cpv.highConfidenceWeb) {
    score += 40;
    reasons.push("Strongly relevant website/internet CPV");
  } else if (cpv.strong && !cpv.broadOnly) {
    score += 10;
    reasons.push("Supporting IT CPV (not sufficient alone)");
  } else if (cpv.broadOnly) {
    score += 0;
    reasons.push("Broad IT CPV ignored without strong web text weight");
  }

  if (relevantKeywordInTitle) {
    score += 25;
    reasons.push("Strong web keyword in title");
  }

  if (relevantKeywordInDescription) {
    score += 15;
    reasons.push("Strong web keyword in description");
  }

  if (
    input.webCategory === "WEBSITE" ||
    input.webCategory === "WEB_APPLICATION" ||
    input.webCategory === "WEB_PLATFORM" ||
    input.webCategory === "WEBSITE_SUPPORT"
  ) {
    score += 10;
    reasons.push(`Clear web category: ${input.webCategory}`);
  } else if (input.webCategory === "WEB_API_INTEGRATION") {
    score += 5;
    reasons.push("Web/API integration scope");
  }

  const budget = input.budgetWithoutVat;
  const budgetInConfigured =
    budget != null && budget >= input.minBudget && budget <= input.maxBudget;
  if (budget != null) {
    if (budget >= 3000 && budget <= 20_000) {
      score += 10;
      reasons.push("Budget in sweet spot (€3k–€20k)");
    } else if (budgetInConfigured) {
      score += 5;
      reasons.push("Budget within configured range");
    }
  }

  const earlyStage =
    input.recordType === "REQ" &&
    input.isPrimaryRequest &&
    !input.hasNoticeRef &&
    !input.pdf?.alreadyAdvanced;

  if (earlyStage) {
    score += 10;
    reasons.push("Primary Request / early stage");
  }

  const earlyWebReqBonus =
    earlyStage &&
    relevantKeywordInTitle &&
    !input.pdf?.targetedSupplier &&
    !input.pdf?.alreadyAdvanced &&
    (budget == null || budgetInConfigured);

  if (earlyWebReqBonus) {
    score += EARLY_WEB_REQ_BONUS;
    reasons.push(`Early Web REQ bonus (+${EARLY_WEB_REQ_BONUS})`);
  }

  const hardwareDominant =
    hardwareHits.length > 0 && webHits.length === 0 && !cpv.highConfidenceWeb;
  const socialMediaDominant =
    socialHits.length > 0 && webHits.length === 0 && !cpv.highConfidenceWeb;
  const mixedMarketing = Boolean(input.mixedMarketing);

  if (hardwareDominant) {
    score -= 30;
    reasons.push("Primarily hardware/equipment");
  }

  if (socialMediaDominant) {
    score -= 25;
    reasons.push("Primarily social media/content/marketing");
  }

  if (mixedMarketing) {
    score -= MIXED_MARKETING_PENALTY;
    reasons.push(`Mixed marketing/social penalty (-${MIXED_MARKETING_PENALTY})`);
  }

  if (input.hasNoticeRef) {
    score -= 25;
    reasons.push("Existing linked notice already exists");
  }

  const pdf = input.pdf;
  if (pdf?.alreadyAdvanced) {
    score -= 40;
    reasons.push("Already appears awarded / selected (PDF)");
  }
  if (pdf?.targetedSupplier) {
    score -= 30;
    reasons.push("Targeted invitation to a named supplier");
  }
  if (pdf?.nonInvitedOffersRejected) {
    score -= 30;
    reasons.push("Non-invited offers explicitly rejected");
  }

  return {
    score: clamp(Math.round(score), 0, 100),
    reasons,
    flags: {
      stronglyRelevantCpv: cpv.strong,
      highConfidenceWebCpv: cpv.highConfidenceWeb,
      relevantKeywordInTitle,
      relevantKeywordInDescription,
      earlyStage,
      earlyWebReqBonus,
      hardwareDominant,
      socialMediaDominant,
      mixedMarketing,
      alreadyAdvanced: Boolean(pdf?.alreadyAdvanced),
      targetedSupplier: Boolean(pdf?.targetedSupplier),
      nonInvitedOffersRejected: Boolean(pdf?.nonInvitedOffersRejected),
      hasLinkedNotice: input.hasNoticeRef,
    },
  };
};
