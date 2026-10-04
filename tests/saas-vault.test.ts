import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_FOLDERS,
  captureSubmissionDocumentSnapshots,
  computeStatus,
  createWorkspaceDocumentRef,
  listDocuments,
  setDocumentStorageForTests,
  uploadDocument,
  uploadNewVersion,
} from "../src/saas/services/vault.js";
import { createLocalDocumentStorage } from "../src/saas/storage/document-storage.js";
import {
  createSaasTestApp,
  getSaasTestPrisma,
  resetSaasDatabase,
  signUpAndGetCookie,
  authedJson,
} from "./helpers/saas-test.js";
import os from "node:os";
import path from "node:path";
import { mkdtempSync, rmSync } from "node:fs";

const prisma = getSaasTestPrisma();
let tempStorageDir = "";

describe("SaaS company vault", () => {
  beforeEach(async () => {
    await resetSaasDatabase(prisma);
    tempStorageDir = mkdtempSync(path.join(os.tmpdir(), "tekia-vault-"));
    setDocumentStorageForTests(createLocalDocumentStorage(tempStorageDir));
  });

  afterAll(async () => {
    setDocumentStorageForTests(null);
    await prisma.$disconnect();
  });

  afterEach(() => {
    if (tempStorageDir) {
      rmSync(tempStorageDir, { recursive: true, force: true });
      tempStorageDir = "";
    }
  });

  it("seeds default folders per organization on first GET", async () => {
    const { app } = createSaasTestApp(prisma);
    const user = await signUpAndGetCookie(app, {
      name: "Vault User",
      email: `vault-${Date.now()}@example.com`,
      password: "password123",
    });
    const org = await authedJson<{ organization: { id: string } }>(
      app,
      "/api/saas/organizations",
      { cookie: user.cookie, body: { name: "Vault Org" } },
    );
    expect(org.status).toBe(201);

    const foldersRes = await authedJson<{ folders: { slug: string; isSystem: boolean }[] }>(
      app,
      "/api/saas/vault/folders",
      { cookie: user.cookie, organizationId: org.json.organization.id },
    );
    expect(foldersRes.status).toBe(200);
    expect(foldersRes.json.folders).toHaveLength(DEFAULT_FOLDERS.length);
    expect(foldersRes.json.folders.every((f) => f.isSystem)).toBe(true);
  });

  it("Organization A cannot list Organization B vault documents", async () => {
    const { app } = createSaasTestApp(prisma);
    const a = await signUpAndGetCookie(app, {
      name: "User A",
      email: `va-${Date.now()}@example.com`,
      password: "password123",
    });
    const b = await signUpAndGetCookie(app, {
      name: "User B",
      email: `vb-${Date.now()}@example.com`,
      password: "password123",
    });

    const orgA = await authedJson<{ organization: { id: string } }>(
      app,
      "/api/saas/organizations",
      { cookie: a.cookie, body: { name: "Org A" } },
    );
    const orgB = await authedJson<{ organization: { id: string } }>(
      app,
      "/api/saas/organizations",
      { cookie: b.cookie, body: { name: "Org B" } },
    );

    const foldersA = await authedJson<{ folders: { id: string }[] }>(
      app,
      "/api/saas/vault/folders",
      { cookie: a.cookie, organizationId: orgA.json.organization.id },
    );
    const folderId = foldersA.json.folders[0]!.id;

    await authedJson(app, "/api/saas/vault/documents", {
      cookie: a.cookie,
      organizationId: orgA.json.organization.id,
      body: { folderId, name: "Secret cert" },
    });

    const crossList = await authedJson(app, "/api/saas/vault/documents", {
      cookie: a.cookie,
      organizationId: orgB.json.organization.id,
      method: "GET",
    });
    expect(crossList.status).toBe(403);
  });

  it("rejects unsupported upload types and persists PDF metadata", async () => {
    const { app } = createSaasTestApp(prisma);
    const user = await signUpAndGetCookie(app, {
      name: "Upload User",
      email: `up-${Date.now()}@example.com`,
      password: "password123",
    });
    const org = await authedJson<{ organization: { id: string } }>(
      app,
      "/api/saas/organizations",
      { cookie: user.cookie, body: { name: "Upload Org" } },
    );
    const organizationId = org.json.organization.id;
    const folders = await authedJson<{ folders: { id: string }[] }>(
      app,
      "/api/saas/vault/folders",
      { cookie: user.cookie, organizationId },
    );
    const dbUser = await prisma.user.findFirstOrThrow({
      where: { name: "Upload User" },
    });

    await expect(
      uploadDocument(prisma, {
        userId: dbUser.id,
        organizationId,
        folderId: folders.json.folders[0]!.id,
        name: "Bad",
        originalFilename: "notes.txt",
        bytes: Buffer.from("hello"),
      }),
    ).rejects.toMatchObject({
      code: "bad_request",
      message: "vault_unsupported_file_type",
    });

    const uploaded = await uploadDocument(prisma, {
      userId: dbUser.id,
      organizationId,
      folderId: folders.json.folders[0]!.id,
      name: "Πιστοποιητικό ΓΕΜΗ",
      originalFilename: "gemi.pdf",
      bytes: Buffer.from("%PDF-1.4 fake"),
      documentType: "Πιστοποιητικό ΓΕΜΗ",
      noExpiry: true,
    });
    expect(uploaded.document.name).toBe("Πιστοποιητικό ΓΕΜΗ");
    expect(uploaded.document.mimeType).toBe("application/pdf");
    expect(uploaded.document.status).toBe("NO_EXPIRY");
    expect(uploaded.version.version).toBe(1);

    const docs = await listDocuments(prisma, {
      userId: dbUser.id,
      organizationId,
      folderId: folders.json.folders[0]!.id,
    });
    expect(docs).toHaveLength(1);
    expect(docs[0]?.folderId).toBe(folders.json.folders[0]!.id);
  });

  it("derives expiry status correctly", () => {
    const now = new Date("2026-10-04T12:00:00.000Z");
    expect(computeStatus({ noExpiry: true }, now)).toBe("NO_EXPIRY");
    expect(
      computeStatus(
        { expiryDate: new Date("2026-09-01T00:00:00.000Z"), noExpiry: false },
        now,
      ),
    ).toBe("EXPIRED");
    expect(
      computeStatus(
        { expiryDate: new Date("2026-10-20T00:00:00.000Z"), noExpiry: false },
        now,
      ),
    ).toBe("EXPIRING_SOON");
    expect(
      computeStatus(
        { expiryDate: new Date("2027-01-01T00:00:00.000Z"), noExpiry: false },
        now,
      ),
    ).toBe("VALID");
  });

  it("new version preserves old version and updates current", async () => {
    const { app } = createSaasTestApp(prisma);
    const user = await signUpAndGetCookie(app, {
      name: "Version User",
      email: `ver-${Date.now()}@example.com`,
      password: "password123",
    });
    const org = await authedJson<{ organization: { id: string } }>(
      app,
      "/api/saas/organizations",
      { cookie: user.cookie, body: { name: "Version Org" } },
    );
    const organizationId = org.json.organization.id;
    const folders = await authedJson<{ folders: { id: string }[] }>(
      app,
      "/api/saas/vault/folders",
      { cookie: user.cookie, organizationId },
    );
    const dbUser = await prisma.user.findFirstOrThrow({
      where: { name: "Version User" },
    });

    const first = await uploadDocument(prisma, {
      userId: dbUser.id,
      organizationId,
      folderId: folders.json.folders[0]!.id,
      name: "Φορολογική",
      originalFilename: "tax-v1.pdf",
      bytes: Buffer.from("%PDF-v1"),
    });
    const second = await uploadNewVersion(prisma, {
      userId: dbUser.id,
      organizationId,
      documentId: first.document.id,
      originalFilename: "tax-v2.pdf",
      bytes: Buffer.from("%PDF-v2"),
    });

    expect(second.document.version).toBe(2);
    const versions = await prisma.vaultDocumentVersion.findMany({
      where: { documentId: first.document.id },
      orderBy: { version: "asc" },
    });
    expect(versions).toHaveLength(2);
    expect(versions[0]!.storageKey).not.toBe(versions[1]!.storageKey);
  });

  it("one vault document can be referenced by two tender workspaces and snapshot preserves version", async () => {
    const { app } = createSaasTestApp(prisma);
    const user = await signUpAndGetCookie(app, {
      name: "Workspace User",
      email: `ws-${Date.now()}@example.com`,
      password: "password123",
    });
    const org = await authedJson<{ organization: { id: string } }>(
      app,
      "/api/saas/organizations",
      { cookie: user.cookie, body: { name: "WS Org" } },
    );
    const organizationId = org.json.organization.id;
    const folders = await authedJson<{ folders: { id: string }[] }>(
      app,
      "/api/saas/vault/folders",
      { cookie: user.cookie, organizationId },
    );
    const dbUser = await prisma.user.findFirstOrThrow({
      where: { name: "Workspace User" },
    });

    const uploaded = await uploadDocument(prisma, {
      userId: dbUser.id,
      organizationId,
      folderId: folders.json.folders[0]!.id,
      name: "Shared ISO cert",
      originalFilename: "iso.pdf",
      bytes: Buffer.from("%PDF-iso"),
    });

    const ws1 = await prisma.tenderWorkspace.create({
      data: { organizationId, name: "Tender workspace 1" },
    });
    const ws2 = await prisma.tenderWorkspace.create({
      data: { organizationId, name: "Tender workspace 2" },
    });

    const ref1 = await createWorkspaceDocumentRef(prisma, {
      userId: dbUser.id,
      organizationId,
      workspaceId: ws1.id,
      documentId: uploaded.document.id,
      folderHint: "05",
    });
    const ref2 = await createWorkspaceDocumentRef(prisma, {
      userId: dbUser.id,
      organizationId,
      workspaceId: ws2.id,
      documentId: uploaded.document.id,
    });

    expect(ref1.documentId).toBe(uploaded.document.id);
    expect(ref2.documentId).toBe(uploaded.document.id);
    expect(ref1.documentVersionId).toBe(uploaded.version.id);

    const now = new Date();
    const tender = await prisma.tender.create({
      data: {
        referenceNumber: `26REQ${Date.now()}`,
        recordType: "REQ",
        title: "Snapshot tender",
        firstSeenAt: now,
        lastSeenAt: now,
      },
    });
    const orgTender = await prisma.organizationTender.create({
      data: {
        organizationId,
        tenderId: tender.id,
        following: true,
        monitoringActive: true,
      },
    });
    const submission = await prisma.submission.create({
      data: {
        organizationId,
        organizationTenderId: orgTender.id,
        submittedAt: now,
        submissionMethod: "EMAIL",
      },
    });

    const snapshots = await captureSubmissionDocumentSnapshots(prisma, {
      userId: dbUser.id,
      organizationId,
      submissionId: submission.id,
      items: [
        {
          documentId: uploaded.document.id,
          documentVersionId: uploaded.version.id,
          purpose: "δικαιολογητικά",
        },
      ],
    });
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]!.storageKeySnapshot).toBe(uploaded.version.storageKey);

    await uploadNewVersion(prisma, {
      userId: dbUser.id,
      organizationId,
      documentId: uploaded.document.id,
      originalFilename: "iso-v2.pdf",
      bytes: Buffer.from("%PDF-iso-v2"),
    });

    const frozen = await prisma.submissionDocumentSnapshot.findFirstOrThrow({
      where: { id: snapshots[0]!.id },
    });
    expect(frozen.storageKeySnapshot).toBe(uploaded.version.storageKey);
    expect(frozen.documentVersionId).toBe(uploaded.version.id);
  });

  it("denies download across tenants", async () => {
    const { app } = createSaasTestApp(prisma);
    const a = await signUpAndGetCookie(app, {
      name: "DL A",
      email: `dla-${Date.now()}@example.com`,
      password: "password123",
    });
    const b = await signUpAndGetCookie(app, {
      name: "DL B",
      email: `dlb-${Date.now()}@example.com`,
      password: "password123",
    });
    const orgA = await authedJson<{ organization: { id: string } }>(
      app,
      "/api/saas/organizations",
      { cookie: a.cookie, body: { name: "DL Org A" } },
    );
    const orgB = await authedJson<{ organization: { id: string } }>(
      app,
      "/api/saas/organizations",
      { cookie: b.cookie, body: { name: "DL Org B" } },
    );
    const folders = await authedJson<{ folders: { id: string }[] }>(
      app,
      "/api/saas/vault/folders",
      { cookie: a.cookie, organizationId: orgA.json.organization.id },
    );
    const dbUser = await prisma.user.findFirstOrThrow({ where: { name: "DL A" } });
    const uploaded = await uploadDocument(prisma, {
      userId: dbUser.id,
      organizationId: orgA.json.organization.id,
      folderId: folders.json.folders[0]!.id,
      name: "Private",
      originalFilename: "private.pdf",
      bytes: Buffer.from("%PDF-private"),
    });

    const denied = await app.request(
      `/api/saas/vault/documents/${uploaded.document.id}/download`,
      {
        headers: {
          cookie: b.cookie,
          "X-Organization-Id": orgB.json.organization.id,
        },
      },
    );
    expect(denied.status).toBe(404);
  });
});
