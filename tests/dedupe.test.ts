import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "../src/db/database.js";
import { createRepository } from "../src/db/repository.js";

describe("dedupe", () => {
  let dir: string;
  let dbPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "tekia-tender-"));
    dbPath = join(dir, "tenders.db");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("same ADAM does not notify twice", () => {
    const db = openDatabase(dbPath);
    const repo = createRepository(db);
    const adam = "26REQ019870224";
    const now = new Date().toISOString();

    const first = repo.upsertNewOrTouch({
      referenceNumber: adam,
      recordType: "REQ",
      title: "Website",
      organization: "Δήμος",
      submissionDate: now,
      signedDate: null,
      finalSubmissionDate: null,
      budgetWithoutVat: 8000,
      budgetWithVat: 9920,
      cpvs: ["72413000-8"],
      score: 88,
      stage: "EARLY",
      targetedSupplier: false,
      nonInvitedOffersRejected: false,
      pdfTextStatus: "skipped",
      officialPdfUrl: "https://example.com/pdf",
      publicKimdisUrl: "https://example.com/public",
      scoreReasons: ["test"],
      webRelevant: true,
      webCategory: "WEBSITE",
      relevanceStatus: "RELEVANT",
      ignoreReason: null,
      reviewReason: null,
      rawJson: { referenceNumber: adam },
      nowIso: now,
    });

    expect(first.isNew).toBe(true);
    expect(repo.wasNotified(adam)).toBe(false);

    const marked = repo.markNotified(adam, now);
    expect(marked).toBe(true);
    expect(repo.wasNotified(adam)).toBe(true);

    const second = repo.upsertNewOrTouch({
      referenceNumber: adam,
      recordType: "REQ",
      title: "Website",
      organization: "Δήμος",
      submissionDate: now,
      signedDate: null,
      finalSubmissionDate: null,
      budgetWithoutVat: 8000,
      budgetWithVat: 9920,
      cpvs: ["72413000-8"],
      score: 88,
      stage: "EARLY",
      targetedSupplier: false,
      nonInvitedOffersRejected: false,
      pdfTextStatus: "skipped",
      officialPdfUrl: "https://example.com/pdf",
      publicKimdisUrl: "https://example.com/public",
      scoreReasons: ["test"],
      webRelevant: true,
      webCategory: "WEBSITE",
      relevanceStatus: "RELEVANT",
      ignoreReason: null,
      reviewReason: null,
      rawJson: { referenceNumber: adam },
      nowIso: new Date().toISOString(),
    });

    expect(second.isNew).toBe(false);
    expect(repo.wasNotified(adam)).toBe(true);

    // Second markNotified should be a no-op (already notified).
    const markedAgain = repo.markNotified(adam, new Date().toISOString());
    expect(markedAgain).toBe(false);

    db.close();
  });
});
