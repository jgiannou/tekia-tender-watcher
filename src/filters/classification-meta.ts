import { createHash } from "node:crypto";
import type { RecordType } from "../kimdis/types.js";

/**
 * Bump when PDF classify, web relevance, or scoring rules change in a way
 * that should force re-evaluation of stored tenders.
 */
export const CLASSIFICATION_VERSION = 2;

export type AlertEligibilityCode =
  | "ELIGIBLE"
  | "BOOTSTRAP_SUPPRESSED"
  | "BELOW_SCORE_THRESHOLD"
  | "NOT_WEB_RELEVANT"
  | "NEEDS_REVIEW"
  | "TARGETED_OTHER"
  | "EXPIRED"
  | "ALREADY_ADVANCED"
  | "UNKNOWN_CATEGORY"
  | "LINKED_NOTICE"
  | "PDF_UNREADABLE"
  | "MIXED_MARKETING"
  | "ALREADY_NOTIFIED"
  | "NOT_EVALUATED";

export type SourceFingerprintInput = {
  recordType: RecordType;
  title: string;
  description: string;
  organization: string;
  cpvs: string[];
  budgetWithoutVat: number | null;
  finalSubmissionDate: string | null;
  hasNoticeRef: boolean;
};

export const buildSourceFingerprint = (input: SourceFingerprintInput): string => {
  const payload = [
    input.recordType,
    input.title.trim(),
    input.description.trim(),
    input.organization.trim(),
    [...input.cpvs].map((c) => c.trim()).sort().join(","),
    input.budgetWithoutVat == null ? "" : String(input.budgetWithoutVat),
    input.finalSubmissionDate ?? "",
    input.hasNoticeRef ? "1" : "0",
  ].join("|");

  return createHash("sha256").update(payload, "utf8").digest("hex").slice(0, 32);
};

export type ReevalDecisionInput = {
  storedVersion: number | null | undefined;
  storedFingerprint: string | null | undefined;
  currentFingerprint: string;
  score: number | null | undefined;
  relevanceStatus: string | null | undefined;
  pdfTextStatus: string | null | undefined;
  recordType: RecordType;
  webRelevant: number | boolean | null | undefined;
};

/**
 * Decide whether an existing ADAM should go through full classify/score again.
 * Avoids blind recompute every poll while healing stale/wrong first passes.
 */
export const shouldReevaluateTender = (input: ReevalDecisionInput): boolean => {
  const version = input.storedVersion ?? 0;
  if (version !== CLASSIFICATION_VERSION) return true;

  if ((input.storedFingerprint ?? "") !== input.currentFingerprint) return true;

  const status = input.relevanceStatus ?? "";
  const score = input.score ?? 0;
  const pdf = input.pdfTextStatus ?? "none";

  // Never properly evaluated / suspicious defaults
  if (!status || status === "UNKNOWN") return true;
  if (score === 0 && (status === "IRRELEVANT" || status === "RELEVANT")) {
    // score=0 + RELEVANT is inconsistent; score=0 + IRRELEVANT may be correct,
    // but version bumps already cover rule changes. Still refresh when PDF was skipped
    // for types that need PDF verification.
  }
  if (score === 0 && status === "RELEVANT") return true;

  if (
    input.recordType === "PROC" &&
    (pdf === "none" || pdf === "skipped" || pdf === "error") &&
    Boolean(input.webRelevant)
  ) {
    return true;
  }

  if (
    input.recordType === "REQ" &&
    score === 0 &&
    (pdf === "none" || pdf === "skipped") &&
    status !== "IRRELEVANT"
  ) {
    return true;
  }

  return false;
};

/** Map human eligibility reasons → stable debug codes. */
export const eligibilityReasonToCode = (
  eligible: boolean,
  reason: string | null,
): AlertEligibilityCode => {
  if (eligible) return "ELIGIBLE";
  if (!reason) return "NOT_EVALUATED";
  const r = reason.toLowerCase();
  if (r.includes("bootstrap")) return "BOOTSTRAP_SUPPRESSED";
  if (r.includes("below threshold") || r.includes("score below")) {
    return "BELOW_SCORE_THRESHOLD";
  }
  if (r.includes("not web relevant")) return "NOT_WEB_RELEVANT";
  if (r.includes("needs review")) return "NEEDS_REVIEW";
  if (r.includes("targeted")) return "TARGETED_OTHER";
  if (r.includes("expired")) return "EXPIRED";
  if (r.includes("already advanced") || r.includes("award")) {
    return "ALREADY_ADVANCED";
  }
  if (r.includes("unknown category")) return "UNKNOWN_CATEGORY";
  if (r.includes("linked invitation") || r.includes("linked notice")) {
    return "LINKED_NOTICE";
  }
  if (r.includes("unreadable") || r.includes("pdf")) return "PDF_UNREADABLE";
  if (r.includes("mixed marketing")) return "MIXED_MARKETING";
  if (r.includes("already notified")) return "ALREADY_NOTIFIED";
  return "NOT_EVALUATED";
};
