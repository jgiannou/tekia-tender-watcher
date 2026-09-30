import type { Config } from "../config.js";
import type { Repository, TenderRow } from "../db/repository.js";
import { scoreOpportunity } from "../filters/scorer.js";
import {
  isWebRelevant,
  webCategorySlackLabel,
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
  alertCandidates: number;
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
    return Array.isArray(parsed)
      ? parsed.map(String).filter(Boolean)
      : [];
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

const stageLabel = (
  recordType: RecordType,
  stage: string,
): string => {
  if (stage === "ALREADY_ADVANCED") return "Already advanced";
  if (recordType === "REQ") return "Πρωτογενές Αίτημα";
  if (recordType === "PROC") return "Πρόσκληση / Διακήρυξη";
  return recordType;
};

const shouldAlert = (
  row: TenderRow,
  threshold: number,
  targetedAlertScore: number,
): boolean => {
  if (!row.web_relevant) return false;
  const category = (row.web_category as WebCategory) ?? "UNKNOWN";
  if (category === "UNKNOWN") return false;
  const score = row.score ?? 0;
  if (score < threshold) return false;
  if (Boolean(row.targeted_supplier) && score < targetedAlertScore) return false;
  return true;
};

export const reevaluateStoredTenders = (
  repo: Repository,
  config: Pick<Config, "MIN_BUDGET" | "MAX_BUDGET" | "ALERT_SCORE_THRESHOLD" | "TARGETED_ALERT_SCORE">,
): ReevaluateStats => {
  const rows = repo.listAll();
  const nowIso = new Date().toISOString();

  let relevant = 0;
  let needsReview = 0;
  let irrelevant = 0;
  let alertCandidates = 0;

  for (const row of rows) {
    const cpvs = parseCpvs(row.cpvs);
    const gate = isWebRelevant({
      title: row.title ?? "",
      description: "",
      cpvs,
    });

    let score = 0;
    let reasons: string[] = [gate.ignoreReason ?? "Not web relevant"];
    let stage = row.stage ?? "UNKNOWN";

    if (!gate.isWebRelevant) {
      score = 0;
      stage = gate.status === "NEEDS_REVIEW" ? "NEEDS_REVIEW" : "IRRELEVANT";
      if (gate.status === "NEEDS_REVIEW") needsReview += 1;
      else irrelevant += 1;
    } else {
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
        pdf: {
          alreadyAdvanced: stage === "ALREADY_ADVANCED",
          targetedSupplier: Boolean(row.targeted_supplier),
          nonInvitedOffersRejected: Boolean(row.non_invited_offers_rejected),
        },
      });
      score = scored.score;
      reasons = scored.reasons;
      relevant += 1;
    }

    repo.updateRelevanceFields({
      referenceNumber: row.reference_number,
      score,
      stage,
      scoreReasons: reasons,
      webRelevant: gate.isWebRelevant,
      webCategory: gate.category,
      relevanceStatus: gate.status,
      ignoreReason: gate.ignoreReason,
      nowIso,
    });

    const updated: TenderRow = {
      ...row,
      score,
      stage,
      score_reasons: JSON.stringify(reasons),
      web_relevant: gate.isWebRelevant ? 1 : 0,
      web_category: gate.category,
      relevance_status: gate.status,
      ignore_reason: gate.ignoreReason,
    };

    if (shouldAlert(updated, config.ALERT_SCORE_THRESHOLD, config.TARGETED_ALERT_SCORE)) {
      alertCandidates += 1;
    }
  }

  return {
    total: rows.length,
    relevant,
    needsReview,
    irrelevant,
    alertCandidates,
  };
};

const buildSlackText = (row: TenderRow): string => {
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
    flags: {
      earlyStage: stage === "EARLY" || row.record_type === "REQ",
      hasLinkedNotice: false,
      targetedSupplier: Boolean(row.targeted_supplier),
      nonInvitedOffersRejected: Boolean(row.non_invited_offers_rejected),
      alreadyAdvanced: stage === "ALREADY_ADVANCED",
      pdfNeedsManualReview: pdfStatus === "unreadable" || pdfStatus === "error",
    },
  });
};

export const resendMatchingAlerts = async (
  deps: {
    repo: Repository;
    slack: SlackClient;
    config: Pick<
      Config,
      "MIN_BUDGET" | "MAX_BUDGET" | "ALERT_SCORE_THRESHOLD" | "TARGETED_ALERT_SCORE"
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
    .filter((row) =>
      shouldAlert(row, deps.config.ALERT_SCORE_THRESHOLD, deps.config.TARGETED_ALERT_SCORE),
    )
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

    const text = buildSlackText(row);
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
