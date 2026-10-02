import type { RecordType } from "../kimdis/types.js";
import type { PdfTextStatus } from "../pdf/extract-text.js";
import type { RelevanceStatus, WebCategory } from "./web-relevance.js";
import {
  eligibilityReasonToCode,
  type AlertEligibilityCode,
} from "./classification-meta.js";

export type SlackEligibilityInput = {
  recordType: RecordType;
  isWebRelevant: boolean;
  category: WebCategory;
  relevanceStatus: RelevanceStatus;
  score: number;
  threshold: number;
  hasNoticeRef: boolean;
  alreadyAdvanced: boolean;
  targetedSupplier: boolean;
  nonInvitedOffersRejected: boolean;
  pdfTextStatus: PdfTextStatus | string;
  finalSubmissionDate: string | null;
  mixedMarketingNeedsReview?: boolean;
};

export type SlackEligibilityResult = {
  eligible: boolean;
  reason: string | null;
  code: AlertEligibilityCode;
};

const isDeadlineExpired = (finalSubmissionDate: string | null): boolean => {
  if (!finalSubmissionDate) return false;
  const deadline = new Date(finalSubmissionDate);
  if (Number.isNaN(deadline.getTime())) return false;
  return deadline.getTime() < Date.now();
};

export const isDeadlineInPast = isDeadlineExpired;

/**
 * Central Slack gate — Slack stays clean.
 * UNKNOWN category never notifies.
 */
const result = (
  eligible: boolean,
  reason: string | null,
): SlackEligibilityResult => ({
  eligible,
  reason,
  code: eligibilityReasonToCode(eligible, reason),
});

export const evaluateSlackEligibility = (
  input: SlackEligibilityInput,
): SlackEligibilityResult => {
  if (input.relevanceStatus === "EXPIRED") {
    return result(false, "Deadline already expired");
  }
  if (input.relevanceStatus === "TARGETED") {
    return result(false, "Targeted invitation");
  }
  if (input.relevanceStatus === "NEEDS_REVIEW") {
    return result(false, "Needs review — not Slack eligible");
  }
  if (input.relevanceStatus === "IRRELEVANT" || !input.isWebRelevant) {
    return result(false, "Not web relevant");
  }
  if (input.category === "UNKNOWN") {
    return result(false, "UNKNOWN category — no Slack");
  }
  if (input.score < input.threshold) {
    return result(false, `Score below threshold (${input.threshold})`);
  }
  if (input.alreadyAdvanced) {
    return result(false, "Already advanced / award indicators");
  }
  if (input.mixedMarketingNeedsReview) {
    return result(false, "Mixed marketing scope needs review");
  }

  if (input.recordType === "PROC") {
    if (input.pdfTextStatus !== "extracted") {
      return result(
        false,
        "PROC PDF unreadable — recipient cannot be verified",
      );
    }
    if (input.targetedSupplier) {
      return result(false, "Targeted invitation to specific supplier");
    }
    if (input.nonInvitedOffersRejected) {
      return result(false, "Non-invited offers explicitly rejected");
    }
    if (isDeadlineExpired(input.finalSubmissionDate)) {
      return result(false, "Deadline already expired");
    }
    return result(true, null);
  }

  // REQ — more permissive for early leads
  if (input.hasNoticeRef) {
    return result(false, "Linked invitation/notice already exists");
  }
  if (input.targetedSupplier) {
    return result(false, "Targeted supplier indicators");
  }

  return result(true, null);
};
