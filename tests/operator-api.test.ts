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
  let db: ReturnType<typeof openDatabase>;
  let repo: ReturnType<typeof createRepository>;
  let app: ReturnType<typeof createOperatorRoutes>;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "tekia-ops-"));
    dbPath = join(dir, "tenders.db");
    db = openDatabase(dbPath);
    repo = createRepository(db);
    app = createOperatorRoutes({
      operatorToken: TOKEN,
      adminToken: "admin-token-test-fallback-value",
      allowedOrigins: ["http://localhost:5173"],
      config: { ...baseConfig, databasePath: dbPath },
      repo,
    });
  });

  afterEach(() => {
    db.close();
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

  it("accepts ADMIN_TOKEN as operator fallback", async () => {
    seedTender(repo, "26REQ-ADMIN");
    const res = await request("/api/operator/config", {
      token: "admin-token-test-fallback-value",
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pollIntervalMinutes).toBeTypeOf("number");
  });

  it("accepts X-Admin-Token when X-Operator-Token is wrong", async () => {
    const res = await app.request("/api/operator/config", {
      headers: {
        "X-Operator-Token": "wrong-overwritten-by-proxy",
        "X-Admin-Token": "admin-token-test-fallback-value",
      },
    });
    expect(res.status).toBe(200);
  });

  it("filters opportunities by operational status", async () => {
    seedTender(repo, "26REQ1");
    seedTender(repo, "26REQ2");
    repo.updateOperationalStatus("26REQ2", "READY");

    const all = await request("/api/operator/opportunities?filter=all");
    expect(all.status).toBe(200);
    const allBody = await all.json();
    expect(allBody.items).toHaveLength(2);
    expect(allBody.items[0].publishedAt).toBe("2026-09-29T10:00:00.000Z");

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

  it("filters and surfaces early outreach sent status", async () => {
    seedTender(repo, "26REQ_OUT1");
    seedTender(repo, "26REQ_OUT2");
    repo.updateTenderOperatorFields("26REQ_OUT2", {
      drafts: {
        outreach: {
          status: "SENT",
          subject: "Εκδήλωση ενδιαφέροντος",
          body: "Στάλθηκε χειροκίνητα",
          sentAt: "2026-10-02T10:00:00.000Z",
          recipient: "info@peta.gr",
        },
        technical: { status: "NOT_STARTED" },
        economic: { status: "NOT_STARTED" },
        declarations: { status: "NOT_STARTED" },
      },
    });

    const all = await request("/api/operator/opportunities?filter=all");
    const allBody = await all.json();
    const sentItem = allBody.items.find(
      (i: { referenceNumber: string }) => i.referenceNumber === "26REQ_OUT2",
    );
    const pendingItem = allBody.items.find(
      (i: { referenceNumber: string }) => i.referenceNumber === "26REQ_OUT1",
    );
    expect(sentItem?.outreachStatus).toBe("SENT");
    expect(sentItem?.monitoringState).toBe("WAITING_FOR_INVITATION");
    expect(sentItem?.watchForRelatedProc).toBe(true);
    expect(pendingItem?.outreachStatus).toBe("NOT_STARTED");
    expect(allBody.counters.outreachSent).toBeGreaterThanOrEqual(1);
    expect(allBody.counters.monitored).toBeGreaterThanOrEqual(1);

    const sent = await request("/api/operator/opportunities?filter=monitored");
    const sentBody = await sent.json();
    expect(sentBody.items).toHaveLength(1);
    expect(sentBody.items[0].referenceNumber).toBe("26REQ_OUT2");
    expect(sentBody.items[0].outreachStatus).toBe("SENT");
    expect(sentBody.items[0].outreachRecipient).toBe("info@peta.gr");
  });

  it("records outreach SENT without setting tender SUBMITTED", async () => {
    seedTender(repo, "26REQ019873897");
    repo.updateTenderOperatorFields("26REQ019873897", {
      contact_email: "info@peta.gr",
      drafts: {
        outreach: {
          status: "READY",
          subject: "Εκδήλωση ενδιαφέροντος — ΠΕΤΑ",
        },
        technical: { status: "NOT_STARTED" },
        economic: { status: "NOT_STARTED" },
        declarations: { status: "NOT_STARTED" },
      },
    });

    const res = await request(
      "/api/operator/tenders/26REQ019873897/outreach/send",
      {
        method: "POST",
        body: JSON.stringify({
          sentAt: "2026-10-02T09:30:00.000Z",
          subject: "Εκδήλωση ενδιαφέροντος — ΠΕΤΑ",
          notes: "Στάλθηκε χειροκίνητα",
        }),
      },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tender.drafts.outreach.status).toBe("SENT");
    expect(body.tender.drafts.outreach.sentAt).toBe("2026-10-02T09:30:00.000Z");
    expect(body.tender.drafts.outreach.recipient).toBe("info@peta.gr");
    expect(body.tender.currentStatus).not.toBe("SUBMITTED");
    expect(body.tender.monitoring.watchForRelatedProc).toBe(true);
    expect(body.tender.monitoring.state).toBe("WAITING_FOR_INVITATION");
    expect(body.tender.monitoring.stateLabel).toBe("Αναμονή πρόσκλησης");
    const types = body.tender.events.map((e: { eventType: string }) => e.eventType);
    expect(types).toContain("OUTREACH_SENT");
    expect(types).toContain("MONITORING_STARTED");
  });

  it("does not invent outreach recipient when contact email missing", async () => {
    seedTender(repo, "26REQ_NOEMAIL");
    const res = await request(
      "/api/operator/tenders/26REQ_NOEMAIL/outreach/send",
      {
        method: "POST",
        body: JSON.stringify({
          sentAt: "2026-10-02T09:30:00.000Z",
          subject: "Hello",
        }),
      },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tender.drafts.outreach.recipient).toBeNull();
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

  it("persists tender contact details across PATCH and GET", async () => {
    seedTender(repo, "26REQ_CONTACT");

    const patched = await request("/api/operator/tenders/26REQ_CONTACT", {
      method: "PATCH",
      body: JSON.stringify({
        contact_name: "Μαρία Παπαδοπούλου",
        contact_department: "Τμήμα Προμηθειών",
        contact_email: "maria@dimos.gr",
        contact_phone: "2101234567",
        scope_summary: "Συντήρηση ιστοσελίδας δήμου",
      }),
    });
    expect(patched.status).toBe(200);
    const patchedBody = await patched.json();
    expect(patchedBody.tender.contact).toEqual({
      name: "Μαρία Παπαδοπούλου",
      department: "Τμήμα Προμηθειών",
      email: "maria@dimos.gr",
      phone: "2101234567",
    });
    expect(patchedBody.tender.scopeSummary).toBe("Συντήρηση ιστοσελίδας δήμου");

    const reloaded = await request("/api/operator/tenders/26REQ_CONTACT");
    expect(reloaded.status).toBe(200);
    const reloadedBody = await reloaded.json();
    expect(reloadedBody.contact.email).toBe("maria@dimos.gr");
    expect(reloadedBody.contact.name).toBe("Μαρία Παπαδοπούλου");
    expect(reloadedBody.scopeSummary).toBe("Συντήρηση ιστοσελίδας δήμου");

    // Partial patch must not wipe other contact fields
    const partial = await request("/api/operator/tenders/26REQ_CONTACT", {
      method: "PATCH",
      body: JSON.stringify({
        submission_email: "offers@dimos.gr",
      }),
    });
    expect(partial.status).toBe(200);
    const partialBody = await partial.json();
    expect(partialBody.tender.contact.email).toBe("maria@dimos.gr");
    expect(partialBody.tender.submissionInfo.email).toBe("offers@dimos.gr");
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

  it("persists outreach draft subject/body/notes on PATCH and returns them on GET", async () => {
    seedTender(repo, "26REQ019897367");

    const patch = await app.request(
      "/api/operator/tenders/26REQ019897367",
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-Operator-Token": TOKEN,
        },
        body: JSON.stringify({
          drafts: {
            outreach: {
              status: "DRAFT",
              subject: "TEKIA",
              body: "Αξιότιμοι κύριοι,\nΕκδήλωση ενδιαφέροντος.",
              notes: "Σημείωση χειριστή",
            },
          },
        }),
      },
    );
    expect(patch.status).toBe(200);
    const patched = await patch.json();
    expect(patched.tender.drafts.outreach.subject).toBe("TEKIA");
    expect(patched.tender.drafts.outreach.body).toContain("Εκδήλωση ενδιαφέροντος");
    expect(patched.tender.drafts.outreach.notes).toBe("Σημείωση χειριστή");
    expect(patched.tender.drafts.outreach.status).toBe("DRAFT");

    const get = await app.request("/api/operator/tenders/26REQ019897367", {
      headers: { "X-Operator-Token": TOKEN },
    });
    expect(get.status).toBe(200);
    const got = await get.json();
    expect(got.drafts.outreach.subject).toBe("TEKIA");
    expect(got.drafts.outreach.body).toContain("Εκδήλωση ενδιαφέροντος");
    expect(got.drafts.outreach.notes).toBe("Σημείωση χειριστή");
  });

  it("restores SENT outreach from durable ledger after tender row rebuild", async () => {
    seedTender(repo, "26REQ-LEDGER");

    const send = await app.request(
      "/api/operator/tenders/26REQ-LEDGER/outreach/send",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Operator-Token": TOKEN,
        },
        body: JSON.stringify({
          sentAt: "2026-10-02T10:00:00.000Z",
          subject: "Εκδήλωση ενδιαφέροντος",
          notes: "στάλθηκε",
        }),
      },
    );
    expect(send.status).toBe(200);

    // Simulate Coolify tender wipe: delete tender row but keep ledger.
    db.prepare("DELETE FROM tender_events WHERE tender_reference_number = ?").run(
      "26REQ-LEDGER",
    );
    db.prepare("DELETE FROM tenders WHERE reference_number = ?").run("26REQ-LEDGER");
    expect(repo.findByAdam("26REQ-LEDGER")).toBeUndefined();

    // Poll-like re-insert
    repo.upsertNewOrTouch({
      referenceNumber: "26REQ-LEDGER",
      recordType: "REQ",
      title: "Ιστοσελίδα",
      organization: "ΔΕΥΑΝ",
      submissionDate: "2026-10-01T00:00:00.000Z",
      signedDate: null,
      finalSubmissionDate: null,
      budgetWithoutVat: 5000,
      budgetWithVat: 6200,
      cpvs: ["72413000-8"],
      score: 80,
      stage: "EARLY",
      targetedSupplier: false,
      nonInvitedOffersRejected: false,
      pdfTextStatus: "skipped",
      officialPdfUrl: "https://example.com/pdf",
      publicKimdisUrl: "https://example.com/kimdis",
      scoreReasons: [],
      webRelevant: true,
      webCategory: "WEBSITE",
      relevanceStatus: "RELEVANT",
      ignoreReason: null,
      reviewReason: null,
      rawJson: {},
      nowIso: new Date().toISOString(),
    });

    const got = await app.request("/api/operator/tenders/26REQ-LEDGER", {
      headers: { "X-Operator-Token": TOKEN },
    });
    const body = await got.json();
    expect(body.drafts.outreach.status).toBe("SENT");
    expect(body.drafts.outreach.subject).toContain("Εκδήλωση");
    expect(body.monitoring.state).toBe("WAITING_FOR_INVITATION");
  });

  it("keeps cloud external sending disabled and free of send symbols in src", async () => {
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

  it("New counter ignores indexed tenders that are not actionable", () => {
    seedTender(repo, "26REQ-ACTION");
    repo.upsertNewOrTouch({
      referenceNumber: "26REQ-NOISE",
      recordType: "REQ",
      title: "Άσχετο",
      organization: "Δήμος",
      submissionDate: null,
      signedDate: null,
      finalSubmissionDate: null,
      budgetWithoutVat: 100,
      budgetWithVat: null,
      cpvs: [],
      score: 0,
      stage: "IRRELEVANT",
      targetedSupplier: false,
      nonInvitedOffersRejected: false,
      pdfTextStatus: "none",
      officialPdfUrl: "https://example.com/pdf",
      publicKimdisUrl: "https://example.com/public",
      scoreReasons: [],
      webRelevant: false,
      webCategory: "UNKNOWN",
      relevanceStatus: "IRRELEVANT",
      ignoreReason: "not web",
      reviewReason: null,
      rawJson: {},
      nowIso: "2026-09-29T10:00:00.000Z",
    });

    const counters = repo.getOpportunityCounters();
    const listed = repo.listOpportunities("all");
    expect(listed.map((row) => row.reference_number)).toEqual(["26REQ-ACTION"]);
    expect(counters.new).toBe(1);
  });
});
