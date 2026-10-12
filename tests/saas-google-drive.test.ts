import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { randomBytes } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import {
  authedJson,
  createSaasTestApp,
  getSaasTestPrisma,
  resetSaasDatabase,
  setOrgPlan,
  signUpAndGetCookie,
} from "./helpers/saas-test.js";
import { encryptSecret } from "../src/saas/crypto/secrets.js";
import { PLAN_KEYS, BASIC_PLAN } from "../src/saas/plans/catalog.js";
import { SAAS_JOB_TYPES } from "../src/saas/jobs/outbox.js";
import {
  MAX_IMPORT_FILES_PER_BATCH,
  processGoogleDriveImportJob,
  resolveImportPlan,
} from "../src/saas/services/google-drive-import.js";
import {
  ensureVaultFolders,
  setDocumentStorageForTests,
} from "../src/saas/services/vault.js";
import { createLocalDocumentStorage } from "../src/saas/storage/document-storage.js";

const encryptionKey = randomBytes(32).toString("hex");
const DRIVE_SCOPES =
  "openid email https://www.googleapis.com/auth/drive.file";

const MIME_PDF = "application/pdf";
const MIME_DOCX =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const MIME_GDOC = "application/vnd.google-apps.document";
const MIME_GSHEET = "application/vnd.google-apps.spreadsheet";

const enableGoogleDriveEnv = () => {
  process.env.SAAS_GOOGLE_DRIVE_ENABLED = "true";
  process.env.SAAS_GOOGLE_CLIENT_ID = "test-google-client";
  process.env.SAAS_GOOGLE_CLIENT_SECRET = "test-google-secret";
  process.env.SAAS_GOOGLE_REDIRECT_URI =
    "http://127.0.0.1:3000/api/saas/integrations/google/oauth/callback";
  process.env.SAAS_SECRETS_ENCRYPTION_KEY = encryptionKey;
  process.env.SAAS_GOOGLE_PICKER_API_KEY = "test-picker-key";
  process.env.SAAS_GOOGLE_PICKER_APP_ID = "1234567890";
};

const disableGoogleEnv = () => {
  for (const key of [
    "SAAS_GOOGLE_CALENDAR_ENABLED",
    "SAAS_GOOGLE_DRIVE_ENABLED",
    "SAAS_GOOGLE_SHEETS_ENABLED",
    "SAAS_GOOGLE_CLIENT_ID",
    "SAAS_GOOGLE_CLIENT_SECRET",
    "SAAS_GOOGLE_REDIRECT_URI",
    "SAAS_SECRETS_ENCRYPTION_KEY",
    "SAAS_GOOGLE_PICKER_API_KEY",
    "SAAS_GOOGLE_PICKER_APP_ID",
  ]) {
    delete process.env[key];
  }
};

type FakeDriveFile = {
  name: string;
  mimeType: string;
  /** Reported by files.get; omitted for Google-native files. */
  size?: number;
  content?: Buffer;
  metaStatus?: number;
  mediaStatus?: number;
  exportStatus?: number;
  exportBytes?: Buffer;
};

const pdfBytes = (label = "x") => Buffer.from(`%PDF-1.4 ${label}`);

describe("resolveImportPlan", () => {
  it("copies PDF and DOCX as-is", () => {
    const pdf = resolveImportPlan({ name: "Φορολογική", mimeType: MIME_PDF, sizeBytes: 100 });
    expect(pdf).toMatchObject({
      ok: true,
      targetFilename: "Φορολογική.pdf",
      needsExport: false,
      targetMime: MIME_PDF,
    });
    const docx = resolveImportPlan({ name: "Offer.DOCX", mimeType: MIME_DOCX, sizeBytes: 100 });
    expect(docx).toMatchObject({ ok: true, targetFilename: "Offer.docx", needsExport: false });
  });

  it("exports Google Docs as PDF", () => {
    const plan = resolveImportPlan({ name: "Προσφορά", mimeType: MIME_GDOC, sizeBytes: null });
    expect(plan).toMatchObject({
      ok: true,
      needsExport: true,
      exportMimeType: MIME_PDF,
      targetFilename: "Προσφορά.pdf",
      formatLabelEl: "Θα εξαχθεί ως PDF",
    });
  });

  it("rejects legacy .doc, Sheets, Slides, folders and unknown types", () => {
    const cases: Array<[string, string]> = [
      ["application/msword", "unsupported_legacy_doc"],
      [MIME_GSHEET, "unsupported_spreadsheet"],
      ["application/vnd.google-apps.presentation", "unsupported_presentation"],
      ["application/vnd.google-apps.folder", "unsupported_folder"],
      ["image/png", "unsupported_type"],
    ];
    for (const [mimeType, code] of cases) {
      const plan = resolveImportPlan({ name: "f", mimeType, sizeBytes: 10 });
      expect(plan).toMatchObject({ ok: false, code });
    }
  });

  it("rejects oversize binary files before download", () => {
    const plan = resolveImportPlan({
      name: "big.pdf",
      mimeType: MIME_PDF,
      sizeBytes: 26 * 1024 * 1024,
    });
    expect(plan).toMatchObject({ ok: false, code: "file_too_large" });
  });
});

describe("Google Drive import (mocked Google)", () => {
  const prisma = getSaasTestPrisma();
  const { app } = createSaasTestApp(prisma);
  let fetchMock: ReturnType<typeof vi.fn>;
  let driveFiles: Record<string, FakeDriveFile>;
  let tempStorageDir = "";

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    setDocumentStorageForTests(null);
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetSaasDatabase(prisma);
    enableGoogleDriveEnv();
    tempStorageDir = mkdtempSync(path.join(os.tmpdir(), "tekia-drive-import-"));
    setDocumentStorageForTests(createLocalDocumentStorage(tempStorageDir));
    driveFiles = {};
    fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("oauth2.googleapis.com/token")) {
        return new Response(
          JSON.stringify({
            access_token: "ya29.drive-access",
            expires_in: 3600,
            refresh_token: "1//drive-refresh",
            scope: DRIVE_SCOPES,
            token_type: "Bearer",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.includes("openidconnect.googleapis.com/v1/userinfo")) {
        return new Response(
          JSON.stringify({ sub: "google-sub-d", email: "drive@gmail.com", email_verified: true }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      const match = url.match(/\/drive\/v3\/files\/([^/?]+)(\/export)?\?(.*)$/);
      if (!match) return new Response("not mocked", { status: 500 });
      const fileId = decodeURIComponent(match[1]!);
      const isExport = Boolean(match[2]);
      const isMedia = match[3]!.includes("alt=media");
      const file = driveFiles[fileId];
      if (!file) return new Response("{}", { status: 404 });
      if (isExport) {
        if (file.exportStatus) return new Response("{}", { status: file.exportStatus });
        return new Response(new Uint8Array(file.exportBytes ?? pdfBytes("export")), { status: 200 });
      }
      if (isMedia) {
        if (file.mediaStatus) return new Response("{}", { status: file.mediaStatus });
        return new Response(new Uint8Array(file.content ?? pdfBytes(fileId)), { status: 200 });
      }
      if (file.metaStatus) {
        return new Response(
          JSON.stringify({ error: { status: "PERMISSION_DENIED", errors: [{ reason: "forbidden" }] } }),
          { status: file.metaStatus },
        );
      }
      return new Response(
        JSON.stringify({
          id: fileId,
          name: file.name,
          mimeType: file.mimeType,
          ...(file.size !== undefined ? { size: String(file.size) } : {}),
          modifiedTime: "2026-10-01T10:00:00.000Z",
          md5Checksum: file.mimeType === MIME_GDOC ? undefined : "abc123",
          version: "7",
          trashed: false,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    disableGoogleEnv();
    if (tempStorageDir) {
      rmSync(tempStorageDir, { recursive: true, force: true });
      tempStorageDir = "";
    }
  });

  const signupOrg = async (
    email: string,
    plan: "free" | "basic" | "pro" | "trial" = "basic",
  ) => {
    const { cookie } = await signUpAndGetCookie(app, {
      name: "Owner",
      email,
      password: "Password123!",
    });
    const me = await authedJson<{ userId: string }>(app, "/api/saas/me", { cookie });
    const org = await authedJson<{ organization: { id: string } }>(
      app,
      "/api/saas/organizations",
      { cookie, body: { name: `Org ${email}` } },
    );
    const orgId = org.json.organization.id;
    await setOrgPlan(prisma, orgId, PLAN_KEYS[plan]);
    await ensureVaultFolders(prisma, orgId);
    const folder = await prisma.vaultFolder.findFirstOrThrow({
      where: { organizationId: orgId },
      orderBy: { sortOrder: "asc" },
    });
    return { cookie, orgId, userId: me.json.userId, folderId: folder.id };
  };

  const connectDrive = async (
    orgId: string,
    userId: string,
    grantedScopes = DRIVE_SCOPES,
  ) => {
    const refresh = encryptSecret("1//drive-refresh");
    const access = encryptSecret("ya29.drive-access");
    return prisma.userOrganizationGoogleConnection.create({
      data: {
        organizationId: orgId,
        userId,
        googleAccountId: `sub-${userId}`,
        googleEmail: "drive@gmail.com",
        refreshTokenCiphertext: refresh.ciphertext,
        refreshTokenNonce: refresh.nonce,
        accessTokenCiphertext: access.ciphertext,
        accessTokenNonce: access.nonce,
        accessTokenExpiresAt: new Date(Date.now() + 3600_000),
        grantedScopes,
        tokenStatus: "ACTIVE",
        driveStatus: "ACTIVE",
      },
    });
  };

  type BatchJson = {
    records: Array<{
      id: string;
      googleFileId: string;
      status: "PENDING" | "SUCCEEDED" | "FAILED";
      errorCode: string | null;
      errorEl: string | null;
    }>;
    active: boolean;
  };

  const startImport = (
    ctx: { cookie: string; orgId: string; folderId: string },
    ids: string[],
  ) =>
    authedJson<BatchJson>(app, "/api/saas/integrations/google/drive/import", {
      cookie: ctx.cookie,
      organizationId: ctx.orgId,
      body: {
        folderId: ctx.folderId,
        files: ids.map((googleFileId) => ({ googleFileId })),
      },
    });

  const runPendingJobs = async () => {
    const jobs = await prisma.saasJob.findMany({
      where: { type: SAAS_JOB_TYPES.googleDriveImport, status: "PENDING" },
      orderBy: { createdAt: "asc" },
    });
    const results: string[] = [];
    for (const job of jobs) {
      results.push(await processGoogleDriveImportJob(prisma, job));
    }
    return results;
  };

  // --- Entitlements / flags ---------------------------------------------

  it("locks Free users out of Drive import", async () => {
    const ctx = await signupOrg("d-free@example.com", "free");
    const view = await authedJson<{
      drive: { entitled: boolean; importEntitled: boolean; featureAvailable: boolean };
    }>(app, "/api/saas/integrations/google", { cookie: ctx.cookie, organizationId: ctx.orgId });
    expect(view.json.drive.featureAvailable).toBe(true);
    expect(view.json.drive.entitled).toBe(false);
    expect(view.json.drive.importEntitled).toBe(false);

    const token = await authedJson(app, "/api/saas/integrations/google/drive/picker-token", {
      method: "POST",
      cookie: ctx.cookie,
      organizationId: ctx.orgId,
      body: {},
    });
    expect(token.status).toBe(403);
    const start = await authedJson(app, "/api/saas/integrations/google/oauth/start", {
      cookie: ctx.cookie,
      organizationId: ctx.orgId,
      body: { capabilities: ["drive"] },
    });
    expect(start.status).toBe(403);
  });

  it("entitles Basic and exposes picker config + copy hint without secrets", async () => {
    expect(BASIC_PLAN.googleDrive).toBe(true);
    const ctx = await signupOrg("d-basic@example.com", "basic");
    await connectDrive(ctx.orgId, ctx.userId);
    const view = await authedJson<{
      drive: {
        entitled: boolean;
        importEntitled: boolean;
        pickerConfigured: boolean;
        status: string;
        statusLabelEl: string;
      };
      messages: { importCopyHintEl: string };
    }>(app, "/api/saas/integrations/google", { cookie: ctx.cookie, organizationId: ctx.orgId });
    expect(view.json.drive.entitled).toBe(true);
    expect(view.json.drive.importEntitled).toBe(true);
    expect(view.json.drive.pickerConfigured).toBe(true);
    expect(view.json.drive.status).toBe("ACTIVE");
    expect(view.json.drive.statusLabelEl).toBe("Συνδεδεμένο");
    expect(view.json.messages.importCopyHintEl).toContain("Θα αποθηκευτεί αντίγραφο");
    expect(JSON.stringify(view.json)).not.toContain("test-picker-key");
    expect(JSON.stringify(view.json)).not.toContain("ya29");

    const res = await app.request("/api/saas/integrations/google/drive/picker-token", {
      method: "POST",
      headers: { cookie: ctx.cookie, "X-Organization-Id": ctx.orgId, "Content-Type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const json = (await res.json()) as {
      accessToken: string;
      expiresIn: number;
      pickerApiKey: string;
      appId: string;
    };
    expect(json.accessToken).toBe("ya29.drive-access");
    expect(json.pickerApiKey).toBe("test-picker-key");
    expect(json.appId).toBe("1234567890");
    expect(json.expiresIn).toBeGreaterThan(60);
    expect(json.expiresIn).toBeLessThanOrEqual(3600);
    expect(JSON.stringify(json)).not.toContain("refresh");
  });

  it("hides the feature when the flag is off", async () => {
    const ctx = await signupOrg("d-off@example.com", "basic");
    await connectDrive(ctx.orgId, ctx.userId);
    delete process.env.SAAS_GOOGLE_DRIVE_ENABLED;
    const view = await authedJson<{ drive: { featureAvailable: boolean } }>(
      app,
      "/api/saas/integrations/google",
      { cookie: ctx.cookie, organizationId: ctx.orgId },
    );
    expect(view.json.drive.featureAvailable).toBe(false);
    for (const route of ["picker-token", "preview", "import"]) {
      const res = await authedJson(app, `/api/saas/integrations/google/drive/${route}`, {
        cookie: ctx.cookie,
        organizationId: ctx.orgId,
        body: { files: [{ id: "f1", googleFileId: "f1" }], folderId: ctx.folderId },
      });
      expect(res.status).toBe(503);
    }
  });

  it("reports pickerConfigured=false and refuses a picker token without Picker env", async () => {
    const ctx = await signupOrg("d-nopicker@example.com", "basic");
    await connectDrive(ctx.orgId, ctx.userId);
    delete process.env.SAAS_GOOGLE_PICKER_API_KEY;
    const view = await authedJson<{ drive: { featureAvailable: boolean; pickerConfigured: boolean } }>(
      app,
      "/api/saas/integrations/google",
      { cookie: ctx.cookie, organizationId: ctx.orgId },
    );
    expect(view.json.drive.featureAvailable).toBe(true);
    expect(view.json.drive.pickerConfigured).toBe(false);
    const token = await authedJson(app, "/api/saas/integrations/google/drive/picker-token", {
      method: "POST",
      cookie: ctx.cookie,
      organizationId: ctx.orgId,
      body: {},
    });
    expect(token.status).toBe(503);
  });

  it("blocks unverified users", async () => {
    const ctx = await signupOrg("d-unverified@example.com", "basic");
    await connectDrive(ctx.orgId, ctx.userId);
    await prisma.user.update({ where: { id: ctx.userId }, data: { emailVerified: false } });
    const res = await authedJson(app, "/api/saas/integrations/google/drive/picker-token", {
      method: "POST",
      cookie: ctx.cookie,
      organizationId: ctx.orgId,
      body: {},
    });
    expect(res.status).toBe(403);
  });

  // --- Preview ------------------------------------------------------------

  it("previews Google Sheets as unsupported and Google Docs as PDF export", async () => {
    const ctx = await signupOrg("d-preview@example.com", "basic");
    await connectDrive(ctx.orgId, ctx.userId);
    driveFiles = {
      sheet1: { name: "Budget", mimeType: MIME_GSHEET },
      doc1: { name: "Προσφορά", mimeType: MIME_GDOC },
      pdf1: { name: "Cert.pdf", mimeType: MIME_PDF, size: 2048 },
      old1: { name: "old.doc", mimeType: "application/msword", size: 100 },
    };
    const res = await authedJson<{
      files: Array<{
        id: string;
        supported: boolean;
        needsExport: boolean;
        formatLabelEl: string | null;
        reasonEl: string | null;
        targetFilename: string | null;
        sizeBytes: number | null;
      }>;
    }>(app, "/api/saas/integrations/google/drive/preview", {
      cookie: ctx.cookie,
      organizationId: ctx.orgId,
      body: {
        files: [{ id: "sheet1" }, { id: "doc1" }, { id: "pdf1" }, { id: "old1" }],
      },
    });
    expect(res.status).toBe(200);
    const byId = Object.fromEntries(res.json.files.map((f) => [f.id, f]));
    expect(byId.sheet1).toMatchObject({ supported: false });
    expect(byId.sheet1!.reasonEl).toContain("Google Sheets");
    expect(byId.old1).toMatchObject({ supported: false });
    expect(byId.doc1).toMatchObject({
      supported: true,
      needsExport: true,
      formatLabelEl: "Θα εξαχθεί ως PDF",
      targetFilename: "Προσφορά.pdf",
    });
    expect(byId.pdf1).toMatchObject({
      supported: true,
      needsExport: false,
      sizeBytes: 2048,
      formatLabelEl: "PDF",
    });
    // Preview never downloads content.
    expect(
      fetchMock.mock.calls.some((c) => String(c[0]).includes("alt=media") || String(c[0]).includes("/export")),
    ).toBe(false);
  });

  // --- Import -------------------------------------------------------------

  it("imports a PDF, a DOCX and an exported Google Doc into the vault", async () => {
    const ctx = await signupOrg("d-import@example.com", "basic");
    const conn = await connectDrive(ctx.orgId, ctx.userId);
    driveFiles = {
      pdf1: { name: "Φορολογική Ενημερότητα.pdf", mimeType: MIME_PDF, size: 64, content: pdfBytes("pdf1") },
      docx1: { name: "Εμπειρία", mimeType: MIME_DOCX, size: 64, content: Buffer.from("PK-docx") },
      doc1: { name: "Προφίλ", mimeType: MIME_GDOC, exportBytes: pdfBytes("exported") },
    };
    const started = await startImport(ctx, ["pdf1", "docx1", "doc1"]);
    expect(started.status).toBe(202);
    expect(started.json.active).toBe(true);
    expect(started.json.records.map((r) => r.status)).toEqual(["PENDING", "PENDING", "PENDING"]);

    const jobs = await prisma.saasJob.findMany({ where: { type: SAAS_JOB_TYPES.googleDriveImport } });
    expect(jobs).toHaveLength(3);
    for (const job of jobs) {
      const payload = JSON.stringify(job.payload);
      expect(payload).not.toContain("ya29");
      expect(payload).not.toContain("1//");
      expect(Object.keys(job.payload as object).sort()).toEqual(
        ["connectionId", "importRecordId", "organizationId", "userId"],
      );
    }

    expect(await runPendingJobs()).toEqual(["ok", "ok", "ok"]);

    const records = await prisma.googleDriveImportRecord.findMany({
      where: { connectionId: conn.id },
      orderBy: { googleFileId: "asc" },
    });
    expect(records.map((r) => r.status)).toEqual(["SUCCEEDED", "SUCCEEDED", "SUCCEEDED"]);
    for (const record of records) {
      expect(record.vaultDocumentId).not.toBeNull();
      expect(record.importedAt).not.toBeNull();
      expect(record.googleModifiedTime?.toISOString()).toBe("2026-10-01T10:00:00.000Z");
    }
    const docRecord = records.find((r) => r.googleFileId === "doc1")!;
    expect(docRecord.exportMimeType).toBe(MIME_PDF);
    expect(docRecord.googleVersion).toBe("7");
    const pdfRecord = records.find((r) => r.googleFileId === "pdf1")!;
    expect(pdfRecord.googleMd5Checksum).toBe("abc123");

    const docs = await prisma.vaultDocument.findMany({
      where: { organizationId: ctx.orgId },
      include: { versions: true },
    });
    expect(docs).toHaveLength(3);
    expect(docs.every((d) => d.source === "IMPORTED" && d.folderId === ctx.folderId)).toBe(true);
    const exported = docs.find((d) => d.id === docRecord.vaultDocumentId)!;
    expect(exported.mimeType).toBe(MIME_PDF);
    expect(exported.originalFilename).toBe("Προφίλ.pdf");
    expect(exported.versions).toHaveLength(1);

    const connection = await prisma.userOrganizationGoogleConnection.findUniqueOrThrow({
      where: { id: conn.id },
    });
    expect(connection.driveLastSuccessAt).not.toBeNull();

    // Status endpoint reflects the finished batch.
    const status = await app.request(
      `/api/saas/integrations/google/drive/import/status?ids=${records.map((r) => r.id).join(",")}`,
      { headers: { cookie: ctx.cookie, "X-Organization-Id": ctx.orgId } },
    );
    const statusJson = (await status.json()) as BatchJson;
    expect(statusJson.active).toBe(false);
    expect(statusJson.records.every((r) => r.status === "SUCCEEDED")).toBe(true);

    // Re-importing the same Drive file creates a NEW document (no overwrite).
    const again = await startImport(ctx, ["pdf1"]);
    expect(again.status).toBe(202);
    await runPendingJobs();
    const afterDocs = await prisma.vaultDocument.findMany({ where: { organizationId: ctx.orgId } });
    expect(afterDocs).toHaveLength(4);
    expect(new Set(afterDocs.map((d) => d.id)).size).toBe(4);
  });

  it("reports partial success with per-file reasons and retries failed files only", async () => {
    const ctx = await signupOrg("d-partial@example.com", "basic");
    await connectDrive(ctx.orgId, ctx.userId);
    driveFiles = {
      ok1: { name: "ok.pdf", mimeType: MIME_PDF, size: 10 },
      sheet1: { name: "Budget", mimeType: MIME_GSHEET },
      gone1: { name: "gone.pdf", mimeType: MIME_PDF, size: 10, mediaStatus: 404 },
    };
    const started = await startImport(ctx, ["ok1", "sheet1", "gone1"]);
    expect(started.status).toBe(202);
    const immediate = Object.fromEntries(started.json.records.map((r) => [r.googleFileId, r]));
    // Unsupported types fail immediately; the rest are queued.
    expect(immediate.sheet1).toMatchObject({ status: "FAILED", errorCode: "unsupported_spreadsheet" });
    expect(immediate.sheet1!.errorEl).toContain("Google Sheets");
    expect(immediate.ok1!.status).toBe("PENDING");

    await runPendingJobs();
    const final = await prisma.googleDriveImportRecord.findMany({
      where: { organizationId: ctx.orgId },
    });
    const byFile = Object.fromEntries(final.map((r) => [r.googleFileId, r]));
    expect(byFile.ok1).toMatchObject({ status: "SUCCEEDED" });
    expect(byFile.sheet1).toMatchObject({ status: "FAILED", errorSafe: "unsupported_spreadsheet" });
    expect(byFile.gone1).toMatchObject({ status: "FAILED", errorSafe: "not_found" });
    expect(await prisma.vaultDocument.count({ where: { organizationId: ctx.orgId } })).toBe(1);

    // Retry only the failed, now-fixed file.
    driveFiles.gone1 = { name: "gone.pdf", mimeType: MIME_PDF, size: 10 };
    const retry = await startImport(ctx, ["gone1"]);
    expect(retry.status).toBe(202);
    await runPendingJobs();
    expect(await prisma.vaultDocument.count({ where: { organizationId: ctx.orgId } })).toBe(2);
    const downloads = fetchMock.mock.calls.filter(
      (c) => String(c[0]).includes("/files/ok1?alt=media"),
    );
    expect(downloads).toHaveLength(1);
  });

  it("re-checks size after export", async () => {
    const ctx = await signupOrg("d-bigexport@example.com", "basic");
    await connectDrive(ctx.orgId, ctx.userId);
    driveFiles = {
      big: {
        name: "Huge",
        mimeType: MIME_GDOC,
        exportBytes: Buffer.alloc(26 * 1024 * 1024, 1),
      },
    };
    await startImport(ctx, ["big"]);
    await runPendingJobs();
    const record = await prisma.googleDriveImportRecord.findFirstOrThrow({
      where: { organizationId: ctx.orgId },
    });
    expect(record).toMatchObject({ status: "FAILED", errorSafe: "file_too_large" });
    expect(await prisma.vaultDocument.count({ where: { organizationId: ctx.orgId } })).toBe(0);
  });

  it("rejects an import when the vault storage quota is exhausted", async () => {
    const ctx = await signupOrg("d-quota@example.com", "basic");
    await connectDrive(ctx.orgId, ctx.userId);
    const seed = await prisma.vaultDocument.create({
      data: {
        organizationId: ctx.orgId,
        folderId: ctx.folderId,
        name: "Seed",
        status: "NO_EXPIRY",
      },
    });
    await prisma.vaultDocumentVersion.create({
      data: {
        organizationId: ctx.orgId,
        documentId: seed.id,
        version: 1,
        storageKey: "seed/key",
        fileSize: BASIC_PLAN.storageBytes,
      },
    });
    driveFiles = { pdf1: { name: "a.pdf", mimeType: MIME_PDF, size: 100 } };
    await startImport(ctx, ["pdf1"]);
    await runPendingJobs();
    const record = await prisma.googleDriveImportRecord.findFirstOrThrow({
      where: { organizationId: ctx.orgId },
    });
    expect(record).toMatchObject({ status: "FAILED", errorSafe: "quota_exceeded" });
    expect(await prisma.vaultDocument.count({ where: { organizationId: ctx.orgId } })).toBe(1);
  });

  it("retries transient Drive errors and does not fail the record yet", async () => {
    const ctx = await signupOrg("d-transient@example.com", "basic");
    await connectDrive(ctx.orgId, ctx.userId);
    driveFiles = { flaky: { name: "flaky.pdf", mimeType: MIME_PDF, size: 10, mediaStatus: 503 } };
    await startImport(ctx, ["flaky"]);
    expect(await runPendingJobs()).toEqual(["retry"]);
    const record = await prisma.googleDriveImportRecord.findFirstOrThrow({
      where: { organizationId: ctx.orgId },
    });
    expect(record.status).toBe("PENDING");
  });

  it("fails queued imports when the plan is downgraded before the job runs", async () => {
    const ctx = await signupOrg("d-downgrade@example.com", "basic");
    await connectDrive(ctx.orgId, ctx.userId);
    driveFiles = { pdf1: { name: "a.pdf", mimeType: MIME_PDF, size: 10 } };
    await startImport(ctx, ["pdf1"]);
    await setOrgPlan(prisma, ctx.orgId, PLAN_KEYS.free);
    await runPendingJobs();
    const record = await prisma.googleDriveImportRecord.findFirstOrThrow({
      where: { organizationId: ctx.orgId },
    });
    expect(record).toMatchObject({ status: "FAILED", errorSafe: "plan_locked" });
    expect(await prisma.vaultDocument.count({ where: { organizationId: ctx.orgId } })).toBe(0);
  });

  // --- OAuth scope ---------------------------------------------------------

  it("rejects the OAuth callback when Google omits the drive.file scope", async () => {
    const ctx = await signupOrg("d-scope@example.com", "basic");
    const start = await authedJson<{ authorizeUrl: string }>(
      app,
      "/api/saas/integrations/google/oauth/start",
      { cookie: ctx.cookie, organizationId: ctx.orgId, body: { capabilities: ["drive"] } },
    );
    expect(start.status).toBe(200);
    expect(start.json.authorizeUrl).toContain("drive.file");
    expect(start.json.authorizeUrl).not.toContain("calendar");
    const state = new URL(start.json.authorizeUrl).searchParams.get("state")!;

    fetchMock.mockImplementationOnce(
      async () =>
        new Response(
          JSON.stringify({
            access_token: "ya29.no-drive",
            expires_in: 3600,
            refresh_token: "1//no-drive",
            scope: "openid email",
            token_type: "Bearer",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    );
    const callback = await app.request(
      `/api/saas/integrations/google/oauth/callback?code=c&state=${state}`,
      { redirect: "manual" },
    );
    expect(callback.status).toBe(302);
    expect(callback.headers.get("location")).toContain("missing_drive_scope");
    expect(
      await prisma.userOrganizationGoogleConnection.count({ where: { organizationId: ctx.orgId } }),
    ).toBe(0);
  });

  it("connects Drive via OAuth and activates driveStatus", async () => {
    const ctx = await signupOrg("d-oauth@example.com", "basic");
    const start = await authedJson<{ authorizeUrl: string }>(
      app,
      "/api/saas/integrations/google/oauth/start",
      { cookie: ctx.cookie, organizationId: ctx.orgId, body: { capabilities: ["drive"] } },
    );
    const state = new URL(start.json.authorizeUrl).searchParams.get("state")!;
    const callback = await app.request(
      `/api/saas/integrations/google/oauth/callback?code=c&state=${state}`,
      { redirect: "manual" },
    );
    expect(callback.headers.get("location")).toContain("feature=drive");
    const row = await prisma.userOrganizationGoogleConnection.findFirstOrThrow({
      where: { organizationId: ctx.orgId },
    });
    expect(row.driveStatus).toBe("ACTIVE");
    expect(row.calendarStatus).toBe("DISABLED");
  });

  it("refuses preview/import when stored scopes lack drive.file and flags reconnect", async () => {
    const ctx = await signupOrg("d-noscope@example.com", "basic");
    const conn = await connectDrive(ctx.orgId, ctx.userId, "openid email");
    const res = await authedJson<{ message: string }>(
      app,
      "/api/saas/integrations/google/drive/preview",
      { cookie: ctx.cookie, organizationId: ctx.orgId, body: { files: [{ id: "x" }] } },
    );
    expect(res.status).toBe(403);
    expect(res.json.message).toBe("google_drive_scope_missing");
    const row = await prisma.userOrganizationGoogleConnection.findUniqueOrThrow({ where: { id: conn.id } });
    expect(row.driveStatus).toBe("NEEDS_RECONNECT");
  });

  // --- Concurrency ---------------------------------------------------------

  it("allows only one active batch per connection", async () => {
    const ctx = await signupOrg("d-concurrent@example.com", "basic");
    await connectDrive(ctx.orgId, ctx.userId);
    driveFiles = {
      a: { name: "a.pdf", mimeType: MIME_PDF, size: 10 },
      b: { name: "b.pdf", mimeType: MIME_PDF, size: 10 },
    };
    const first = await startImport(ctx, ["a"]);
    expect(first.status).toBe(202);
    const second = await authedJson<{ message: string }>(
      app,
      "/api/saas/integrations/google/drive/import",
      {
        cookie: ctx.cookie,
        organizationId: ctx.orgId,
        body: { folderId: ctx.folderId, files: [{ googleFileId: "b" }] },
      },
    );
    expect(second.status).toBe(409);
    expect(second.json.message).toBe("google_drive_import_in_progress");

    await runPendingJobs();
    const third = await startImport(ctx, ["b"]);
    expect(third.status).toBe(202);
  });

  it("starts concurrent requests serially (advisory lock)", async () => {
    const ctx = await signupOrg("d-race@example.com", "basic");
    await connectDrive(ctx.orgId, ctx.userId);
    driveFiles = {
      a: { name: "a.pdf", mimeType: MIME_PDF, size: 10 },
      b: { name: "b.pdf", mimeType: MIME_PDF, size: 10 },
    };
    const [r1, r2] = await Promise.all([startImport(ctx, ["a"]), startImport(ctx, ["b"])]);
    expect([r1.status, r2.status].sort()).toEqual([202, 409]);
    expect(
      await prisma.googleDriveImportRecord.count({ where: { organizationId: ctx.orgId } }),
    ).toBe(1);
  });

  it("caps a batch at the maximum number of files", async () => {
    const ctx = await signupOrg("d-cap@example.com", "basic");
    await connectDrive(ctx.orgId, ctx.userId);
    const ids = Array.from({ length: MAX_IMPORT_FILES_PER_BATCH + 1 }, (_, i) => `f${i}`);
    for (const id of ids) driveFiles[id] = { name: `${id}.pdf`, mimeType: MIME_PDF, size: 1 };
    const res = await startImport(ctx, ids);
    expect(res.status).toBe(400);
    expect(
      await prisma.googleDriveImportRecord.count({ where: { organizationId: ctx.orgId } }),
    ).toBe(0);
  });

  // --- Isolation / disconnect ---------------------------------------------

  it("isolates import records and folders between organizations", async () => {
    const a = await signupOrg("d-iso-a@example.com", "basic");
    const b = await signupOrg("d-iso-b@example.com", "basic");
    await connectDrive(a.orgId, a.userId);
    await connectDrive(b.orgId, b.userId);
    driveFiles = { pdf1: { name: "a.pdf", mimeType: MIME_PDF, size: 10 } };
    const started = await startImport(a, ["pdf1"]);
    const recordId = started.json.records[0]!.id;

    // B cannot read A's records.
    const status = await app.request(
      `/api/saas/integrations/google/drive/import/status?ids=${recordId}`,
      { headers: { cookie: b.cookie, "X-Organization-Id": b.orgId } },
    );
    expect(((await status.json()) as BatchJson).records).toHaveLength(0);

    // B cannot import into A's vault folder.
    const cross = await authedJson(app, "/api/saas/integrations/google/drive/import", {
      cookie: b.cookie,
      organizationId: b.orgId,
      body: { folderId: a.folderId, files: [{ googleFileId: "pdf1" }] },
    });
    expect(cross.status).toBe(404);

    // A's job never writes into B's vault.
    await runPendingJobs();
    expect(await prisma.vaultDocument.count({ where: { organizationId: a.orgId } })).toBe(1);
    expect(await prisma.vaultDocument.count({ where: { organizationId: b.orgId } })).toBe(0);

    // B's active batch does not block A's connection (and vice versa).
    const bStart = await startImport(b, ["pdf1"]);
    expect(bStart.status).toBe(202);
  });

  it("disconnecting Drive cancels queued imports and marks records failed", async () => {
    const ctx = await signupOrg("d-disconnect@example.com", "basic");
    const conn = await connectDrive(ctx.orgId, ctx.userId);
    driveFiles = { pdf1: { name: "a.pdf", mimeType: MIME_PDF, size: 10 } };
    await startImport(ctx, ["pdf1"]);
    const res = await authedJson<{ drive: { status: string } }>(
      app,
      "/api/saas/integrations/google/disconnect",
      { cookie: ctx.cookie, organizationId: ctx.orgId, body: { capability: "drive" } },
    );
    expect(res.status).toBe(200);
    expect(res.json.drive.status).toBe("DISABLED");
    const job = await prisma.saasJob.findFirstOrThrow({ where: { type: SAAS_JOB_TYPES.googleDriveImport } });
    expect(job.status).toBe("CANCELLED");
    const record = await prisma.googleDriveImportRecord.findFirstOrThrow({
      where: { connectionId: conn.id },
    });
    expect(record).toMatchObject({ status: "FAILED", errorSafe: "connection_stopped" });
  });

  it("never logs or stores Google tokens in import records", async () => {
    const ctx = await signupOrg("d-secrets@example.com", "basic");
    await connectDrive(ctx.orgId, ctx.userId);
    driveFiles = { pdf1: { name: "a.pdf", mimeType: MIME_PDF, size: 10 } };
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const started = await startImport(ctx, ["pdf1"]);
    await runPendingJobs();
    const records = await prisma.googleDriveImportRecord.findMany();
    const serialized = JSON.stringify([records, started.json, spy.mock.calls]);
    expect(serialized).not.toContain("ya29");
    expect(serialized).not.toContain("1//drive-refresh");
    spy.mockRestore();
  });
});
