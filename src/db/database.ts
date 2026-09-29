import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

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

    CREATE INDEX IF NOT EXISTS idx_tenders_notified_at ON tenders(notified_at);
    CREATE INDEX IF NOT EXISTS idx_tenders_score ON tenders(score);
  `);

  return db;
};
