import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";

export type StoredObject = {
  storageKey: string;
  checksum: string;
  size: number;
};

export type DocumentStorageProvider = {
  putObject: (input: {
    organizationId: string;
    documentId: string;
    version: number;
    originalFilename: string;
    bytes: Buffer;
  }) => Promise<StoredObject>;
  getObject: (storageKey: string) => Promise<Buffer>;
  deleteObject: (storageKey: string) => Promise<void>;
};

const sanitizeFilename = (name: string): string =>
  name.replace(/[^a-zA-Z0-9._\-()\s\u0370-\u03FF]/g, "_").slice(0, 120) || "file";

export const createLocalDocumentStorage = (
  rootDir = path.resolve(process.cwd(), "data/saas-vault"),
): DocumentStorageProvider => {
  const resolveKeyPath = (storageKey: string): string => {
    const full = path.resolve(rootDir, storageKey);
    if (!full.startsWith(path.resolve(rootDir))) {
      throw new Error("invalid_storage_key");
    }
    return full;
  };

  return {
    putObject: async ({
      organizationId,
      documentId,
      version,
      originalFilename,
      bytes,
    }) => {
      const safeName = sanitizeFilename(originalFilename);
      const storageKey = path.join(
        organizationId,
        documentId,
        `v${version}-${randomUUID().slice(0, 8)}-${safeName}`,
      );
      const fullPath = resolveKeyPath(storageKey);
      await mkdir(path.dirname(fullPath), { recursive: true });
      await writeFile(fullPath, bytes);
      return {
        storageKey,
        checksum: createHash("sha256").update(bytes).digest("hex"),
        size: bytes.byteLength,
      };
    },
    getObject: async (storageKey) => readFile(resolveKeyPath(storageKey)),
    deleteObject: async (storageKey) => {
      try {
        await unlink(resolveKeyPath(storageKey));
      } catch {
        // missing object is fine for cleanup
      }
    },
  };
};

export const ALLOWED_VAULT_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

export const ALLOWED_VAULT_EXTENSIONS = new Set([".pdf", ".docx"]);

export const resolveVaultMimeType = (
  filename: string,
  declaredMime?: string | null,
): string | null => {
  const ext = path.extname(filename).toLowerCase();
  if (ext === ".pdf") return "application/pdf";
  if (ext === ".docx") {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  if (declaredMime && ALLOWED_VAULT_MIME_TYPES.has(declaredMime)) {
    return declaredMime;
  }
  return null;
};
