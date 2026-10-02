import { randomUUID } from "node:crypto";
import { requestCloudApi } from "../cloud-api.js";
import { getLocalCompanySettings } from "../company-settings-store.js";
import { buildTradingNameStatus } from "./company-profile-merge.js";
import { loadGoogleOAuthConfig } from "./config.js";
import {
  cloneGoogleDocToFolder,
  DriveApiError,
  ensureChildFolder,
  getDriveFile,
  listChildFiles,
  listChildFolders,
  trashDriveFile,
} from "./drive-api.js";
import {
  buildCompanyProfileReplacements,
  companyProfileReplaceRequests,
  findUnresolvedPlaceholders as findCompanyProfileUnresolved,
  GENERATED_COMPANY_PROFILE_NAME,
} from "./company-profile-merge.js";
import { batchReplaceAllText, getDocumentText } from "./docs-api.js";
import { getValidAccessToken, startGoogleOAuthLogin } from "./oauth.js";
import {
  assertMergeTargetIsCopy,
  buildMergeReplacements,
  buildReplaceAllTextRequests,
  canMarkDocumentReady,
  findUnresolvedPlaceholders,
} from "./template-merge.js";
import {
  buildVaultDiscovery,
  COMPANY_DOC_KEY_TO_TYPE,
  parseDriveFolderInput,
  resolveDocumentValidity,
  selectMasterTemplate,
  TEMPLATE_KEY_TO_TYPE,
  TENDER_TEMPLATE_KEYS,
  validateDriveVault,
  type CompanyDocKey,
  type TemplateKey,
  type TemplateSelection,
} from "./vault-structure.js";
import {
  addTenderDocument,
  disconnectGoogleDrive,
  findTenderDocument,
  getVaultPublicState,
  hasGoogleTokens,
  listTenderDocuments,
  saveDiscoveredVault,
  setCompanyProfileFile,
  setRootFolder,
  setTemplateMaster,
  updateTenderDocument,
  upsertDocumentMeta,
  type TenderDocumentRecord,
  type VaultDocumentMeta,
} from "./vault-store.js";

export type DrivePublicStatus = {
  configured: boolean;
  connected: boolean;
  accountEmail: string | null;
  scope: string | null;
  configSource: string | null;
  rootFolderId: string | null;
  rootFolderName: string | null;
  health: ReturnType<typeof validateDriveVault>;
  templates: Array<{
    key: TemplateKey;
    folderName: string;
    selection: ReturnType<typeof selectMasterTemplate>;
  }>;
  companyDocuments: Array<{
    key: CompanyDocKey;
    folderName: string;
    files: Array<{
      id: string;
      name: string;
      mimeType: string;
      modifiedTime: string | null;
      webViewLink: string;
      validity: ReturnType<typeof resolveDocumentValidity>;
      validUntil: string | null;
    }>;
  }>;
  /** Selected MASTER Google Doc under Templates / Company Profile */
  companyProfileSelection: TemplateSelection | null;
  missing: string[];
  lastError: string | null;
  scopeWarning: string | null;
};

const TEMPLATE_LABELS: Record<TemplateKey, string> = {
  earlyOutreach: "Early Outreach",
  technicalOffer: "Technical Offer",
  economicOffer: "Economic Offer",
  declarations: "Declarations",
  companyProfile: "Company Profile",
};

const COMPANY_LABELS: Record<CompanyDocKey, string> = {
  gemi: "GEMI",
  taxClearance: "Tax Clearance",
  insuranceClearance: "Insurance Clearance",
  kad: "KAD",
  companyProfile: "Company Profile",
};

let lastError: string | null = null;
let scopeWarning: string | null = null;

const requireConfig = () => {
  const config = loadGoogleOAuthConfig();
  if (!config) {
    throw new Error(
      "Google OAuth is not configured. Add GOOGLE_OAUTH_CLIENT_ID to apps/desktop/.env",
    );
  }
  return config;
};

export const getDriveStatus = async (
  options: { refresh?: boolean } = {},
): Promise<DrivePublicStatus> => {
  const config = loadGoogleOAuthConfig();
  const state = getVaultPublicState();
  const connected = hasGoogleTokens();

  const base: DrivePublicStatus = {
    configured: Boolean(config?.clientId),
    connected,
    accountEmail: state.connectedAccountEmail,
    scope: config?.scope ?? null,
    configSource: config?.source ?? null,
    rootFolderId: state.rootFolderId,
    rootFolderName: state.rootFolderName,
    health: validateDriveVault(state.discovered),
    templates: [],
    companyDocuments: [],
    companyProfileSelection: null,
    missing: state.discovered?.missing ?? [],
    lastError,
    scopeWarning,
  };

  if (!connected || !state.rootFolderId || !config) {
    return base;
  }

  if (options.refresh) {
    try {
      await refreshVaultDiscovery();
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      if (error instanceof DriveApiError && error.status === 403) {
        scopeWarning =
          "Drive returned 403 while reading the vault. Disconnect → Connect again so Google re-consents to drive.readonly + drive.file. Confirm the OAuth consent screen includes both scopes.";
      }
      return { ...base, lastError, scopeWarning };
    }
  }

  const latest = getVaultPublicState();
  const accessToken = await getValidAccessToken(config);
  const templates: DrivePublicStatus["templates"] = [];
  const companyDocuments: DrivePublicStatus["companyDocuments"] = [];
  let companyProfileSelection: TemplateSelection | null = null;

  for (const key of Object.keys(TEMPLATE_LABELS) as TemplateKey[]) {
    const folder = latest.discovered?.templates[key];
    if (!folder) {
      templates.push({
        key,
        folderName: TEMPLATE_LABELS[key],
        selection: { status: "MISSING" },
      });
      if (key === "companyProfile") {
        companyProfileSelection = { status: "MISSING" };
      }
      continue;
    }
    try {
      const files = await listChildFiles(accessToken, folder.id);
      const selection = selectMasterTemplate(
        files,
        latest.templateMasterIds[key] ?? null,
      );
      templates.push({
        key,
        folderName: TEMPLATE_LABELS[key],
        selection,
      });
      if (key === "companyProfile") {
        companyProfileSelection = selection;
      }
    } catch (error) {
      templates.push({
        key,
        folderName: TEMPLATE_LABELS[key],
        selection: { status: "MISSING" },
      });
      if (key === "companyProfile") {
        companyProfileSelection = { status: "MISSING" };
      }
      lastError = error instanceof Error ? error.message : String(error);
    }
  }

  for (const key of Object.keys(COMPANY_LABELS) as CompanyDocKey[]) {
    const folder = latest.discovered?.companyDocs[key];
    if (!folder) {
      companyDocuments.push({
        key,
        folderName: COMPANY_LABELS[key],
        files: [],
      });
      continue;
    }
    try {
      const files = await listChildFiles(accessToken, folder.id);
      companyDocuments.push({
        key,
        folderName: COMPANY_LABELS[key],
        files: files.map((file) => {
          const meta = latest.documentMeta.find((m) => m.driveFileId === file.id);
          return {
            id: file.id,
            name: file.name,
            mimeType: file.mimeType,
            modifiedTime: file.modifiedTime,
            webViewLink: file.webViewLink,
            validity: resolveDocumentValidity({
              hasFile: true,
              validUntil: meta?.validUntil ?? null,
            }),
            validUntil: meta?.validUntil ?? null,
          };
        }),
      });
    } catch {
      companyDocuments.push({
        key,
        folderName: COMPANY_LABELS[key],
        files: [],
      });
    }
  }

  return {
    ...base,
    rootFolderId: latest.rootFolderId,
    rootFolderName: latest.rootFolderName,
    health: validateDriveVault(latest.discovered),
    templates,
    companyDocuments,
    companyProfileSelection,
    missing: latest.discovered?.missing ?? [],
    lastError,
    scopeWarning,
  };
};

export const connectGoogleDrive = async (): Promise<{ email: string | null }> => {
  const config = requireConfig();
  lastError = null;
  scopeWarning = null;
  return startGoogleOAuthLogin(config);
};

export const disconnectDrive = (): void => {
  disconnectGoogleDrive();
  lastError = null;
  scopeWarning = null;
};

export const setVaultRootFromInput = async (
  folderUrlOrId: string,
): Promise<DrivePublicStatus> => {
  const config = requireConfig();
  const folderId = parseDriveFolderInput(folderUrlOrId);
  if (!folderId) {
    throw new Error("Invalid Google Drive folder URL or ID");
  }

  const accessToken = await getValidAccessToken(config);
  try {
    const file = await getDriveFile(accessToken, folderId);
    if (file.mimeType !== "application/vnd.google-apps.folder") {
      throw new Error("Selected item is not a folder");
    }
    setRootFolder({
      folderId,
      folderName: file.name ?? "Tenders",
    });
    await refreshVaultDiscovery();
    lastError = null;
    scopeWarning = null;
  } catch (error) {
    lastError = error instanceof Error ? error.message : String(error);
    if (error instanceof DriveApiError && error.status === 403) {
      scopeWarning =
        "Existing folder access returned 403. Disconnect Google Drive, Connect again (new consent for drive.readonly), then re-select TEKIA/Tenders.";
    }
    throw error;
  }

  return getDriveStatus();
};

export const refreshVaultDiscovery = async (): Promise<void> => {
  const config = requireConfig();
  const state = getVaultPublicState();
  if (!state.rootFolderId) {
    throw new Error("Select the TEKIA / Tenders root folder first");
  }

  const accessToken = await getValidAccessToken(config);
  const rootMeta = await getDriveFile(accessToken, state.rootFolderId);
  const topChildren = await listChildFolders(accessToken, state.rootFolderId);

  const companyParent = topChildren.find(
    (f) => f.name.trim().toLowerCase() === "company documents",
  );
  const templatesParent = topChildren.find(
    (f) => f.name.trim().toLowerCase() === "templates",
  );

  const companyDocChildren = companyParent
    ? await listChildFolders(accessToken, companyParent.id)
    : [];
  const templateChildren = templatesParent
    ? await listChildFolders(accessToken, templatesParent.id)
    : [];

  const discovered = buildVaultDiscovery({
    root: {
      id: state.rootFolderId,
      name: rootMeta.name ?? state.rootFolderName ?? "Tenders",
    },
    topChildren,
    companyDocChildren,
    templateChildren,
  });

  saveDiscoveredVault(discovered);
};

export const chooseTemplateMaster = (
  key: TemplateKey,
  fileId: string,
): void => {
  setTemplateMaster(key, fileId);
};

export const chooseCompanyProfileDoc = (fileId: string): void => {
  // Preferred master under Templates / Company Profile
  setTemplateMaster("companyProfile", fileId);
};

export const saveVaultDocumentMeta = (
  meta: Omit<VaultDocumentMeta, "lastSyncedAt">,
): void => {
  upsertDocumentMeta({
    ...meta,
    lastSyncedAt: new Date().toISOString(),
  });
};

export const getChecklistFromVault = async (): Promise<
  Array<{
    key: string;
    label: string;
    status: ReturnType<typeof resolveDocumentValidity> | "TO_GENERATE";
    validUntil: string | null;
    driveUrl: string | null;
    note: string | null;
  }>
> => {
  const status = await getDriveStatus({ refresh: false });
  const items: Array<{
    key: string;
    label: string;
    status: ReturnType<typeof resolveDocumentValidity> | "TO_GENERATE";
    validUntil: string | null;
    driveUrl: string | null;
    note: string | null;
  }> = [];

  for (const doc of status.companyDocuments) {
    const first = doc.files[0];
    let note: string | null = null;
    if (!first) {
      note = "Δεν υπάρχει αρχείο στον φάκελο Vault";
    } else if (!first.validUntil?.trim()) {
      note =
        doc.key === "gemi" || doc.folderName.toLowerCase().includes("gemi")
          ? "Δεν αναγράφεται ημερομηνία λήξης"
          : "Χωρίς ημερομηνία λήξης";
    }
    items.push({
      key: doc.key,
      label: doc.folderName,
      status: first ? first.validity : "MISSING",
      validUntil: first?.validUntil ?? null,
      driveUrl: first?.webViewLink ?? null,
      note,
    });
  }

  items.push(
    {
      key: "declaration",
      label: "Declaration",
      status: "TO_GENERATE",
      validUntil: null,
      driveUrl: null,
      note: "Must be generated from template",
    },
    {
      key: "economic_offer",
      label: "Economic Offer",
      status: "TO_GENERATE",
      validUntil: null,
      driveUrl: null,
      note: "Must be prepared",
    },
  );

  return items;
};

export type PackageReadiness = {
  companyDocuments: Array<{
    label: string;
    status: string;
    detail: string | null;
  }>;
  generatedDocuments: Array<{
    label: string;
    status: string;
    detail: string | null;
  }>;
  ready: boolean;
  summary: string;
};

export const preparePackageReadiness = async (
  referenceNumber: string,
): Promise<PackageReadiness> => {
  const status = await getDriveStatus({ refresh: false });
  const tenderDocs = listTenderDocuments(referenceNumber);

  const companyDocuments = status.companyDocuments.map((doc) => {
    const first = doc.files[0];
    if (!first) {
      return {
        label: doc.folderName,
        status: "MISSING",
        detail: "No file in Vault",
      };
    }
    return {
      label: doc.folderName,
      status: first.validity,
      detail:
        first.validity === "EXPIRED"
          ? `Έληξε ${first.validUntil}`
          : first.validUntil
            ? `Ισχύει έως ${first.validUntil}`
            : doc.key === "gemi" || doc.folderName.toLowerCase().includes("gemi")
              ? "Δεν αναγράφεται ημερομηνία λήξης"
              : "Χωρίς ημερομηνία λήξης",
    };
  });

  const generatedDocuments = TENDER_TEMPLATE_KEYS.map((key) => {
    const type = TEMPLATE_KEY_TO_TYPE[key];
    const existing = tenderDocs.find((d) => d.type === type);
    const template = status.templates.find((t) => t.key === key);
    if (existing) {
      return {
        label: TEMPLATE_LABELS[key],
        status: existing.status,
        detail: "Tender copy exists in Drive draft",
      };
    }
    if (!template || template.selection.status === "MISSING") {
      return {
        label: TEMPLATE_LABELS[key],
        status: "MISSING",
        detail: "Master template missing",
      };
    }
    if (template.selection.status === "NEEDS_CONFIGURATION") {
      return {
        label: TEMPLATE_LABELS[key],
        status: "NEEDS_CONFIGURATION",
        detail: "Select master template in Settings",
      };
    }
    return {
      label: TEMPLATE_LABELS[key],
      status: "NOT_PREPARED",
      detail: "Not prepared for this tender",
    };
  });

  const companyOk = companyDocuments.every(
    (d) => d.status === "AVAILABLE" || d.status === "UNKNOWN",
  );
  // UNKNOWN does not block but is not counted as validated-ready
  const companyValidated = companyDocuments.every((d) => d.status === "AVAILABLE");
  const generatedOk = generatedDocuments.every(
    (d) => d.status === "DRAFT" || d.status === "READY",
  );
  const ready = companyValidated && generatedOk;

  return {
    companyDocuments,
    generatedDocuments,
    ready,
    summary: ready
      ? "READY"
      : companyOk
        ? "NOT READY — prepare generated documents"
        : "NOT READY",
  };
};

export const createTenderWorkspace = async (
  referenceNumber: string,
): Promise<{
  adamFolderId: string;
  sourceFolderId: string;
  draftFolderId: string;
  submittedFolderId: string;
  webViewLink: string;
}> => {
  const config = requireConfig();
  const state = getVaultPublicState();
  const submissionsId = state.discovered?.top.submissions?.id;
  if (!submissionsId) {
    throw new Error("Submissions folder missing in Vault");
  }

  const accessToken = await getValidAccessToken(config);
  const adam = await ensureChildFolder(accessToken, submissionsId, referenceNumber);
  const source = await ensureChildFolder(accessToken, adam.id, "source");
  const draft = await ensureChildFolder(accessToken, adam.id, "draft");
  const submitted = await ensureChildFolder(accessToken, adam.id, "submitted");

  return {
    adamFolderId: adam.id,
    sourceFolderId: source.id,
    draftFolderId: draft.id,
    submittedFolderId: submitted.id,
    webViewLink: `https://drive.google.com/drive/folders/${adam.id}`,
  };
};

export const copyTemplateForTender = async (input: {
  referenceNumber: string;
  templateKey: Exclude<TemplateKey, "companyProfile">;
  /** Explicit operator values for economic / declaration / optional technical fills */
  operatorValues?: Record<string, string>;
}): Promise<{
  documentId: string;
  driveFileId: string;
  driveUrl: string;
  name: string;
  masterFileId: string;
  masterUntouched: true;
  status: "DRAFT" | "READY";
  unresolvedPlaceholders: string[];
  replacedKeys: string[];
}> => {
  if ((input.templateKey as TemplateKey) === "companyProfile") {
    throw new Error(
      "Company Profile uses Sync Company Profile (master → Company Documents copy), not tender draft copy",
    );
  }
  const config = requireConfig();
  const status = await getDriveStatus({ refresh: false });
  const template = status.templates.find((t) => t.key === input.templateKey);
  if (!template || template.selection.status !== "READY") {
    throw new Error("Master template is not ready — configure in Settings");
  }

  const workspace = await createTenderWorkspace(input.referenceNumber);
  const accessToken = await getValidAccessToken(config);
  const masterId = template.selection.file.id;
  const cloned = await cloneGoogleDocToFolder(
    accessToken,
    masterId,
    workspace.draftFolderId,
    `${input.referenceNumber} – ${TEMPLATE_LABELS[input.templateKey]}`,
  );
  const copied = cloned;

  // Safety: master id must differ from copy id
  if (copied.id === masterId) {
    throw new Error("Copy failed — refusing to modify master template");
  }

  assertMergeTargetIsCopy(masterId, copied.id);

  const docType = TEMPLATE_KEY_TO_TYPE[input.templateKey];
  const mergeCtx = await loadMergeContext(
    input.referenceNumber,
    input.operatorValues,
  );
  const plan = buildMergeReplacements(docType, mergeCtx);
  const requests = buildReplaceAllTextRequests(plan.replacements);

  // Docs API merge — COPY ONLY (never masterId)
  await batchReplaceAllText(accessToken, copied.id, requests);

  const textAfter = await getDocumentText(accessToken, copied.id);
  const unresolved = findUnresolvedPlaceholders(textAfter);
  const now = new Date().toISOString();

  const record: TenderDocumentRecord = {
    id: randomUUID(),
    tenderReferenceNumber: input.referenceNumber,
    type: docType,
    driveFileId: copied.id,
    driveUrl: copied.webViewLink,
    masterFileId: masterId,
    status: "DRAFT",
    unresolvedPlaceholders: unresolved,
    createdAt: now,
    updatedAt: now,
  };
  addTenderDocument(record);

  return {
    documentId: record.id,
    driveFileId: copied.id,
    driveUrl: copied.webViewLink,
    name: copied.name,
    masterFileId: masterId,
    masterUntouched: true,
    status: "DRAFT",
    unresolvedPlaceholders: unresolved,
    replacedKeys: Object.keys(plan.replacements),
  };
};

type CloudTender = {
  referenceNumber: string;
  title: string | null;
  organization: string | null;
  scopeSummary: string | null;
  contact?: { name: string | null; email: string | null; phone: string | null };
};

const loadMergeContext = async (
  referenceNumber: string,
  operatorValues?: Record<string, string>,
) => {
  let tender: CloudTender | null = null;
  const localCompany = getLocalCompanySettings().company;

  try {
    tender = await requestCloudApi<CloudTender>(
      `/api/operator/tenders/${encodeURIComponent(referenceNumber)}`,
    );
  } catch {
    tender = null;
  }

  const today = new Date().toLocaleDateString("el-GR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  return {
    organization: tender?.organization ?? null,
    tenderTitle: tender?.title ?? null,
    adam: tender?.referenceNumber ?? referenceNumber,
    protocolNumber: operatorValues?.PROTOCOL_NUMBER ?? null,
    // Company Settings only — never invent; never use tender authority contact here
    contactName: localCompany.contact_name || null,
    contactEmail: localCompany.email || null,
    contactPhone: localCompany.phone || null,
    legalRepresentative: localCompany.contact_name || null,
    legalName: localCompany.legal_name || null,
    brandName: localCompany.brand_name || null,
    tradingName: localCompany.trading_name || null,
    tradingNameStatus: buildTradingNameStatus(
      localCompany.trading_name,
      localCompany.distinctive_title_confirmed,
    ),
    date: today,
    scopeSummary: tender?.scopeSummary ?? null,
    operatorValues: operatorValues ?? {},
  };
};

export const markTenderDocumentReady = (
  documentId: string,
): TenderDocumentRecord => {
  const existing = findTenderDocument(documentId);
  if (!existing) {
    throw new Error("Tender document not found");
  }
  if (!canMarkDocumentReady(existing.unresolvedPlaceholders ?? [])) {
    throw new Error(
      `Cannot mark READY — unresolved placeholders: ${(existing.unresolvedPlaceholders ?? []).join(", ")}`,
    );
  }
  const updated = updateTenderDocument(documentId, { status: "READY" });
  if (!updated) throw new Error("Failed to update document status");
  return updated;
};

export const getTenderDriveDocuments = (
  referenceNumber: string,
): TenderDocumentRecord[] => listTenderDocuments(referenceNumber);

/**
 * Read plain text from a tender Drive COPY (never master).
 * Used to populate local preview/edit fields from the Google Doc.
 */
export const readTenderDocumentContent = async (
  documentId: string,
): Promise<{
  documentId: string;
  driveFileId: string;
  text: string;
  subject: string | null;
  body: string;
  unresolvedPlaceholders: string[];
}> => {
  const existing = findTenderDocument(documentId);
  if (!existing) throw new Error("Tender document not found");
  assertMergeTargetIsCopy(existing.masterFileId, existing.driveFileId);

  const config = requireConfig();
  const accessToken = await getValidAccessToken(config);
  const text = await getDocumentText(accessToken, existing.driveFileId);
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l, idx, arr) => !(l.trim() === "" && idx === 0));

  const firstNonEmpty = lines.find((l) => l.trim().length > 0)?.trim() ?? null;
  const body = text.trim();

  return {
    documentId: existing.id,
    driveFileId: existing.driveFileId,
    text,
    subject: firstNonEmpty ? firstNonEmpty.slice(0, 200) : null,
    body,
    unresolvedPlaceholders: findUnresolvedPlaceholders(text),
  };
};

/**
 * Re-merge operator values into an existing COPY (e.g. after filling economic fields).
 * Never targets masterFileId.
 */
export const remergeOperatorValuesIntoCopy = async (input: {
  documentId: string;
  operatorValues: Record<string, string>;
}): Promise<TenderDocumentRecord> => {
  const existing = findTenderDocument(input.documentId);
  if (!existing) throw new Error("Tender document not found");

  assertMergeTargetIsCopy(existing.masterFileId, existing.driveFileId);

  const config = requireConfig();
  const accessToken = await getValidAccessToken(config);
  const mergeCtx = await loadMergeContext(
    existing.tenderReferenceNumber,
    input.operatorValues,
  );
  const plan = buildMergeReplacements(existing.type, mergeCtx);
  const requests = buildReplaceAllTextRequests(plan.replacements);
  await batchReplaceAllText(accessToken, existing.driveFileId, requests);

  const textAfter = await getDocumentText(accessToken, existing.driveFileId);
  const unresolved = findUnresolvedPlaceholders(textAfter);
  const updated = updateTenderDocument(existing.id, {
    unresolvedPlaceholders: unresolved,
    status: "DRAFT",
  });
  if (!updated) throw new Error("Failed to update tender document");
  return updated;
};

/**
 * Controlled Sync:
 * Templates/Company Profile (master) → copy → Company Documents/Company Profile (current)
 * → Docs ReplaceAllText on the COPY only.
 * Master never modified. Explicit Sync only (never on Save).
 * Uses local Electron Company Settings (survives rebuilds).
 *
 * Previous files under Company Documents are trashed best-effort only.
 * drive.file cannot trash docs the app did not create — Sync still succeeds
 * with a new app-owned copy; operator may delete old files manually.
 */
export const syncCompanyProfileFromSettings = async (): Promise<{
  fileId: string;
  fileName: string;
  driveUrl: string;
  masterFileId: string;
  masterUntouched: true;
  replacedKeys: string[];
  skippedUnknown: string[];
  unresolvedPlaceholders: string[];
  mapping: Array<{ settingsKey: string; placeholder: string; applied: boolean }>;
  cleanupWarnings: string[];
}> => {
  const config = requireConfig();
  const status = await getDriveStatus({ refresh: false });
  const selection = status.companyProfileSelection;

  if (!selection || selection.status === "MISSING") {
    throw new Error(
      "Company Profile master not found under Templates / Company Profile",
    );
  }
  if (selection.status === "NEEDS_CONFIGURATION") {
    throw new Error(
      "Multiple Company Profile masters found — select the master in Settings → Templates → Company Profile",
    );
  }

  const master = selection.file;
  const state = getVaultPublicState();
  const destFolder = state.discovered?.companyDocs.companyProfile;
  if (!destFolder) {
    throw new Error(
      "Company Documents / Company Profile folder missing — create it in the vault",
    );
  }

  const accessToken = await getValidAccessToken(config);
  const existing = await listChildFiles(accessToken, destFolder.id);

  if (existing.some((f) => f.id === master.id)) {
    throw new Error(
      "Refusing sync: Company Profile master must live under Templates/, not Company Documents/",
    );
  }

  // Create new app-owned clone FIRST (writable under drive.file), then merge.
  // Native copy may 403 on pre-existing vault docs — export/import fallback handles that.
  let copied: {
    id: string;
    name: string;
    webViewLink: string;
    method: "copy" | "export_import";
  };
  try {
    copied = await cloneGoogleDocToFolder(
      accessToken,
      master.id,
      destFolder.id,
      GENERATED_COMPANY_PROFILE_NAME,
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Cannot create writable Company Profile from master “${master.name}”: ${msg}. The master stays readable; Sync needs an app-owned clone (copy or export/import).`,
    );
  }

  if (copied.id === master.id) {
    throw new Error("Clone failed — refusing to modify Company Profile master");
  }

  const settings = getLocalCompanySettings();
  const plan = buildCompanyProfileReplacements({
    ...settings.company,
    legal_form: settings.company.legal_form ?? "",
    website: settings.company.website ?? "",
  });
  const requests = companyProfileReplaceRequests(plan.replacements);

  // Docs merge — COPY ONLY (app-created file)
  await batchReplaceAllText(accessToken, copied.id, requests);

  const textAfter = await getDocumentText(accessToken, copied.id);
  const unresolved = findCompanyProfileUnresolved(textAfter);

  // Best-effort cleanup of previous copies (never master, never new copy)
  const cleanupWarnings: string[] = [];
  const previousIds = new Set(
    [
      state.companyProfileFileId,
      ...existing.map((f) => f.id),
    ].filter((id): id is string => Boolean(id) && id !== copied.id && id !== master.id),
  );

  for (const fileId of previousIds) {
    const label =
      existing.find((f) => f.id === fileId)?.name ??
      (fileId === state.companyProfileFileId ? "previous synced profile" : fileId);
    try {
      await trashDriveFile(accessToken, fileId);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      cleanupWarnings.push(
        `Could not remove “${label}” (Drive write permission). Delete it manually in Drive if it is an old filled copy. New synced file was still created.`,
      );
      lastError = msg;
    }
  }

  setCompanyProfileFile(copied.id);

  return {
    fileId: copied.id,
    fileName: copied.name,
    driveUrl: copied.webViewLink,
    masterFileId: master.id,
    masterUntouched: true,
    replacedKeys: Object.keys(plan.replacements),
    skippedUnknown: plan.skippedUnknown,
    unresolvedPlaceholders: unresolved,
    mapping: plan.mapping,
    cleanupWarnings,
  };
};

export const assertNoGoogleSecretsInRendererBridge = (preloadSource: string): void => {
  const forbidden = [
    "accessToken",
    "refreshToken",
    "getGoogleTokens",
    "GOOGLE_OAUTH_CLIENT_SECRET",
    "safeStorage.encryptString",
  ];
  for (const token of forbidden) {
    if (preloadSource.includes(token)) {
      throw new Error(`Preload must not expose ${token}`);
    }
  }
};

// silence unused import if tree-shaken oddly
void COMPANY_DOC_KEY_TO_TYPE;
