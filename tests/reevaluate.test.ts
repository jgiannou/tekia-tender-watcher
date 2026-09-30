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

  it("marks broad CPV-only rows irrelevant and keeps website rows alertable", async () => {
    const db = openDatabase(dbPath);
    const repo = createRepository(db);
    const now = new Date().toISOString();

    repo.upsertNewOrTouch({
      referenceNumber: "26REQ_NOISE",
      recordType: "REQ",
      title: "Συντήρηση λογισμικού Η/Υ",
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
      rawJson: {},
      nowIso: now,
    });

    repo.upsertNewOrTouch({
      referenceNumber: "26REQ_WEB",
      recordType: "REQ",
      title: "Αναβάθμιση ιστοσελίδας και CMS WordPress",
      organization: "Δήμος Β",
      submissionDate: now,
      signedDate: null,
      finalSubmissionDate: null,
      budgetWithoutVat: 9000,
      budgetWithVat: 11160,
      cpvs: ["72413000-8"],
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
      rawJson: {},
      nowIso: now,
    });

    const stats = reevaluateStoredTenders(repo, baseConfig);
    expect(stats.total).toBe(2);
    expect(stats.irrelevant).toBeGreaterThanOrEqual(1);
    expect(stats.relevant).toBeGreaterThanOrEqual(1);
    expect(stats.alertCandidates).toBeGreaterThanOrEqual(1);

    const noise = repo.findByAdam("26REQ_NOISE");
    expect(noise?.relevance_status).toBe("IRRELEVANT");
    expect(noise?.score).toBe(0);

    const web = repo.findByAdam("26REQ_WEB");
    expect(web?.web_relevant).toBe(1);
    expect((web?.score ?? 0) >= 60).toBe(true);

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
      { dryRun: true, force: true, limit: 10 },
    );

    expect(dry.dryRun).toBe(true);
    expect(dry.sent).toBe(0);
    expect(dry.samples.length).toBeGreaterThanOrEqual(1);
    expect(sent).toHaveLength(0);

    const live = await resendMatchingAlerts(
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
      { force: true, limit: 10 },
    );

    expect(live.sent).toBeGreaterThanOrEqual(1);
    expect(sent.length).toBe(live.sent);
    expect(repo.wasNotified("26REQ_WEB")).toBe(true);

    db.close();
  });
});
