import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { safeStorage, app } from "electron";
import type { DiscoveredVault, TemplateKey } from "./vault-structure.js";

export type GoogleTokenBundle = {
  accessToken: string;
  refreshToken: string | null;
  expiryDate: number | null;
  tokenType?: string;
  scope?: string;
};

export type VaultDocumentMeta = {
  driveFileId: string;
  documentType:
    | "GEMI"
    | "TAX_CLEARANCE"
    | "INSURANCE_CLEARANCE"
    | "KAD"
    | "COMPANY_PROFILE"
    | "OTHER";
  validFrom: string | null;
  validUntil: string | null;
  notes: string | null;
  lastSyncedAt: string | null;
};

export type TenderDocumentRecord = {
  id: string;
  tenderReferenceNumber: string;
  type: "OUTREACH" | "TECHNICAL_OFFER" | "ECONOMIC_OFFER" | "DECLARATION";
  driveFileId: string;
  driveUrl: string;
  /** Master template ID — never pass to Docs batchUpdate */
  masterFileId: string;
  status: "DRAFT" | "READY" | "SUBMITTED";
  unresolvedPlaceholders: string[];
  /** Hash of last subject+body successfully written from the app. */
  lastSyncedHash?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DriveVaultState = {
  connectedAccountEmail: string | null;
  rootFolderId: string | null;
  rootFolderName: string | null;
  discovered: DiscoveredVault | null;
  discoveredAt: string | null;
  templateMasterIds: Partial<Record<TemplateKey, string>>;
  /** Preferred Google Doc under Company Documents / Company Profile */
  companyProfileFileId: string | null;
  documentMeta: VaultDocumentMeta[];
  tenderDocuments: TenderDocumentRecord[];
};

type StoredDriveVault = {
  connectedAccountEmail: string | null;
  rootFolderId: string | null;
  rootFolderName: string | null;
  discovered: DiscoveredVault | null;
  discoveredAt: string | null;
  templateMasterIds: Partial<Record<TemplateKey, string>>;
  companyProfileFileId: string | null;
  documentMeta: VaultDocumentMeta[];
  tenderDocuments: TenderDocumentRecord[];
  tokensEncryptedBase64?: string;
};

const ensureDir = (): void => {
  mkdirSync(app.getPath("userData"), { recursive: true });
};

const vaultPath = (): string => join(app.getPath("userData"), "drive-vault.json");

const encrypt = (value: string): string => {
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.encryptString(value).toString("base64");
  }
  console.warn(
    "[desktop] safeStorage unavailable — Google tokens stored obfuscated only",
  );
  return Buffer.from(value, "utf8").toString("base64");
};

const decrypt = (value: string): string | null => {
  try {
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(Buffer.from(value, "base64"));
    }
    return Buffer.from(value, "base64").toString("utf8");
  } catch {
    return null;
  }
};

const readStored = (): StoredDriveVault => {
  const path = vaultPath();
  if (!existsSync(path)) {
    return emptyState();
  }
  try {
    return {
      ...emptyState(),
      ...(JSON.parse(readFileSync(path, "utf8")) as StoredDriveVault),
    };
  } catch {
    return emptyState();
  }
};

const emptyState = (): StoredDriveVault => ({
  connectedAccountEmail: null,
  rootFolderId: null,
  rootFolderName: null,
  discovered: null,
  discoveredAt: null,
  templateMasterIds: {},
  companyProfileFileId: null,
  documentMeta: [],
  tenderDocuments: [],
});

const writeStored = (state: StoredDriveVault): void => {
  ensureDir();
  writeFileSync(vaultPath(), JSON.stringify(state, null, 2), "utf8");
};

export const getVaultPublicState = (): DriveVaultState => {
  const stored = readStored();
  return {
    connectedAccountEmail: stored.connectedAccountEmail,
    rootFolderId: stored.rootFolderId,
    rootFolderName: stored.rootFolderName,
    discovered: stored.discovered,
    discoveredAt: stored.discoveredAt,
    templateMasterIds: stored.templateMasterIds,
    companyProfileFileId: stored.companyProfileFileId ?? null,
    documentMeta: stored.documentMeta,
    tenderDocuments: stored.tenderDocuments,
  };
};

export const hasGoogleTokens = (): boolean =>
  Boolean(readStored().tokensEncryptedBase64);

export const getGoogleTokens = (): GoogleTokenBundle | null => {
  const stored = readStored();
  if (!stored.tokensEncryptedBase64) return null;
  const raw = decrypt(stored.tokensEncryptedBase64);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as GoogleTokenBundle;
  } catch {
    return null;
  }
};

export const saveGoogleTokens = (
  tokens: GoogleTokenBundle,
  accountEmail?: string | null,
): void => {
  const stored = readStored();
  stored.tokensEncryptedBase64 = encrypt(JSON.stringify(tokens));
  if (accountEmail !== undefined) {
    stored.connectedAccountEmail = accountEmail;
  }
  writeStored(stored);
};

export const clearGoogleAuth = (): void => {
  const stored = readStored();
  // Keep historical tenderDocuments + documentMeta references; clear live auth + discovery cache
  writeStored({
    ...emptyState(),
    tenderDocuments: stored.tenderDocuments,
    documentMeta: stored.documentMeta,
  });
};

export const setRootFolder = (input: {
  folderId: string;
  folderName: string;
}): void => {
  const stored = readStored();
  stored.rootFolderId = input.folderId;
  stored.rootFolderName = input.folderName;
  stored.discovered = null;
  stored.discoveredAt = null;
  writeStored(stored);
};

export const saveDiscoveredVault = (discovered: DiscoveredVault): void => {
  const stored = readStored();
  stored.discovered = discovered;
  stored.discoveredAt = new Date().toISOString();
  stored.rootFolderId = discovered.root.id;
  stored.rootFolderName = discovered.root.name;
  writeStored(stored);
};

export const setTemplateMaster = (key: TemplateKey, fileId: string): void => {
  const stored = readStored();
  stored.templateMasterIds = {
    ...stored.templateMasterIds,
    [key]: fileId,
  };
  writeStored(stored);
};

export const setCompanyProfileFile = (fileId: string): void => {
  const stored = readStored();
  stored.companyProfileFileId = fileId;
  writeStored(stored);
};

export const upsertDocumentMeta = (meta: VaultDocumentMeta): void => {
  const stored = readStored();
  const next = stored.documentMeta.filter((m) => m.driveFileId !== meta.driveFileId);
  next.push(meta);
  stored.documentMeta = next;
  writeStored(stored);
};

export const addTenderDocument = (record: TenderDocumentRecord): void => {
  const stored = readStored();
  stored.tenderDocuments = [...stored.tenderDocuments, record];
  writeStored(stored);
};

export const updateTenderDocument = (
  id: string,
  patch: Partial<TenderDocumentRecord>,
): TenderDocumentRecord | null => {
  const stored = readStored();
  const idx = stored.tenderDocuments.findIndex((row) => row.id === id);
  if (idx < 0) return null;
  const next = {
    ...stored.tenderDocuments[idx],
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  stored.tenderDocuments[idx] = next;
  writeStored(stored);
  return next;
};

export const listTenderDocuments = (
  referenceNumber: string,
): TenderDocumentRecord[] =>
  getVaultPublicState()
    .tenderDocuments.filter(
      (row) => row.tenderReferenceNumber === referenceNumber,
    )
    .map((row) => ({
      ...row,
      unresolvedPlaceholders: row.unresolvedPlaceholders ?? [],
      masterFileId: row.masterFileId ?? "",
    }));

export const findTenderDocument = (
  id: string,
): TenderDocumentRecord | undefined => {
  const row = getVaultPublicState().tenderDocuments.find((r) => r.id === id);
  if (!row) return undefined;
  return {
    ...row,
    unresolvedPlaceholders: row.unresolvedPlaceholders ?? [],
    masterFileId: row.masterFileId ?? "",
  };
};

export const disconnectGoogleDrive = (): void => {
  clearGoogleAuth();
};

/** Test helper path — not exported to renderer. */
export const __driveVaultStoragePathForTests = vaultPath;
