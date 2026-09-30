import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type { RecordType } from "../kimdis/types.js";
import type { PdfTextStatus } from "../pdf/extract-text.js";
import type { RelevanceStatus, WebCategory } from "../filters/web-relevance.js";
import {
  DEFAULT_DOCUMENT_CHECKLIST,
  DEFAULT_DRAFTS,
  DEFAULT_OPERATOR_SETTINGS,
  type DocumentChecklistItem,
  type OperationalStatus,
  type OperatorSettings,
  type SubmissionMethod,
  type SubmissionResult,
  type TenderDrafts,
  type TenderEventType,
} from "../operator/types.js";
import {
  buildApprovalSnapshot,
  shouldInvalidateApproval,
} from "../operator/approval.js";

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
  review_reason: string | null;
  current_status: OperationalStatus | string;
  contact_name: string | null;
  contact_department: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  submission_method: string | null;
  submission_email: string | null;
  submission_portal: string | null;
  submission_instructions: string | null;
  scope_summary: string | null;
  document_checklist_json: string | null;
  drafts_json: string | null;
  approval_status: string | null;
  approval_snapshot_json: string | null;
  approved_at: string | null;
};

export type SubmissionRow = {
  id: string;
  tender_reference_number: string;
  submitted_at: string;
  submission_method: string;
  recipient: string | null;
  subject: string | null;
  amount_without_vat: number | null;
  amount_with_vat: number | null;
  attachments_json: string | null;
  external_reference: string | null;
  result: SubmissionResult | string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type TenderEventRow = {
  id: string;
  tender_reference_number: string;
  event_type: string;
  note: string | null;
  created_at: string;
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
  reviewReason: string | null;
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

export type OpportunityFilter =
  | "all"
  | "new"
  | "review"
  | "ready"
  | "req"
  | "proc";

export type CreateSubmissionInput = {
  tenderReferenceNumber: string;
  submittedAt: string;
  submissionMethod: SubmissionMethod;
  recipient?: string | null;
  subject?: string | null;
  amountWithoutVat?: number | null;
  amountWithVat?: number | null;
  attachments?: string[];
  externalReference?: string | null;
  notes?: string | null;
};

const parseDrafts = (raw: string | null): TenderDrafts => {
  if (!raw) return DEFAULT_DRAFTS();
  try {
    const parsed = JSON.parse(raw) as Partial<TenderDrafts>;
    const base = DEFAULT_DRAFTS();
    return {
      outreach: { ...base.outreach, ...(parsed.outreach ?? {}) },
      technical: { ...base.technical, ...(parsed.technical ?? {}) },
      economic: { ...base.economic, ...(parsed.economic ?? {}) },
      declarations: { ...base.declarations, ...(parsed.declarations ?? {}) },
    };
  } catch {
    return DEFAULT_DRAFTS();
  }
};

const isActionableOpportunity = (row: TenderRow): boolean => {
  const status = row.current_status ?? "NEW";
  if (status === "SUBMITTED" || status === "WON" || status === "LOST") {
    return false;
  }
  if (row.notified_at) return true;
  if (row.relevance_status === "RELEVANT") return true;
  if (row.relevance_status === "NEEDS_REVIEW" && (row.score ?? 0) > 0) {
    return true;
  }
  return false;
};

const parseChecklist = (raw: string | null): DocumentChecklistItem[] => {
  if (!raw) return DEFAULT_DOCUMENT_CHECKLIST();
  try {
    const parsed = JSON.parse(raw) as DocumentChecklistItem[];
    return Array.isArray(parsed) && parsed.length > 0
      ? parsed
      : DEFAULT_DOCUMENT_CHECKLIST();
  } catch {
    return DEFAULT_DOCUMENT_CHECKLIST();
  }
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
      web_relevant, web_category, relevance_status, ignore_reason, review_reason,
      current_status,
      first_seen_at, last_seen_at, notified_at, raw_json
    ) VALUES (
      @reference_number, @record_type, @title, @organization,
      @submission_date, @signed_date, @final_submission_date,
      @budget_without_vat, @budget_with_vat, @cpvs, @score, @stage,
      @targeted_supplier, @non_invited_offers_rejected, @pdf_text_status,
      @official_pdf_url, @public_kimdis_url, @score_reasons,
      @web_relevant, @web_category, @relevance_status, @ignore_reason, @review_reason,
      'NEW',
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
      review_reason = @review_reason,
      targeted_supplier = @targeted_supplier,
      non_invited_offers_rejected = @non_invited_offers_rejected,
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

  const insertEvent = db.prepare(`
    INSERT INTO tender_events (id, tender_reference_number, event_type, note, created_at)
    VALUES (@id, @tender_reference_number, @event_type, @note, @created_at)
  `);

  const listEvents = db.prepare(`
    SELECT * FROM tender_events
    WHERE tender_reference_number = ?
    ORDER BY created_at ASC
  `);

  const findSubmissionByTender = db.prepare(`
    SELECT * FROM submissions
    WHERE tender_reference_number = ?
    ORDER BY submitted_at DESC
    LIMIT 1
  `);

  const listSubmissions = db.prepare(`
    SELECT s.*, t.title AS tender_title, t.organization AS tender_organization,
           t.record_type AS tender_record_type
    FROM submissions s
    JOIN tenders t ON t.reference_number = s.tender_reference_number
    ORDER BY s.submitted_at DESC
  `);

  const insertSubmission = db.prepare(`
    INSERT INTO submissions (
      id, tender_reference_number, submitted_at, submission_method,
      recipient, subject, amount_without_vat, amount_with_vat,
      attachments_json, external_reference, result, notes, created_at, updated_at
    ) VALUES (
      @id, @tender_reference_number, @submitted_at, @submission_method,
      @recipient, @subject, @amount_without_vat, @amount_with_vat,
      @attachments_json, @external_reference, 'PENDING', @notes, @created_at, @updated_at
    )
  `);

  const updateTenderStatus = db.prepare(`
    UPDATE tenders SET current_status = @current_status
    WHERE reference_number = @reference_number
  `);

  const updateSubmissionResult = db.prepare(`
    UPDATE submissions
    SET result = @result, updated_at = @updated_at
    WHERE id = @id
  `);

  const getSetting = db.prepare(
    "SELECT value FROM operator_settings WHERE key = ?",
  );
  const upsertSetting = db.prepare(`
    INSERT INTO operator_settings (key, value, updated_at)
    VALUES (@key, @value, @updated_at)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `);

  const addEvent = (
    adam: string,
    eventType: TenderEventType,
    note?: string | null,
    createdAt?: string,
  ): TenderEventRow => {
    const row: TenderEventRow = {
      id: randomUUID(),
      tender_reference_number: adam,
      event_type: eventType,
      note: note ?? null,
      created_at: createdAt ?? new Date().toISOString(),
    };
    insertEvent.run(row);
    return row;
  };

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
        review_reason: input.reviewReason,
        first_seen_at: input.nowIso,
        last_seen_at: input.nowIso,
        raw_json: JSON.stringify(input.rawJson),
      });

      addEvent(input.referenceNumber, "DETECTED", "Discovered by watcher", input.nowIso);

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
      reviewReason: string | null;
      targetedSupplier?: boolean;
      nonInvitedOffersRejected?: boolean;
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
        review_reason: input.reviewReason,
        targeted_supplier: input.targetedSupplier ? 1 : 0,
        non_invited_offers_rejected: input.nonInvitedOffersRejected ? 1 : 0,
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

    parseDrafts,
    parseChecklist,

    listOpportunities: (filter: OpportunityFilter = "all"): TenderRow[] => {
      const actionable = (listAll.all() as TenderRow[]).filter(isActionableOpportunity);

      return actionable.filter((row) => {
        const status = (row.current_status ?? "NEW").toUpperCase();
        switch (filter) {
          case "new":
            return status === "NEW";
          case "review":
            return status === "REVIEW";
          case "ready":
            return status === "READY";
          case "req":
            return row.record_type === "REQ";
          case "proc":
            return row.record_type === "PROC";
          default:
            return true;
        }
      });
    },

    getOpportunityCounters: (): {
      new: number;
      ready: number;
      submittedThisMonth: number;
      pendingResult: number;
    } => {
      const now = new Date();
      const monthPrefix = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

      const submissions = listSubmissions.all() as Array<
        SubmissionRow & { tender_title?: string }
      >;

      const actionable = (listAll.all() as TenderRow[]).filter(
        isActionableOpportunity,
      );

      return {
        new: actionable.filter((r) => (r.current_status ?? "NEW") === "NEW")
          .length,
        ready: actionable.filter((r) => r.current_status === "READY").length,
        submittedThisMonth: submissions.filter((s) =>
          s.submitted_at.startsWith(monthPrefix),
        ).length,
        pendingResult: submissions.filter((s) => s.result === "PENDING").length,
      };
    },

    listEvents: (adam: string): TenderEventRow[] =>
      listEvents.all(adam) as TenderEventRow[],

    addEvent,

    getSubmissionForTender: (adam: string): SubmissionRow | undefined =>
      findSubmissionByTender.get(adam) as SubmissionRow | undefined,

    listSubmissions: (resultFilter?: SubmissionResult | "all"): Array<
      SubmissionRow & {
        tender_title: string | null;
        tender_organization: string | null;
        tender_record_type: string | null;
      }
    > => {
      const rows = listSubmissions.all() as Array<
        SubmissionRow & {
          tender_title: string | null;
          tender_organization: string | null;
          tender_record_type: string | null;
        }
      >;
      if (!resultFilter || resultFilter === "all") return rows;
      return rows.filter((r) => r.result === resultFilter);
    },

    updateOperationalStatus: (
      adam: string,
      status: OperationalStatus,
      options?: { note?: string | null; skipEvent?: boolean },
    ): TenderRow | undefined => {
      const existing = findByAdam.get(adam) as TenderRow | undefined;
      if (!existing) return undefined;

      updateTenderStatus.run({
        reference_number: adam,
        current_status: status,
      });

      if (!options?.skipEvent) {
        const eventMap: Partial<Record<OperationalStatus, TenderEventType>> = {
          REVIEW: "REVIEWED",
          READY: "READY",
          SUBMITTED: "SUBMITTED",
          WON: "WON",
          LOST: "LOST",
        };
        const eventType = eventMap[status];
        if (eventType) {
          addEvent(adam, eventType, options?.note ?? null);
        }
      }

      return findByAdam.get(adam) as TenderRow;
    },

    updateTenderOperatorFields: (
      adam: string,
      patch: {
        contact_name?: string | null;
        contact_department?: string | null;
        contact_email?: string | null;
        contact_phone?: string | null;
        submission_method?: string | null;
        submission_email?: string | null;
        submission_portal?: string | null;
        submission_instructions?: string | null;
        scope_summary?: string | null;
        document_checklist?: DocumentChecklistItem[];
        drafts?: TenderDrafts;
      },
    ): { tender: TenderRow; approvalInvalidated: boolean } | undefined => {
      const existing = findByAdam.get(adam) as TenderRow | undefined;
      if (!existing) return undefined;

      const nextDrafts = patch.drafts ?? parseDrafts(existing.drafts_json);
      const nextRecipient =
        patch.submission_email !== undefined
          ? patch.submission_email
          : existing.submission_email;

      let approvalInvalidated = false;
      if (
        shouldInvalidateApproval({
          approvalStatus: existing.approval_status,
          storedSnapshotJson: existing.approval_snapshot_json,
          recipient: nextRecipient,
          drafts: nextDrafts,
        })
      ) {
        approvalInvalidated = true;
      }

      const stmt = db.prepare(`
        UPDATE tenders SET
          contact_name = @contact_name,
          contact_department = @contact_department,
          contact_email = @contact_email,
          contact_phone = @contact_phone,
          submission_method = @submission_method,
          submission_email = @submission_email,
          submission_portal = @submission_portal,
          submission_instructions = @submission_instructions,
          scope_summary = @scope_summary,
          document_checklist_json = @document_checklist_json,
          drafts_json = @drafts_json,
          approval_status = @approval_status,
          approval_snapshot_json = @approval_snapshot_json,
          approved_at = @approved_at,
          current_status = @current_status
        WHERE reference_number = @reference_number
      `);

      const statusAfter =
        approvalInvalidated && existing.current_status === "READY"
          ? "READY"
          : existing.current_status;

      stmt.run({
        reference_number: adam,
        contact_name:
          patch.contact_name !== undefined
            ? patch.contact_name
            : existing.contact_name,
        contact_department:
          patch.contact_department !== undefined
            ? patch.contact_department
            : existing.contact_department,
        contact_email:
          patch.contact_email !== undefined
            ? patch.contact_email
            : existing.contact_email,
        contact_phone:
          patch.contact_phone !== undefined
            ? patch.contact_phone
            : existing.contact_phone,
        submission_method:
          patch.submission_method !== undefined
            ? patch.submission_method
            : existing.submission_method,
        submission_email: nextRecipient,
        submission_portal:
          patch.submission_portal !== undefined
            ? patch.submission_portal
            : existing.submission_portal,
        submission_instructions:
          patch.submission_instructions !== undefined
            ? patch.submission_instructions
            : existing.submission_instructions,
        scope_summary:
          patch.scope_summary !== undefined
            ? patch.scope_summary
            : existing.scope_summary,
        document_checklist_json: JSON.stringify(
          patch.document_checklist ?? parseChecklist(existing.document_checklist_json),
        ),
        drafts_json: JSON.stringify(nextDrafts),
        approval_status: approvalInvalidated ? null : existing.approval_status,
        approval_snapshot_json: approvalInvalidated
          ? null
          : existing.approval_snapshot_json,
        approved_at: approvalInvalidated ? null : existing.approved_at,
        current_status: statusAfter,
      });

      return {
        tender: findByAdam.get(adam) as TenderRow,
        approvalInvalidated,
      };
    },

    approveTender: (
      adam: string,
    ): { tender: TenderRow } | { error: string } => {
      const existing = findByAdam.get(adam) as TenderRow | undefined;
      if (!existing) return { error: "not_found" };
      if (existing.current_status !== "READY") {
        return { error: "must_be_ready" };
      }
      if (findSubmissionByTender.get(adam)) {
        return { error: "already_submitted" };
      }

      const drafts = parseDrafts(existing.drafts_json);
      const snapshot = buildApprovalSnapshot({
        recipient: existing.submission_email,
        drafts,
      });

      db.prepare(`
        UPDATE tenders SET
          approval_status = 'APPROVED',
          approval_snapshot_json = @approval_snapshot_json,
          approved_at = @approved_at
        WHERE reference_number = @reference_number
      `).run({
        reference_number: adam,
        approval_snapshot_json: JSON.stringify(snapshot),
        approved_at: new Date().toISOString(),
      });

      addEvent(adam, "APPROVED", "Operator approved package for send");
      return { tender: findByAdam.get(adam) as TenderRow };
    },

    recordSubmission: (
      input: CreateSubmissionInput,
    ):
      | { submission: SubmissionRow; tender: TenderRow }
      | { error: "not_found" | "already_submitted" } => {
      const existing = findByAdam.get(input.tenderReferenceNumber) as
        | TenderRow
        | undefined;
      if (!existing) return { error: "not_found" };

      const prior = findSubmissionByTender.get(input.tenderReferenceNumber) as
        | SubmissionRow
        | undefined;
      if (prior) return { error: "already_submitted" };

      const now = new Date().toISOString();
      const submission: SubmissionRow = {
        id: randomUUID(),
        tender_reference_number: input.tenderReferenceNumber,
        submitted_at: input.submittedAt,
        submission_method: input.submissionMethod,
        recipient: input.recipient ?? null,
        subject: input.subject ?? null,
        amount_without_vat: input.amountWithoutVat ?? null,
        amount_with_vat: input.amountWithVat ?? null,
        attachments_json: JSON.stringify(input.attachments ?? []),
        external_reference: input.externalReference ?? null,
        result: "PENDING",
        notes: input.notes ?? null,
        created_at: now,
        updated_at: now,
      };

      const tx = db.transaction(() => {
        insertSubmission.run(submission);
        updateTenderStatus.run({
          reference_number: input.tenderReferenceNumber,
          current_status: "SUBMITTED",
        });
        addEvent(
          input.tenderReferenceNumber,
          "SUBMITTED",
          `Recorded ${input.submissionMethod} submission`,
          now,
        );
      });
      tx();

      return {
        submission,
        tender: findByAdam.get(input.tenderReferenceNumber) as TenderRow,
      };
    },

    updateSubmissionResult: (
      id: string,
      result: SubmissionResult,
    ): SubmissionRow | undefined => {
      const row = db
        .prepare("SELECT * FROM submissions WHERE id = ?")
        .get(id) as SubmissionRow | undefined;
      if (!row) return undefined;

      const now = new Date().toISOString();
      updateSubmissionResult.run({ id, result, updated_at: now });

      if (result === "WON" || result === "LOST") {
        updateTenderStatus.run({
          reference_number: row.tender_reference_number,
          current_status: result,
        });
        addEvent(row.tender_reference_number, result, `Result: ${result}`, now);
      }

      return db.prepare("SELECT * FROM submissions WHERE id = ?").get(id) as
        | SubmissionRow
        | undefined;
    },

    getOperatorSettings: (): OperatorSettings => {
      const row = getSetting.get("operator") as { value: string } | undefined;
      if (!row?.value) return DEFAULT_OPERATOR_SETTINGS();
      try {
        const parsed = JSON.parse(row.value) as Partial<OperatorSettings>;
        const defaults = DEFAULT_OPERATOR_SETTINGS();
        return {
          company: { ...defaults.company, ...(parsed.company ?? {}) },
          drive: { ...defaults.drive, ...(parsed.drive ?? {}) },
          documents: parsed.documents?.length
            ? parsed.documents
            : defaults.documents,
        };
      } catch {
        return DEFAULT_OPERATOR_SETTINGS();
      }
    },

    saveOperatorSettings: (settings: OperatorSettings): OperatorSettings => {
      upsertSetting.run({
        key: "operator",
        value: JSON.stringify(settings),
        updated_at: new Date().toISOString(),
      });
      return settings;
    },
  };
};

export type Repository = ReturnType<typeof createRepository>;
