import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "../src/db/database.js";
import { createRepository } from "../src/db/repository.js";
import {
  reevaluateStoredTenders,
  resendMatchingAlerts,
} from "../src/jobs/reevaluate.js";

const baseConfig = {
  MIN_BUDGET: 1500,
  MAX_BUDGET: 30000,
  ALERT_SCORE_THRESHOLD: 60,
  TARGETED_ALERT_SCORE: 85,
};

describe("reevaluate + resend", () => {
  let dir: string;
  let dbPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "tekia-reeval-"));
    dbPath = join(dir, "tenders.db");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("reclassifies noise as ignored and website REQ as alertable without resending notified", async () => {
    const db = openDatabase(dbPath);
    const repo = createRepository(db);
    const now = new Date().toISOString();

    repo.upsertNewOrTouch({
      referenceNumber: "26REQ_NOISE",
      recordType: "REQ",
      title: "Συντήρηση εφαρμογών λογισμικού",
      organization: "Δήμος Α",
      submissionDate: now,
      signedDate: null,
      finalSubmissionDate: null,
      budgetWithoutVat: 8000,
      budgetWithVat: 9920,
      cpvs: ["72261000-2"],
      score: 70,
      stage: "EARLY",
      targetedSupplier: false,
      nonInvitedOffersRejected: false,
      pdfTextStatus: "skipped",
      officialPdfUrl: "https://example.com/pdf1",
      publicKimdisUrl: "https://example.com/public1",
      scoreReasons: ["old"],
      webRelevant: true,
      webCategory: "UNKNOWN",
      relevanceStatus: "RELEVANT",
      ignoreReason: null,
      reviewReason: null,
      rawJson: {},
      nowIso: now,
    });
    repo.markNotified("26REQ_NOISE", now);

    repo.upsertNewOrTouch({
      referenceNumber: "26REQ_PETA",
      recordType: "REQ",
      title: "Συντήρηση της ιστοσελίδας για την ΠΕΤΑ ΑΕ.",
      organization: "ΠΕΤΑ ΑΕ",
      submissionDate: now,
      signedDate: null,
      finalSubmissionDate: null,
      budgetWithoutVat: 3500,
      budgetWithVat: 4340,
      cpvs: [],
      score: 40,
      stage: "EARLY",
      targetedSupplier: false,
      nonInvitedOffersRejected: false,
      pdfTextStatus: "skipped",
      officialPdfUrl: "https://example.com/pdf2",
      publicKimdisUrl: "https://example.com/public2",
      scoreReasons: ["old"],
      webRelevant: false,
      webCategory: "UNKNOWN",
      relevanceStatus: "IRRELEVANT",
      ignoreReason: null,
      reviewReason: null,
      rawJson: {
        objectDetails: [
          { shortDescription: "Συντήρηση ιστοσελίδας και φιλοξενία CMS" },
        ],
      },
      nowIso: now,
    });

    const stats = reevaluateStoredTenders(repo, baseConfig);
    expect(stats.total).toBe(2);
    expect(stats.irrelevant).toBeGreaterThanOrEqual(1);
    expect(stats.relevant).toBeGreaterThanOrEqual(1);
    expect(stats.previouslyNotifiedNowSuppressed.length).toBeGreaterThanOrEqual(1);

    const noise = repo.findByAdam("26REQ_NOISE");
    expect(noise?.relevance_status).toBe("IRRELEVANT");
    expect(noise?.notified_at).toBeTruthy(); // preserved

    const peta = repo.findByAdam("26REQ_PETA");
    expect(peta?.web_relevant).toBe(1);
    // Title-only would be 75; description keyword adds +15 → 90
    expect(peta?.score).toBe(90);
    expect(JSON.parse(peta?.score_reasons ?? "[]")).toContain(
      "Strong web keyword in description",
    );

    const sent: string[] = [];
    const dry = await resendMatchingAlerts(
      {
        repo,
        slack: {
          sendText: async (text) => {
            sent.push(text);
            return true;
          },
        },
        config: baseConfig,
      },
      { dryRun: true, force: false, limit: 10 },
    );

    expect(dry.dryRun).toBe(true);
    expect(dry.sent).toBe(0);
    expect(sent).toHaveLength(0);

    db.close();
  });
});
