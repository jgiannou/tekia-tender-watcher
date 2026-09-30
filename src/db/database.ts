import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const addColumnIfMissing = (
  db: Database.Database,
  table: string,
  column: string,
  definition: string,
) => {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{
    name: string;
  }>;
  if (cols.some((c) => c.name === column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
};

export const openDatabase = (databasePath: string): Database.Database => {
  mkdirSync(dirname(databasePath), { recursive: true });

  const db = new Database(databasePath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS tenders (
      reference_number TEXT PRIMARY KEY,
      record_type TEXT NOT NULL CHECK (record_type IN ('REQ', 'PROC')),
      title TEXT,
      organization TEXT,
      submission_date TEXT,
      signed_date TEXT,
      final_submission_date TEXT,
      budget_without_vat REAL,
      budget_with_vat REAL,
      cpvs TEXT,
      score INTEGER,
      stage TEXT,
      targeted_supplier INTEGER NOT NULL DEFAULT 0,
      non_invited_offers_rejected INTEGER NOT NULL DEFAULT 0,
      pdf_text_status TEXT,
      official_pdf_url TEXT,
      public_kimdis_url TEXT,
      score_reasons TEXT,
      first_seen_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      notified_at TEXT,
      raw_json TEXT
    );

    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS submissions (
      id TEXT PRIMARY KEY,
      tender_reference_number TEXT NOT NULL,
      submitted_at TEXT NOT NULL,
      submission_method TEXT NOT NULL,
      recipient TEXT,
      subject TEXT,
      amount_without_vat REAL,
      amount_with_vat REAL,
      attachments_json TEXT,
      external_reference TEXT,
      result TEXT NOT NULL DEFAULT 'PENDING'
        CHECK (result IN ('PENDING', 'WON', 'LOST')),
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (tender_reference_number) REFERENCES tenders(reference_number)
    );

    CREATE TABLE IF NOT EXISTS tender_events (
      id TEXT PRIMARY KEY,
      tender_reference_number TEXT NOT NULL,
      event_type TEXT NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (tender_reference_number) REFERENCES tenders(reference_number)
    );

    CREATE TABLE IF NOT EXISTS operator_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  // Migrate older DBs before creating indexes on new columns.
  addColumnIfMissing(db, "tenders", "web_relevant", "INTEGER NOT NULL DEFAULT 0");
  addColumnIfMissing(db, "tenders", "web_category", "TEXT");
  addColumnIfMissing(db, "tenders", "relevance_status", "TEXT");
  addColumnIfMissing(db, "tenders", "ignore_reason", "TEXT");
  addColumnIfMissing(db, "tenders", "review_reason", "TEXT");

  // Operator workflow fields
  addColumnIfMissing(
    db,
    "tenders",
    "current_status",
    "TEXT NOT NULL DEFAULT 'NEW'",
  );
  addColumnIfMissing(db, "tenders", "contact_name", "TEXT");
  addColumnIfMissing(db, "tenders", "contact_department", "TEXT");
  addColumnIfMissing(db, "tenders", "contact_email", "TEXT");
  addColumnIfMissing(db, "tenders", "contact_phone", "TEXT");
  addColumnIfMissing(db, "tenders", "submission_method", "TEXT");
  addColumnIfMissing(db, "tenders", "submission_email", "TEXT");
  addColumnIfMissing(db, "tenders", "submission_portal", "TEXT");
  addColumnIfMissing(db, "tenders", "submission_instructions", "TEXT");
  addColumnIfMissing(db, "tenders", "scope_summary", "TEXT");
  addColumnIfMissing(db, "tenders", "document_checklist_json", "TEXT");
  addColumnIfMissing(db, "tenders", "drafts_json", "TEXT");
  addColumnIfMissing(db, "tenders", "approval_status", "TEXT");
  addColumnIfMissing(db, "tenders", "approval_snapshot_json", "TEXT");
  addColumnIfMissing(db, "tenders", "approved_at", "TEXT");

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_tenders_notified_at ON tenders(notified_at);
    CREATE INDEX IF NOT EXISTS idx_tenders_score ON tenders(score);
    CREATE INDEX IF NOT EXISTS idx_tenders_relevance_status ON tenders(relevance_status);
    CREATE INDEX IF NOT EXISTS idx_tenders_current_status ON tenders(current_status);
    CREATE INDEX IF NOT EXISTS idx_submissions_tender ON submissions(tender_reference_number);
    CREATE INDEX IF NOT EXISTS idx_submissions_result ON submissions(result);
    CREATE INDEX IF NOT EXISTS idx_tender_events_tender ON tender_events(tender_reference_number);
    CREATE INDEX IF NOT EXISTS idx_tender_events_created ON tender_events(created_at);
  `);

  return db;
};
