import type Database from "better-sqlite3";
import type { RecordType } from "../kimdis/types.js";
import type { PdfTextStatus } from "../pdf/extract-text.js";
import type { RelevanceStatus, WebCategory } from "../filters/web-relevance.js";

export type TenderRow = {
  reference_number: string;
  record_type: RecordType;
  title: string | null;
  organization: string | null;
  submission_date: string | null;
  signed_date: string | null;
  final_submission_date: string | null;
  budget_without_vat: number | null;
  budget_with_vat: number | null;
  cpvs: string | null;
  score: number | null;
  stage: string | null;
  targeted_supplier: number;
  non_invited_offers_rejected: number;
  pdf_text_status: PdfTextStatus | string | null;
  official_pdf_url: string | null;
  public_kimdis_url: string | null;
  score_reasons: string | null;
  first_seen_at: string;
  last_seen_at: string;
  notified_at: string | null;
  raw_json: string | null;
  web_relevant: number;
  web_category: WebCategory | string | null;
  relevance_status: RelevanceStatus | string | null;
  ignore_reason: string | null;
};

export type UpsertTenderInput = {
  referenceNumber: string;
  recordType: RecordType;
  title: string;
  organization: string;
  submissionDate: string | null;
  signedDate: string | null;
  finalSubmissionDate: string | null;
  budgetWithoutVat: number | null;
  budgetWithVat: number | null;
  cpvs: string[];
  score: number;
  stage: string;
  targetedSupplier: boolean;
  nonInvitedOffersRejected: boolean;
  pdfTextStatus: PdfTextStatus | string;
  officialPdfUrl: string;
  publicKimdisUrl: string;
  scoreReasons: string[];
  webRelevant: boolean;
  webCategory: WebCategory | string;
  relevanceStatus: RelevanceStatus | string;
  ignoreReason: string | null;
  rawJson: unknown;
  nowIso: string;
};

export type PollStats = {
  lastPollAt: string | null;
  lastPollSuccess: boolean;
  lastPollError: string | null;
  totalSeen: number;
  totalAlerts: number;
  bootstrapDone: boolean;
};

export const createRepository = (db: Database.Database) => {
  const getMeta = db.prepare("SELECT value FROM meta WHERE key = ?");
  const setMeta = db.prepare(
    `INSERT INTO meta (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  );

  const findByAdam = db.prepare(
    "SELECT * FROM tenders WHERE reference_number = ?",
  );

  const countAll = db.prepare("SELECT COUNT(*) AS count FROM tenders");
  const countAlerts = db.prepare(
    "SELECT COUNT(*) AS count FROM tenders WHERE notified_at IS NOT NULL",
  );

  const insertTender = db.prepare(`
    INSERT INTO tenders (
      reference_number, record_type, title, organization,
      submission_date, signed_date, final_submission_date,
      budget_without_vat, budget_with_vat, cpvs, score, stage,
      targeted_supplier, non_invited_offers_rejected, pdf_text_status,
      official_pdf_url, public_kimdis_url, score_reasons,
      web_relevant, web_category, relevance_status, ignore_reason,
      first_seen_at, last_seen_at, notified_at, raw_json
    ) VALUES (
      @reference_number, @record_type, @title, @organization,
      @submission_date, @signed_date, @final_submission_date,
      @budget_without_vat, @budget_with_vat, @cpvs, @score, @stage,
      @targeted_supplier, @non_invited_offers_rejected, @pdf_text_status,
      @official_pdf_url, @public_kimdis_url, @score_reasons,
      @web_relevant, @web_category, @relevance_status, @ignore_reason,
      @first_seen_at, @last_seen_at, NULL, @raw_json
    )
  `);

  const touchSeen = db.prepare(`
    UPDATE tenders
    SET last_seen_at = @last_seen_at
    WHERE reference_number = @reference_number
  `);

  const updateRelevance = db.prepare(`
    UPDATE tenders
    SET
      score = @score,
      stage = @stage,
      score_reasons = @score_reasons,
      web_relevant = @web_relevant,
      web_category = @web_category,
      relevance_status = @relevance_status,
      ignore_reason = @ignore_reason,
      last_seen_at = @last_seen_at
    WHERE reference_number = @reference_number
  `);

  const markNotified = db.prepare(`
    UPDATE tenders
    SET notified_at = @notified_at
    WHERE reference_number = @reference_number
      AND notified_at IS NULL
  `);

  const clearNotified = db.prepare(`
    UPDATE tenders
    SET notified_at = NULL
    WHERE reference_number = @reference_number
  `);

  const listAll = db.prepare("SELECT * FROM tenders ORDER BY score DESC");

  return {
    isEmpty: (): boolean => {
      const row = countAll.get() as { count: number };
      return row.count === 0;
    },

    findByAdam: (adam: string): TenderRow | undefined => {
      return findByAdam.get(adam) as TenderRow | undefined;
    },

    listAll: (): TenderRow[] => listAll.all() as TenderRow[],

    upsertNewOrTouch: (input: UpsertTenderInput): { isNew: boolean } => {
      const existing = findByAdam.get(input.referenceNumber) as
        | TenderRow
        | undefined;

      if (existing) {
        touchSeen.run({
          reference_number: input.referenceNumber,
          last_seen_at: input.nowIso,
        });
        return { isNew: false };
      }

      insertTender.run({
        reference_number: input.referenceNumber,
        record_type: input.recordType,
        title: input.title,
        organization: input.organization,
        submission_date: input.submissionDate,
        signed_date: input.signedDate,
        final_submission_date: input.finalSubmissionDate,
        budget_without_vat: input.budgetWithoutVat,
        budget_with_vat: input.budgetWithVat,
        cpvs: JSON.stringify(input.cpvs),
        score: input.score,
        stage: input.stage,
        targeted_supplier: input.targetedSupplier ? 1 : 0,
        non_invited_offers_rejected: input.nonInvitedOffersRejected ? 1 : 0,
        pdf_text_status: input.pdfTextStatus,
        official_pdf_url: input.officialPdfUrl,
        public_kimdis_url: input.publicKimdisUrl,
        score_reasons: JSON.stringify(input.scoreReasons),
        web_relevant: input.webRelevant ? 1 : 0,
        web_category: input.webCategory,
        relevance_status: input.relevanceStatus,
        ignore_reason: input.ignoreReason,
        first_seen_at: input.nowIso,
        last_seen_at: input.nowIso,
        raw_json: JSON.stringify(input.rawJson),
      });

      return { isNew: true };
    },

    updateRelevanceFields: (input: {
      referenceNumber: string;
      score: number;
      stage: string;
      scoreReasons: string[];
      webRelevant: boolean;
      webCategory: string;
      relevanceStatus: string;
      ignoreReason: string | null;
      nowIso: string;
    }): void => {
      updateRelevance.run({
        reference_number: input.referenceNumber,
        score: input.score,
        stage: input.stage,
        score_reasons: JSON.stringify(input.scoreReasons),
        web_relevant: input.webRelevant ? 1 : 0,
        web_category: input.webCategory,
        relevance_status: input.relevanceStatus,
        ignore_reason: input.ignoreReason,
        last_seen_at: input.nowIso,
      });
    },

    markNotified: (adam: string, notifiedAt: string): boolean => {
      const result = markNotified.run({
        reference_number: adam,
        notified_at: notifiedAt,
      });
      return result.changes > 0;
    },

    clearNotified: (adam: string): boolean => {
      const result = clearNotified.run({
        reference_number: adam,
      });
      return result.changes > 0;
    },

    wasNotified: (adam: string): boolean => {
      const row = findByAdam.get(adam) as TenderRow | undefined;
      return Boolean(row?.notified_at);
    },

    getPollStats: (): PollStats => {
      const lastPollAt =
        (getMeta.get("last_poll_at") as { value: string } | undefined)?.value ??
        null;
      const lastPollSuccessRaw = (
        getMeta.get("last_poll_success") as { value: string } | undefined
      )?.value;
      const lastPollError =
        (getMeta.get("last_poll_error") as { value: string } | undefined)
          ?.value ?? null;
      const bootstrapDone =
        ((getMeta.get("bootstrap_done") as { value: string } | undefined)
          ?.value ?? "false") === "true";

      return {
        lastPollAt,
        lastPollSuccess: lastPollSuccessRaw === "true",
        lastPollError,
        totalSeen: (countAll.get() as { count: number }).count,
        totalAlerts: (countAlerts.get() as { count: number }).count,
        bootstrapDone,
      };
    },

    setPollResult: (success: boolean, errorMessage?: string): void => {
      const now = new Date().toISOString();
      setMeta.run("last_poll_at", now);
      setMeta.run("last_poll_success", success ? "true" : "false");
      setMeta.run("last_poll_error", errorMessage ?? "");
    },

    markBootstrapDone: (): void => {
      setMeta.run("bootstrap_done", "true");
    },

    isBootstrapDone: (): boolean => {
      return (
        ((getMeta.get("bootstrap_done") as { value: string } | undefined)
          ?.value ?? "false") === "true"
      );
    },
  };
};

export type Repository = ReturnType<typeof createRepository>;
