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
  type DraftPackage,
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
import {
  deriveReqMonitoringState,
  isActivelyMonitored,
  isClosedMonitoringState,
  isFormalOpportunityState,
  isOutreachSent,
} from "../operator/outreach-monitoring.js";

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
  parent_tender_id: string | null;
  relation_candidate_id: string | null;
  relation_confidence: string | null;
  relation_method: string | null;
  relation_score: number | null;
  relation_reasons_json: string | null;
  invitation_type: string | null;
  invited_vendor_name: string | null;
  our_invitation_status: string | null;
  classification_version: number | null;
  source_fingerprint: string | null;
  alert_eligibility_reason: string | null;
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
  classificationVersion?: number | null;
  sourceFingerprint?: string | null;
  alertEligibilityReason?: string | null;
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
  | "proc"
  | "outreach_sent"
  | "monitored"
  | "formal"
  | "closed";

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

type OutreachLedgerRow = {
  reference_number: string;
  status: string;
  subject: string | null;
  body: string | null;
  notes: string | null;
  recipient: string | null;
  sent_at: string | null;
  updated_at: string;
  payload_json: string | null;
};

const outreachFromLedgerRow = (row: OutreachLedgerRow): DraftPackage => {
  let payload: Partial<DraftPackage> = {};
  if (row.payload_json) {
    try {
      payload = JSON.parse(row.payload_json) as Partial<DraftPackage>;
    } catch {
      payload = {};
    }
  }
  return {
    status: (row.status as DraftPackage["status"]) || "NOT_STARTED",
    subject: row.subject ?? payload.subject ?? null,
    body: row.body ?? payload.body ?? null,
    notes: row.notes ?? payload.notes ?? null,
    recipient: row.recipient ?? payload.recipient ?? null,
    sentAt: row.sent_at ?? payload.sentAt ?? null,
    updatedAt: row.updated_at ?? payload.updatedAt ?? null,
    amountWithoutVat: payload.amountWithoutVat ?? null,
    attachments: payload.attachments ?? [],
  };
};

const mergeOutreachPreferSent = (
  fromTender: DraftPackage,
  fromLedger: DraftPackage | null,
): DraftPackage => {
  if (!fromLedger) return fromTender;
  const rank = (s: string | null | undefined) =>
    s === "SENT" ? 4 : s === "READY" ? 3 : s === "DRAFT" ? 2 : s === "NOT_STARTED" ? 1 : 0;
  if (rank(fromLedger.status) > rank(fromTender.status)) {
    return { ...fromTender, ...fromLedger };
  }
  if (rank(fromLedger.status) < rank(fromTender.status)) {
    return fromTender;
  }
  // Same status — prefer whichever has more content / newer timestamp
  const ledgerTs = Date.parse(fromLedger.updatedAt || fromLedger.sentAt || "");
  const tenderTs = Date.parse(fromTender.updatedAt || fromTender.sentAt || "");
  if (Number.isFinite(ledgerTs) && Number.isFinite(tenderTs) && ledgerTs > tenderTs) {
    return { ...fromTender, ...fromLedger };
  }
  if (
    !(fromTender.body || fromTender.subject) &&
    (fromLedger.body || fromLedger.subject)
  ) {
    return { ...fromTender, ...fromLedger };
  }
  return fromTender;
};

/** RELEVANT rows below this score are mostly penalised noise — hidden until touched. */
const MIN_LIST_SCORE = 20;

const isActionableOpportunity = (row: TenderRow): boolean => {
  const status = row.current_status ?? "NEW";
  if (status === "SUBMITTED" || status === "WON" || status === "LOST") {
    return false;
  }
  const operatorTouched =
    status !== "NEW" || parseDrafts(row.drafts_json).outreach.status !== "NOT_STARTED";
  if (operatorTouched) return true;
  if (row.relevance_status === "IRRELEVANT") return false;
  if (row.notified_at) return true;
  if (row.relevance_status === "RELEVANT") {
    return (row.score ?? 0) >= MIN_LIST_SCORE;
  }
  if (row.relevance_status === "NEEDS_REVIEW" && (row.score ?? 0) > 0) {
    return true;
  }
  return false;
};

/** REQ adam → PROC rows linked (parent) or proposed (candidate) for it. */
type ProcIndex = Map<string, TenderRow[]>;

const buildProcIndex = (allRows: TenderRow[]): ProcIndex => {
  const index: ProcIndex = new Map();
  const add = (reqAdam: string | null, proc: TenderRow) => {
    if (!reqAdam) return;
    const list = index.get(reqAdam) ?? [];
    if (!list.includes(proc)) list.push(proc);
    index.set(reqAdam, list);
  };
  for (const row of allRows) {
    if (row.record_type !== "PROC") continue;
    add(row.parent_tender_id, row);
    add(row.relation_candidate_id, row);
  }
  return index;
};

const linkedProcSummariesForReq = (reqAdam: string, procIndex: ProcIndex) =>
  (procIndex.get(reqAdam) ?? []).map((proc) => ({
      referenceNumber: proc.reference_number,
      linked: proc.parent_tender_id === reqAdam,
      possible:
        proc.relation_candidate_id === reqAdam && !proc.parent_tender_id,
      invitationType: proc.invitation_type,
      ourInvitationStatus: proc.our_invitation_status,
    }));

const reqMonitoringState = (row: TenderRow, procIndex: ProcIndex) =>
  deriveReqMonitoringState({
    outreachStatus: parseDrafts(row.drafts_json).outreach.status,
    linkedProcs: linkedProcSummariesForReq(row.reference_number, procIndex),
  });

const matchesOpportunityFilter = (
  row: TenderRow,
  filter: OpportunityFilter,
  procIndex: ProcIndex,
): boolean => {
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
    case "outreach_sent":
    case "monitored": {
      if (row.record_type !== "REQ") return false;
      if (!isOutreachSent(parseDrafts(row.drafts_json).outreach)) return false;
      return isActivelyMonitored(reqMonitoringState(row, procIndex));
    }
    case "formal": {
      if (row.record_type === "PROC") {
        return (
          row.invitation_type === "OPEN" ||
          row.our_invitation_status === "INVITED"
        );
      }
      if (row.record_type !== "REQ") return false;
      return isFormalOpportunityState(reqMonitoringState(row, procIndex));
    }
    case "closed": {
      if (row.record_type === "PROC") {
        return (
          row.invitation_type === "TARGETED" &&
          row.our_invitation_status === "NOT_INVITED"
        );
      }
      if (row.record_type !== "REQ") return false;
      return isClosedMonitoringState(reqMonitoringState(row, procIndex));
    }
    default:
      return true;
  }
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

  const getOutreachLedger = db.prepare(
    "SELECT * FROM outreach_ledger WHERE reference_number = ?",
  );
  const upsertOutreachLedger = db.prepare(`
    INSERT INTO outreach_ledger (
      reference_number, status, subject, body, notes, recipient, sent_at, updated_at, payload_json
    ) VALUES (
      @reference_number, @status, @subject, @body, @notes, @recipient, @sent_at, @updated_at, @payload_json
    )
    ON CONFLICT(reference_number) DO UPDATE SET
      status = excluded.status,
      subject = excluded.subject,
      body = excluded.body,
      notes = excluded.notes,
      recipient = excluded.recipient,
      sent_at = excluded.sent_at,
      updated_at = excluded.updated_at,
      payload_json = excluded.payload_json
  `);

  const saveOutreachLedger = (adam: string, outreach: DraftPackage): void => {
    const updatedAt = outreach.updatedAt ?? new Date().toISOString();
    upsertOutreachLedger.run({
      reference_number: adam,
      status: outreach.status ?? "NOT_STARTED",
      subject: outreach.subject ?? null,
      body: outreach.body ?? null,
      notes: outreach.notes ?? null,
      recipient: outreach.recipient ?? null,
      sent_at: outreach.sentAt ?? null,
      updated_at: updatedAt,
      payload_json: JSON.stringify(outreach),
    });
  };

  const ledgerOutreachFor = (adam: string): DraftPackage | null => {
    const row = getOutreachLedger.get(adam) as OutreachLedgerRow | undefined;
    return row ? outreachFromLedgerRow(row) : null;
  };

  const resolveDrafts = (row: TenderRow): TenderDrafts => {
    const drafts = parseDrafts(row.drafts_json);
    const ledger = ledgerOutreachFor(row.reference_number);
    return {
      ...drafts,
      outreach: mergeOutreachPreferSent(drafts.outreach, ledger),
    };
  };

  const applyLedgerToTenderRow = (adam: string): void => {
    const ledger = ledgerOutreachFor(adam);
    if (!ledger) return;
    if (ledger.status === "NOT_STARTED" && !ledger.body && !ledger.subject) {
      return;
    }
    const existing = findByAdam.get(adam) as TenderRow | undefined;
    if (!existing) return;
    const drafts = parseDrafts(existing.drafts_json);
    const merged = mergeOutreachPreferSent(drafts.outreach, ledger);
    if (
      drafts.outreach.status === merged.status &&
      drafts.outreach.subject === merged.subject &&
      drafts.outreach.body === merged.body &&
      drafts.outreach.sentAt === merged.sentAt
    ) {
      return;
    }
    drafts.outreach = merged;
    const nextStatus =
      merged.status === "SENT" &&
      (existing.current_status === "NEW" || !existing.current_status)
        ? "REVIEW"
        : existing.current_status;
    db.prepare(
      `
      UPDATE tenders SET
        drafts_json = @drafts_json,
        current_status = @current_status
      WHERE reference_number = @reference_number
    `,
    ).run({
      reference_number: adam,
      drafts_json: JSON.stringify(drafts),
      current_status: nextStatus,
    });
  };

  const insertTender = db.prepare(`
    INSERT INTO tenders (
      reference_number, record_type, title, organization,
      submission_date, signed_date, final_submission_date,
      budget_without_vat, budget_with_vat, cpvs, score, stage,
      targeted_supplier, non_invited_offers_rejected, pdf_text_status,
      official_pdf_url, public_kimdis_url, score_reasons,
      web_relevant, web_category, relevance_status, ignore_reason, review_reason,
      current_status,
      classification_version, source_fingerprint, alert_eligibility_reason,
      first_seen_at, last_seen_at, notified_at, raw_json
    ) VALUES (
      @reference_number, @record_type, @title, @organization,
      @submission_date, @signed_date, @final_submission_date,
      @budget_without_vat, @budget_with_vat, @cpvs, @score, @stage,
      @targeted_supplier, @non_invited_offers_rejected, @pdf_text_status,
      @official_pdf_url, @public_kimdis_url, @score_reasons,
      @web_relevant, @web_category, @relevance_status, @ignore_reason, @review_reason,
      'NEW',
      @classification_version, @source_fingerprint, @alert_eligibility_reason,
      @first_seen_at, @last_seen_at, NULL, @raw_json
    )
  `);

  const touchSeen = db.prepare(`
    UPDATE tenders
    SET last_seen_at = @last_seen_at
    WHERE reference_number = @reference_number
  `);

  const updateClassification = db.prepare(`
    UPDATE tenders
    SET
      title = @title,
      organization = @organization,
      submission_date = @submission_date,
      signed_date = @signed_date,
      final_submission_date = @final_submission_date,
      budget_without_vat = @budget_without_vat,
      budget_with_vat = @budget_with_vat,
      cpvs = @cpvs,
      score = @score,
      stage = @stage,
      targeted_supplier = @targeted_supplier,
      non_invited_offers_rejected = @non_invited_offers_rejected,
      pdf_text_status = @pdf_text_status,
      official_pdf_url = @official_pdf_url,
      public_kimdis_url = @public_kimdis_url,
      score_reasons = @score_reasons,
      web_relevant = @web_relevant,
      web_category = @web_category,
      relevance_status = @relevance_status,
      ignore_reason = @ignore_reason,
      review_reason = @review_reason,
      classification_version = @classification_version,
      source_fingerprint = @source_fingerprint,
      alert_eligibility_reason = @alert_eligibility_reason,
      raw_json = @raw_json,
      last_seen_at = @last_seen_at
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
      classification_version = COALESCE(@classification_version, classification_version),
      source_fingerprint = COALESCE(@source_fingerprint, source_fingerprint),
      alert_eligibility_reason = COALESCE(@alert_eligibility_reason, alert_eligibility_reason),
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

  // List views never need the KIMDIS payload; skipping raw_json keeps them fast.
  const lightColumns = (
    db.prepare("PRAGMA table_info(tenders)").all() as Array<{ name: string }>
  )
    .map((col) => col.name)
    .filter((name) => name !== "raw_json")
    .join(", ");
  const listAllLight = db.prepare(
    `SELECT ${lightColumns}, NULL AS raw_json FROM tenders ORDER BY score DESC`,
  );

  const listProcsForReq = db.prepare(
    `SELECT ${lightColumns}, NULL AS raw_json FROM tenders
     WHERE record_type = 'PROC'
       AND (parent_tender_id = @adam OR relation_candidate_id = @adam)
     ORDER BY score DESC`,
  );

  const applyAllLedgerRows = (): void => {
    const ledgerAdams = db
      .prepare("SELECT reference_number FROM outreach_ledger")
      .all() as Array<{ reference_number: string }>;
    for (const row of ledgerAdams) {
      applyLedgerToTenderRow(row.reference_number);
    }
  };

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
        classification_version: input.classificationVersion ?? null,
        source_fingerprint: input.sourceFingerprint ?? null,
        alert_eligibility_reason: input.alertEligibilityReason ?? null,
        first_seen_at: input.nowIso,
        last_seen_at: input.nowIso,
        raw_json: JSON.stringify(input.rawJson),
      });

      addEvent(input.referenceNumber, "DETECTED", "Discovered by watcher", input.nowIso);

      // Re-apply durable early-outreach if this ADAM was recorded before a DB rebuild.
      applyLedgerToTenderRow(input.referenceNumber);

      return { isNew: true };
    },

    /** Full classify/score write for an existing ADAM (re-eval path). */
    updateExistingClassification: (input: UpsertTenderInput): void => {
      updateClassification.run({
        reference_number: input.referenceNumber,
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
        classification_version: input.classificationVersion ?? null,
        source_fingerprint: input.sourceFingerprint ?? null,
        alert_eligibility_reason: input.alertEligibilityReason ?? null,
        raw_json: JSON.stringify(input.rawJson),
        last_seen_at: input.nowIso,
      });
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
      classificationVersion?: number | null;
      sourceFingerprint?: string | null;
      alertEligibilityReason?: string | null;
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
        classification_version: input.classificationVersion ?? null,
        source_fingerprint: input.sourceFingerprint ?? null,
        alert_eligibility_reason: input.alertEligibilityReason ?? null,
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
    resolveDrafts,
    saveOutreachLedger,
    applyLedgerToTenderRow,
    parseChecklist,

    listOpportunities: (filter: OpportunityFilter = "all"): TenderRow[] => {
      // Ensure durable outreach ledger is reflected on tender rows before filtering.
      applyAllLedgerRows();

      const allRows = listAllLight.all() as TenderRow[];
      const procIndex = buildProcIndex(allRows);
      return allRows
        .filter(isActionableOpportunity)
        .filter((row) => matchesOpportunityFilter(row, filter, procIndex));
    },

    getOpportunityCounters: (): {
      new: number;
      ready: number;
      submittedThisMonth: number;
      pendingResult: number;
      outreachSent: number;
      monitored: number;
      formal: number;
      closed: number;
    } => {
      applyAllLedgerRows();

      const now = new Date();
      const monthPrefix = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

      const submissions = listSubmissions.all() as Array<
        SubmissionRow & { tender_title?: string }
      >;

      const allRows = listAllLight.all() as TenderRow[];
      const procIndex = buildProcIndex(allRows);
      const actionable = allRows.filter(isActionableOpportunity);

      return {
        new: actionable.filter((r) => (r.current_status ?? "NEW") === "NEW")
          .length,
        ready: actionable.filter((r) => r.current_status === "READY").length,
        submittedThisMonth: submissions.filter((s) =>
          s.submitted_at.startsWith(monthPrefix),
        ).length,
        pendingResult: submissions.filter((s) => s.result === "PENDING").length,
        outreachSent: actionable.filter(
          (r) =>
            r.record_type === "REQ" &&
            isOutreachSent(parseDrafts(r.drafts_json).outreach),
        ).length,
        monitored: actionable.filter((r) =>
          matchesOpportunityFilter(r, "monitored", procIndex),
        ).length,
        formal: actionable.filter((r) =>
          matchesOpportunityFilter(r, "formal", procIndex),
        ).length,
        closed: actionable.filter((r) =>
          matchesOpportunityFilter(r, "closed", procIndex),
        ).length,
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
      if (patch.drafts?.outreach) {
        saveOutreachLedger(adam, nextDrafts.outreach);
      }
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

    /**
     * Record that Early Outreach was sent manually outside the app.
     * Sets outreachStatus=SENT and starts monitoring — never sets SUBMITTED.
     */
    recordOutreachSent: (
      adam: string,
      input: {
        sentAt: string;
        recipient?: string | null;
        subject?: string | null;
        notes?: string | null;
      },
    ): TenderRow | undefined => {
      const existing = findByAdam.get(adam) as TenderRow | undefined;
      if (!existing) return undefined;

      const drafts = parseDrafts(existing.drafts_json);
      const recipient =
        input.recipient?.trim() ||
        existing.contact_email?.trim() ||
        null;

      drafts.outreach = {
        ...drafts.outreach,
        status: "SENT",
        subject:
          input.subject?.trim() ||
          drafts.outreach.subject ||
          null,
        notes: input.notes?.trim() || drafts.outreach.notes || null,
        sentAt: input.sentAt,
        recipient,
        updatedAt: new Date().toISOString(),
      };

      saveOutreachLedger(adam, drafts.outreach);

      const nextStatus =
        existing.current_status === "NEW" || !existing.current_status
          ? "REVIEW"
          : existing.current_status === "SUBMITTED"
            ? "REVIEW"
            : existing.current_status;

      db.prepare(
        `
        UPDATE tenders SET
          drafts_json = @drafts_json,
          current_status = @current_status
        WHERE reference_number = @reference_number
      `,
      ).run({
        reference_number: adam,
        drafts_json: JSON.stringify(drafts),
        current_status: nextStatus,
      });

      addEvent(
        adam,
        "OUTREACH_SENT",
        `Η Εκδήλωση Ενδιαφέροντος στάλθηκε${
          recipient ? ` προς ${recipient}` : ""
        }`,
        input.sentAt,
      );
      addEvent(
        adam,
        "MONITORING_STARTED",
        "Παρακολούθηση ενεργή — αναμονή σχετικής πρόσκλησης",
        input.sentAt,
      );

      if (nextStatus === "REVIEW" && existing.current_status !== "REVIEW") {
        addEvent(adam, "REVIEWED", "Moved to review after outreach sent");
      }

      return findByAdam.get(adam) as TenderRow;
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

    listRecentReqs: (limit = 200): TenderRow[] => {
      const rows = listAll.all() as TenderRow[];
      return rows
        .filter((r) => r.record_type === "REQ")
        .sort((a, b) =>
          String(b.submission_date ?? b.first_seen_at).localeCompare(
            String(a.submission_date ?? a.first_seen_at),
          ),
        )
        .slice(0, limit);
    },

    listLinkedProcsForReq: (reqAdam: string): TenderRow[] =>
      listProcsForReq.all({ adam: reqAdam }) as TenderRow[],

    updateRelationAndInvitation: (
      adam: string,
      patch: {
        parentTenderId?: string | null;
        relationCandidateId?: string | null;
        relationConfidence?: string | null;
        relationMethod?: string | null;
        relationScore?: number | null;
        relationReasons?: Array<{ points: number; label: string }> | null;
        invitationType?: string | null;
        invitedVendorName?: string | null;
        ourInvitationStatus?: string | null;
      },
    ): TenderRow | undefined => {
      const existing = findByAdam.get(adam) as TenderRow | undefined;
      if (!existing) return undefined;

      db.prepare(
        `
        UPDATE tenders SET
          parent_tender_id = @parent_tender_id,
          relation_candidate_id = @relation_candidate_id,
          relation_confidence = @relation_confidence,
          relation_method = @relation_method,
          relation_score = @relation_score,
          relation_reasons_json = @relation_reasons_json,
          invitation_type = @invitation_type,
          invited_vendor_name = @invited_vendor_name,
          our_invitation_status = @our_invitation_status
        WHERE reference_number = @reference_number
      `,
      ).run({
        reference_number: adam,
        parent_tender_id:
          patch.parentTenderId !== undefined
            ? patch.parentTenderId
            : existing.parent_tender_id,
        relation_candidate_id:
          patch.relationCandidateId !== undefined
            ? patch.relationCandidateId
            : existing.relation_candidate_id,
        relation_confidence:
          patch.relationConfidence !== undefined
            ? patch.relationConfidence
            : existing.relation_confidence,
        relation_method:
          patch.relationMethod !== undefined
            ? patch.relationMethod
            : existing.relation_method,
        relation_score:
          patch.relationScore !== undefined
            ? patch.relationScore
            : existing.relation_score,
        relation_reasons_json:
          patch.relationReasons !== undefined
            ? patch.relationReasons
              ? JSON.stringify(patch.relationReasons)
              : null
            : existing.relation_reasons_json,
        invitation_type:
          patch.invitationType !== undefined
            ? patch.invitationType
            : existing.invitation_type,
        invited_vendor_name:
          patch.invitedVendorName !== undefined
            ? patch.invitedVendorName
            : existing.invited_vendor_name,
        our_invitation_status:
          patch.ourInvitationStatus !== undefined
            ? patch.ourInvitationStatus
            : existing.our_invitation_status,
      });

      return findByAdam.get(adam) as TenderRow;
    },

    confirmProcRelation: (procAdam: string): TenderRow | undefined => {
      const proc = findByAdam.get(procAdam) as TenderRow | undefined;
      if (!proc || proc.record_type !== "PROC") return undefined;
      const parent = proc.relation_candidate_id ?? proc.parent_tender_id;
      if (!parent) return undefined;

      db.prepare(
        `
        UPDATE tenders SET
          parent_tender_id = @parent,
          relation_candidate_id = NULL,
          relation_confidence = 'HIGH',
          relation_method = 'MANUAL'
        WHERE reference_number = @adam
      `,
      ).run({ parent, adam: procAdam });

      addEvent(
        parent,
        "RELATION_CONFIRMED",
        `Operator confirmed link to PROC ${procAdam}`,
      );
      addEvent(
        procAdam,
        "RELATION_CONFIRMED",
        `Operator confirmed parent REQ ${parent}`,
      );

      return findByAdam.get(procAdam) as TenderRow;
    },

    dismissProcRelation: (procAdam: string): TenderRow | undefined => {
      const proc = findByAdam.get(procAdam) as TenderRow | undefined;
      if (!proc || proc.record_type !== "PROC") return undefined;
      const candidate = proc.relation_candidate_id;

      db.prepare(
        `
        UPDATE tenders SET
          parent_tender_id = NULL,
          relation_candidate_id = NULL,
          relation_confidence = NULL,
          relation_method = NULL,
          relation_score = NULL,
          relation_reasons_json = NULL
        WHERE reference_number = @adam
      `,
      ).run({ adam: procAdam });

      if (candidate) {
        addEvent(
          procAdam,
          "RELATION_DISMISSED",
          `Operator dismissed possible link to REQ ${candidate}`,
        );
      }

      return findByAdam.get(procAdam) as TenderRow;
    },
  };
};

export type Repository = ReturnType<typeof createRepository>;
