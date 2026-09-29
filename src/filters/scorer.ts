import { classifyCpvs } from "./cpvs.js";
import {
  findKeywordHits,
  HARDWARE_KEYWORDS,
  POSITIVE_KEYWORDS,
  SOCIAL_MEDIA_KEYWORDS,
} from "./keywords.js";
import type { RecordType } from "../kimdis/types.js";

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
    relevantKeywordInTitle: boolean;
    relevantKeywordInDescription: boolean;
    earlyStage: boolean;
    hardwareDominant: boolean;
    socialMediaDominant: boolean;
    alreadyAdvanced: boolean;
    targetedSupplier: boolean;
    nonInvitedOffersRejected: boolean;
    hasLinkedNotice: boolean;
  };
};

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

export const scoreOpportunity = (input: ScoreInput): ScoreResult => {
  let score = 0;
  const reasons: string[] = [];

  const cpv = classifyCpvs(input.cpvs);
  const positiveHits = findKeywordHits(
    input.title,
    input.description,
    POSITIVE_KEYWORDS,
  );
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

  const relevantKeywordInTitle = positiveHits.some((hit) => hit.inTitle);
  const relevantKeywordInDescription = positiveHits.some(
    (hit) => hit.inDescription,
  );

  if (cpv.strong) {
    score += 40;
    reasons.push("Strongly relevant CPV");
  } else if (cpv.itFamily) {
    score += 20;
    reasons.push("IT/software CPV family (72xxxxxx)");
  }

  if (relevantKeywordInTitle) {
    score += 25;
    reasons.push("Highly relevant keyword in title");
  }

  if (relevantKeywordInDescription) {
    score += 15;
    reasons.push("Relevant keyword in object description");
  }

  const budget = input.budgetWithoutVat;
  if (budget != null) {
    if (budget >= 3000 && budget <= 20_000) {
      score += 10;
      reasons.push("Budget in sweet spot (€3k–€20k)");
    } else if (budget >= input.minBudget && budget <= input.maxBudget) {
      score += 5;
      reasons.push("Budget within configured range");
    } else if (budget < input.minBudget || budget > input.maxBudget) {
      // Soft signal only — do not discard missing/out-of-range budgets hard.
      score -= 5;
      reasons.push("Budget outside preferred range");
    }
  }

  const earlyStage =
    input.recordType === "REQ" &&
    input.isPrimaryRequest &&
    !input.hasNoticeRef;

  if (earlyStage) {
    score += 10;
    reasons.push("Primary Request / early stage");
  }

  if (cpv.strong || cpv.itFamily || relevantKeywordInTitle || relevantKeywordInDescription) {
    score += 5;
    reasons.push("Website/software/IT-related contracting scope");
  }

  const hardwareDominant =
    hardwareHits.length > 0 &&
    positiveHits.length === 0 &&
    !cpv.strong &&
    !cpv.itFamily;

  const socialMediaDominant =
    socialHits.length > 0 &&
    positiveHits.length === 0 &&
    !cpv.strong;

  if (hardwareDominant) {
    score -= 25;
    reasons.push("Primarily hardware/equipment");
  } else if (hardwareHits.length > 0 && positiveHits.length === 0) {
    score -= 15;
    reasons.push("Hardware terms present");
  }

  if (socialMediaDominant) {
    score -= 25;
    reasons.push("Primarily social media/content/marketing");
  } else if (socialHits.length > 0 && positiveHits.length <= 1) {
    score -= 10;
    reasons.push("Social/content terms present");
  }

  // Clearly unrelated: no CPV signal, no positive keywords, maybe negative.
  const clearlyUnrelated =
    !cpv.strong &&
    !cpv.itFamily &&
    positiveHits.length === 0 &&
    (hardwareDominant || socialMediaDominant || (hardwareHits.length + socialHits.length > 0));

  if (clearlyUnrelated) {
    score -= 40;
    reasons.push("Clearly unrelated procurement");
  }

  if (input.hasNoticeRef) {
    score -= 25;
    reasons.push("Existing linked notice already exists");
  }

  const pdf = input.pdf;
  const alreadyAdvanced = Boolean(pdf?.alreadyAdvanced);
  const targetedSupplier = Boolean(pdf?.targetedSupplier);
  const nonInvitedOffersRejected = Boolean(pdf?.nonInvitedOffersRejected);

  if (alreadyAdvanced) {
    score -= 40;
    reasons.push("Already appears awarded / selected (PDF)");
  }

  if (targetedSupplier) {
    score -= 20;
    reasons.push("Targeted invitation to a named supplier");
  }

  if (nonInvitedOffersRejected) {
    score -= 30;
    reasons.push("Non-invited offers explicitly rejected");
  }

  return {
    score: clamp(Math.round(score), 0, 100),
    reasons,
    flags: {
      stronglyRelevantCpv: cpv.strong,
      relevantKeywordInTitle,
      relevantKeywordInDescription,
      earlyStage,
      hardwareDominant,
      socialMediaDominant,
      alreadyAdvanced,
      targetedSupplier,
      nonInvitedOffersRejected,
      hasLinkedNotice: input.hasNoticeRef,
    },
  };
};
