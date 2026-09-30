import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase } from "../src/db/database.js";
import { createRepository } from "../src/db/repository.js";
import { createOperatorRoutes } from "../src/routes/operator.js";
import type { Config } from "../src/config.js";
import {
  CLOUD_EXTERNAL_SENDING_ENABLED,
  FORBIDDEN_CLOUD_SEND_SYMBOLS,
  assertCloudCannotSend,
} from "../src/security/no-external-send.js";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";

const TOKEN = "test-operator-token-32chars-min!!";

const baseConfig = {
  NODE_ENV: "test",
  PORT: 3000,
  DATABASE_PATH: "./data/test.db",
  POLL_INTERVAL_MINUTES: 5,
  LOOKBACK_HOURS: 24,
  MIN_BUDGET: 1500,
  MAX_BUDGET: 30000,
  ALERT_SCORE_THRESHOLD: 60,
  BOOTSTRAP_SEND_ALERTS: false,
  ADMIN_TOKEN: "admin-token-test",
  KIMDIS_BASE_URL: "https://cerpp.eprocurement.gov.gr",
  HTTP_TIMEOUT_MS: 30_000,
  PDF_SCORE_THRESHOLD: 45,
  TARGETED_ALERT_SCORE: 85,
  OPERATOR_API_TOKEN: TOKEN,
  LOCAL_DASHBOARD_URL: "http://localhost:5173",
  LOCAL_DASHBOARD_ORIGINS: ["http://localhost:5173"],
  databasePath: "./data/test.db",
} as Config;

const seedTender = (
  repo: ReturnType<typeof createRepository>,
  adam: string,
  extras?: { notified?: boolean; score?: number },
) => {
  repo.upsertNewOrTouch({
    referenceNumber: adam,
    recordType: "REQ",
    title: "Ιστοσελίδα δήμου",
    organization: "Δήμος Τεστ",
    submissionDate: "2026-09-29T10:00:00.000Z",
    signedDate: null,
    finalSubmissionDate: null,
    budgetWithoutVat: 8000,
    budgetWithVat: 9920,
    cpvs: ["72413000-8"],
    score: extras?.score ?? 80,
    stage: "EARLY",
    targetedSupplier: false,
    nonInvitedOffersRejected: false,
    pdfTextStatus: "none",
    officialPdfUrl: "https://example.com/pdf",
    publicKimdisUrl: "https://example.com/public",
    scoreReasons: ["Strong web keyword in title"],
    webRelevant: true,
    webCategory: "WEBSITE",
    relevanceStatus: "RELEVANT",
    ignoreReason: null,
    reviewReason: null,
    rawJson: {},
    nowIso: "2026-09-29T10:00:00.000Z",
  });
  if (extras?.notified !== false) {
    repo.markNotified(adam, "2026-09-29T10:05:00.000Z");
  }
};

describe("operator API + submission workflow", () => {
  let dir: string;
  let dbPath: string;
  let repo: ReturnType<typeof createRepository>;
  let app: ReturnType<typeof createOperatorRoutes>;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "tekia-ops-"));
    dbPath = join(dir, "tenders.db");
    const db = openDatabase(dbPath);
    repo = createRepository(db);
    app = createOperatorRoutes({
      operatorToken: TOKEN,
      allowedOrigins: ["http://localhost:5173"],
      config: { ...baseConfig, databasePath: dbPath },
      repo,
    });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const request = (
    path: string,
    init?: RequestInit & { token?: string | null },
  ) => {
    const headers = new Headers(init?.headers);
    if (init?.token !== null) {
      headers.set("X-Operator-Token", init?.token ?? TOKEN);
    }
    if (init?.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    return app.request(path, { ...init, headers });
  };

  it("rejects missing/invalid operator token", async () => {
    seedTender(repo, "26REQ1");

    const missing = await request("/api/operator/opportunities", { token: null });
    expect(missing.status).toBe(401);

    const invalid = await request("/api/operator/opportunities", {
      token: "wrong",
    });
    expect(invalid.status).toBe(401);
  });

  it("filters opportunities by operational status", async () => {
    seedTender(repo, "26REQ1");
    seedTender(repo, "26REQ2");
    repo.updateOperationalStatus("26REQ2", "READY");

    const all = await request("/api/operator/opportunities?filter=all");
    expect(all.status).toBe(200);
    const allBody = await all.json();
    expect(allBody.items).toHaveLength(2);

    const ready = await request("/api/operator/opportunities?filter=ready");
    const readyBody = await ready.json();
    expect(readyBody.items).toHaveLength(1);
    expect(readyBody.items[0].referenceNumber).toBe("26REQ2");

    const reqOnly = await request("/api/operator/opportunities?filter=req");
    const reqBody = await reqOnly.json();
    expect(reqBody.items.every((i: { recordType: string }) => i.recordType === "REQ")).toBe(
      true,
    );
  });

  it("does not treat tenders without Submission as submitted", async () => {
    seedTender(repo, "26REQ3");
    repo.updateOperationalStatus("26REQ3", "READY");

    const submitted = await request("/api/operator/submissions");
    const body = await submitted.json();
    expect(body.items).toHaveLength(0);

    const detail = await request("/api/operator/tenders/26REQ3");
    const tender = await detail.json();
    expect(tender.submission).toBeNull();
    expect(tender.currentStatus).not.toBe("SUBMITTED");
  });

  it("records submission, emits SUBMITTED event, and lists under Submitted", async () => {
    seedTender(repo, "26REQ4");

    const created = await request("/api/operator/tenders/26REQ4/submission", {
      method: "POST",
      body: JSON.stringify({
        submitted_at: "2026-09-30T12:00:00.000Z",
        submission_method: "EMAIL",
        recipient: "ops@example.gov.gr",
        amount_without_vat: 7500,
        external_reference: "MSG-1",
      }),
    });
    expect(created.status).toBe(201);
    const createdBody = await created.json();
    expect(createdBody.tender.currentStatus).toBe("SUBMITTED");
    expect(createdBody.tender.submission).toBeTruthy();

    const events = createdBody.tender.events.map(
      (e: { eventType: string }) => e.eventType,
    );
    expect(events).toContain("DETECTED");
    expect(events).toContain("SUBMITTED");

    const list = await request("/api/operator/submissions?result=pending");
    const listBody = await list.json();
    expect(listBody.items).toHaveLength(1);
    expect(listBody.items[0].referenceNumber).toBe("26REQ4");
  });

  it("blocks duplicate normal submission", async () => {
    seedTender(repo, "26REQ5");

    const first = await request("/api/operator/tenders/26REQ5/submission", {
      method: "POST",
      body: JSON.stringify({
        submitted_at: "2026-09-30T12:00:00.000Z",
        submission_method: "EMAIL",
        recipient: "a@example.com",
      }),
    });
    expect(first.status).toBe(201);

    const second = await request("/api/operator/tenders/26REQ5/submission", {
      method: "POST",
      body: JSON.stringify({
        submitted_at: "2026-09-30T13:00:00.000Z",
        submission_method: "EMAIL",
        recipient: "b@example.com",
      }),
    });
    expect(second.status).toBe(409);
    const body = await second.json();
    expect(body.error).toBe("already_submitted");
  });

  it("invalidates approval when material draft fields change", async () => {
    seedTender(repo, "26REQ6");
    repo.updateOperationalStatus("26REQ6", "READY");
    repo.updateTenderOperatorFields("26REQ6", {
      submission_email: "authority@example.gov.gr",
      drafts: {
        outreach: {
          status: "READY",
          subject: "Offer",
          body: "Body A",
          attachments: [],
        },
        technical: { status: "READY" },
        economic: { status: "READY", amountWithoutVat: 1000 },
        declarations: { status: "READY", body: "Decl A" },
      },
    });

    const approved = await request("/api/operator/tenders/26REQ6/approve", {
      method: "POST",
      body: "{}",
    });
    expect(approved.status).toBe(200);
    const approvedBody = await approved.json();
    expect(approvedBody.tender.approvalStatus).toBe("APPROVED");

    const patched = await request("/api/operator/tenders/26REQ6", {
      method: "PATCH",
      body: JSON.stringify({
        drafts: {
          outreach: {
            status: "READY",
            subject: "Offer",
            body: "Body B changed",
          },
        },
      }),
    });
    expect(patched.status).toBe(200);
    const patchedBody = await patched.json();
    expect(patchedBody.approvalInvalidated).toBe(true);
    expect(patchedBody.tender.approvalStatus).toBeNull();
  });

  it("rejects marking SUBMITTED via status endpoint without submission record", async () => {
    seedTender(repo, "26REQ7");
    const res = await request("/api/operator/tenders/26REQ7/status", {
      method: "PATCH",
      body: JSON.stringify({ status: "SUBMITTED" }),
    });
    expect(res.status).toBe(400);
  });

  it("keeps cloud external sending disabled and free of send symbols in src", () => {
    assertCloudCannotSend();
    expect(CLOUD_EXTERNAL_SENDING_ENABLED).toBe(false);

    const walk = (dirPath: string, files: string[] = []): string[] => {
      for (const entry of readdirSync(dirPath)) {
        const full = join(dirPath, entry);
        const st = statSync(full);
        if (st.isDirectory()) walk(full, files);
        else if (full.endsWith(".ts")) files.push(full);
      }
      return files;
    };

    const root = resolve(process.cwd(), "src");
    const files = walk(root).filter(
      (f) => !f.endsWith("no-external-send.ts"),
    );

    for (const file of files) {
      const content = readFileSync(file, "utf8");
      for (const symbol of FORBIDDEN_CLOUD_SEND_SYMBOLS) {
        expect(content.includes(`function ${symbol}`)).toBe(false);
        expect(content.includes(`const ${symbol}`)).toBe(false);
        expect(content.includes(`${symbol}(`)).toBe(false);
      }
    }
  });

  it("watcher opportunities listing works independently of dashboard process", async () => {
    // Cloud repo APIs remain usable without any local dashboard runtime.
    seedTender(repo, "26REQ8");
    const counters = repo.getOpportunityCounters();
    expect(counters.new).toBeGreaterThanOrEqual(1);
    const rows = repo.listOpportunities("all");
    expect(rows.some((r) => r.reference_number === "26REQ8")).toBe(true);
  });
});
