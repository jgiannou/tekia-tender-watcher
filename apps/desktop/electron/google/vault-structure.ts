/**
 * Expected TEKIA / Tenders vault layout — discovery by name only.
 * Never hard-code Drive file IDs.
 */

export const VAULT_TOP_FOLDERS = [
  "Company Documents",
  "Templates",
  "Submissions",
] as const;

export const COMPANY_DOC_FOLDERS = [
  "GEMI",
  "Tax Clearance",
  "Insurance Clearance",
  "KAD",
  "Company Profile",
] as const;

export const TEMPLATE_FOLDERS = [
  "Early Outreach",
  "Technical Offer",
  "Economic Offer",
  "Declarations",
] as const;

export type VaultTopKey = "companyDocuments" | "templates" | "submissions";
export type CompanyDocKey =
  | "gemi"
  | "taxClearance"
  | "insuranceClearance"
  | "kad"
  | "companyProfile";
export type TemplateKey =
  | "earlyOutreach"
  | "technicalOffer"
  | "economicOffer"
  | "declarations";

export const TOP_FOLDER_NAME_TO_KEY: Record<string, VaultTopKey> = {
  "company documents": "companyDocuments",
  templates: "templates",
  submissions: "submissions",
};

export const COMPANY_DOC_NAME_TO_KEY: Record<string, CompanyDocKey> = {
  gemi: "gemi",
  "tax clearance": "taxClearance",
  "insurance clearance": "insuranceClearance",
  kad: "kad",
  "company profile": "companyProfile",
};

export const TEMPLATE_NAME_TO_KEY: Record<string, TemplateKey> = {
  "early outreach": "earlyOutreach",
  "technical offer": "technicalOffer",
  "economic offer": "economicOffer",
  declarations: "declarations",
};

export const COMPANY_DOC_KEY_TO_TYPE: Record<
  CompanyDocKey,
  "GEMI" | "TAX_CLEARANCE" | "INSURANCE_CLEARANCE" | "KAD" | "COMPANY_PROFILE"
> = {
  gemi: "GEMI",
  taxClearance: "TAX_CLEARANCE",
  insuranceClearance: "INSURANCE_CLEARANCE",
  kad: "KAD",
  companyProfile: "COMPANY_PROFILE",
};

export const TEMPLATE_KEY_TO_TYPE: Record<
  TemplateKey,
  "OUTREACH" | "TECHNICAL_OFFER" | "ECONOMIC_OFFER" | "DECLARATION"
> = {
  earlyOutreach: "OUTREACH",
  technicalOffer: "TECHNICAL_OFFER",
  economicOffer: "ECONOMIC_OFFER",
  declarations: "DECLARATION",
};

export type DriveFolderRef = {
  id: string;
  name: string;
};

export type DiscoveredVault = {
  root: DriveFolderRef;
  top: Partial<Record<VaultTopKey, DriveFolderRef>>;
  companyDocs: Partial<Record<CompanyDocKey, DriveFolderRef>>;
  templates: Partial<Record<TemplateKey, DriveFolderRef>>;
  missing: string[];
};

export const normalizeFolderName = (name: string): string =>
  name.trim().toLowerCase().replace(/\s+/g, " ");

export const matchNamedChild = <T extends string>(
  children: DriveFolderRef[],
  nameToKey: Record<string, T>,
): { found: Partial<Record<T, DriveFolderRef>>; missingNames: string[] } => {
  const found: Partial<Record<T, DriveFolderRef>> = {};
  const byName = new Map(
    children.map((child) => [normalizeFolderName(child.name), child]),
  );

  const expectedNames = Object.keys(nameToKey);
  const missingNames: string[] = [];

  for (const expected of expectedNames) {
    const key = nameToKey[expected];
    const hit = byName.get(expected);
    if (hit) {
      found[key] = hit;
    } else {
      missingNames.push(expected);
    }
  }

  return { found, missingNames };
};

export const buildVaultDiscovery = (input: {
  root: DriveFolderRef;
  topChildren: DriveFolderRef[];
  companyDocChildren: DriveFolderRef[];
  templateChildren: DriveFolderRef[];
}): DiscoveredVault => {
  const top = matchNamedChild(input.topChildren, TOP_FOLDER_NAME_TO_KEY);
  const companyDocs = matchNamedChild(
    input.companyDocChildren,
    COMPANY_DOC_NAME_TO_KEY,
  );
  const templates = matchNamedChild(input.templateChildren, TEMPLATE_NAME_TO_KEY);

  const missing: string[] = [
    ...top.missingNames.map((n) => titleCase(n)),
    ...companyDocs.missingNames.map((n) => titleCase(n)),
    ...templates.missingNames.map((n) => titleCase(n)),
  ];

  return {
    root: input.root,
    top: top.found,
    companyDocs: companyDocs.found,
    templates: templates.found,
    missing,
  };
};

const titleCase = (value: string): string =>
  value
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

/** Extract a Drive folder ID from a pasted URL or raw ID. */
export const parseDriveFolderInput = (raw: string): string | null => {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Raw Drive ID (typically long). Reject short/hyphenated phrases.
  if (/^[a-zA-Z0-9_-]{20,}$/.test(trimmed) && !trimmed.includes("://")) {
    return trimmed;
  }

  try {
    const url = new URL(trimmed);
    if (!url.hostname.includes("google.com") && !url.hostname.includes("googleusercontent.com")) {
      // still allow drive.google.com variants
      if (!url.hostname.includes("drive.google")) return null;
    }

    // https://drive.google.com/drive/folders/FOLDER_ID
    const foldersMatch = url.pathname.match(/\/folders\/([a-zA-Z0-9_-]+)/);
    if (foldersMatch?.[1]) return foldersMatch[1];

    // ?id=FOLDER_ID
    const idParam = url.searchParams.get("id");
    if (idParam) return idParam;
  } catch {
    return null;
  }

  return null;
};

export type VaultHealthItem = {
  name: string;
  ok: boolean;
  folderId: string | null;
};

export const validateDriveVault = (
  discovered: DiscoveredVault | null,
): {
  root: VaultHealthItem;
  top: VaultHealthItem[];
  companyDocuments: VaultHealthItem[];
  templates: VaultHealthItem[];
  missing: string[];
} => {
  if (!discovered) {
    return {
      root: { name: "Root", ok: false, folderId: null },
      top: VAULT_TOP_FOLDERS.map((name) => ({
        name,
        ok: false,
        folderId: null,
      })),
      companyDocuments: COMPANY_DOC_FOLDERS.map((name) => ({
        name,
        ok: false,
        folderId: null,
      })),
      templates: TEMPLATE_FOLDERS.map((name) => ({
        name,
        ok: false,
        folderId: null,
      })),
      missing: [...VAULT_TOP_FOLDERS, ...COMPANY_DOC_FOLDERS, ...TEMPLATE_FOLDERS],
    };
  }

  const top: VaultHealthItem[] = [
    {
      name: "Company Documents",
      ok: Boolean(discovered.top.companyDocuments),
      folderId: discovered.top.companyDocuments?.id ?? null,
    },
    {
      name: "Templates",
      ok: Boolean(discovered.top.templates),
      folderId: discovered.top.templates?.id ?? null,
    },
    {
      name: "Submissions",
      ok: Boolean(discovered.top.submissions),
      folderId: discovered.top.submissions?.id ?? null,
    },
  ];

  const companyDocuments: VaultHealthItem[] = COMPANY_DOC_FOLDERS.map((name) => {
    const key = COMPANY_DOC_NAME_TO_KEY[normalizeFolderName(name)];
    const ref = key ? discovered.companyDocs[key] : undefined;
    return { name, ok: Boolean(ref), folderId: ref?.id ?? null };
  });

  const templates: VaultHealthItem[] = TEMPLATE_FOLDERS.map((name) => {
    const key = TEMPLATE_NAME_TO_KEY[normalizeFolderName(name)];
    const ref = key ? discovered.templates[key] : undefined;
    return { name, ok: Boolean(ref), folderId: ref?.id ?? null };
  });

  return {
    root: {
      name: discovered.root.name,
      ok: true,
      folderId: discovered.root.id,
    },
    top,
    companyDocuments,
    templates,
    missing: discovered.missing,
  };
};

export const GOOGLE_DOC_MIME = "application/vnd.google-apps.document";
export const GOOGLE_FOLDER_MIME = "application/vnd.google-apps.folder";

export type TemplateSelection =
  | { status: "READY"; file: { id: string; name: string; webViewLink: string } }
  | { status: "MISSING" }
  | { status: "NEEDS_CONFIGURATION"; candidates: Array<{ id: string; name: string; webViewLink: string }> };

export const selectMasterTemplate = (
  files: Array<{ id: string; name: string; mimeType: string; webViewLink: string }>,
  preferredFileId?: string | null,
): TemplateSelection => {
  const docs = files.filter((f) => f.mimeType === GOOGLE_DOC_MIME);
  if (preferredFileId) {
    const preferred = docs.find((f) => f.id === preferredFileId);
    if (preferred) {
      return {
        status: "READY",
        file: {
          id: preferred.id,
          name: preferred.name,
          webViewLink: preferred.webViewLink,
        },
      };
    }
  }
  if (docs.length === 0) return { status: "MISSING" };
  if (docs.length === 1) {
    return {
      status: "READY",
      file: {
        id: docs[0].id,
        name: docs[0].name,
        webViewLink: docs[0].webViewLink,
      },
    };
  }
  return {
    status: "NEEDS_CONFIGURATION",
    candidates: docs.map((d) => ({
      id: d.id,
      name: d.name,
      webViewLink: d.webViewLink,
    })),
  };
};

export type DocValidityStatus =
  | "AVAILABLE"
  | "EXPIRED"
  | "MISSING"
  | "TO_GENERATE"
  | "UNKNOWN";

export const resolveDocumentValidity = (input: {
  hasFile: boolean;
  validUntil?: string | null;
}): DocValidityStatus => {
  if (!input.hasFile) return "MISSING";
  if (!input.validUntil) return "UNKNOWN";
  const until = new Date(input.validUntil);
  if (Number.isNaN(until.getTime())) return "UNKNOWN";
  if (until.getTime() < Date.now()) return "EXPIRED";
  return "AVAILABLE";
};
