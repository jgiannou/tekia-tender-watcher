import type {
  PrismaClient,
  VaultDocumentSource,
  VaultDocumentStatus,
} from "@prisma/client";
import { badRequest, conflict, notFound } from "../errors.js";
import { requireOrgMembership } from "../auth/org-context.js";
import { getOrganizationEntitlements } from "./entitlements.js";
import {
  ALLOWED_VAULT_EXTENSIONS,
  createLocalDocumentStorage,
  resolveVaultMimeType,
  type DocumentStorageProvider,
} from "../storage/document-storage.js";
import path from "node:path";

/** Default top-level vault folders (Greek company document taxonomy). */
export const DEFAULT_FOLDERS = [
  { sortOrder: 0, slug: "00", name: "00 — Εταιρικά Στοιχεία" },
  { sortOrder: 1, slug: "01", name: "01 — ΓΕΜΗ & Νομιμοποιητικά" },
  { sortOrder: 2, slug: "02", name: "02 — Φορολογικά" },
  { sortOrder: 3, slug: "03", name: "03 — Ασφαλιστικά" },
  { sortOrder: 4, slug: "04", name: "04 — Δηλώσεις & Εξουσιοδοτήσεις" },
  { sortOrder: 5, slug: "05", name: "05 — Πιστοποιήσεις & Άδειες" },
  { sortOrder: 6, slug: "06", name: "06 — Οικονομικά / Τραπεζικά" },
  { sortOrder: 7, slug: "07", name: "07 — Τεχνική Ικανότητα & Εμπειρία" },
  { sortOrder: 8, slug: "08", name: "08 — Εταιρικό Προφίλ" },
  { sortOrder: 9, slug: "09", name: "09 — Πρότυπα" },
] as const;

export const EXPIRING_SOON_DAYS = 30;

let storageSingleton: DocumentStorageProvider | null = null;

export const getDocumentStorage = (): DocumentStorageProvider => {
  if (!storageSingleton) {
    storageSingleton = createLocalDocumentStorage();
  }
  return storageSingleton;
};

/** Test-only override. */
export const setDocumentStorageForTests = (
  storage: DocumentStorageProvider | null,
) => {
  storageSingleton = storage;
};

export const computeStatus = (
  input: {
    expiryDate?: Date | null;
    noExpiry?: boolean;
  },
  now = new Date(),
): VaultDocumentStatus => {
  if (input.noExpiry !== false && !input.expiryDate) return "NO_EXPIRY";
  if (!input.expiryDate) return "NO_EXPIRY";
  const expiry =
    input.expiryDate instanceof Date
      ? input.expiryDate
      : new Date(input.expiryDate);
  if (Number.isNaN(expiry.getTime())) return "NO_EXPIRY";
  if (expiry.getTime() < now.getTime()) return "EXPIRED";
  const soonMs = EXPIRING_SOON_DAYS * 24 * 60 * 60 * 1000;
  if (expiry.getTime() - now.getTime() <= soonMs) return "EXPIRING_SOON";
  return "VALID";
};

const slugifyFolderName = (name: string): string => {
  const normalized = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
  const slug = normalized
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || `folder-${Date.now().toString(36)}`;
};

const assertUniqueFolderSlug = async (
  prisma: PrismaClient,
  organizationId: string,
  parentId: string | null | undefined,
  slug: string,
  excludeFolderId?: string,
) => {
  const existing = await prisma.vaultFolder.findFirst({
    where: {
      organizationId,
      parentId: parentId ?? null,
      slug,
      ...(excludeFolderId ? { NOT: { id: excludeFolderId } } : {}),
    },
  });
  if (existing) throw badRequest("vault_folder_slug_exists");
};

export const ensureVaultFolders = async (
  prisma: PrismaClient,
  organizationId: string,
) => {
  const count = await prisma.vaultFolder.count({ where: { organizationId } });
  if (count > 0) return;

  await prisma.vaultFolder.createMany({
    data: DEFAULT_FOLDERS.map((folder) => ({
      organizationId,
      parentId: null,
      name: folder.name,
      slug: folder.slug,
      sortOrder: folder.sortOrder,
      isSystem: true,
    })),
  });
};

export const listFolders = async (
  prisma: PrismaClient,
  input: { userId: string; organizationId: string | null },
) => {
  const { organizationId } = await requireOrgMembership(
    prisma,
    input.userId,
    input.organizationId,
  );
  return prisma.vaultFolder.findMany({
    where: { organizationId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
};

export const createFolder = async (
  prisma: PrismaClient,
  input: {
    userId: string;
    organizationId: string | null;
    name: string;
    parentId?: string | null;
  },
) => {
  const { organizationId } = await requireOrgMembership(
    prisma,
    input.userId,
    input.organizationId,
  );
  const name = input.name.trim();
  if (!name) throw badRequest("vault_folder_name_required");

  const parentId = input.parentId ?? null;
  if (parentId) {
    const parent = await prisma.vaultFolder.findFirst({
      where: { id: parentId, organizationId },
    });
    if (!parent) throw notFound("vault_folder_parent_not_found");
  }

  const slug = slugifyFolderName(name);
  await assertUniqueFolderSlug(prisma, organizationId, parentId, slug);

  const maxSort = await prisma.vaultFolder.aggregate({
    where: { organizationId, parentId },
    _max: { sortOrder: true },
  });

  return prisma.vaultFolder.create({
    data: {
      organizationId,
      parentId,
      name,
      slug,
      sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
      isSystem: false,
    },
  });
};

const mapDocument = <T extends { expiryDate: Date | null; noExpiry?: boolean }>(
  doc: T,
) => ({
  ...doc,
  status: computeStatus({
    expiryDate: doc.expiryDate,
    noExpiry: doc.noExpiry,
  }),
});

export const listDocuments = async (
  prisma: PrismaClient,
  input: {
    userId: string;
    organizationId: string | null;
    folderId?: string | null;
    q?: string | null;
  },
) => {
  const { organizationId } = await requireOrgMembership(
    prisma,
    input.userId,
    input.organizationId,
  );

  if (input.folderId) {
    const folder = await prisma.vaultFolder.findFirst({
      where: { id: input.folderId, organizationId },
    });
    if (!folder) throw notFound("vault_folder_not_found");
  }

  const q = input.q?.trim();
  const rows = await prisma.vaultDocument.findMany({
    where: {
      organizationId,
      ...(input.folderId ? { folderId: input.folderId } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { documentType: { contains: q, mode: "insensitive" } },
              { notes: { contains: q, mode: "insensitive" } },
              { originalFilename: { contains: q, mode: "insensitive" } },
              { folder: { name: { contains: q, mode: "insensitive" } } },
            ],
          }
        : {}),
    },
    include: { folder: { select: { id: true, name: true } } },
    orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
  });

  return rows.map(mapDocument);
};

export const getDocumentForOrg = async (
  prisma: PrismaClient,
  input: { userId: string; organizationId: string | null; documentId: string },
) => {
  const { organizationId } = await requireOrgMembership(
    prisma,
    input.userId,
    input.organizationId,
  );
  const document = await prisma.vaultDocument.findFirst({
    where: { id: input.documentId, organizationId },
    include: {
      folder: { select: { id: true, name: true } },
      versions: { orderBy: { version: "desc" } },
    },
  });
  if (!document) throw notFound("vault_document_not_found");
  return mapDocument(document);
};

const assertSupportedFile = (filename: string, mimeType?: string | null) => {
  const ext = path.extname(filename).toLowerCase();
  if (!ALLOWED_VAULT_EXTENSIONS.has(ext)) {
    throw badRequest("vault_unsupported_file_type");
  }
  const resolved = resolveVaultMimeType(filename, mimeType);
  if (!resolved) throw badRequest("vault_unsupported_file_type");
  return resolved;
};

export type UploadDocumentInput = {
  userId: string;
  organizationId: string | null;
  folderId: string;
  name: string;
  originalFilename: string;
  bytes: Buffer;
  declaredMimeType?: string | null;
  documentType?: string | null;
  notes?: string | null;
  issueDate?: Date | null;
  expiryDate?: Date | null;
  noExpiry?: boolean;
  source?: VaultDocumentSource;
};

const assertVaultStorageBudget = async (
  prisma: PrismaClient,
  input: { userId: string; organizationId: string; additionalBytes: number },
) => {
  const { entitlements } = await getOrganizationEntitlements(prisma, {
    userId: input.userId,
    organizationId: input.organizationId,
  });
  const used = await prisma.vaultDocumentVersion.aggregate({
    where: { organizationId: input.organizationId },
    _sum: { fileSize: true },
  });
  const usedBytes = used._sum.fileSize ?? 0;
  if (usedBytes + input.additionalBytes > entitlements.storageBytes) {
    throw conflict("vault_storage_limit_reached");
  }
};

export const uploadDocument = async (
  prisma: PrismaClient,
  input: UploadDocumentInput,
) => {
  const { organizationId, userId } = await requireOrgMembership(
    prisma,
    input.userId,
    input.organizationId,
  );

  const name = input.name.trim();
  if (!name) throw badRequest("vault_document_name_required");
  if (!input.bytes.byteLength) throw badRequest("vault_empty_file");
  if (input.bytes.byteLength > 25 * 1024 * 1024) {
    throw badRequest("vault_file_too_large");
  }

  const folder = await prisma.vaultFolder.findFirst({
    where: { id: input.folderId, organizationId },
  });
  if (!folder) throw notFound("vault_folder_not_found");

  await assertVaultStorageBudget(prisma, {
    userId,
    organizationId,
    additionalBytes: input.bytes.byteLength,
  });

  const mimeType = assertSupportedFile(
    input.originalFilename,
    input.declaredMimeType,
  );
  const noExpiry = input.noExpiry !== false && !input.expiryDate;
  const expiryDate = noExpiry ? null : (input.expiryDate ?? null);
  const status = computeStatus({ expiryDate, noExpiry });

  const document = await prisma.vaultDocument.create({
    data: {
      organizationId,
      folderId: input.folderId,
      name,
      originalFilename: input.originalFilename,
      documentType: input.documentType?.trim() || null,
      mimeType,
      issueDate: input.issueDate ?? null,
      expiryDate,
      noExpiry,
      status,
      notes: input.notes?.trim() || null,
      source: input.source ?? "USER_UPLOAD",
      uploadedByUserId: userId,
      version: 1,
    },
  });

  const stored = await getDocumentStorage().putObject({
    organizationId,
    documentId: document.id,
    version: 1,
    originalFilename: input.originalFilename,
    bytes: input.bytes,
  });

  const version = await prisma.vaultDocumentVersion.create({
    data: {
      organizationId,
      documentId: document.id,
      version: 1,
      storageKey: stored.storageKey,
      originalFilename: input.originalFilename,
      mimeType,
      fileSize: stored.size,
      checksum: stored.checksum,
      uploadedByUserId: userId,
    },
  });

  const updated = await prisma.vaultDocument.update({
    where: { id: document.id },
    data: {
      storageKey: stored.storageKey,
      fileSize: stored.size,
      checksum: stored.checksum,
    },
    include: { folder: { select: { id: true, name: true } } },
  });

  return { document: mapDocument(updated), version };
};

/** Metadata-only create kept for tests / non-binary stubs. */
export const createDocumentMetadata = async (
  prisma: PrismaClient,
  input: {
    userId: string;
    organizationId: string | null;
    folderId: string;
    name: string;
    mimeType?: string | null;
    storageKey?: string | null;
    fileSize?: number | null;
    issueDate?: Date | null;
    expiryDate?: Date | null;
    noExpiry?: boolean;
    notes?: string | null;
    documentType?: string | null;
    source?: VaultDocumentSource;
  },
) => {
  const { organizationId, userId } = await requireOrgMembership(
    prisma,
    input.userId,
    input.organizationId,
  );

  const name = input.name.trim();
  if (!name) throw badRequest("vault_document_name_required");

  const folder = await prisma.vaultFolder.findFirst({
    where: { id: input.folderId, organizationId },
  });
  if (!folder) throw notFound("vault_folder_not_found");

  const noExpiry = input.noExpiry !== false && !input.expiryDate;
  const expiryDate = noExpiry ? null : (input.expiryDate ?? null);
  const status = computeStatus({ expiryDate, noExpiry });

  return mapDocument(
    await prisma.vaultDocument.create({
      data: {
        organizationId,
        folderId: input.folderId,
        name,
        mimeType: input.mimeType ?? null,
        storageKey: input.storageKey ?? null,
        fileSize: input.fileSize ?? null,
        documentType: input.documentType ?? null,
        issueDate: input.issueDate ?? null,
        expiryDate,
        noExpiry,
        status,
        notes: input.notes ?? null,
        source: input.source ?? "USER_UPLOAD",
        uploadedByUserId: userId,
      },
    }),
  );
};

export const uploadNewVersion = async (
  prisma: PrismaClient,
  input: {
    userId: string;
    organizationId: string | null;
    documentId: string;
    originalFilename: string;
    bytes: Buffer;
    declaredMimeType?: string | null;
  },
) => {
  const { organizationId, userId } = await requireOrgMembership(
    prisma,
    input.userId,
    input.organizationId,
  );
  const document = await prisma.vaultDocument.findFirst({
    where: { id: input.documentId, organizationId },
  });
  if (!document) throw notFound("vault_document_not_found");
  if (!input.bytes.byteLength) throw badRequest("vault_empty_file");

  await assertVaultStorageBudget(prisma, {
    userId,
    organizationId,
    additionalBytes: input.bytes.byteLength,
  });

  const mimeType = assertSupportedFile(
    input.originalFilename,
    input.declaredMimeType,
  );
  const nextVersion = document.version + 1;
  const stored = await getDocumentStorage().putObject({
    organizationId,
    documentId: document.id,
    version: nextVersion,
    originalFilename: input.originalFilename,
    bytes: input.bytes,
  });

  const version = await prisma.vaultDocumentVersion.create({
    data: {
      organizationId,
      documentId: document.id,
      version: nextVersion,
      storageKey: stored.storageKey,
      originalFilename: input.originalFilename,
      mimeType,
      fileSize: stored.size,
      checksum: stored.checksum,
      uploadedByUserId: userId,
    },
  });

  const updated = await prisma.vaultDocument.update({
    where: { id: document.id },
    data: {
      version: nextVersion,
      storageKey: stored.storageKey,
      fileSize: stored.size,
      checksum: stored.checksum,
      mimeType,
      originalFilename: input.originalFilename,
    },
  });

  return { document: mapDocument(updated), version };
};

export const updateDocumentMetadata = async (
  prisma: PrismaClient,
  input: {
    userId: string;
    organizationId: string | null;
    documentId: string;
    name?: string;
    folderId?: string;
    documentType?: string | null;
    notes?: string | null;
    issueDate?: Date | null;
    expiryDate?: Date | null;
    noExpiry?: boolean;
  },
) => {
  const { organizationId } = await requireOrgMembership(
    prisma,
    input.userId,
    input.organizationId,
  );
  const document = await prisma.vaultDocument.findFirst({
    where: { id: input.documentId, organizationId },
  });
  if (!document) throw notFound("vault_document_not_found");

  if (input.folderId) {
    const folder = await prisma.vaultFolder.findFirst({
      where: { id: input.folderId, organizationId },
    });
    if (!folder) throw notFound("vault_folder_not_found");
  }

  const noExpiry =
    input.noExpiry !== undefined
      ? input.noExpiry
      : input.expiryDate === null
        ? true
        : document.noExpiry;
  const expiryDate =
    input.expiryDate !== undefined
      ? noExpiry
        ? null
        : input.expiryDate
      : noExpiry
        ? null
        : document.expiryDate;

  return mapDocument(
    await prisma.vaultDocument.update({
      where: { id: document.id },
      data: {
        ...(input.name?.trim() ? { name: input.name.trim() } : {}),
        ...(input.folderId ? { folderId: input.folderId } : {}),
        ...(input.documentType !== undefined
          ? { documentType: input.documentType?.trim() || null }
          : {}),
        ...(input.notes !== undefined
          ? { notes: input.notes?.trim() || null }
          : {}),
        ...(input.issueDate !== undefined ? { issueDate: input.issueDate } : {}),
        noExpiry,
        expiryDate,
        status: computeStatus({ expiryDate, noExpiry }),
      },
    }),
  );
};

export const deleteDocument = async (
  prisma: PrismaClient,
  input: { userId: string; organizationId: string | null; documentId: string },
) => {
  const { organizationId } = await requireOrgMembership(
    prisma,
    input.userId,
    input.organizationId,
  );
  const document = await prisma.vaultDocument.findFirst({
    where: { id: input.documentId, organizationId },
    include: { versions: true },
  });
  if (!document) throw notFound("vault_document_not_found");

  await prisma.vaultDocument.delete({ where: { id: document.id } });
  const storage = getDocumentStorage();
  await Promise.all(
    document.versions.map((version) => storage.deleteObject(version.storageKey)),
  );
  return { deleted: true };
};

export const getDocumentDownload = async (
  prisma: PrismaClient,
  input: {
    userId: string;
    organizationId: string | null;
    documentId: string;
    version?: number;
  },
) => {
  const { organizationId } = await requireOrgMembership(
    prisma,
    input.userId,
    input.organizationId,
  );
  const document = await prisma.vaultDocument.findFirst({
    where: { id: input.documentId, organizationId },
  });
  if (!document) throw notFound("vault_document_not_found");

  const versionRow = input.version
    ? await prisma.vaultDocumentVersion.findFirst({
        where: {
          documentId: document.id,
          organizationId,
          version: input.version,
        },
      })
    : await prisma.vaultDocumentVersion.findFirst({
        where: { documentId: document.id, organizationId },
        orderBy: { version: "desc" },
      });

  const storageKey = versionRow?.storageKey ?? document.storageKey;
  if (!storageKey) throw notFound("vault_file_not_found");

  const bytes = await getDocumentStorage().getObject(storageKey);
  return {
    bytes,
    mimeType: versionRow?.mimeType ?? document.mimeType ?? "application/octet-stream",
    filename:
      versionRow?.originalFilename ??
      document.originalFilename ??
      `${document.name}.bin`,
    version: versionRow?.version ?? document.version,
  };
};

export const createWorkspaceDocumentRef = async (
  prisma: PrismaClient,
  input: {
    userId: string;
    organizationId: string | null;
    workspaceId: string;
    documentId: string;
    documentVersionId?: string | null;
    purpose?: string | null;
    folderHint?: string | null;
  },
) => {
  const { organizationId, userId } = await requireOrgMembership(
    prisma,
    input.userId,
    input.organizationId,
  );

  const workspace = await prisma.tenderWorkspace.findFirst({
    where: { id: input.workspaceId, organizationId },
  });
  if (!workspace) throw notFound("tender_workspace_not_found");

  const document = await prisma.vaultDocument.findFirst({
    where: { id: input.documentId, organizationId },
  });
  if (!document) throw notFound("vault_document_not_found");

  let documentVersionId = input.documentVersionId ?? null;
  if (!documentVersionId) {
    const current = await prisma.vaultDocumentVersion.findFirst({
      where: { documentId: document.id, organizationId },
      orderBy: { version: "desc" },
    });
    documentVersionId = current?.id ?? null;
  } else {
    const version = await prisma.vaultDocumentVersion.findFirst({
      where: { id: documentVersionId, documentId: document.id, organizationId },
    });
    if (!version) throw notFound("vault_document_version_not_found");
  }

  try {
    return await prisma.tenderWorkspaceDocumentRef.create({
      data: {
        workspaceId: input.workspaceId,
        documentId: input.documentId,
        documentVersionId,
        purpose: input.purpose ?? null,
        folderHint: input.folderHint ?? null,
        linkedByUserId: userId,
      },
    });
  } catch {
    throw badRequest("workspace_document_ref_exists");
  }
};

export const captureSubmissionDocumentSnapshots = async (
  prisma: PrismaClient,
  input: {
    userId: string;
    organizationId: string | null;
    submissionId: string;
    items: Array<{
      documentId: string;
      documentVersionId: string;
      purpose?: string | null;
    }>;
  },
) => {
  const { organizationId } = await requireOrgMembership(
    prisma,
    input.userId,
    input.organizationId,
  );

  const submission = await prisma.submission.findFirst({
    where: { id: input.submissionId, organizationId },
  });
  if (!submission) throw notFound("submission_not_found");

  const created = [];
  for (const item of input.items) {
    const version = await prisma.vaultDocumentVersion.findFirst({
      where: {
        id: item.documentVersionId,
        documentId: item.documentId,
        organizationId,
      },
      include: { document: true },
    });
    if (!version) throw notFound("vault_document_version_not_found");

    created.push(
      await prisma.submissionDocumentSnapshot.create({
        data: {
          organizationId,
          submissionId: input.submissionId,
          documentId: item.documentId,
          documentVersionId: item.documentVersionId,
          purpose: item.purpose ?? null,
          nameSnapshot: version.document.name,
          storageKeySnapshot: version.storageKey,
        },
      }),
    );
  }
  return created;
};
