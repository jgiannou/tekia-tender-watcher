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
import type { SaasJob } from "@prisma/client";
import type { KimdisClient } from "../src/kimdis/client.js";
import {
  authedJson,
  createSaasTestApp,
  getSaasTestPrisma,
  resetSaasDatabase,
  setOrgPlan,
  signUpAndGetCookie,
} from "./helpers/saas-test.js";
import { encryptSecret } from "../src/saas/crypto/secrets.js";
import { BASIC_PLAN, PLAN_KEYS } from "../src/saas/plans/catalog.js";
import { SAAS_JOB_TYPES } from "../src/saas/jobs/outbox.js";
import {
  DRIVE_FOLDER_COPY_HINT_EL,
  DRIVE_FOLDER_SECTIONS,
  DRIVE_FOLDER_SUCCESS_EL,
  buildFolderPlan,
  buildTenderSummaryMarkdown,
  defaultFolderName,
  processGoogleDriveFolderJob,
  shortTenderTitle,
  type GoogleDriveFolderView,
  type TenderDriveFolderPreview,
} from "../src/saas/services/google-drive-folder.js";
import { uploadFile } from "../src/saas/services/google-drive-api.js";
import {
  ensureVaultFolders,
  setDocumentStorageForTests,
  uploadDocument,
} from "../src/saas/services/vault.js";
import { createLocalDocumentStorage } from "../src/saas/storage/document-storage.js";

const encryptionKey = randomBytes(32).toString("hex");
const DRIVE_SCOPES = "openid email https://www.googleapis.com/auth/drive.file";
const MIME_FOLDER = "application/vnd.google-apps.folder";
const BASE = "/api/saas/integrations/google/drive/folders";

const enableGoogleDriveEnv = () => {
  process.env.SAAS_GOOGLE_DRIVE_ENABLED = "true";
  process.env.SAAS_GOOGLE_CLIENT_ID = "test-google-client";
  process.env.SAAS_GOOGLE_CLIENT_SECRET = "test-google-secret";
  process.env.SAAS_GOOGLE_REDIRECT_URI =
    "http://127.0.0.1:3000/api/saas/integrations/google/oauth/callback";
  process.env.SAAS_SECRETS_ENCRYPTION_KEY = encryptionKey;
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
  ]) {
    delete process.env[key];
  }
};

const pdfBytes = (label = "x") => Buffer.from(`%PDF-1.4 ${label}`);

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

describe("tender folder helpers", () => {
  it("builds «{αναγνωριστικό} — {σύντομος τίτλος}» and truncates long titles", () => {
    expect(defaultFolderName({ referenceNumber: "26PROC1", title: "Προμήθεια υπολογιστών" })).toBe(
      "26PROC1 — Προμήθεια υπολογιστών",
    );
    expect(defaultFolderName({ referenceNumber: "26PROC1", title: null })).toBe("26PROC1");
    const long = "Προμήθεια ".repeat(20);
    const short = shortTenderTitle(long);
    expect(short.length).toBeLessThanOrEqual(61);
    expect(short.endsWith("…")).toBe(true);
  });

  it("plans the three sections, summary after official PDFs, and gates optional items", () => {
    const plan = buildFolderPlan({
      options: { vaultDocumentIds: ["v1"], includeOfficialDocs: true, includeChecklistSummary: false },
      officialDocs: [
        { key: "PROC:A", label: "Διακήρυξη A", mode: "pdf", recordType: "PROC", adam: "A", url: "u" },
        { key: "REQ:B", label: "Έγγραφο B", mode: "link_only", recordType: "REQ", adam: "B", url: "u" },
      ],
      vaultDocuments: [{ id: "v1", fileName: "tax.pdf" }],
    });
    expect(plan.filter((i) => i.kind === "SUBFOLDER").map((i) => i.displayName)).toEqual(
      DRIVE_FOLDER_SECTIONS.map((s) => s.name),
    );
    // Link-only candidates never become a file item.
    expect(plan.filter((i) => i.kind === "OFFICIAL_PDF").map((i) => i.itemKey)).toEqual([
      "official:PROC:A",
    ]);
    expect(plan.some((i) => i.kind === "CHECKLIST")).toBe(false);
    const order = [...plan].sort((a, b) => a.sortOrder - b.sortOrder).map((i) => i.kind);
    expect(order.indexOf("SUMMARY")).toBeGreaterThan(order.indexOf("OFFICIAL_PDF"));
    expect(order.indexOf("SUMMARY")).toBeLessThan(order.indexOf("VAULT_DOCUMENT"));
    expect(new Set(plan.map((i) => i.itemKey)).size).toBe(plan.length);
  });

  it("never claims a PDF was copied when only the link is known", () => {
    const tender = {
      id: "t",
      referenceNumber: "26PROC9",
      recordType: "PROC" as const,
      title: "Τίτλος",
      contractingAuthority: "Δήμος Αθηναίων",
      finalSubmissionDate: null,
      officialPdfUrl: "https://example.gr/doc.pdf",
      publicKimdisUrl: null,
    };
    const linkOnly = buildTenderSummaryMarkdown({
      tender,
      officialRequested: true,
      official: [{ label: "Διακήρυξη 26PROC9", url: tender.officialPdfUrl, copiedAs: null }],
      snapshotAt: new Date("2026-10-12T10:00:00Z"),
    });
    expect(linkOnly).toContain("μόνο σύνδεσμος — δεν αντιγράφηκε αρχείο PDF");
    expect(linkOnly).toContain("https://example.gr/doc.pdf");
    expect(linkOnly).toContain("Προθεσμία υποβολής: Δεν είναι γνωστή");
    expect(linkOnly).not.toContain("αντίγραφο PDF στον φάκελο");

    const copied = buildTenderSummaryMarkdown({
      tender,
      officialRequested: true,
      official: [{ label: "Διακήρυξη 26PROC9", url: tender.officialPdfUrl, copiedAs: "26PROC9.pdf" }],
      snapshotAt: new Date("2026-10-12T10:00:00Z"),
    });
    expect(copied).toContain("αντίγραφο PDF στον φάκελο");
  });
});

// ---------------------------------------------------------------------------
// Drive API client (resumable path) — mocked fetch
// ---------------------------------------------------------------------------

describe("uploadFile", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uses a resumable session above the multipart ceiling", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        calls.push(`${init?.method ?? "GET"} ${url}`);
        if (url.includes("uploadType=resumable")) {
          return new Response("{}", {
            status: 200,
            headers: { Location: "https://www.googleapis.com/upload/session/abc" },
          });
        }
        return new Response(JSON.stringify({ id: "file-big", name: "big.pdf", mimeType: "application/pdf" }), {
          status: 200,
        });
      }),
    );
    const result = await uploadFile({
      accessToken: "t",
      name: "big.pdf",
      mimeType: "application/pdf",
      bytes: Buffer.alloc(6 * 1024 * 1024, 1),
      parentId: "p",
      appKey: "k",
    });
    expect(result).toMatchObject({ ok: true, value: { id: "file-big" } });
    expect(calls).toHaveLength(2);
    expect(calls[1]).toBe("PUT https://www.googleapis.com/upload/session/abc");
  });
});

// ---------------------------------------------------------------------------
// End-to-end (mocked Google)
// ---------------------------------------------------------------------------

type FakeItem = {
  id: string;
  name: string;
  mimeType: string;
  parents: string[];
  appKey: string | null;
  bytes: Buffer | null;
};

describe("Google Drive tender folders (mocked Google)", () => {
  const prisma = getSaasTestPrisma();
  /** Bytes the fake KIMDIS returns for an attachment (null → no attachment). */
  let kimdisPdf: Buffer | null = null;
  const downloadAttachment = vi.fn(async () => kimdisPdf);
  const kimdis = {
    downloadAttachment,
    publicUrl: (adam: string) => `https://kimdis.test/${adam}`,
    pdfUrl: (_type: string, adam: string) => `https://kimdis.test/pdf/${adam}`,
  } as unknown as KimdisClient;
  const { app } = createSaasTestApp(prisma, { kimdis });
  let fetchMock: ReturnType<typeof vi.fn>;
  let drive: Map<string, FakeItem>;
  let driveCalls = 0;
  let uploadCalls = 0;
  /** file name → HTTP status the fake Drive answers with on upload. */
  let failUploads: Map<string, number>;
  let tempStorageDir = "";
  let idSeq = 0;

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    setDocumentStorageForTests(null);
    await prisma.$disconnect();
  });

  const parseMultipart = (body: Uint8Array, contentType: string) => {
    const boundary = /boundary=(.+)$/.exec(contentType)![1]!;
    const buf = Buffer.from(body);
    const sep = Buffer.from(`--${boundary}`);
    const i1 = buf.indexOf(sep);
    const i2 = buf.indexOf(sep, i1 + sep.length);
    const i3 = buf.indexOf(sep, i2 + sep.length);
    const part1 = buf.subarray(i1 + sep.length, i2);
    const part2 = buf.subarray(i2 + sep.length, i3);
    const metadata = JSON.parse(
      part1.subarray(part1.indexOf("\r\n\r\n") + 4).toString("utf8").trim(),
    ) as { name: string; parents: string[]; appProperties?: { arcKey?: string } };
    const content = part2.subarray(part2.indexOf("\r\n\r\n") + 4, part2.length - 2);
    return { metadata, content: Buffer.from(content) };
  };

  const unescapeQ = (value: string) => value.replace(/\\(.)/g, "$1");

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });

  const itemJson = (item: FakeItem) => ({
    id: item.id,
    name: item.name,
    mimeType: item.mimeType,
    webViewLink: `https://drive.google.com/drive/folders/${item.id}`,
  });

  beforeEach(async () => {
    await resetSaasDatabase(prisma);
    enableGoogleDriveEnv();
    tempStorageDir = mkdtempSync(path.join(os.tmpdir(), "tekia-drive-folder-"));
    setDocumentStorageForTests(createLocalDocumentStorage(tempStorageDir));
    drive = new Map();
    driveCalls = 0;
    uploadCalls = 0;
    idSeq = 0;
    failUploads = new Map();
    kimdisPdf = pdfBytes("official");
    downloadAttachment.mockClear();

    fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (!url.hostname.endsWith("googleapis.com")) {
        return new Response("not mocked", { status: 500 });
      }
      driveCalls += 1;
      const method = init?.method ?? "GET";

      // Multipart upload
      if (url.pathname === "/upload/drive/v3/files" && method === "POST") {
        const headers = new Headers(init?.headers);
        const { metadata, content } = parseMultipart(
          init!.body as Uint8Array,
          headers.get("content-type") ?? "",
        );
        uploadCalls += 1;
        const forced = failUploads.get(metadata.name);
        if (forced) {
          return json(
            { error: { status: "ERR", errors: [{ reason: forced === 403 ? "forbidden" : "backendError" }] } },
            forced,
          );
        }
        const item: FakeItem = {
          id: `file-${++idSeq}`,
          name: metadata.name,
          mimeType: "file",
          parents: metadata.parents,
          appKey: metadata.appProperties?.arcKey ?? null,
          bytes: content,
        };
        drive.set(item.id, item);
        return json(itemJson(item));
      }

      // Create folder
      if (url.pathname === "/drive/v3/files" && method === "POST") {
        const body = JSON.parse(String(init!.body)) as {
          name: string;
          mimeType: string;
          parents?: string[];
          appProperties?: { arcKey?: string };
        };
        const item: FakeItem = {
          id: `folder-${++idSeq}`,
          name: body.name,
          mimeType: body.mimeType,
          parents: body.parents ?? ["root"],
          appKey: body.appProperties?.arcKey ?? null,
          bytes: null,
        };
        drive.set(item.id, item);
        return json(itemJson(item));
      }

      // List
      if (url.pathname === "/drive/v3/files" && method === "GET") {
        const q = url.searchParams.get("q") ?? "";
        const appKey = /value='((?:[^'\\]|\\.)*)'/.exec(q)?.[1];
        const name = /(?:^| )name='((?:[^'\\]|\\.)*)'/.exec(q)?.[1];
        const parent = /'([^']+)' in parents/.exec(q)?.[1];
        const files = [...drive.values()].filter(
          (f) =>
            (appKey === undefined || f.appKey === unescapeQ(appKey)) &&
            (name === undefined || f.name === unescapeQ(name)) &&
            (parent === undefined || f.parents.includes(parent)) &&
            (!q.includes("mimeType='") || f.mimeType === MIME_FOLDER),
        );
        return json({ files: files.map(itemJson) });
      }
      return new Response("not mocked", { status: 500 });
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

  // --- fixtures -------------------------------------------------------------

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
    return { cookie, orgId, userId: me.json.userId, vaultFolderId: folder.id };
  };

  type Ctx = Awaited<ReturnType<typeof signupOrg>>;

  const connectDrive = async (ctx: Ctx, googleEmail = "drive@gmail.com") => {
    const refresh = encryptSecret("1//drive-refresh");
    const access = encryptSecret("ya29.drive-access");
    return prisma.userOrganizationGoogleConnection.create({
      data: {
        organizationId: ctx.orgId,
        userId: ctx.userId,
        googleAccountId: `sub-${ctx.userId}`,
        googleEmail,
        refreshTokenCiphertext: refresh.ciphertext,
        refreshTokenNonce: refresh.nonce,
        accessTokenCiphertext: access.ciphertext,
        accessTokenNonce: access.nonce,
        accessTokenExpiresAt: new Date(Date.now() + 3600_000),
        grantedScopes: DRIVE_SCOPES,
        tokenStatus: "ACTIVE",
        driveStatus: "ACTIVE",
      },
    });
  };

  const seedTender = async (
    ctx: Ctx,
    overrides: Partial<{
      referenceNumber: string;
      officialPdfUrl: string | null;
      publicKimdisUrl: string | null;
      pdfText: string | null;
    }> = {},
  ) => {
    const deadline = new Date(Date.UTC(2026, 10, 20));
    const tender = await prisma.tender.create({
      data: {
        referenceNumber: overrides.referenceNumber ?? "26PROC001234567",
        recordType: "PROC",
        title: "Προμήθεια ηλεκτρονικού εξοπλισμού για τα σχολεία του Δήμου",
        contractingAuthority: "Δήμος Δοκιμής",
        finalSubmissionDate: deadline,
        officialPdfUrl:
          overrides.officialPdfUrl === undefined
            ? "https://cerpp.test/khmdhs-opendata/notice/attachment/26PROC001234567"
            : overrides.officialPdfUrl,
        publicKimdisUrl:
          overrides.publicKimdisUrl === undefined
            ? "https://cerpp.test/upgkimdis/unprotected/home.xhtml?referenceNumber=26PROC001234567"
            : overrides.publicKimdisUrl,
        pdfText: overrides.pdfText ?? null,
        firstSeenAt: new Date(),
        lastSeenAt: new Date(),
      },
    });
    const orgTender = await prisma.organizationTender.create({
      data: { organizationId: ctx.orgId, tenderId: tender.id, following: true },
    });
    return { tender, orgTender };
  };

  const READABLE_PDF_TEXT =
    "Φορολογική ενημερότητα απαιτείται. Ασφαλιστική ενημερότητα απαιτείται. " +
    "Προθεσμία υποβολής προσφορών 20/11/2026. Εγγυητική επιστολή συμμετοχής 2% του προϋπολογισμού.";

  const addVaultDoc = async (ctx: Ctx, name: string, label = name) => {
    const { document } = await uploadDocument(prisma, {
      userId: ctx.userId,
      organizationId: ctx.orgId,
      folderId: ctx.vaultFolderId,
      name,
      originalFilename: `${name}.pdf`,
      bytes: pdfBytes(label),
      declaredMimeType: "application/pdf",
      source: "USER_UPLOAD",
    });
    return document;
  };

  const startFolder = (
    ctx: Ctx,
    tenderId: string,
    body: Record<string, unknown> = {},
  ) =>
    authedJson<{ folder: GoogleDriveFolderView; message?: string }>(app, BASE, {
      cookie: ctx.cookie,
      organizationId: ctx.orgId,
      body: { tenderId, ...body },
    });

  const pendingJobs = () =>
    prisma.saasJob.findMany({
      where: { type: SAAS_JOB_TYPES.googleDriveCreateFolder, status: "PENDING" },
      orderBy: { createdAt: "asc" },
    });

  const runJob = async (job: SaasJob, overrides: Partial<SaasJob> = {}) => {
    const result = await processGoogleDriveFolderJob(
      prisma,
      { ...job, ...overrides },
      { kimdis },
    );
    // Like the outbox: settled jobs leave the PENDING queue (retries stay queued).
    if (result !== "retry") {
      await prisma.saasJob.updateMany({
        where: { id: job.id, status: "PENDING" },
        data: { status: "SUCCEEDED" },
      });
    }
    return result;
  };

  const driveFolders = () => [...drive.values()].filter((f) => f.mimeType === MIME_FOLDER);
  const driveFiles = () => [...drive.values()].filter((f) => f.mimeType !== MIME_FOLDER);
  const getLink = (id: string) =>
    prisma.googleDriveFolderLink.findUniqueOrThrow({ where: { id }, include: { items: true } });

  // --- Entitlements / flag --------------------------------------------------

  it("locks Free users out of tender folders", async () => {
    const ctx = await signupOrg("f-free@example.com", "free");
    await connectDrive(ctx);
    const { tender } = await seedTender(ctx);

    const list = await authedJson(app, `${BASE}?tenderId=${tender.id}`, {
      cookie: ctx.cookie,
      organizationId: ctx.orgId,
    });
    expect(list.status).toBe(403);
    const preview = await authedJson(app, `${BASE}/preview`, {
      cookie: ctx.cookie,
      organizationId: ctx.orgId,
      body: { tenderId: tender.id },
    });
    expect(preview.status).toBe(403);
    const start = await startFolder(ctx, tender.id);
    expect(start.status).toBe(403);
    expect(await prisma.googleDriveFolderLink.count()).toBe(0);
    expect(await pendingJobs()).toHaveLength(0);
  });

  it("returns 503 on every folder route when the flag is off", async () => {
    const ctx = await signupOrg("f-off@example.com", "basic");
    await connectDrive(ctx);
    const { tender } = await seedTender(ctx);
    delete process.env.SAAS_GOOGLE_DRIVE_ENABLED;

    const list = await authedJson(app, `${BASE}?tenderId=${tender.id}`, {
      cookie: ctx.cookie,
      organizationId: ctx.orgId,
    });
    expect(list.status).toBe(503);
    for (const route of ["/preview", ""]) {
      const res = await authedJson(app, `${BASE}${route}`, {
        cookie: ctx.cookie,
        organizationId: ctx.orgId,
        body: { tenderId: tender.id },
      });
      expect(res.status).toBe(503);
    }
    const status = await authedJson(app, `${BASE}/jobs/anything`, {
      cookie: ctx.cookie,
      organizationId: ctx.orgId,
    });
    expect(status.status).toBe(503);
    expect(driveCalls).toBe(0);
  });

  // --- Preview --------------------------------------------------------------

  it("previews destination account, name, structure, documents and limits for Basic", async () => {
    const ctx = await signupOrg("f-preview@example.com", "basic");
    await connectDrive(ctx, "tenders@gmail.com");
    const { tender } = await seedTender(ctx, { pdfText: READABLE_PDF_TEXT });
    const doc = await addVaultDoc(ctx, "Φορολογική ενημερότητα");

    const res = await authedJson<TenderDriveFolderPreview>(app, `${BASE}/preview`, {
      cookie: ctx.cookie,
      organizationId: ctx.orgId,
      body: { tenderId: tender.id, vaultDocumentIds: [doc.id] },
    });
    expect(res.status).toBe(200);
    const preview = res.json;
    expect(preview.googleEmail).toBe("tenders@gmail.com");
    expect(preview.messages.destinationEl).toContain("tenders@gmail.com");
    expect(preview.defaultFolderName).toMatch(/^26PROC001234567 — Προμήθεια/);
    expect(preview.structure.map((s) => s.name)).toEqual(DRIVE_FOLDER_SECTIONS.map((s) => s.name));
    expect(preview.officialDocuments).toHaveLength(1);
    expect(preview.officialDocuments[0]!.mode).toBe("pdf");
    expect(preview.vault.documents).toMatchObject([{ id: doc.id, supported: true }]);
    expect(preview.checklist).toMatchObject({ entitled: true, available: true });
    expect(preview.checklist.limitationEl).toContain("δεν επιβεβαιώνει");
    expect(preview.messages.copyHintEl).toBe(DRIVE_FOLDER_COPY_HINT_EL);
    expect(preview.tender.deadlineEl).toBe("20/11/2026");
    expect(preview.existingFolders).toEqual([]);
    expect(JSON.stringify(preview)).not.toContain("ya29");
    // Preview never writes to Drive.
    expect(driveCalls).toBe(0);
    expect(await prisma.googleDriveFolderLink.count()).toBe(0);
  });

  it("does not invent a checklist export when there is no readable analysis", async () => {
    const ctx = await signupOrg("f-nochk@example.com", "basic");
    await connectDrive(ctx);
    const { tender } = await seedTender(ctx, { pdfText: null });
    const res = await authedJson<TenderDriveFolderPreview>(app, `${BASE}/preview`, {
      cookie: ctx.cookie,
      organizationId: ctx.orgId,
      body: { tenderId: tender.id },
    });
    expect(res.json.checklist.available).toBe(false);
    expect(res.json.checklist.reasonEl).toBeTruthy();

    // Even when requested, the job writes no checklist file.
    const started = await startFolder(ctx, tender.id, { includeChecklistSummary: true });
    expect(started.status).toBe(202);
    const [job] = await pendingJobs();
    await runJob(job!);
    const link = await getLink(started.json.folder.id);
    const checklistItem = link.items.find((i) => i.kind === "CHECKLIST")!;
    expect(checklistItem.status).toBe("SKIPPED");
    expect(checklistItem.errorSafe).toBe("checklist_unavailable");
    expect(driveFiles().some((f) => f.name.includes("Έλεγχος δικαιολογητικών"))).toBe(false);
    expect(link.status).toBe("SUCCEEDED");
  });

  // --- Create ---------------------------------------------------------------

  it("creates the folder, three sub-folders, official PDF, vault copy and summary exactly once", async () => {
    const ctx = await signupOrg("f-create@example.com", "basic");
    const conn = await connectDrive(ctx);
    const { tender, orgTender } = await seedTender(ctx, { pdfText: READABLE_PDF_TEXT });
    const doc = await addVaultDoc(ctx, "Ασφαλιστική ενημερότητα", "asf");

    const started = await startFolder(ctx, tender.id, {
      folderName: "Φάκελος δοκιμής",
      vaultDocumentIds: [doc.id],
      includeChecklistSummary: true,
    });
    expect(started.status).toBe(202);
    expect(started.json.folder.status).toBe("PENDING");
    expect(started.json.folder.active).toBe(true);
    // Start never touches Google — the outbox job does.
    expect(driveCalls).toBe(0);

    const jobs = await pendingJobs();
    expect(jobs).toHaveLength(1);
    expect(jobs[0]!.payload).toMatchObject({
      connectionId: conn.id,
      organizationId: ctx.orgId,
      userId: ctx.userId,
      organizationTenderId: orgTender.id,
      tenderId: tender.id,
      folderName: "Φάκελος δοκιμής",
      vaultDocumentIds: [doc.id],
      includeOfficialDocs: true,
      includeChecklistSummary: true,
    });
    expect(JSON.stringify(jobs[0]!.payload)).not.toContain("ya29");

    expect(await runJob(jobs[0]!)).toBe("ok");

    const root = driveFolders().find((f) => f.name === "Φάκελος δοκιμής")!;
    expect(root).toBeTruthy();
    expect(root.parents).toEqual(["root"]);
    const sections = DRIVE_FOLDER_SECTIONS.map(
      (s) => driveFolders().find((f) => f.name === s.name && f.parents.includes(root.id))!,
    );
    expect(sections.every(Boolean)).toBe(true);

    const filesIn = (folderId: string) =>
      driveFiles().filter((f) => f.parents.includes(folderId)).map((f) => f.name);
    expect(filesIn(sections[0]!.id)).toEqual(["26PROC001234567.pdf"]);
    expect(filesIn(sections[1]!.id)).toEqual(["Ασφαλιστική ενημερότητα.pdf"]);
    expect(filesIn(sections[2]!.id)).toEqual(["Έλεγχος δικαιολογητικών (ενδεικτικός).md"]);
    expect(filesIn(root.id)).toEqual(["Σύνοψη διαγωνισμού.md"]);
    expect(driveFolders()).toHaveLength(4);
    expect(driveFiles()).toHaveLength(4);

    const official = driveFiles().find((f) => f.name === "26PROC001234567.pdf")!;
    expect(official.bytes!.toString()).toContain("official");
    const vaultCopy = driveFiles().find((f) => f.name === "Ασφαλιστική ενημερότητα.pdf")!;
    expect(vaultCopy.bytes!.toString()).toContain("asf");

    const summary = driveFiles().find((f) => f.name === "Σύνοψη διαγωνισμού.md")!.bytes!.toString("utf8");
    expect(summary).toContain("26PROC001234567");
    expect(summary).toContain("Δήμος Δοκιμής");
    expect(summary).toContain("Προθεσμία υποβολής: 20/11/2026");
    expect(summary).toContain("Πηγή: ΚΗΜΔΗΣ");
    expect(summary).toContain("/app/tenders/PROC/26PROC001234567");
    expect(summary).toContain("αντίγραφο PDF στον φάκελο");

    const checklist = driveFiles()
      .find((f) => f.name.startsWith("Έλεγχος δικαιολογητικών"))!
      .bytes!.toString("utf8");
    expect(checklist).toContain("δεν επιβεβαιώνει");
    expect(checklist).toContain("δεν αποτελεί πλήρες πακέτο");
    expect(checklist).toContain("Φορολογική ενημερότητα");

    const link = await getLink(started.json.folder.id);
    expect(link.status).toBe("SUCCEEDED");
    expect(link.folderId).toBe(root.id);
    expect(link.folderUrl).toContain(root.id);

    // Status route + list return the success copy and Open link data.
    const status = await authedJson<{ folder: GoogleDriveFolderView }>(
      app,
      `${BASE}/jobs/${link.id}`,
      { cookie: ctx.cookie, organizationId: ctx.orgId },
    );
    expect(status.json.folder).toMatchObject({
      status: "SUCCEEDED",
      active: false,
      successEl: DRIVE_FOLDER_SUCCESS_EL,
      copyHintEl: DRIVE_FOLDER_COPY_HINT_EL,
      folderUrl: link.folderUrl,
      retryable: false,
    });
    const list = await authedJson<{ folders: GoogleDriveFolderView[] }>(
      app,
      `${BASE}?tenderId=${tender.id}`,
      { cookie: ctx.cookie, organizationId: ctx.orgId },
    );
    expect(list.json.folders.map((f) => f.id)).toEqual([link.id]);
    expect(list.json.folders[0]!.googleEmail).toBe("drive@gmail.com");
  });

  it("retrying the same job (even after a crash before the DB write) creates no duplicates", async () => {
    const ctx = await signupOrg("f-idem@example.com", "basic");
    await connectDrive(ctx);
    const { tender } = await seedTender(ctx);
    const doc = await addVaultDoc(ctx, "ΓΕΜΗ");
    const started = await startFolder(ctx, tender.id, { vaultDocumentIds: [doc.id] });
    const [job] = await pendingJobs();

    await runJob(job!);
    const folders = driveFolders().length;
    const files = driveFiles().length;
    const uploadsBefore = uploadCalls;

    // 1. Re-delivery of a finished job is a no-op.
    expect(await runJob(job!)).toBe("ok");
    expect(driveFolders()).toHaveLength(folders);
    expect(driveFiles()).toHaveLength(files);
    expect(uploadCalls).toBe(uploadsBefore);

    // 2. Crash window: Drive has everything but ARC lost the bookkeeping.
    await prisma.googleDriveFolderItem.updateMany({
      where: { linkId: started.json.folder.id },
      data: { status: "PENDING", driveFileId: null },
    });
    await prisma.googleDriveFolderLink.update({
      where: { id: started.json.folder.id },
      data: { status: "PENDING", folderId: null, folderUrl: null, completedAt: null },
    });
    expect(await runJob(job!)).toBe("ok");
    expect(driveFolders()).toHaveLength(folders);
    expect(driveFiles()).toHaveLength(files);
    expect(uploadCalls).toBe(uploadsBefore);
    expect((await getLink(started.json.folder.id)).status).toBe("SUCCEEDED");
  });

  it("dedupes double submits (same request id) and blocks a concurrent second snapshot", async () => {
    const ctx = await signupOrg("f-double@example.com", "basic");
    await connectDrive(ctx);
    const { tender } = await seedTender(ctx);

    const body = { clientRequestId: "dialog-session-0001" };
    const first = await startFolder(ctx, tender.id, body);
    const second = await startFolder(ctx, tender.id, body);
    expect(first.status).toBe(202);
    expect(second.status).toBe(202);
    expect(second.json.folder.id).toBe(first.json.folder.id);
    expect(await prisma.googleDriveFolderLink.count()).toBe(1);
    expect(await pendingJobs()).toHaveLength(1);

    const other = await startFolder(ctx, tender.id, { clientRequestId: "dialog-session-0002" });
    expect(other.status).toBe(409);
    expect(other.json.message).toBe("google_drive_folder_in_progress");
  });

  it("a new snapshot is a new folder and never touches the old one", async () => {
    const ctx = await signupOrg("f-snap@example.com", "basic");
    await connectDrive(ctx);
    const { tender } = await seedTender(ctx);

    const first = await startFolder(ctx, tender.id, { folderName: "Φάκελος Α" });
    await runJob((await pendingJobs())[0]!);
    const afterFirst = [...drive.values()].map((f) => `${f.id}:${f.name}`);
    const firstFiles = driveFiles().map((f) => f.id);

    // The user edits a file in Drive — ARC must never overwrite it.
    const edited = driveFiles().find((f) => f.name === "Σύνοψη διαγωνισμού.md")!;
    edited.bytes = Buffer.from("edited by user");

    const second = await startFolder(ctx, tender.id, { folderName: "Φάκελος Β" });
    expect(second.status).toBe(202);
    expect(second.json.folder.id).not.toBe(first.json.folder.id);
    await runJob((await pendingJobs())[0]!);

    for (const entry of afterFirst) {
      const [id, ...name] = entry.split(":");
      expect(drive.get(id!)!.name).toBe(name.join(":"));
    }
    expect(drive.get(edited.id)!.bytes!.toString()).toBe("edited by user");
    expect(firstFiles.every((id) => drive.has(id))).toBe(true);
    expect(driveFolders().filter((f) => f.parents.includes("root"))).toHaveLength(2);

    const links = await prisma.googleDriveFolderLink.findMany({ orderBy: { createdAt: "asc" } });
    expect(links.map((l) => l.folderName)).toEqual(["Φάκελος Α", "Φάκελος Β"]);
    expect(new Set(links.map((l) => l.folderId)).size).toBe(2);
  });

  // --- Partial failure ------------------------------------------------------

  it("shows what completed on partial failure and retries only the failed files", async () => {
    const ctx = await signupOrg("f-partial@example.com", "basic");
    await connectDrive(ctx);
    const { tender } = await seedTender(ctx);
    const good = await addVaultDoc(ctx, "Καλό έγγραφο");
    const bad = await addVaultDoc(ctx, "Προβληματικό έγγραφο");
    failUploads.set("Προβληματικό έγγραφο.pdf", 403);

    const started = await startFolder(ctx, tender.id, { vaultDocumentIds: [good.id, bad.id] });
    const [job] = await pendingJobs();
    expect(await runJob(job!)).toBe("ok");

    const status = await authedJson<{ folder: GoogleDriveFolderView }>(
      app,
      `${BASE}/jobs/${started.json.folder.id}`,
      { cookie: ctx.cookie, organizationId: ctx.orgId },
    );
    const folder = status.json.folder;
    expect(folder.status).toBe("PARTIAL");
    expect(folder.successEl).toBeNull();
    expect(folder.retryable).toBe(true);
    expect(folder.folderUrl).toBeTruthy();
    const byName = (name: string) => folder.items.find((i) => i.name === name)!;
    expect(byName("Καλό έγγραφο.pdf").status).toBe("SUCCEEDED");
    expect(byName("Προβληματικό έγγραφο.pdf")).toMatchObject({
      status: "FAILED",
      errorCode: "drive_denied",
      retryable: true,
    });
    expect(driveFiles().map((f) => f.name)).toContain("Καλό έγγραφο.pdf");
    expect(driveFiles().map((f) => f.name)).not.toContain("Προβληματικό έγγραφο.pdf");

    // Retry only the failed file: nothing else is re-uploaded or re-created.
    failUploads.clear();
    const foldersBefore = driveFolders().length;
    const filesBefore = driveFiles().length;
    uploadCalls = 0;
    const retry = await authedJson<{ folder: GoogleDriveFolderView }>(
      app,
      `${BASE}/${started.json.folder.id}/retry`,
      { cookie: ctx.cookie, organizationId: ctx.orgId, method: "POST", body: {} },
    );
    expect(retry.status).toBe(202);
    expect(retry.json.folder.status).toBe("PENDING");

    // The superseded job (old epoch) does nothing.
    expect(await runJob(job!)).toBe("skip");
    const retryJobs = await pendingJobs();
    const retryJob = retryJobs.find((j) => (j.payload as { jobEpoch: number }).jobEpoch === 1)!;
    expect(retryJob).toBeTruthy();
    expect(await runJob(retryJob)).toBe("ok");

    expect(uploadCalls).toBe(1);
    expect(driveFolders()).toHaveLength(foldersBefore);
    expect(driveFiles()).toHaveLength(filesBefore + 1);
    expect(driveFiles().filter((f) => f.name === "Καλό έγγραφο.pdf")).toHaveLength(1);
    const link = await getLink(started.json.folder.id);
    expect(link.status).toBe("SUCCEEDED");
    expect(link.errorSafe).toBeNull();

    const again = await authedJson<{ message: string }>(
      app,
      `${BASE}/${started.json.folder.id}/retry`,
      { cookie: ctx.cookie, organizationId: ctx.orgId, method: "POST", body: {} },
    );
    expect(again.status).toBe(400);
    expect(again.json.message).toBe("google_drive_folder_nothing_to_retry");
  });

  it("retries a transient Drive error with backoff and fails safely on the last attempt", async () => {
    const ctx = await signupOrg("f-transient@example.com", "basic");
    await connectDrive(ctx);
    const { tender } = await seedTender(ctx);
    const doc = await addVaultDoc(ctx, "Έγγραφο");
    failUploads.set("Έγγραφο.pdf", 500);

    const started = await startFolder(ctx, tender.id, { vaultDocumentIds: [doc.id] });
    const [job] = await pendingJobs();
    expect(await runJob(job!, { attempts: 1 })).toBe("retry");
    expect((await getLink(started.json.folder.id)).status).toBe("PENDING");

    expect(await runJob(job!, { attempts: job!.maxAttempts })).toBe("ok");
    const link = await getLink(started.json.folder.id);
    expect(link.status).toBe("PARTIAL");
    expect(link.items.find((i) => i.sourceRef === doc.id)!.errorSafe).toBe("drive_unavailable");
  });

  // --- Official docs --------------------------------------------------------

  it("puts only the link in the summary when no PDF bytes exist", async () => {
    const ctx = await signupOrg("f-linkonly@example.com", "basic");
    await connectDrive(ctx);
    const { tender } = await seedTender(ctx);
    kimdisPdf = null; // KIMDIS has no attachment
    const started = await startFolder(ctx, tender.id);
    await runJob((await pendingJobs())[0]!);

    const link = await getLink(started.json.folder.id);
    const official = link.items.find((i) => i.kind === "OFFICIAL_PDF")!;
    expect(official).toMatchObject({ status: "SKIPPED", errorSafe: "link_only" });
    expect(link.status).toBe("SUCCEEDED");
    expect(driveFiles().map((f) => f.name)).toEqual(["Σύνοψη διαγωνισμού.md"]);
    const summary = driveFiles()[0]!.bytes!.toString("utf8");
    expect(summary).toContain("μόνο σύνδεσμος — δεν αντιγράφηκε αρχείο PDF");
    expect(summary).toContain("https://cerpp.test/khmdhs-opendata/notice/attachment/26PROC001234567");
    expect(summary).not.toContain("αντίγραφο PDF στον φάκελο");
  });

  it("treats a non-PDF attachment and a link-only tender as link-only", async () => {
    const ctx = await signupOrg("f-linkonly2@example.com", "basic");
    await connectDrive(ctx);
    const { tender } = await seedTender(ctx, { officialPdfUrl: null });

    const preview = await authedJson<TenderDriveFolderPreview>(app, `${BASE}/preview`, {
      cookie: ctx.cookie,
      organizationId: ctx.orgId,
      body: { tenderId: tender.id },
    });
    expect(preview.json.officialDocuments).toMatchObject([{ mode: "link_only" }]);
    expect(preview.json.officialDocuments[0]!.modeLabelEl).toContain("δεν θα αντιγραφεί αρχείο PDF");

    const started = await startFolder(ctx, tender.id);
    // (The preview's checklist analysis may fetch the PDF itself — only count the job.)
    downloadAttachment.mockClear();
    await runJob((await pendingJobs())[0]!);
    // No download is attempted for link-only candidates.
    expect(downloadAttachment).not.toHaveBeenCalled();
    const link = await getLink(started.json.folder.id);
    expect(link.items.some((i) => i.kind === "OFFICIAL_PDF")).toBe(false);
    expect(driveFiles()[0]!.bytes!.toString("utf8")).toContain("μόνο σύνδεσμος");

    // HTML error page served instead of a PDF → still link-only.
    const second = await signupOrg("f-linkonly3@example.com", "basic");
    await connectDrive(second);
    const seeded = await seedTender(second, { referenceNumber: "26PROC000000002" });
    kimdisPdf = Buffer.from("<html>not a pdf</html>");
    const started2 = await startFolder(second, seeded.tender.id);
    await runJob((await pendingJobs())[0]!);
    const link2 = await getLink(started2.json.folder.id);
    expect(link2.items.find((i) => i.kind === "OFFICIAL_PDF")).toMatchObject({
      status: "SKIPPED",
      errorSafe: "link_only",
    });
  });

  // --- Checklist entitlement ------------------------------------------------

  it("gates the checklist summary on the participationChecklist entitlement", async () => {
    const ctx = await signupOrg("f-gate@example.com", "basic");
    await connectDrive(ctx);
    const { tender } = await seedTender(ctx, { pdfText: READABLE_PDF_TEXT });

    const original = BASIC_PLAN.participationChecklist;
    BASIC_PLAN.participationChecklist = false;
    try {
      const preview = await authedJson<TenderDriveFolderPreview>(app, `${BASE}/preview`, {
        cookie: ctx.cookie,
        organizationId: ctx.orgId,
        body: { tenderId: tender.id },
      });
      expect(preview.status).toBe(200);
      expect(preview.json.checklist).toMatchObject({ entitled: false, available: false });
      const denied = await startFolder(ctx, tender.id, { includeChecklistSummary: true });
      expect(denied.status).toBe(403);
      expect(await prisma.googleDriveFolderLink.count()).toBe(0);

      // Without the option the folder is still created, with no checklist item.
      const ok = await startFolder(ctx, tender.id);
      expect(ok.status).toBe(202);
      const link = await getLink(ok.json.folder.id);
      expect(link.items.some((i) => i.kind === "CHECKLIST")).toBe(false);
    } finally {
      BASIC_PLAN.participationChecklist = original;
    }
  });

  // --- Stale jobs / disconnect ----------------------------------------------

  it("skips a stale job after the Google account changed", async () => {
    const ctx = await signupOrg("f-stale@example.com", "basic");
    const conn = await connectDrive(ctx);
    const { tender } = await seedTender(ctx);
    const started = await startFolder(ctx, tender.id);
    const [job] = await pendingJobs();

    await prisma.userOrganizationGoogleConnection.update({
      where: { id: conn.id },
      data: { googleAccountId: "someone-else", googleEmail: "other@gmail.com" },
    });
    expect(await runJob(job!)).toBe("ok");
    expect(driveCalls).toBe(0);
    expect(drive.size).toBe(0);
    const link = await getLink(started.json.folder.id);
    expect(link).toMatchObject({ status: "FAILED", errorSafe: "account_changed" });

    const retry = await authedJson<{ message: string }>(app, `${BASE}/${link.id}/retry`, {
      cookie: ctx.cookie,
      organizationId: ctx.orgId,
      method: "POST",
      body: {},
    });
    expect(retry.status).toBe(400);
    expect(retry.json.message).toBe("google_drive_folder_account_changed");

    // The old folder stays visible, labelled with the account it was created in.
    const list = await authedJson<{ folders: GoogleDriveFolderView[] }>(
      app,
      `${BASE}?tenderId=${tender.id}`,
      { cookie: ctx.cookie, organizationId: ctx.orgId },
    );
    expect(list.json.folders[0]).toMatchObject({
      googleEmail: "drive@gmail.com",
      retryable: false,
    });
  });

  it("cancels queued folder jobs when Drive is disconnected, leaving Calendar alone", async () => {
    const ctx = await signupOrg("f-disc@example.com", "basic");
    await connectDrive(ctx);
    const { tender } = await seedTender(ctx);
    const started = await startFolder(ctx, tender.id);
    const calendarJob = await prisma.saasJob.create({
      data: {
        type: SAAS_JOB_TYPES.googleCalendarFullSync,
        deliveryKey: "GICAL_FULL:keep",
        organizationId: ctx.orgId,
        payload: { connectionId: (await prisma.userOrganizationGoogleConnection.findFirstOrThrow()).id },
      },
    });

    const res = await authedJson(app, "/api/saas/integrations/google/disconnect", {
      cookie: ctx.cookie,
      organizationId: ctx.orgId,
      body: { capability: "drive" },
    });
    expect(res.status).toBe(200);

    const folderJob = await prisma.saasJob.findFirstOrThrow({
      where: { type: SAAS_JOB_TYPES.googleDriveCreateFolder },
    });
    expect(folderJob.status).toBe("CANCELLED");
    expect((await prisma.saasJob.findUniqueOrThrow({ where: { id: calendarJob.id } })).status).toBe("PENDING");
    const link = await getLink(started.json.folder.id);
    expect(link).toMatchObject({ status: "FAILED", errorSafe: "connection_stopped" });

    // A job that still runs afterwards does not write to Drive.
    expect(await runJob({ ...folderJob, status: "PENDING" })).toBe("ok");
    expect(driveCalls).toBe(0);
  });

  it("marks the connection for reconnect when Drive rejects the token", async () => {
    const ctx = await signupOrg("f-auth@example.com", "basic");
    const conn = await connectDrive(ctx);
    const { tender } = await seedTender(ctx);
    const started = await startFolder(ctx, tender.id);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: { status: "UNAUTHENTICATED" } }), { status: 401 })),
    );
    const [job] = await pendingJobs();
    expect(await runJob(job!)).toBe("ok");
    const link = await getLink(started.json.folder.id);
    expect(link).toMatchObject({ status: "FAILED", errorSafe: "needs_reconnect" });
    const row = await prisma.userOrganizationGoogleConnection.findUniqueOrThrow({ where: { id: conn.id } });
    expect(row.driveStatus).toBe("NEEDS_RECONNECT");
  });

  // --- Isolation ------------------------------------------------------------

  it("isolates folders, tenders and vault documents between organizations", async () => {
    const a = await signupOrg("f-iso-a@example.com", "basic");
    const b = await signupOrg("f-iso-b@example.com", "basic");
    await connectDrive(a);
    await connectDrive(b);
    const tenderA = await seedTender(a);
    const tenderB = await seedTender(b, { referenceNumber: "26PROC000000777" });
    const docA = await addVaultDoc(a, "Μυστικό");

    const started = await startFolder(a, tenderA.tender.id);
    await runJob((await pendingJobs())[0]!);
    const linkId = started.json.folder.id;

    // B cannot read, poll or retry A's snapshot.
    const listB = await authedJson<{ folders: GoogleDriveFolderView[] }>(
      app,
      `${BASE}?tenderId=${tenderA.tender.id}`,
      { cookie: b.cookie, organizationId: b.orgId },
    );
    expect(listB.json.folders).toEqual([]);
    const statusB = await authedJson(app, `${BASE}/jobs/${linkId}`, {
      cookie: b.cookie,
      organizationId: b.orgId,
    });
    expect(statusB.status).toBe(404);
    const retryB = await authedJson(app, `${BASE}/${linkId}/retry`, {
      cookie: b.cookie,
      organizationId: b.orgId,
      method: "POST",
      body: {},
    });
    expect(retryB.status).toBe(404);

    // B cannot snapshot A's tender or attach A's vault documents.
    const foreignTender = await startFolder(b, tenderA.tender.id);
    expect(foreignTender.status).toBe(404);
    expect(foreignTender.json.message).toBe("tender_not_in_workspace");
    const foreignDoc = await startFolder(b, tenderB.tender.id, { vaultDocumentIds: [docA.id] });
    expect(foreignDoc.status).toBe(404);
    expect(foreignDoc.json.message).toBe("vault_document_not_found");
    const foreignPreview = await authedJson(app, `${BASE}/preview`, {
      cookie: b.cookie,
      organizationId: b.orgId,
      body: { tenderId: tenderB.tender.id, vaultDocumentIds: [docA.id] },
    });
    expect(foreignPreview.status).toBe(404);
    expect(await prisma.googleDriveFolderLink.count({ where: { organizationId: b.orgId } })).toBe(0);
  });

  it("caps the number of vault documents per folder", async () => {
    const ctx = await signupOrg("f-cap@example.com", "basic");
    await connectDrive(ctx);
    const { tender } = await seedTender(ctx);
    const res = await startFolder(ctx, tender.id, {
      vaultDocumentIds: Array.from({ length: 21 }, (_, i) => `doc${i}`),
    });
    expect(res.status).toBe(400);
    expect(res.json.message).toBe("google_drive_folder_too_many_documents");
  });
});
