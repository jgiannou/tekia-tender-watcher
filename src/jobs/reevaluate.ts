import type { Config } from "../config.js";
import type { Repository, TenderRow } from "../db/repository.js";
import { scoreOpportunity } from "../filters/scorer.js";
import {
  evaluateSlackEligibility,
  isDeadlineInPast,
} from "../filters/slack-eligibility.js";
import {
  isWebRelevant,
  webCategorySlackLabel,
  type RelevanceStatus,
  type WebCategory,
} from "../filters/web-relevance.js";
import type { RecordType } from "../kimdis/types.js";
import type { SlackClient } from "../slack/client.js";
import { formatSlackMessage } from "../slack/format-message.js";

export type ReevaluateStats = {
  total: number;
  relevant: number;
  needsReview: number;
  irrelevant: number;
  expired: number;
  targeted: number;
  alertCandidates: number;
  previouslyNotifiedNowSuppressed: Array<{
    adam: string;
    title: string;
    organization: string | null;
    oldScore: number | null;
    newStatus: string;
    reason: string | null;
  }>;
  spotlight: Array<{
    match: string;
    adam: string;
    organization: string | null;
    title: string;
    score: number;
    status: string;
    category: string;
    slackEligible: boolean;
    reason: string | null;
  }>;
};

export type ResendOptions = {
  force?: boolean;
  dryRun?: boolean;
  limit?: number;
};

export type ResendResult = {
  reevaluate: ReevaluateStats;
  candidates: number;
  sent: number;
  skippedAlreadyNotified: number;
  skippedLimit: number;
  failed: number;
  dryRun: boolean;
  force: boolean;
  samples: Array<{
    adam: string;
    title: string;
    score: number;
    notifiedBefore: boolean;
  }>;
};

const parseCpvs = (raw: string | null): string[] => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
};

const parseReasons = (raw: string | null): string[] => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
};

const stageLabel = (recordType: RecordType, stage: string): string => {
  if (stage === "ALREADY_ADVANCED") return "Already advanced";
  if (stage === "TARGETED") return "Targeted invitation";
  if (stage === "EXPIRED") return "Expired";
  if (recordType === "REQ") return "Πρωτογενές Αίτημα";
  if (recordType === "PROC") return "Πρόσκληση / Διακήρυξη";
  return recordType;
};

const spotlightMatchers = [
  { key: "ΠΕΤΑ ΑΕ", test: (r: TenderRow) => /πετα/i.test(r.organization ?? "") || /πετα/i.test(r.title ?? "") },
  {
    key: "Δήμος Παλαιού Φαλήρου",
    test: (r: TenderRow) => /παλαιου φαληρ|παλαιού φαλήρ/i.test(`${r.organization ?? ""} ${r.title ?? ""}`),
  },
  {
    key: "Ελληνική Αρχή Γεωλογικών",
    test: (r: TenderRow) =>
      /γεωλογικ|μεταλλευτικ/i.test(`${r.organization ?? ""} ${r.title ?? ""}`) ||
      /κοινωνικησ δικτυωσ|κοινωνικής δικτύωσ/i.test(r.title ?? ""),
  },
];

const classifyRow = (
  row: TenderRow,
  config: Pick<
    Config,
    "MIN_BUDGET" | "MAX_BUDGET" | "ALERT_SCORE_THRESHOLD" | "TARGETED_ALERT_SCORE"
  >,
): {
  score: number;
  stage: string;
  reasons: string[];
  webRelevant: boolean;
  webCategory: WebCategory;
  relevanceStatus: RelevanceStatus;
  ignoreReason: string | null;
  reviewReason: string | null;
  targetedSupplier: boolean;
  nonInvitedOffersRejected: boolean;
  slackEligible: boolean;
  slackBlockReason: string | null;
} => {
  const cpvs = parseCpvs(row.cpvs);
  const targetedSupplier = Boolean(row.targeted_supplier);
  const nonInvitedOffersRejected = Boolean(row.non_invited_offers_rejected);
  const pdfStatus = row.pdf_text_status ?? "none";
  const alreadyAdvanced = (row.stage ?? "") === "ALREADY_ADVANCED";

  const gate = isWebRelevant({
    title: row.title ?? "",
    description: "",
    cpvs,
  });

  let relevanceStatus: RelevanceStatus = gate.status;
  let ignoreReason = gate.ignoreReason;
  let reviewReason = gate.reviewReason;
  let stage = row.stage ?? "UNKNOWN";
  let score = 0;
  let reasons: string[] = [gate.ignoreReason ?? gate.reviewReason ?? "Not web relevant"];

  if (row.record_type === "PROC" && gate.isWebRelevant) {
    if (pdfStatus !== "extracted") {
      relevanceStatus = "NEEDS_REVIEW";
      reviewReason = "PROC PDF unreadable — recipient cannot be verified";
      ignoreReason = null;
      stage = "NEEDS_REVIEW";
      reasons = [reviewReason];
    } else if (targetedSupplier || nonInvitedOffersRejected) {
      relevanceStatus = "TARGETED";
      ignoreReason = nonInvitedOffersRejected
        ? "Non-invited offers explicitly rejected"
        : "Targeted invitation to specific supplier";
      reviewReason = null;
      stage = "TARGETED";
      reasons = [ignoreReason];
    } else if (isDeadlineInPast(row.final_submission_date)) {
      relevanceStatus = "EXPIRED";
      ignoreReason = "Deadline already expired";
      reviewReason = null;
      stage = "EXPIRED";
      reasons = [ignoreReason];
    } else if (alreadyAdvanced) {
      relevanceStatus = "IRRELEVANT";
      ignoreReason = "Already advanced / award language in PDF";
      reviewReason = null;
      reasons = [ignoreReason];
    }
  }

  if (
    relevanceStatus === "RELEVANT" &&
    gate.isWebRelevant &&
    gate.category !== "UNKNOWN"
  ) {
    const scored = scoreOpportunity({
      recordType: row.record_type,
      title: row.title ?? "",
      description: "",
      cpvs,
      budgetWithoutVat: row.budget_without_vat,
      minBudget: config.MIN_BUDGET,
      maxBudget: config.MAX_BUDGET,
      hasNoticeRef: false,
      isPrimaryRequest: row.record_type === "REQ",
      webCategory: gate.category,
      mixedMarketing: gate.mixedMarketing,
      pdf: {
        alreadyAdvanced,
        targetedSupplier,
        nonInvitedOffersRejected,
      },
    });
    score = scored.score;
    reasons = scored.reasons;
    if (row.record_type === "REQ") stage = "EARLY";
  } else if (relevanceStatus === "NEEDS_REVIEW") {
    score = 0;
    stage = stage === "UNKNOWN" ? "NEEDS_REVIEW" : stage;
  } else if (relevanceStatus === "IRRELEVANT") {
    score = 0;
    stage = "IRRELEVANT";
  }

  const eligibility = evaluateSlackEligibility({
    recordType: row.record_type,
    isWebRelevant: gate.isWebRelevant && relevanceStatus === "RELEVANT",
    category: gate.category,
    relevanceStatus,
    score,
    threshold: config.ALERT_SCORE_THRESHOLD,
    hasNoticeRef: false,
    alreadyAdvanced,
    targetedSupplier,
    nonInvitedOffersRejected,
    pdfTextStatus: pdfStatus,
    finalSubmissionDate: row.final_submission_date,
  });

  return {
    score,
    stage,
    reasons,
    webRelevant: gate.isWebRelevant && relevanceStatus === "RELEVANT",
    webCategory: gate.category,
    relevanceStatus,
    ignoreReason,
    reviewReason,
    targetedSupplier,
    nonInvitedOffersRejected,
    slackEligible: eligibility.eligible,
    slackBlockReason: eligibility.reason,
  };
};

export const reevaluateStoredTenders = (
  repo: Repository,
  config: Pick<
    Config,
    "MIN_BUDGET" | "MAX_BUDGET" | "ALERT_SCORE_THRESHOLD" | "TARGETED_ALERT_SCORE"
  >,
): ReevaluateStats => {
  const rows = repo.listAll();
  const nowIso = new Date().toISOString();

  let relevant = 0;
  let needsReview = 0;
  let irrelevant = 0;
  let expired = 0;
  let targeted = 0;
  let alertCandidates = 0;
  const previouslyNotifiedNowSuppressed: ReevaluateStats["previouslyNotifiedNowSuppressed"] =
    [];
  const classified = new Map<string, ReturnType<typeof classifyRow>>();

  for (const row of rows) {
    const result = classifyRow(row, config);
    classified.set(row.reference_number, result);

    repo.updateRelevanceFields({
      referenceNumber: row.reference_number,
      score: result.score,
      stage: result.stage,
      scoreReasons: result.reasons,
      webRelevant: result.webRelevant,
      webCategory: result.webCategory,
      relevanceStatus: result.relevanceStatus,
      ignoreReason: result.ignoreReason,
      reviewReason: result.reviewReason,
      targetedSupplier: result.targetedSupplier,
      nonInvitedOffersRejected: result.nonInvitedOffersRejected,
      nowIso,
    });

    switch (result.relevanceStatus) {
      case "RELEVANT":
        relevant += 1;
        break;
      case "NEEDS_REVIEW":
        needsReview += 1;
        break;
      case "EXPIRED":
        expired += 1;
        break;
      case "TARGETED":
        targeted += 1;
        break;
      default:
        irrelevant += 1;
        break;
    }

    if (result.slackEligible) alertCandidates += 1;

    if (row.notified_at && !result.slackEligible) {
      previouslyNotifiedNowSuppressed.push({
        adam: row.reference_number,
        title: row.title ?? "",
        organization: row.organization,
        oldScore: row.score,
        newStatus: result.relevanceStatus,
        reason: result.slackBlockReason ?? result.reviewReason ?? result.ignoreReason,
      });
    }
  }

  const spotlight: ReevaluateStats["spotlight"] = [];
  for (const matcher of spotlightMatchers) {
    const row = rows.find((r) => matcher.test(r));
    if (!row) {
      spotlight.push({
        match: matcher.key,
        adam: "(not in DB)",
        organization: null,
        title: "",
        score: 0,
        status: "MISSING",
        category: "UNKNOWN",
        slackEligible: false,
        reason: "Record not found in local/current database",
      });
      continue;
    }
    const result = classified.get(row.reference_number)!;
    spotlight.push({
      match: matcher.key,
      adam: row.reference_number,
      organization: row.organization,
      title: row.title ?? "",
      score: result.score,
      status: result.relevanceStatus,
      category: result.webCategory,
      slackEligible: result.slackEligible,
      reason: result.slackBlockReason ?? result.reviewReason ?? result.ignoreReason,
    });
  }

  return {
    total: rows.length,
    relevant,
    needsReview,
    irrelevant,
    expired,
    targeted,
    alertCandidates,
    previouslyNotifiedNowSuppressed: previouslyNotifiedNowSuppressed.slice(0, 50),
    spotlight,
  };
};

const shouldAlertRow = (
  row: TenderRow,
  config: Pick<Config, "ALERT_SCORE_THRESHOLD" | "TARGETED_ALERT_SCORE">,
): boolean => {
  const eligibility = evaluateSlackEligibility({
    recordType: row.record_type,
    isWebRelevant: Boolean(row.web_relevant),
    category: (row.web_category as WebCategory) ?? "UNKNOWN",
    relevanceStatus: (row.relevance_status as RelevanceStatus) ?? "IRRELEVANT",
    score: row.score ?? 0,
    threshold: config.ALERT_SCORE_THRESHOLD,
    hasNoticeRef: false,
    alreadyAdvanced: (row.stage ?? "") === "ALREADY_ADVANCED",
    targetedSupplier: Boolean(row.targeted_supplier),
    nonInvitedOffersRejected: Boolean(row.non_invited_offers_rejected),
    pdfTextStatus: row.pdf_text_status ?? "none",
    finalSubmissionDate: row.final_submission_date,
  });
  return eligibility.eligible;
};

const buildSlackText = (
  row: TenderRow,
  localDashboardUrl?: string | null,
): string => {
  const cpvs = parseCpvs(row.cpvs);
  const reasons = parseReasons(row.score_reasons);
  const category = (row.web_category as WebCategory) ?? "UNKNOWN";
  const stage = row.stage ?? "UNKNOWN";
  const pdfStatus = row.pdf_text_status ?? "none";

  return formatSlackMessage({
    score: row.score ?? 0,
    title: row.title ?? "(no title)",
    organization: row.organization ?? "Unknown organization",
    budgetWithoutVat: row.budget_without_vat,
    recordType: row.record_type,
    stageLabel: stageLabel(row.record_type, stage),
    webCategoryLabel: webCategorySlackLabel(category),
    cpvs,
    submissionDate: row.submission_date,
    finalSubmissionDate: row.final_submission_date,
    publicUrl: row.public_kimdis_url ?? "",
    pdfUrl: row.official_pdf_url ?? "",
    reasons,
    referenceNumber: row.reference_number,
    localDashboardUrl,
    flags: {
      earlyStage: stage === "EARLY" || row.record_type === "REQ",
      hasLinkedNotice: false,
      targetedSupplier: Boolean(row.targeted_supplier),
      nonInvitedOffersRejected: Boolean(row.non_invited_offers_rejected),
      alreadyAdvanced: stage === "ALREADY_ADVANCED",
      pdfNeedsManualReview: false,
      pdfVerified: row.record_type === "PROC" && pdfStatus === "extracted",
      budgetInRange: true,
    },
  });
};

export const resendMatchingAlerts = async (
  deps: {
    repo: Repository;
    slack: SlackClient;
    config: Pick<
      Config,
      | "MIN_BUDGET"
      | "MAX_BUDGET"
      | "ALERT_SCORE_THRESHOLD"
      | "TARGETED_ALERT_SCORE"
      | "LOCAL_DASHBOARD_URL"
    >;
  },
  options: ResendOptions = {},
): Promise<ResendResult> => {
  const force = Boolean(options.force);
  const dryRun = Boolean(options.dryRun);
  const limit =
    typeof options.limit === "number" && options.limit > 0
      ? Math.floor(options.limit)
      : 50;

  const reevaluate = reevaluateStoredTenders(deps.repo, deps.config);
  const rows = deps.repo
    .listAll()
    .filter((row) => shouldAlertRow(row, deps.config))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  let sent = 0;
  let skippedAlreadyNotified = 0;
  let skippedLimit = 0;
  let failed = 0;
  let acted = 0;
  const samples: ResendResult["samples"] = [];

  for (const row of rows) {
    const notifiedBefore = Boolean(row.notified_at);
    if (!force && notifiedBefore) {
      skippedAlreadyNotified += 1;
      continue;
    }

    if (acted >= limit) {
      skippedLimit += 1;
      continue;
    }

    samples.push({
      adam: row.reference_number,
      title: row.title ?? "",
      score: row.score ?? 0,
      notifiedBefore,
    });
    acted += 1;

    if (dryRun) continue;

    const text = buildSlackText(row, deps.config.LOCAL_DASHBOARD_URL);
    const ok = await deps.slack.sendText(text);
    if (!ok) {
      failed += 1;
      continue;
    }

    if (force && notifiedBefore) {
      deps.repo.clearNotified(row.reference_number);
    }
    deps.repo.markNotified(row.reference_number, new Date().toISOString());
    sent += 1;
  }

  return {
    reevaluate,
    candidates: rows.length,
    sent: dryRun ? 0 : sent,
    skippedAlreadyNotified,
    skippedLimit,
    failed,
    dryRun,
    force,
    samples: samples.slice(0, 25),
  };
};
