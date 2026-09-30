import { randomUUID } from "node:crypto";
import { loadGoogleOAuthConfig } from "./config.js";
import {
  copyFileToFolder,
  DriveApiError,
  ensureChildFolder,
  getDriveFile,
  listChildFiles,
  listChildFolders,
} from "./drive-api.js";
import { getValidAccessToken, startGoogleOAuthLogin } from "./oauth.js";
import {
  buildVaultDiscovery,
  COMPANY_DOC_KEY_TO_TYPE,
  parseDriveFolderInput,
  resolveDocumentValidity,
  selectMasterTemplate,
  TEMPLATE_KEY_TO_TYPE,
  validateDriveVault,
  type CompanyDocKey,
  type TemplateKey,
} from "./vault-structure.js";
import {
  addTenderDocument,
  disconnectGoogleDrive,
  getVaultPublicState,
  hasGoogleTokens,
  listTenderDocuments,
  saveDiscoveredVault,
  setRootFolder,
  setTemplateMaster,
  upsertDocumentMeta,
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
  missing: string[];
  lastError: string | null;
  scopeWarning: string | null;
};

const TEMPLATE_LABELS: Record<TemplateKey, string> = {
  earlyOutreach: "Early Outreach",
  technicalOffer: "Technical Offer",
  economicOffer: "Economic Offer",
  declarations: "Declarations",
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

  for (const key of Object.keys(TEMPLATE_LABELS) as TemplateKey[]) {
    const folder = latest.discovered?.templates[key];
    if (!folder) {
      templates.push({
        key,
        folderName: TEMPLATE_LABELS[key],
        selection: { status: "MISSING" },
      });
      continue;
    }
    try {
      const files = await listChildFiles(accessToken, folder.id);
      templates.push({
        key,
        folderName: TEMPLATE_LABELS[key],
        selection: selectMasterTemplate(
          files,
          latest.templateMasterIds[key] ?? null,
        ),
      });
    } catch (error) {
      templates.push({
        key,
        folderName: TEMPLATE_LABELS[key],
        selection: { status: "MISSING" },
      });
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
    items.push({
      key: doc.key,
      label: doc.folderName,
      status: first
        ? first.validity
        : "MISSING",
      validUntil: first?.validUntil ?? null,
      driveUrl: first?.webViewLink ?? null,
      note: first ? null : "No file in Vault folder",
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
          ? `Expired ${first.validUntil}`
          : first.validity === "UNKNOWN"
            ? "Expiry unknown — not treated as valid"
            : first.validUntil
              ? `Valid until ${first.validUntil}`
              : null,
    };
  });

  const generatedDocuments = (
    Object.keys(TEMPLATE_LABELS) as TemplateKey[]
  ).map((key) => {
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
  templateKey: TemplateKey;
}): Promise<{
  driveFileId: string;
  driveUrl: string;
  name: string;
  masterUntouched: true;
}> => {
  const config = requireConfig();
  const status = await getDriveStatus({ refresh: false });
  const template = status.templates.find((t) => t.key === input.templateKey);
  if (!template || template.selection.status !== "READY") {
    throw new Error("Master template is not ready — configure in Settings");
  }

  const workspace = await createTenderWorkspace(input.referenceNumber);
  const accessToken = await getValidAccessToken(config);
  const masterId = template.selection.file.id;
  const copied = await copyFileToFolder(
    accessToken,
    masterId,
    workspace.draftFolderId,
    `${input.referenceNumber} – ${TEMPLATE_LABELS[input.templateKey]}`,
  );

  // Safety: master id must differ from copy id
  if (copied.id === masterId) {
    throw new Error("Copy failed — refusing to modify master template");
  }

  addTenderDocument({
    id: randomUUID(),
    tenderReferenceNumber: input.referenceNumber,
    type: TEMPLATE_KEY_TO_TYPE[input.templateKey],
    driveFileId: copied.id,
    driveUrl: copied.webViewLink,
    status: "DRAFT",
    createdAt: new Date().toISOString(),
  });

  return {
    driveFileId: copied.id,
    driveUrl: copied.webViewLink,
    name: copied.name,
    masterUntouched: true,
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
