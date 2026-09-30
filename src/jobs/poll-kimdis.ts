import type { Config } from "../config.js";
import type { KimdisClient } from "../kimdis/client.js";
import { lookbackWindow } from "../kimdis/client.js";
import type {
  KimdisNoticeRecord,
  KimdisObjectDetail,
  KimdisRequestRecord,
  RecordType,
} from "../kimdis/types.js";
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
import { extractPdfText, type PdfTextStatus } from "../pdf/extract-text.js";
import { classifyPdfText } from "../pdf/classify.js";
import type { Repository } from "../db/repository.js";
import type { SlackClient } from "../slack/client.js";
import {
  formatBootstrapMessage,
  formatSlackMessage,
} from "../slack/format-message.js";

export type PollResult = {
  fetched: number;
  newCount: number;
  matching: number;
  notified: number;
  bootstrap: boolean;
  durationMs: number;
};

const CONTRACT_TYPES = ["9", "14"] as const;

const collectCpvs = (details: KimdisObjectDetail[] | null | undefined): string[] => {
  const cpvs = new Set<string>();
  for (const detail of details ?? []) {
    for (const cpv of detail.cpvs ?? []) {
      if (cpv.key) cpvs.add(String(cpv.key));
    }
  }
  return [...cpvs];
};

const collectDescription = (
  details: KimdisObjectDetail[] | null | undefined,
): string =>
  (details ?? [])
    .map((detail) => detail.shortDescription ?? "")
    .filter(Boolean)
    .join("\n");

const stageLabel = (
  recordType: RecordType,
  stage: string,
  isPrimary: boolean,
): string => {
  if (stage === "ALREADY_ADVANCED") return "Already advanced";
  if (stage === "TARGETED") return "Targeted invitation";
  if (stage === "EXPIRED") return "Expired";
  if (stage === "NEEDS_REVIEW") return "Needs review";
  if (recordType === "REQ" && isPrimary) return "Πρωτογενές Αίτημα";
  if (recordType === "PROC") return "Πρόσκληση / Διακήρυξη";
  return recordType;
};

type NormalizedRecord = {
  adam: string;
  recordType: RecordType;
  title: string;
  organization: string;
  submissionDate: string | null;
  signedDate: string | null;
  finalSubmissionDate: string | null;
  budgetWithoutVat: number | null;
  budgetWithVat: number | null;
  cpvs: string[];
  description: string;
  hasNoticeRef: boolean;
  isPrimaryRequest: boolean;
  raw: unknown;
};

const normalizeRequest = (record: KimdisRequestRecord): NormalizedRecord => ({
  adam: record.referenceNumber,
  recordType: "REQ",
  title: record.title?.trim() || "(no title)",
  organization: record.organization?.value?.trim() || "Unknown organization",
  submissionDate: record.submissionDate ?? null,
  signedDate: record.signedDate ?? null,
  finalSubmissionDate: null,
  budgetWithoutVat:
    typeof record.totalCostWithoutVAT === "number"
      ? record.totalCostWithoutVAT
      : null,
  budgetWithVat:
    typeof record.totalCostWithVAT === "number" ? record.totalCostWithVAT : null,
  cpvs: collectCpvs(record.objectDetails),
  description: collectDescription(record.objectDetails),
  hasNoticeRef: (record.noticeRefNo ?? []).length > 0,
  isPrimaryRequest: true,
  raw: record,
});

const normalizeNotice = (record: KimdisNoticeRecord): NormalizedRecord => ({
  adam: record.referenceNumber,
  recordType: "PROC",
  title: record.title?.trim() || "(no title)",
  organization: record.organization?.value?.trim() || "Unknown organization",
  submissionDate: record.submissionDate ?? null,
  signedDate: record.signedDate ?? null,
  finalSubmissionDate: record.finalSubmissionDate ?? null,
  budgetWithoutVat:
    typeof record.totalCostWithoutVAT === "number"
      ? record.totalCostWithoutVAT
      : null,
  budgetWithVat:
    typeof record.totalCostWithVAT === "number" ? record.totalCostWithVAT : null,
  cpvs: collectCpvs(record.objectDetails),
  description: collectDescription(record.objectDetails),
  hasNoticeRef: false,
  isPrimaryRequest: false,
  raw: record,
});

/** Lightweight pre-filter: skip PDF download for obvious non-web noise (REQ only). */
const maybeWorthPdf = (title: string, description: string, cpvs: string[]): boolean => {
  const gate = isWebRelevant({ title, description, cpvs });
  if (gate.isWebRelevant || gate.status === "NEEDS_REVIEW") return true;
  return gate.weakOnlySignals.length > 0 || gate.highConfidenceCpv;
};

export const createPollJob = (deps: {
  config: Config;
  kimdis: KimdisClient;
  repo: Repository;
  slack: SlackClient;
}) => {
  let running = false;

  const processRecord = async (
    record: NormalizedRecord,
    options: { bootstrap: boolean; sendAlerts: boolean },
  ): Promise<{ isNew: boolean; matching: boolean; notified: boolean }> => {
    const existing = deps.repo.findByAdam(record.adam);
    if (existing) {
      deps.repo.upsertNewOrTouch({
        referenceNumber: record.adam,
        recordType: record.recordType,
        title: record.title,
        organization: record.organization,
        submissionDate: record.submissionDate,
        signedDate: record.signedDate,
        finalSubmissionDate: record.finalSubmissionDate,
        budgetWithoutVat: record.budgetWithoutVat,
        budgetWithVat: record.budgetWithVat,
        cpvs: record.cpvs,
        score: existing.score ?? 0,
        stage: existing.stage ?? "UNKNOWN",
        targetedSupplier: Boolean(existing.targeted_supplier),
        nonInvitedOffersRejected: Boolean(existing.non_invited_offers_rejected),
        pdfTextStatus: (existing.pdf_text_status as PdfTextStatus) ?? "none",
        officialPdfUrl:
          existing.official_pdf_url ??
          deps.kimdis.pdfUrl(record.recordType, record.adam),
        publicKimdisUrl:
          existing.public_kimdis_url ?? deps.kimdis.publicUrl(record.adam),
        scoreReasons: [],
        webRelevant: Boolean(existing.web_relevant),
        webCategory: (existing.web_category as WebCategory) ?? "UNKNOWN",
        relevanceStatus: existing.relevance_status ?? "IRRELEVANT",
        ignoreReason: existing.ignore_reason,
        reviewReason: existing.review_reason,
        rawJson: record.raw,
        nowIso: new Date().toISOString(),
      });
      return { isNew: false, matching: false, notified: false };
    }

    let pdfText = "";
    let pdfTextStatus: PdfTextStatus = "skipped";
    let pdfClassification = classifyPdfText("");
    let stage = record.recordType === "REQ" ? "EARLY" : "UNKNOWN";

    const shouldFetchPdf =
      record.recordType === "PROC"
        ? maybeWorthPdf(record.title, record.description, record.cpvs)
        : maybeWorthPdf(record.title, record.description, record.cpvs);

    if (shouldFetchPdf) {
      try {
        const pdfBuffer = await deps.kimdis.downloadAttachment(
          record.recordType,
          record.adam,
        );
        const extracted = await extractPdfText(pdfBuffer);
        pdfTextStatus = extracted.status;
        if (extracted.status === "extracted") {
          pdfText = extracted.text;
          pdfClassification = classifyPdfText(extracted.text);
          if (pdfClassification.stage === "ALREADY_ADVANCED") {
            stage = "ALREADY_ADVANCED";
          } else if (record.recordType === "REQ") {
            stage = "EARLY";
          } else if (pdfClassification.targetedSupplier) {
            stage = "TARGETED";
          } else {
            stage = "OPEN_INVITATION";
          }
        }
      } catch (error) {
        pdfTextStatus = "error";
        console.warn(
          `pdf processing failed for ${record.adam}:`,
          error instanceof Error ? error.message : error,
        );
      }
    }

    // Hard web relevance gate (title + description + PDF)
    const relevance = isWebRelevant({
      title: record.title,
      description: record.description,
      cpvs: record.cpvs,
      pdfText,
    });

    let relevanceStatus: RelevanceStatus = relevance.status;
    let ignoreReason = relevance.ignoreReason;
    let reviewReason = relevance.reviewReason;
    let score = 0;
    let reasons: string[] = [];
    let scoreFlags = scoreOpportunity({
      recordType: record.recordType,
      title: record.title,
      description: record.description,
      cpvs: record.cpvs,
      budgetWithoutVat: record.budgetWithoutVat,
      minBudget: deps.config.MIN_BUDGET,
      maxBudget: deps.config.MAX_BUDGET,
      hasNoticeRef: record.hasNoticeRef,
      isPrimaryRequest: record.isPrimaryRequest,
      webCategory: relevance.category,
      mixedMarketing: relevance.mixedMarketing,
    }).flags;

    // PROC hard rules before Slack consideration
    if (record.recordType === "PROC" && relevance.isWebRelevant) {
      if (pdfTextStatus !== "extracted") {
        relevanceStatus = "NEEDS_REVIEW";
        reviewReason =
          "PROC PDF unreadable — recipient cannot be verified";
        ignoreReason = null;
        stage = "NEEDS_REVIEW";
      } else if (pdfClassification.targetedSupplier) {
        relevanceStatus = "TARGETED";
        ignoreReason = pdfClassification.nonInvitedOffersRejected
          ? "Non-invited offers explicitly rejected"
          : "Targeted invitation to specific supplier";
        reviewReason = null;
        stage = "TARGETED";
      } else if (isDeadlineInPast(record.finalSubmissionDate)) {
        relevanceStatus = "EXPIRED";
        ignoreReason = "Deadline already expired";
        reviewReason = null;
        stage = "EXPIRED";
      } else if (pdfClassification.stage === "ALREADY_ADVANCED") {
        relevanceStatus = "IRRELEVANT";
        ignoreReason = "Already advanced / award language in PDF";
        reviewReason = null;
        stage = "ALREADY_ADVANCED";
      }
    }

    if (record.recordType === "REQ" && record.hasNoticeRef) {
      // Linked notice means no longer truly early-stage
      stage = stage === "EARLY" ? "HAS_NOTICE" : stage;
    }

    if (
      relevanceStatus === "RELEVANT" &&
      relevance.isWebRelevant &&
      relevance.category !== "UNKNOWN"
    ) {
      const scored = scoreOpportunity({
        recordType: record.recordType,
        title: record.title,
        description: record.description,
        cpvs: record.cpvs,
        budgetWithoutVat: record.budgetWithoutVat,
        minBudget: deps.config.MIN_BUDGET,
        maxBudget: deps.config.MAX_BUDGET,
        hasNoticeRef: record.hasNoticeRef,
        isPrimaryRequest: record.isPrimaryRequest,
        webCategory: relevance.category,
        mixedMarketing: relevance.mixedMarketing,
        pdf: {
          alreadyAdvanced: pdfClassification.stage === "ALREADY_ADVANCED",
          targetedSupplier: pdfClassification.targetedSupplier,
          nonInvitedOffersRejected: pdfClassification.nonInvitedOffersRejected,
        },
      });
      score = scored.score;
      reasons = scored.reasons;
      scoreFlags = scored.flags;
    } else if (!relevance.isWebRelevant || relevanceStatus !== "RELEVANT") {
      score = 0;
      if (relevanceStatus === "NEEDS_REVIEW") {
        stage = stage === "UNKNOWN" || stage === "EARLY" ? "NEEDS_REVIEW" : stage;
        reasons = [reviewReason ?? ignoreReason ?? "Needs review"];
      } else if (relevanceStatus === "TARGETED" || relevanceStatus === "EXPIRED") {
        reasons = [ignoreReason ?? relevanceStatus];
      } else {
        stage =
          relevanceStatus === "IRRELEVANT"
            ? "IRRELEVANT"
            : stage;
        reasons = [ignoreReason ?? "Not web relevant"];
      }
    }

    const publicUrl = deps.kimdis.publicUrl(record.adam);
    const pdfUrl = deps.kimdis.pdfUrl(record.recordType, record.adam);
    const nowIso = new Date().toISOString();

    deps.repo.upsertNewOrTouch({
      referenceNumber: record.adam,
      recordType: record.recordType,
      title: record.title,
      organization: record.organization,
      submissionDate: record.submissionDate,
      signedDate: record.signedDate,
      finalSubmissionDate: record.finalSubmissionDate,
      budgetWithoutVat: record.budgetWithoutVat,
      budgetWithVat: record.budgetWithVat,
      cpvs: record.cpvs,
      score,
      stage,
      targetedSupplier: pdfClassification.targetedSupplier,
      nonInvitedOffersRejected: pdfClassification.nonInvitedOffersRejected,
      pdfTextStatus,
      officialPdfUrl: pdfUrl,
      publicKimdisUrl: publicUrl,
      scoreReasons: reasons,
      webRelevant: relevance.isWebRelevant && relevanceStatus === "RELEVANT",
      webCategory: relevance.category,
      relevanceStatus,
      ignoreReason,
      reviewReason,
      rawJson: record.raw,
      nowIso,
    });

    const eligibility = evaluateSlackEligibility({
      recordType: record.recordType,
      isWebRelevant: relevance.isWebRelevant && relevanceStatus === "RELEVANT",
      category: relevance.category,
      relevanceStatus,
      score,
      threshold: deps.config.ALERT_SCORE_THRESHOLD,
      hasNoticeRef: record.hasNoticeRef,
      alreadyAdvanced: pdfClassification.stage === "ALREADY_ADVANCED",
      targetedSupplier: pdfClassification.targetedSupplier,
      nonInvitedOffersRejected: pdfClassification.nonInvitedOffersRejected,
      pdfTextStatus,
      finalSubmissionDate: record.finalSubmissionDate,
    });

    const matching = eligibility.eligible;

    if (!matching || !options.sendAlerts || options.bootstrap) {
      return { isNew: true, matching, notified: false };
    }

    if (deps.repo.wasNotified(record.adam)) {
      return { isNew: true, matching, notified: false };
    }

    const budgetInRange =
      record.budgetWithoutVat != null &&
      record.budgetWithoutVat >= deps.config.MIN_BUDGET &&
      record.budgetWithoutVat <= deps.config.MAX_BUDGET;

    const text = formatSlackMessage({
      score,
      title: record.title,
      organization: record.organization,
      budgetWithoutVat: record.budgetWithoutVat,
      recordType: record.recordType,
      stageLabel: stageLabel(record.recordType, stage, record.isPrimaryRequest),
      webCategoryLabel: webCategorySlackLabel(relevance.category),
      cpvs: record.cpvs,
      submissionDate: record.submissionDate,
      finalSubmissionDate: record.finalSubmissionDate,
      publicUrl,
      pdfUrl,
      reasons,
      flags: {
        earlyStage: scoreFlags.earlyStage,
        hasLinkedNotice: scoreFlags.hasLinkedNotice,
        targetedSupplier: pdfClassification.targetedSupplier,
        nonInvitedOffersRejected: pdfClassification.nonInvitedOffersRejected,
        alreadyAdvanced: pdfClassification.stage === "ALREADY_ADVANCED",
        pdfNeedsManualReview: false, // never Slack unreadable PROC
        pdfVerified: record.recordType === "PROC" && pdfTextStatus === "extracted",
        budgetInRange,
      },
      targetedSupplierName: pdfClassification.targetedSupplierName,
    });

    const sent = await deps.slack.sendText(text);
    if (!sent) {
      return { isNew: true, matching, notified: false };
    }

    deps.repo.markNotified(record.adam, new Date().toISOString());
    return { isNew: true, matching, notified: true };
  };

  const run = async (): Promise<PollResult> => {
    if (running) {
      console.warn("poll skipped: already running");
      return {
        fetched: 0,
        newCount: 0,
        matching: 0,
        notified: 0,
        bootstrap: false,
        durationMs: 0,
      };
    }

    running = true;
    const started = Date.now();

    try {
      const bootstrap = !deps.repo.isBootstrapDone() && deps.repo.isEmpty();
      const sendAlerts = bootstrap ? deps.config.BOOTSTRAP_SEND_ALERTS : true;

      const { dateFrom, dateTo } = lookbackWindow(deps.config.LOOKBACK_HOURS);
      console.log(
        `poll started lookback=${deps.config.LOOKBACK_HOURS}h window=${dateFrom}..${dateTo} bootstrap=${bootstrap}`,
      );

      const records: NormalizedRecord[] = [];

      for (const contractType of CONTRACT_TYPES) {
        const requests = await deps.kimdis.searchRequests({
          dateFrom,
          dateTo,
          contractType,
          isInitial: true,
          isApproved: false,
          isApproval: false,
        });
        records.push(...requests.map(normalizeRequest));

        const notices = await deps.kimdis.searchNotices({
          dateFrom,
          dateTo,
          contractType,
        });
        records.push(...notices.map(normalizeNotice));
      }

      const unique = new Map<string, NormalizedRecord>();
      for (const record of records) {
        if (!record.adam) continue;
        if (!unique.has(record.adam)) unique.set(record.adam, record);
      }

      let newCount = 0;
      let matching = 0;
      let notified = 0;

      for (const record of unique.values()) {
        const result = await processRecord(record, { bootstrap, sendAlerts });
        if (result.isNew) newCount += 1;
        if (result.matching) matching += 1;
        if (result.notified) notified += 1;
      }

      if (bootstrap) {
        await deps.slack.sendText(formatBootstrapMessage());
        deps.repo.markBootstrapDone();
      } else if (!deps.repo.isBootstrapDone()) {
        deps.repo.markBootstrapDone();
      }

      deps.repo.setPollResult(true);

      const durationMs = Date.now() - started;
      console.log(
        `poll done fetched=${unique.size} new=${newCount} matching=${matching} notified=${notified} durationMs=${durationMs}`,
      );

      return {
        fetched: unique.size,
        newCount,
        matching,
        notified,
        bootstrap,
        durationMs,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      deps.repo.setPollResult(false, message);
      console.error("poll failed:", message);
      throw error;
    } finally {
      running = false;
    }
  };

  return { run, isRunning: () => running };
};

export type PollJob = ReturnType<typeof createPollJob>;
