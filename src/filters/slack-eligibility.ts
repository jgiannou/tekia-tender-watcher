import type { RecordType } from "../kimdis/types.js";
import type { PdfTextStatus } from "../pdf/extract-text.js";
import type { RelevanceStatus, WebCategory } from "./web-relevance.js";

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
export const evaluateSlackEligibility = (
  input: SlackEligibilityInput,
): SlackEligibilityResult => {
  if (input.relevanceStatus === "EXPIRED") {
    return { eligible: false, reason: "Deadline already expired" };
  }
  if (input.relevanceStatus === "TARGETED") {
    return { eligible: false, reason: "Targeted invitation" };
  }
  if (input.relevanceStatus === "NEEDS_REVIEW") {
    return { eligible: false, reason: "Needs review — not Slack eligible" };
  }
  if (input.relevanceStatus === "IRRELEVANT" || !input.isWebRelevant) {
    return { eligible: false, reason: "Not web relevant" };
  }
  if (input.category === "UNKNOWN") {
    return { eligible: false, reason: "UNKNOWN category — no Slack" };
  }
  if (input.score < input.threshold) {
    return { eligible: false, reason: `Score below threshold (${input.threshold})` };
  }
  if (input.alreadyAdvanced) {
    return { eligible: false, reason: "Already advanced / award indicators" };
  }
  if (input.mixedMarketingNeedsReview) {
    return { eligible: false, reason: "Mixed marketing scope needs review" };
  }

  if (input.recordType === "PROC") {
    if (input.pdfTextStatus !== "extracted") {
      return {
        eligible: false,
        reason: "PROC PDF unreadable — recipient cannot be verified",
      };
    }
    if (input.targetedSupplier) {
      return { eligible: false, reason: "Targeted invitation to specific supplier" };
    }
    if (input.nonInvitedOffersRejected) {
      return { eligible: false, reason: "Non-invited offers explicitly rejected" };
    }
    if (isDeadlineExpired(input.finalSubmissionDate)) {
      return { eligible: false, reason: "Deadline already expired" };
    }
    return { eligible: true, reason: null };
  }

  // REQ — more permissive for early leads
  if (input.hasNoticeRef) {
    return { eligible: false, reason: "Linked invitation/notice already exists" };
  }
  if (input.targetedSupplier) {
    return { eligible: false, reason: "Targeted supplier indicators" };
  }

  return { eligible: true, reason: null };
};
