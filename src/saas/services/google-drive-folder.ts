import { randomUUID } from "node:crypto";
import type {
  GoogleDriveFolderItem,
  GoogleDriveFolderLink,
  Prisma,
  PrismaClient,
  SaasJob,
  Tender,
} from "@prisma/client";
import type { KimdisClient } from "../../kimdis/client.js";
import {
  SaasError,
  badRequest,
  conflict,
  forbidden,
  notFound,
  serviceUnavailable,
} from "../errors.js";
import { enqueueSaasJob, SAAS_JOB_TYPES } from "../jobs/outbox.js";
import { resolveSaasAppUrl } from "../mail/mail.js";
import { entitlementsForPlanKey } from "../plans/catalog.js";
import {
  getValidGoogleAccessToken,
  requireVerifiedMember,
  assertGoogleEntitled,
} from "./google-connection.js";
import {
  GOOGLE_SCOPE_DRIVE_FILE,
  hasGrantedScope,
  isSaasGoogleDriveEnabled,
} from "./google-config.js";
import {
  findItemByAppKey,
  getOrCreateChildFolder,
  uploadFile,
  type GoogleDriveApiError,
} from "./google-drive-api.js";
import {
  MAX_IMPORT_FILE_BYTES,
  markDriveNeedsReconnect,
  requireAccessToken,
  requireDriveImportContext,
  sanitizeFilename,
} from "./google-drive-import.js";
import { isUtcMidnight } from "./google-calendar-events.js";
import {
  loadParticipationChecklist,
  type ParticipationChecklist,
} from "./participation-checklist.js";
import { resolveOrganizationScanAccess } from "./scan-access.js";
import {
  sourceLabelEl,
  sourceSystemFromReference,
} from "./source-provenance.js";
import { getDocumentDownload } from "./vault.js";

// ---------------------------------------------------------------------------
// Copy (Greek UX) + constants
// ---------------------------------------------------------------------------

export const DRIVE_FOLDER_SECTIONS = [
  { key: "01", name: "01 — Έγγραφα διαγωνισμού" },
  { key: "02", name: "02 — Δικαιολογητικά" },
  { key: "03", name: "03 — Προετοιμασία προσφοράς" },
] as const;

type SectionKey = (typeof DRIVE_FOLDER_SECTIONS)[number]["key"];

export const DRIVE_FOLDER_SUCCESS_EL = "Ο φάκελος δημιουργήθηκε στο Google Drive.";
export const DRIVE_FOLDER_COPY_HINT_EL =
  "Ο φάκελος περιέχει αντίγραφα των εγγράφων που επιλέξατε. Ελέγξτε τις απαιτήσεις της διακήρυξης πριν από την υποβολή.";
export const DRIVE_FOLDER_SNAPSHOT_HINT_EL =
  "Ο φάκελος είναι στιγμιότυπο: δεν συγχρονίζεται με το ARC και δεν μοιράζεται αυτόματα με κανέναν. Ένα νέο στιγμιότυπο δημιουργεί νέο φάκελο και δεν αλλάζει τους υπάρχοντες.";
const SUMMARY_FILENAME = "Σύνοψη διαγωνισμού.md";
const CHECKLIST_FILENAME = "Έλεγχος δικαιολογητικών (ενδεικτικός).md";
const MODE_LABEL_EL = {
  pdf: "Θα αντιγραφεί το PDF αν είναι διαθέσιμο",
  link_only: "Μόνο σύνδεσμος στη σύνοψη (δεν θα αντιγραφεί αρχείο PDF)",
} as const;
const CHECKLIST_LOCKED_EL =
  "Η σύνοψη δικαιολογητικών είναι διαθέσιμη στα πακέτα με λίστα συμμετοχής.";

export const MAX_FOLDER_VAULT_DOCUMENTS = 20;
const MAX_FOLDER_NAME_LENGTH = 120;
const SHORT_TITLE_LENGTH = 60;
/** A PENDING snapshot older than this no longer blocks a new one. */
const ACTIVE_FOLDER_STALE_MS = 15 * 60 * 1000;
const FOLDER_JOB_MAX_ATTEMPTS = 4;
const MIME_PDF = "application/pdf";
const MIME_MARKDOWN = "text/markdown";

/** Greek copy for every safe error code stored on a folder / item. */
const FOLDER_ERROR_EL = {
  plan_locked: "Η δυνατότητα δεν είναι διαθέσιμη για το τρέχον πακέτο.",
  needs_reconnect: "Χρειάζεται επανασύνδεση με το Google Drive.",
  connection_stopped: "Η σύνδεση με το Google Drive διακόπηκε.",
  account_changed:
    "Ο λογαριασμός Google άλλαξε. Δημιουργήστε νέο φάκελο στον τρέχοντα λογαριασμό.",
  folder_create_failed: "Ο φάκελος δεν δημιουργήθηκε στο Google Drive.",
  folder_missing:
    "Ο φάκελος προορισμού δεν βρέθηκε στο Google Drive (ίσως διαγράφηκε).",
  section_folder_failed: "Ο υποφάκελος δεν δημιουργήθηκε.",
  drive_unavailable:
    "Το Google Drive δεν ήταν διαθέσιμο. Δοκιμάστε ξανά σε λίγο.",
  drive_quota_exceeded:
    "Ο λογαριασμός Google δεν έχει αρκετό αποθηκευτικό χώρο.",
  drive_denied: "Το Google Drive αρνήθηκε την εγγραφή του αρχείου.",
  upload_failed: "Το αρχείο δεν αντιγράφηκε στο Google Drive.",
  vault_file_missing:
    "Το έγγραφο δεν βρέθηκε στα Έγγραφα του ARC. Αφαιρέστε το και δημιουργήστε νέο φάκελο.",
  vault_read_failed: "Το έγγραφο δεν ήταν δυνατό να διαβαστεί. Δοκιμάστε ξανά.",
  file_too_large: "Το αρχείο ξεπερνά το όριο των 25 MB.",
  file_empty: "Το αρχείο είναι κενό.",
  official_download_failed:
    "Η λήψη του επίσημου εγγράφου δεν ολοκληρώθηκε. Δοκιμάστε ξανά.",
  checklist_failed: "Η σύνοψη δικαιολογητικών δεν δημιουργήθηκε. Δοκιμάστε ξανά.",
  dependency_failed:
    "Δεν δημιουργήθηκε επειδή το επίσημο έγγραφο δεν ολοκληρώθηκε. Δοκιμάστε ξανά.",
  link_only:
    "Μόνο σύνδεσμος στη σύνοψη — δεν αντιγράφηκε αρχείο PDF.",
  checklist_unavailable:
    "Δεν υπάρχει διαθέσιμη ανάλυση δικαιολογητικών για αυτόν τον διαγωνισμό.",
  folder_incomplete: "Ο φάκελος δεν ολοκληρώθηκε πλήρως.",
  folder_failed: "Η δημιουργία του φακέλου δεν ολοκληρώθηκε. Δοκιμάστε ξανά.",
} as const;

export type DriveFolderErrorCode = keyof typeof FOLDER_ERROR_EL;

export const driveFolderErrorEl = (code: string | null | undefined): string | null => {
  if (!code) return null;
  return (
    FOLDER_ERROR_EL[code as DriveFolderErrorCode] ?? FOLDER_ERROR_EL.folder_failed
  );
};

/** Failures that a retry cannot fix (the source itself is gone / invalid). */
const NON_RETRYABLE_CODES = new Set<string>([
  "vault_file_missing",
  "file_too_large",
  "file_empty",
  "plan_locked",
  "account_changed",
]);

// ---------------------------------------------------------------------------
// Pure helpers (exported for tests)
// ---------------------------------------------------------------------------

export type FolderOptions = {
  vaultDocumentIds: string[];
  includeOfficialDocs: boolean;
  includeChecklistSummary: boolean;
};

const normalizeText = (value: string): string => value.replace(/\s+/g, " ").trim();

export const shortTenderTitle = (title: string | null | undefined): string => {
  const clean = normalizeText(title ?? "");
  if (clean.length <= SHORT_TITLE_LENGTH) return clean;
  const cut = clean.slice(0, SHORT_TITLE_LENGTH);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > SHORT_TITLE_LENGTH / 2 ? cut.slice(0, lastSpace) : cut).trim()}…`;
};

/** «{αναγνωριστικό} — {σύντομος τίτλος}», safe for Drive. */
export const defaultFolderName = (tender: {
  referenceNumber: string;
  title: string | null;
}): string => {
  const short = shortTenderTitle(tender.title);
  return cleanFolderName(
    short ? `${tender.referenceNumber} — ${short}` : tender.referenceNumber,
  );
};

const cleanFolderName = (name: string): string =>
  sanitizeFilename(name).slice(0, MAX_FOLDER_NAME_LENGTH).trim();

export type OfficialDocumentCandidate = {
  /** Item key suffix, e.g. "PROC:26PROC001". */
  key: string;
  label: string;
  /** "pdf" → try to copy bytes; "link_only" → only the link goes in the summary. */
  mode: "pdf" | "link_only";
  recordType: "REQ" | "PROC" | null;
  adam: string;
  url: string | null;
};

type TenderForFolder = Pick<
  Tender,
  | "id"
  | "referenceNumber"
  | "recordType"
  | "title"
  | "contractingAuthority"
  | "finalSubmissionDate"
  | "officialPdfUrl"
  | "publicKimdisUrl"
>;

const officialCandidate = (
  tender: TenderForFolder,
  kimdisAvailable: boolean,
): OfficialDocumentCandidate | null => {
  const url = tender.officialPdfUrl ?? tender.publicKimdisUrl ?? null;
  if (!url) return null;
  const isKimdis = sourceSystemFromReference(tender.referenceNumber) === "kimdis";
  const downloadable =
    isKimdis &&
    kimdisAvailable &&
    Boolean(tender.officialPdfUrl) &&
    (tender.recordType === "REQ" || tender.recordType === "PROC");
  const recordType =
    tender.recordType === "REQ" || tender.recordType === "PROC"
      ? tender.recordType
      : null;
  return {
    key: `${recordType ?? tender.recordType}:${tender.referenceNumber}`,
    label:
      tender.recordType === "PROC"
        ? `Διακήρυξη ${tender.referenceNumber}`
        : `Έγγραφο ${tender.referenceNumber}`,
    mode: downloadable ? "pdf" : "link_only",
    recordType,
    adam: tender.referenceNumber,
    url,
  };
};

export const formatDeadlineEl = (deadline: Date | null | undefined): string | null => {
  if (!deadline) return null;
  if (Number.isNaN(deadline.getTime())) return null;
  if (isUtcMidnight(deadline)) {
    return new Intl.DateTimeFormat("el-GR", {
      timeZone: "UTC",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(deadline);
  }
  return new Intl.DateTimeFormat("el-GR", {
    timeZone: "Europe/Athens",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(deadline);
};

const arcTenderUrl = (tender: TenderForFolder): string | null => {
  if (sourceSystemFromReference(tender.referenceNumber) !== "kimdis") return null;
  if (tender.recordType !== "REQ" && tender.recordType !== "PROC") return null;
  const base = resolveSaasAppUrl().replace(/\/+$/, "");
  return `${base}/app/tenders/${tender.recordType}/${encodeURIComponent(tender.referenceNumber)}`;
};

type SummaryOfficialLine = {
  label: string;
  url: string | null;
  /** Copied PDF file name when the bytes really were copied. */
  copiedAs: string | null;
};

/** Plain markdown summary. Never claims a PDF was copied unless it was. */
export const buildTenderSummaryMarkdown = (input: {
  tender: TenderForFolder;
  officialRequested: boolean;
  official: SummaryOfficialLine[];
  snapshotAt: Date;
}): string => {
  const { tender } = input;
  const deadline = formatDeadlineEl(tender.finalSubmissionDate);
  const arcUrl = arcTenderUrl(tender);
  const lines: string[] = [
    `# ${normalizeText(tender.title ?? "") || tender.referenceNumber}`,
    "",
    `- Αναγνωριστικό: ${tender.referenceNumber}`,
    `- Αναθέτουσα αρχή: ${normalizeText(tender.contractingAuthority ?? "") || "Δεν έχει καταχωρηθεί"}`,
    `- Προθεσμία υποβολής: ${deadline ?? "Δεν είναι γνωστή"}`,
    `- Πηγή: ${sourceLabelEl(sourceSystemFromReference(tender.referenceNumber))}`,
  ];
  if (arcUrl) lines.push(`- Άνοιγμα στο ARC: ${arcUrl}`);
  lines.push("", "## Επίσημο έγγραφο", "");
  if (input.official.length === 0) {
    lines.push("- Δεν υπάρχει διαθέσιμος επίσημος σύνδεσμος για αυτή την πράξη.");
  }
  for (const doc of input.official) {
    if (doc.copiedAs) {
      lines.push(
        `- ${doc.label}: αντίγραφο PDF στον φάκελο «${DRIVE_FOLDER_SECTIONS[0].name}» (${doc.copiedAs})${doc.url ? ` — ${doc.url}` : ""}`,
      );
      continue;
    }
    lines.push(
      `- ${doc.label}: μόνο σύνδεσμος — δεν αντιγράφηκε αρχείο PDF.${doc.url ? ` ${doc.url}` : ""}`,
    );
  }
  if (!input.officialRequested) {
    lines.push("- Δεν επιλέχθηκε αντιγραφή επίσημου εγγράφου.");
  }
  lines.push(
    "",
    "---",
    `Στιγμιότυπο της ${new Intl.DateTimeFormat("el-GR", { timeZone: "Europe/Athens", day: "2-digit", month: "2-digit", year: "numeric" }).format(input.snapshotAt)}. Δεν ενημερώνεται αυτόματα.`,
    DRIVE_FOLDER_COPY_HINT_EL,
    "",
  );
  return lines.join("\n");
};

/** Plain markdown of the existing (indicative) checklist. Not a complete package. */
export const buildChecklistMarkdown = (input: {
  tender: Pick<TenderForFolder, "referenceNumber" | "title">;
  checklist: ParticipationChecklist;
}): string => {
  const { checklist } = input;
  const lines: string[] = [
    "# Έλεγχος δικαιολογητικών (ενδεικτικός)",
    "",
    `Διαγωνισμός: ${normalizeText(input.tender.title ?? "") || input.tender.referenceNumber} (${input.tender.referenceNumber})`,
    "",
    `> ${checklist.matchDisclaimerEl}`,
    "> Η σύνοψη αυτή δεν αποτελεί πλήρες πακέτο συμμετοχής. Ελέγξτε τις απαιτήσεις της διακήρυξης πριν από την υποβολή.",
    "",
    "## Στοιχεία που εντοπίστηκαν",
    "",
  ];
  for (const field of checklist.fields) {
    const page = field.citation?.page ? ` (σελ. ${field.citation.page})` : "";
    lines.push(`- ${field.label}: ${field.value ?? "Δεν εντοπίστηκε"}${page}`);
  }
  lines.push("", "## Δικαιολογητικά", "");
  if (checklist.documents.length === 0) lines.push("- Δεν εντοπίστηκαν δικαιολογητικά.");
  for (const doc of checklist.documents) {
    lines.push(`- ${doc.label} — ${doc.statusLabelEl}`);
  }
  if (checklist.zeroRulesMessage) lines.push("", checklist.zeroRulesMessage);
  if (checklist.officialPdfUrl) {
    lines.push("", `Επίσημο έγγραφο: ${checklist.officialPdfUrl}`);
  }
  lines.push("");
  return lines.join("\n");
};

// ---------------------------------------------------------------------------
// Folder plan (pure) — one row per sub-folder / file, deterministic keys
// ---------------------------------------------------------------------------

export type PlannedFolderItem = {
  itemKey: string;
  kind: "SUBFOLDER" | "SUMMARY" | "OFFICIAL_PDF" | "VAULT_DOCUMENT" | "CHECKLIST";
  section: SectionKey | null;
  displayName: string;
  sourceRef: string | null;
  sortOrder: number;
};

export const buildFolderPlan = (input: {
  options: FolderOptions;
  officialDocs: OfficialDocumentCandidate[];
  vaultDocuments: Array<{ id: string; fileName: string }>;
}): PlannedFolderItem[] => {
  const items: PlannedFolderItem[] = DRIVE_FOLDER_SECTIONS.map((section, index) => ({
    itemKey: `section:${section.key}`,
    kind: "SUBFOLDER" as const,
    section: section.key,
    displayName: section.name,
    sourceRef: null,
    sortOrder: index,
  }));
  if (input.options.includeOfficialDocs) {
    input.officialDocs
      .filter((doc) => doc.mode === "pdf" && doc.recordType)
      .forEach((doc, index) => {
        items.push({
          itemKey: `official:${doc.key}`,
          kind: "OFFICIAL_PDF",
          section: "01",
          displayName: `${sanitizeFilename(doc.adam)}.pdf`,
          sourceRef: `${doc.recordType}:${doc.adam}`,
          sortOrder: 10 + index,
        });
      });
  }
  // Summary comes after the official documents so it can state what really happened.
  items.push({
    itemKey: "summary",
    kind: "SUMMARY",
    section: null,
    displayName: SUMMARY_FILENAME,
    sourceRef: null,
    sortOrder: 50,
  });
  input.vaultDocuments.forEach((doc, index) => {
    items.push({
      itemKey: `vault:${doc.id}`,
      kind: "VAULT_DOCUMENT",
      section: "02",
      displayName: doc.fileName,
      sourceRef: doc.id,
      sortOrder: 100 + index,
    });
  });
  if (input.options.includeChecklistSummary) {
    items.push({
      itemKey: "checklist",
      kind: "CHECKLIST",
      section: "03",
      displayName: CHECKLIST_FILENAME,
      sourceRef: null,
      sortOrder: 200,
    });
  }
  return items;
};

// ---------------------------------------------------------------------------
// Public views
// ---------------------------------------------------------------------------

export type GoogleDriveFolderItemView = {
  id: string;
  kind: string;
  section: string | null;
  name: string;
  status: "PENDING" | "SUCCEEDED" | "FAILED" | "SKIPPED";
  errorCode: string | null;
  errorEl: string | null;
  retryable: boolean;
};

export type GoogleDriveFolderView = {
  id: string;
  tenderId: string;
  folderName: string;
  folderUrl: string | null;
  googleEmail: string;
  status: "PENDING" | "SUCCEEDED" | "PARTIAL" | "FAILED";
  /** True while the job is still running. */
  active: boolean;
  errorCode: string | null;
  errorEl: string | null;
  createdAt: string;
  completedAt: string | null;
  items: GoogleDriveFolderItemView[];
  /** At least one failed / unfinished item (or the folder itself) can be retried. */
  retryable: boolean;
  successEl: string | null;
  copyHintEl: string;
};

const isItemRetryable = (item: GoogleDriveFolderItem): boolean =>
  item.status === "FAILED" && !NON_RETRYABLE_CODES.has(item.errorSafe ?? "");

const toItemView = (item: GoogleDriveFolderItem): GoogleDriveFolderItemView => ({
  id: item.id,
  kind: item.kind,
  section: item.section,
  name: item.displayName,
  status: item.status,
  errorCode: item.errorSafe,
  errorEl: driveFolderErrorEl(item.errorSafe),
  retryable: isItemRetryable(item),
});

const toFolderView = (
  link: GoogleDriveFolderLink & { items: GoogleDriveFolderItem[] },
): GoogleDriveFolderView => {
  const items = [...link.items].sort((a, b) => a.sortOrder - b.sortOrder);
  const resumable =
    link.status === "PARTIAL" ||
    link.status === "FAILED"
      ? !NON_RETRYABLE_CODES.has(link.errorSafe ?? "") &&
        (!link.folderId ||
          items.some((i) => i.status === "PENDING" || isItemRetryable(i)))
      : false;
  return {
    id: link.id,
    tenderId: link.tenderId,
    folderName: link.folderName,
    folderUrl: link.folderUrl,
    googleEmail: link.googleEmail,
    status: link.status,
    active: link.status === "PENDING",
    errorCode: link.errorSafe,
    errorEl: driveFolderErrorEl(link.errorSafe),
    createdAt: link.createdAt.toISOString(),
    completedAt: link.completedAt?.toISOString() ?? null,
    items: items.map(toItemView),
    retryable: resumable,
    successEl: link.status === "SUCCEEDED" ? DRIVE_FOLDER_SUCCESS_EL : null,
    copyHintEl: DRIVE_FOLDER_COPY_HINT_EL,
  };
};

// ---------------------------------------------------------------------------
// Tender lookup (org isolation)
// ---------------------------------------------------------------------------

type FolderDeps = { kimdis?: KimdisClient };

const loadOrgTender = async (
  prisma: PrismaClient,
  input: { organizationId: string; tenderId: string },
) => {
  const orgTender = await prisma.organizationTender.findFirst({
    where: { organizationId: input.organizationId, tenderId: input.tenderId },
    include: { tender: true },
  });
  if (!orgTender) throw notFound("tender_not_in_workspace");
  return orgTender;
};

const loadOfficialCandidates = async (
  prisma: PrismaClient,
  tender: Tender,
  kimdisAvailable: boolean,
): Promise<OfficialDocumentCandidate[]> => {
  const candidates: OfficialDocumentCandidate[] = [];
  const own = officialCandidate(tender, kimdisAvailable);
  if (own) candidates.push(own);
  if (tender.recordType === "REQ") {
    const children = await prisma.tender.findMany({
      where: { parentTenderId: tender.id, recordType: "PROC" },
      orderBy: { submissionDate: "desc" },
      take: 3,
    });
    for (const child of children) {
      const candidate = officialCandidate(child, kimdisAvailable);
      if (candidate) candidates.push(candidate);
    }
  }
  return candidates;
};

// ---------------------------------------------------------------------------
// Preview
// ---------------------------------------------------------------------------

export type TenderDriveFolderPreview = {
  googleEmail: string;
  tender: {
    id: string;
    referenceNumber: string;
    title: string | null;
    contractingAuthority: string | null;
    deadlineEl: string | null;
    sourceLabelEl: string;
  };
  defaultFolderName: string;
  structure: Array<{ key: string; name: string }>;
  officialDocuments: Array<{
    key: string;
    label: string;
    mode: "pdf" | "link_only";
    modeLabelEl: string;
    url: string | null;
  }>;
  vault: {
    entitled: boolean;
    maxDocuments: number;
    documents: Array<{
      id: string;
      name: string;
      fileName: string;
      fileSizeBytes: number | null;
      supported: boolean;
      reasonEl: string | null;
    }>;
  };
  checklist: {
    entitled: boolean;
    available: boolean;
    labelEl: string;
    reasonEl: string | null;
    /** Existing match/limitation labels — shown verbatim, never reworded. */
    limitationEl: string | null;
  };
  existingFolders: GoogleDriveFolderView[];
  messages: {
    destinationEl: string;
    copyHintEl: string;
    snapshotHintEl: string;
  };
};

const vaultFileName = (doc: { name: string; originalFilename: string | null }): string =>
  sanitizeFilename(doc.originalFilename ?? doc.name) || "έγγραφο";

const loadVaultDocuments = async (
  prisma: PrismaClient,
  organizationId: string,
  ids: string[],
) => {
  if (ids.length === 0) return [];
  const rows = await prisma.vaultDocument.findMany({
    where: { id: { in: ids }, organizationId },
    select: { id: true, name: true, originalFilename: true, fileSize: true },
  });
  if (rows.length !== ids.length) throw notFound("vault_document_not_found");
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.map((id) => byId.get(id)!);
};

const uniqueIds = (ids: string[]): string[] => [...new Set(ids)];

const assertVaultSelection = (ids: string[]) => {
  if (ids.length > MAX_FOLDER_VAULT_DOCUMENTS) {
    throw badRequest("google_drive_folder_too_many_documents");
  }
};

export const previewCreateTenderDriveFolder = async (
  prisma: PrismaClient,
  input: {
    userId: string;
    organizationId: string | null;
    tenderId: string;
    vaultDocumentIds?: string[];
  },
  deps: FolderDeps = {},
): Promise<TenderDriveFolderPreview> => {
  const ctx = await requireDriveImportContext(prisma, input, { requireVault: false });
  const scanAccess = await resolveOrganizationScanAccess(prisma, {
    userId: ctx.userId,
    organizationId: ctx.organizationId,
  });
  const plan = entitlementsForPlanKey(scanAccess.planKey);
  const connection = await prisma.userOrganizationGoogleConnection.findUniqueOrThrow({
    where: { id: ctx.connectionId },
    select: { googleEmail: true },
  });
  const orgTender = await loadOrgTender(prisma, {
    organizationId: ctx.organizationId,
    tenderId: input.tenderId,
  });
  const tender = orgTender.tender;

  const vaultIds = uniqueIds(input.vaultDocumentIds ?? []);
  assertVaultSelection(vaultIds);
  if (vaultIds.length > 0 && !plan.companyVault) throw forbidden("plan_feature_locked");
  const vaultDocs = await loadVaultDocuments(prisma, ctx.organizationId, vaultIds);

  const officialDocs = await loadOfficialCandidates(prisma, tender, Boolean(deps.kimdis));

  let checklistAvailable = false;
  let checklistReason: string | null = null;
  let checklistLimitation: string | null = null;
  if (!plan.participationChecklist) {
    checklistReason = CHECKLIST_LOCKED_EL;
  } else {
    try {
      const checklist = await loadParticipationChecklist(prisma, deps.kimdis, {
        organizationId: ctx.organizationId,
        tenderId: tender.id,
      });
      checklistAvailable = checklist.readable;
      checklistLimitation = checklist.matchDisclaimerEl;
      if (!checklist.readable) checklistReason = checklist.unreadMessage;
    } catch {
      checklistReason = FOLDER_ERROR_EL.checklist_unavailable;
    }
  }

  const existing = await listExistingFolders(prisma, {
    userId: ctx.userId,
    organizationId: ctx.organizationId,
    tenderId: tender.id,
  });

  return {
    googleEmail: connection.googleEmail,
    tender: {
      id: tender.id,
      referenceNumber: tender.referenceNumber,
      title: tender.title,
      contractingAuthority: tender.contractingAuthority,
      deadlineEl: formatDeadlineEl(tender.finalSubmissionDate),
      sourceLabelEl: sourceLabelEl(sourceSystemFromReference(tender.referenceNumber)),
    },
    defaultFolderName: defaultFolderName(tender),
    structure: DRIVE_FOLDER_SECTIONS.map((s) => ({ key: s.key, name: s.name })),
    officialDocuments: officialDocs.map((doc) => ({
      key: doc.key,
      label: doc.label,
      mode: doc.mode,
      modeLabelEl: MODE_LABEL_EL[doc.mode],
      url: doc.url,
    })),
    vault: {
      entitled: plan.companyVault,
      maxDocuments: MAX_FOLDER_VAULT_DOCUMENTS,
      documents: vaultDocs.map((doc) => {
        const tooLarge = doc.fileSize !== null && doc.fileSize > MAX_IMPORT_FILE_BYTES;
        return {
          id: doc.id,
          name: doc.name,
          fileName: vaultFileName(doc),
          fileSizeBytes: doc.fileSize,
          supported: !tooLarge,
          reasonEl: tooLarge ? FOLDER_ERROR_EL.file_too_large : null,
        };
      }),
    },
    checklist: {
      entitled: plan.participationChecklist,
      available: checklistAvailable,
      labelEl: "Σύνοψη ελέγχου δικαιολογητικών (ενδεικτική)",
      reasonEl: checklistReason,
      limitationEl: checklistLimitation,
    },
    existingFolders: existing.folders,
    messages: {
      destinationEl: `Τα αντίγραφα θα αποθηκευτούν στον λογαριασμό Google ${connection.googleEmail}.`,
      copyHintEl: DRIVE_FOLDER_COPY_HINT_EL,
      snapshotHintEl: DRIVE_FOLDER_SNAPSHOT_HINT_EL,
    },
  };
};

// ---------------------------------------------------------------------------
// List / status
// ---------------------------------------------------------------------------

export const listExistingFolders = async (
  prisma: PrismaClient,
  input: { userId: string; organizationId: string | null; tenderId: string },
): Promise<{ folders: GoogleDriveFolderView[] }> => {
  if (!isSaasGoogleDriveEnabled()) throw serviceUnavailableDrive();
  const ctx = await requireVerifiedMember(prisma, input);
  const scope = { userId: ctx.userId, organizationId: ctx.organizationId };
  await assertGoogleEntitled(prisma, scope, "drive");
  const connection = await prisma.userOrganizationGoogleConnection.findUnique({
    where: {
      organizationId_userId: {
        organizationId: ctx.organizationId,
        userId: ctx.userId,
      },
    },
    select: { id: true },
  });
  if (!connection) return { folders: [] };
  const links = await prisma.googleDriveFolderLink.findMany({
    where: {
      connectionId: connection.id,
      organizationId: ctx.organizationId,
      tenderId: input.tenderId,
    },
    include: { items: true },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  return { folders: links.map(toFolderView) };
};

const serviceUnavailableDrive = () => serviceUnavailable("google_drive_disabled");

export const getDriveFolderStatus = async (
  prisma: PrismaClient,
  input: { userId: string; organizationId: string | null; linkId: string },
): Promise<GoogleDriveFolderView> => {
  if (!isSaasGoogleDriveEnabled()) throw serviceUnavailableDrive();
  const ctx = await requireVerifiedMember(prisma, input);
  const link = await prisma.googleDriveFolderLink.findFirst({
    where: {
      id: input.linkId,
      organizationId: ctx.organizationId,
      createdByUserId: ctx.userId,
    },
    include: { items: true },
  });
  if (!link) throw notFound("google_drive_folder_not_found");
  return toFolderView(link);
};

// ---------------------------------------------------------------------------
// Start (enqueue)
// ---------------------------------------------------------------------------

type FolderJobPayload = {
  linkId: string;
  jobEpoch: number;
  connectionId: string;
  organizationId: string;
  userId: string;
  googleAccountId: string;
  organizationTenderId: string;
  tenderId: string;
  folderName: string;
  vaultDocumentIds: string[];
  includeOfficialDocs: boolean;
  includeChecklistSummary: boolean;
};

const enqueueFolderJob = async (
  prisma: PrismaClient,
  link: GoogleDriveFolderLink,
  options: FolderOptions,
) => {
  const payload: FolderJobPayload = {
    linkId: link.id,
    jobEpoch: link.jobEpoch,
    connectionId: link.connectionId,
    organizationId: link.organizationId,
    userId: link.createdByUserId,
    googleAccountId: link.googleAccountId,
    organizationTenderId: link.organizationTenderId,
    tenderId: link.tenderId,
    folderName: link.folderName,
    vaultDocumentIds: options.vaultDocumentIds,
    includeOfficialDocs: options.includeOfficialDocs,
    includeChecklistSummary: options.includeChecklistSummary,
  };
  await enqueueSaasJob(prisma, {
    type: SAAS_JOB_TYPES.googleDriveCreateFolder,
    deliveryKey: `GDRIVE_FOLDER:${link.id}:${link.jobEpoch}`,
    organizationId: link.organizationId,
    payload,
    priority: 60,
    maxAttempts: FOLDER_JOB_MAX_ATTEMPTS,
  });
};

const readOptions = (link: GoogleDriveFolderLink): FolderOptions => {
  const raw = (link.options ?? {}) as Partial<FolderOptions>;
  return {
    vaultDocumentIds: Array.isArray(raw.vaultDocumentIds)
      ? raw.vaultDocumentIds.filter((id): id is string => typeof id === "string")
      : [],
    includeOfficialDocs: raw.includeOfficialDocs !== false,
    includeChecklistSummary: raw.includeChecklistSummary === true,
  };
};

export const startCreateTenderDriveFolder = async (
  prisma: PrismaClient,
  input: {
    userId: string;
    organizationId: string | null;
    tenderId: string;
    folderName?: string;
    vaultDocumentIds?: string[];
    includeOfficialDocs?: boolean;
    includeChecklistSummary?: boolean;
    /** Client-generated id for this dialog session: a double submit returns the same snapshot. */
    clientRequestId?: string;
  },
  deps: FolderDeps = {},
): Promise<GoogleDriveFolderView> => {
  const ctx = await requireDriveImportContext(prisma, input, { requireVault: false });
  const scanAccess = await resolveOrganizationScanAccess(prisma, {
    userId: ctx.userId,
    organizationId: ctx.organizationId,
  });
  const plan = entitlementsForPlanKey(scanAccess.planKey);

  const options: FolderOptions = {
    vaultDocumentIds: uniqueIds(input.vaultDocumentIds ?? []),
    includeOfficialDocs: input.includeOfficialDocs !== false,
    includeChecklistSummary: input.includeChecklistSummary === true,
  };
  assertVaultSelection(options.vaultDocumentIds);
  if (options.vaultDocumentIds.length > 0 && !plan.companyVault) {
    throw forbidden("plan_feature_locked");
  }
  if (options.includeChecklistSummary && !plan.participationChecklist) {
    throw forbidden("plan_feature_locked");
  }

  const orgTender = await loadOrgTender(prisma, {
    organizationId: ctx.organizationId,
    tenderId: input.tenderId,
  });
  const tender = orgTender.tender;
  const vaultDocs = await loadVaultDocuments(
    prisma,
    ctx.organizationId,
    options.vaultDocumentIds,
  );
  for (const doc of vaultDocs) {
    if (doc.fileSize !== null && doc.fileSize > MAX_IMPORT_FILE_BYTES) {
      throw badRequest("google_drive_folder_file_too_large");
    }
  }

  const folderName = cleanFolderName(input.folderName ?? "") || defaultFolderName(tender);
  if (!folderName) throw badRequest("google_drive_folder_name_required");

  // Validates the connection/token now so a dead grant fails fast (no Drive write here).
  await requireAccessToken(prisma, ctx.connectionId);
  const connection = await prisma.userOrganizationGoogleConnection.findUniqueOrThrow({
    where: { id: ctx.connectionId },
    select: { googleAccountId: true, googleEmail: true },
  });

  const officialDocs = await loadOfficialCandidates(prisma, tender, Boolean(deps.kimdis));
  const folderPlan = buildFolderPlan({
    options,
    officialDocs,
    vaultDocuments: vaultDocs.map((doc) => ({ id: doc.id, fileName: vaultFileName(doc) })),
  });

  const snapshotKey = (input.clientRequestId ?? "").match(/^[A-Za-z0-9_-]{8,64}$/)
    ? input.clientRequestId!
    : randomUUID();

  const created = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`gdrive-folder:${ctx.connectionId}`}))`;

    const replay = await tx.googleDriveFolderLink.findUnique({
      where: {
        connectionId_organizationTenderId_snapshotKey: {
          connectionId: ctx.connectionId,
          organizationTenderId: orgTender.id,
          snapshotKey,
        },
      },
      include: { items: true },
    });
    if (replay) return { link: replay, fresh: false };

    const active = await tx.googleDriveFolderLink.count({
      where: {
        connectionId: ctx.connectionId,
        organizationTenderId: orgTender.id,
        status: "PENDING",
        updatedAt: { gt: new Date(Date.now() - ACTIVE_FOLDER_STALE_MS) },
      },
    });
    if (active > 0) throw conflict("google_drive_folder_in_progress");

    const link = await tx.googleDriveFolderLink.create({
      data: {
        connectionId: ctx.connectionId,
        organizationId: ctx.organizationId,
        organizationTenderId: orgTender.id,
        tenderId: tender.id,
        createdByUserId: ctx.userId,
        googleAccountId: connection.googleAccountId,
        googleEmail: connection.googleEmail,
        folderName,
        snapshotKey,
        options: options as unknown as Prisma.InputJsonValue,
        items: {
          create: folderPlan.map((item) => ({
            itemKey: item.itemKey,
            kind: item.kind,
            section: item.section,
            displayName: item.displayName,
            sourceRef: item.sourceRef,
            sortOrder: item.sortOrder,
          })),
        },
      },
      include: { items: true },
    });
    return { link, fresh: true };
  });

  if (created.fresh) await enqueueFolderJob(prisma, created.link, options);
  return toFolderView(created.link);
};

// ---------------------------------------------------------------------------
// Retry failed / unfinished items only
// ---------------------------------------------------------------------------

export const retryTenderDriveFolder = async (
  prisma: PrismaClient,
  input: { userId: string; organizationId: string | null; linkId: string },
): Promise<GoogleDriveFolderView> => {
  const ctx = await requireDriveImportContext(prisma, input, { requireVault: false });
  const connection = await prisma.userOrganizationGoogleConnection.findUniqueOrThrow({
    where: { id: ctx.connectionId },
    select: { googleAccountId: true },
  });

  const updated = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`gdrive-folder:${ctx.connectionId}`}))`;
    const link = await tx.googleDriveFolderLink.findFirst({
      where: {
        id: input.linkId,
        connectionId: ctx.connectionId,
        organizationId: ctx.organizationId,
        createdByUserId: ctx.userId,
      },
      include: { items: true },
    });
    if (!link) throw notFound("google_drive_folder_not_found");
    if (link.status === "PENDING") throw conflict("google_drive_folder_in_progress");
    if (link.status === "SUCCEEDED") {
      throw badRequest("google_drive_folder_nothing_to_retry");
    }
    // The folder lives in another Google account — never write into it from this one.
    if (link.googleAccountId !== connection.googleAccountId) {
      throw badRequest("google_drive_folder_account_changed");
    }
    const retryable = link.items.filter(
      (i) => i.status === "PENDING" || isItemRetryable(i),
    );
    if (link.folderId && retryable.length === 0) {
      throw badRequest("google_drive_folder_nothing_to_retry");
    }
    await tx.googleDriveFolderItem.updateMany({
      where: { linkId: link.id, id: { in: retryable.map((i) => i.id) } },
      data: { status: "PENDING", errorSafe: null },
    });
    const next = await tx.googleDriveFolderLink.update({
      where: { id: link.id },
      data: {
        status: "PENDING",
        errorSafe: null,
        completedAt: null,
        jobEpoch: { increment: 1 },
      },
      include: { items: true },
    });
    return next;
  });

  await enqueueFolderJob(prisma, updated, readOptions(updated));
  return toFolderView(updated);
};

// ---------------------------------------------------------------------------
// Job processor
// ---------------------------------------------------------------------------

const asPayload = (job: SaasJob): Record<string, unknown> =>
  job.payload && typeof job.payload === "object"
    ? (job.payload as Record<string, unknown>)
    : {};

/** Settle the link from its items. `abortCode` forces an incomplete outcome. */
const finalizeLink = async (
  prisma: PrismaClient,
  linkId: string,
  abortCode?: DriveFolderErrorCode,
): Promise<void> => {
  const link = await prisma.googleDriveFolderLink.findUnique({
    where: { id: linkId },
    include: { items: true },
  });
  if (!link) return;
  const failed = link.items.filter((i) => i.status === "FAILED");
  const pending = link.items.filter((i) => i.status === "PENDING");
  const complete =
    !abortCode && Boolean(link.folderId) && failed.length === 0 && pending.length === 0;
  const status = complete
    ? ("SUCCEEDED" as const)
    : link.folderId && abortCode !== "account_changed"
      ? ("PARTIAL" as const)
      : ("FAILED" as const);
  const errorSafe = complete
    ? null
    : (abortCode ?? failed[0]?.errorSafe ?? "folder_incomplete");
  const completedAt = new Date();
  await prisma.googleDriveFolderLink.update({
    where: { id: link.id },
    data: { status, errorSafe, completedAt },
  });
  await prisma.userOrganizationGoogleConnection.updateMany({
    where: { id: link.connectionId },
    data: complete
      ? { driveLastSuccessAt: completedAt, driveLastErrorSafe: null, driveLastErrorAt: null }
      : { driveLastErrorAt: completedAt, driveLastErrorSafe: String(errorSafe) },
  });
};

type Gate =
  | { error: DriveFolderErrorCode; plan?: undefined }
  | { error: null; plan: ReturnType<typeof entitlementsForPlanKey> };

const checkStillAllowed = async (
  prisma: PrismaClient,
  link: GoogleDriveFolderLink,
): Promise<Gate> => {
  if (!isSaasGoogleDriveEnabled()) return { error: "plan_locked" };
  const member = await prisma.organizationMember.findUnique({
    where: {
      organizationId_userId: {
        organizationId: link.organizationId,
        userId: link.createdByUserId,
      },
    },
  });
  if (!member) return { error: "plan_locked" };
  const scan = await resolveOrganizationScanAccess(prisma, {
    userId: link.createdByUserId,
    organizationId: link.organizationId,
  });
  if (scan.status !== "active" && scan.status !== "trial") {
    return { error: "plan_locked" };
  }
  const plan = entitlementsForPlanKey(scan.planKey);
  if (!plan.googleDrive) return { error: "plan_locked" };

  const connection = await prisma.userOrganizationGoogleConnection.findUnique({
    where: { id: link.connectionId },
  });
  if (!connection || connection.driveStatus === "DISABLED") {
    return { error: "connection_stopped" };
  }
  // Stale-job guard: the connection now points at a different Google account.
  if (connection.googleAccountId !== link.googleAccountId) {
    return { error: "account_changed" };
  }
  if (
    connection.tokenStatus === "NEEDS_RECONNECT" ||
    connection.driveStatus === "NEEDS_RECONNECT" ||
    !hasGrantedScope(connection.grantedScopes, GOOGLE_SCOPE_DRIVE_FILE)
  ) {
    return { error: "needs_reconnect" };
  }
  return { error: null, plan };
};

type StepOutcome =
  | { kind: "done" }
  | { kind: "item_failed"; code: DriveFolderErrorCode }
  | { kind: "skipped"; code: DriveFolderErrorCode }
  | { kind: "abort"; code: DriveFolderErrorCode }
  | { kind: "retry" };

const classifyDriveError = async (
  prisma: PrismaClient,
  connectionId: string,
  error: GoogleDriveApiError,
  finalAttempt: boolean,
  fallback: DriveFolderErrorCode,
): Promise<StepOutcome> => {
  if (error.kind === "auth" || error.kind === "scope") {
    await markDriveNeedsReconnect(
      prisma,
      connectionId,
      error.messageSafe,
      error.kind === "auth",
    );
    return { kind: "abort", code: "needs_reconnect" };
  }
  if (!error.permanent) {
    return finalAttempt
      ? { kind: "item_failed", code: "drive_unavailable" }
      : { kind: "retry" };
  }
  if (error.kind === "not_found") return { kind: "item_failed", code: "folder_missing" };
  if (/quota/i.test(error.code ?? "")) {
    return { kind: "item_failed", code: "drive_quota_exceeded" };
  }
  if (error.kind === "forbidden") return { kind: "item_failed", code: "drive_denied" };
  return { kind: "item_failed", code: fallback };
};

const looksLikePdf = (bytes: Buffer): boolean =>
  bytes.byteLength >= 5 && bytes.subarray(0, 5).toString("latin1").startsWith("%PDF");

export const processGoogleDriveFolderJob = async (
  prisma: PrismaClient,
  job: SaasJob,
  deps: FolderDeps = {},
): Promise<"ok" | "skip" | "retry"> => {
  const payload = asPayload(job);
  const linkId = typeof payload.linkId === "string" ? payload.linkId : null;
  if (!linkId) return "skip";

  const link = await prisma.googleDriveFolderLink.findUnique({ where: { id: linkId } });
  if (!link) return "skip"; // connection removed → cascade deleted
  // Superseded by a retry (or already settled): nothing to do.
  if (payload.jobEpoch !== link.jobEpoch) return "skip";
  if (link.status !== "PENDING") return "ok";
  if (
    payload.connectionId !== link.connectionId ||
    payload.userId !== link.createdByUserId ||
    payload.organizationId !== link.organizationId ||
    payload.googleAccountId !== link.googleAccountId
  ) {
    await finalizeLink(prisma, link.id, "folder_failed");
    return "ok";
  }

  const finalAttempt = job.attempts >= job.maxAttempts;
  try {
    return await runFolderJob(prisma, link, deps, finalAttempt);
  } catch (error) {
    if (!finalAttempt) throw error;
    await finalizeLink(prisma, link.id, "folder_failed");
    return "ok";
  }
};

const runFolderJob = async (
  prisma: PrismaClient,
  link: GoogleDriveFolderLink,
  deps: FolderDeps,
  finalAttempt: boolean,
): Promise<"ok" | "retry"> => {
  const gate = await checkStillAllowed(prisma, link);
  if (gate.error) {
    await finalizeLink(prisma, link.id, gate.error);
    return "ok";
  }
  const plan = gate.plan;

  const token = await getValidGoogleAccessToken(prisma, link.connectionId);
  if (!token.ok) {
    await markDriveNeedsReconnect(prisma, link.connectionId, token.errorSafe, true);
    await finalizeLink(prisma, link.id, "needs_reconnect");
    return "ok";
  }
  const accessToken = token.accessToken;

  const abortOrRetry = async (outcome: StepOutcome): Promise<"ok" | "retry"> => {
    if (outcome.kind === "retry") return "retry";
    const code =
      outcome.kind === "abort" || outcome.kind === "item_failed" || outcome.kind === "skipped"
        ? outcome.code
        : "folder_failed";
    await finalizeLink(prisma, link.id, code);
    return "ok";
  };

  // 1. Root folder (idempotent via ARC key, so a crash after creation cannot duplicate it).
  let rootId = link.folderId;
  if (!rootId) {
    const root = await getOrCreateChildFolder({
      accessToken,
      name: link.folderName,
      appKey: `${link.id}:root`,
    });
    if (!root.ok) {
      const outcome = await classifyDriveError(
        prisma,
        link.connectionId,
        root.error,
        finalAttempt,
        "folder_create_failed",
      );
      if (outcome.kind === "item_failed") {
        await finalizeLink(prisma, link.id, "folder_create_failed");
        return "ok";
      }
      return abortOrRetry(outcome);
    }
    rootId = root.value.id;
    await prisma.googleDriveFolderLink.update({
      where: { id: link.id },
      data: {
        folderId: rootId,
        folderUrl:
          root.value.webViewLink ?? `https://drive.google.com/drive/folders/${rootId}`,
      },
    });
  }

  // 2. Items in order (sub-folders → official PDFs → summary → vault docs → checklist).
  const items = await prisma.googleDriveFolderItem.findMany({
    where: { linkId: link.id },
    orderBy: { sortOrder: "asc" },
  });
  const sectionFolders = new Map<string, string>();
  for (const item of items) {
    if (item.kind === "SUBFOLDER" && item.status === "SUCCEEDED" && item.driveFileId && item.section) {
      sectionFolders.set(item.section, item.driveFileId);
    }
  }

  const settle = async (
    item: GoogleDriveFolderItem,
    status: "SUCCEEDED" | "FAILED" | "SKIPPED",
    extra: { driveFileId?: string; errorSafe?: string } = {},
  ) => {
    await prisma.googleDriveFolderItem.update({
      where: { id: item.id },
      data: {
        status,
        driveFileId: extra.driveFileId ?? item.driveFileId,
        errorSafe: extra.errorSafe ?? null,
      },
    });
  };

  /** Create-or-reuse a file (lookup by ARC key first → retries never duplicate). */
  const putFile = async (
    item: GoogleDriveFolderItem,
    parentId: string,
    content: { name: string; mimeType: string; bytes: Buffer },
  ): Promise<StepOutcome> => {
    const appKey = `${link.id}:${item.itemKey}`;
    const existing = await findItemByAppKey({ accessToken, appKey, parentId });
    if (!existing.ok) {
      return classifyDriveError(prisma, link.connectionId, existing.error, finalAttempt, "upload_failed");
    }
    if (existing.value) {
      await settle(item, "SUCCEEDED", { driveFileId: existing.value.id });
      return { kind: "done" };
    }
    const uploaded = await uploadFile({ accessToken, parentId, appKey, ...content });
    if (!uploaded.ok) {
      return classifyDriveError(prisma, link.connectionId, uploaded.error, finalAttempt, "upload_failed");
    }
    await settle(item, "SUCCEEDED", { driveFileId: uploaded.value.id });
    return { kind: "done" };
  };

  const handleOutcome = async (
    item: GoogleDriveFolderItem,
    outcome: StepOutcome,
  ): Promise<"continue" | "ok" | "retry"> => {
    switch (outcome.kind) {
      case "done":
        return "continue";
      case "item_failed":
        await settle(item, "FAILED", { errorSafe: outcome.code });
        return "continue";
      case "skipped":
        await settle(item, "SKIPPED", { errorSafe: outcome.code });
        return "continue";
      case "retry":
        return "retry";
      case "abort":
        await finalizeLink(prisma, link.id, outcome.code);
        return "ok";
    }
  };

  for (const item of items) {
    if (item.status !== "PENDING") continue;
    let outcome: StepOutcome;

    if (item.kind === "SUBFOLDER") {
      const folder = await getOrCreateChildFolder({
        accessToken,
        name: item.displayName,
        parentId: rootId,
      });
      if (!folder.ok) {
        outcome = await classifyDriveError(
          prisma,
          link.connectionId,
          folder.error,
          finalAttempt,
          "section_folder_failed",
        );
        if (outcome.kind === "item_failed") outcome = { kind: "item_failed", code: "section_folder_failed" };
      } else {
        if (item.section) sectionFolders.set(item.section, folder.value.id);
        await settle(item, "SUCCEEDED", { driveFileId: folder.value.id });
        outcome = { kind: "done" };
      }
    } else {
      const parentId = item.section ? sectionFolders.get(item.section) : rootId;
      if (!parentId) {
        outcome = { kind: "item_failed", code: "section_folder_failed" };
      } else if (item.kind === "OFFICIAL_PDF") {
        outcome = await processOfficialPdf({ item, parentId, deps, finalAttempt, putFile });
      } else if (item.kind === "SUMMARY") {
        outcome = await processSummary({ prisma, link, item, parentId, putFile });
      } else if (item.kind === "VAULT_DOCUMENT") {
        outcome = await processVaultDocument({
          prisma,
          link,
          item,
          parentId,
          allowed: plan.companyVault,
          finalAttempt,
          putFile,
        });
      } else if (item.kind === "CHECKLIST") {
        outcome = await processChecklist({
          prisma,
          link,
          item,
          parentId,
          allowed: plan.participationChecklist,
          deps,
          finalAttempt,
          putFile,
        });
      } else {
        outcome = { kind: "item_failed", code: "upload_failed" };
      }
    }

    const next = await handleOutcome(item, outcome);
    if (next === "retry") return "retry";
    if (next === "ok") return "ok";
  }

  await finalizeLink(prisma, link.id);
  return "ok";
};

type PutFile = (
  item: GoogleDriveFolderItem,
  parentId: string,
  content: { name: string; mimeType: string; bytes: Buffer },
) => Promise<StepOutcome>;

const processOfficialPdf = async (input: {
  item: GoogleDriveFolderItem;
  parentId: string;
  deps: FolderDeps;
  finalAttempt: boolean;
  putFile: PutFile;
}): Promise<StepOutcome> => {
  const { item, deps } = input;
  const [recordType, adam] = String(item.sourceRef ?? "").split(":");
  // Without a client or a valid ref we cannot fetch bytes — the summary will carry the link.
  if (!deps.kimdis || (recordType !== "REQ" && recordType !== "PROC") || !adam) {
    return { kind: "skipped", code: "link_only" };
  }
  let bytes: Buffer | null;
  try {
    bytes = await deps.kimdis.downloadAttachment(recordType, adam);
  } catch {
    return input.finalAttempt
      ? { kind: "item_failed", code: "official_download_failed" }
      : { kind: "retry" };
  }
  if (!bytes || !looksLikePdf(bytes) || bytes.byteLength > MAX_IMPORT_FILE_BYTES) {
    return { kind: "skipped", code: "link_only" };
  }
  return input.putFile(item, input.parentId, {
    name: item.displayName,
    mimeType: MIME_PDF,
    bytes,
  });
};

const processSummary = async (input: {
  prisma: PrismaClient;
  link: GoogleDriveFolderLink;
  item: GoogleDriveFolderItem;
  parentId: string;
  putFile: PutFile;
}): Promise<StepOutcome> => {
  const { prisma, link } = input;
  const options = readOptions(link);
  const tender = await prisma.tender.findUnique({ where: { id: link.tenderId } });
  if (!tender) return { kind: "item_failed", code: "upload_failed" };

  const officialItems = await prisma.googleDriveFolderItem.findMany({
    where: { linkId: link.id, kind: "OFFICIAL_PDF" },
  });
  // The summary must state the real outcome — wait for a failed PDF to be retried first.
  if (officialItems.some((i) => i.status === "FAILED" || i.status === "PENDING")) {
    return { kind: "item_failed", code: "dependency_failed" };
  }
  const officialCandidates = await loadOfficialCandidates(prisma, tender, true);
  const copiedByRef = new Map(
    officialItems
      .filter((i) => i.status === "SUCCEEDED")
      .map((i) => [i.sourceRef, i.displayName] as const),
  );
  const official: SummaryOfficialLine[] = officialCandidates.map((doc) => ({
    label: doc.label,
    url: doc.url,
    copiedAs: copiedByRef.get(`${doc.recordType}:${doc.adam}`) ?? null,
  }));

  const markdown = buildTenderSummaryMarkdown({
    tender,
    officialRequested: options.includeOfficialDocs,
    official,
    snapshotAt: link.createdAt,
  });
  return input.putFile(input.item, input.parentId, {
    name: input.item.displayName,
    mimeType: MIME_MARKDOWN,
    bytes: Buffer.from(markdown, "utf8"),
  });
};

const processVaultDocument = async (input: {
  prisma: PrismaClient;
  link: GoogleDriveFolderLink;
  item: GoogleDriveFolderItem;
  parentId: string;
  allowed: boolean;
  finalAttempt: boolean;
  putFile: PutFile;
}): Promise<StepOutcome> => {
  if (!input.allowed) return { kind: "skipped", code: "plan_locked" };
  const documentId = input.item.sourceRef;
  if (!documentId) return { kind: "item_failed", code: "vault_file_missing" };
  let download: Awaited<ReturnType<typeof getDocumentDownload>>;
  try {
    download = await getDocumentDownload(input.prisma, {
      userId: input.link.createdByUserId,
      organizationId: input.link.organizationId,
      documentId,
    });
  } catch (error) {
    if (error instanceof SaasError) {
      return { kind: "item_failed", code: "vault_file_missing" };
    }
    return input.finalAttempt
      ? { kind: "item_failed", code: "vault_read_failed" }
      : { kind: "retry" };
  }
  if (download.bytes.byteLength === 0) return { kind: "item_failed", code: "file_empty" };
  if (download.bytes.byteLength > MAX_IMPORT_FILE_BYTES) {
    return { kind: "item_failed", code: "file_too_large" };
  }
  return input.putFile(input.item, input.parentId, {
    name: input.item.displayName,
    mimeType: download.mimeType || "application/octet-stream",
    bytes: Buffer.from(download.bytes),
  });
};

const processChecklist = async (input: {
  prisma: PrismaClient;
  link: GoogleDriveFolderLink;
  item: GoogleDriveFolderItem;
  parentId: string;
  allowed: boolean;
  deps: FolderDeps;
  finalAttempt: boolean;
  putFile: PutFile;
}): Promise<StepOutcome> => {
  if (!input.allowed) return { kind: "skipped", code: "plan_locked" };
  const tender = await input.prisma.tender.findUnique({
    where: { id: input.link.tenderId },
    select: { referenceNumber: true, title: true },
  });
  if (!tender) return { kind: "item_failed", code: "checklist_failed" };
  let checklist: ParticipationChecklist;
  try {
    checklist = await loadParticipationChecklist(input.prisma, input.deps.kimdis, {
      organizationId: input.link.organizationId,
      tenderId: input.link.tenderId,
    });
  } catch {
    return input.finalAttempt
      ? { kind: "item_failed", code: "checklist_failed" }
      : { kind: "retry" };
  }
  // No supported analysis → do not invent an export.
  if (!checklist.readable) return { kind: "skipped", code: "checklist_unavailable" };
  return input.putFile(input.item, input.parentId, {
    name: input.item.displayName,
    mimeType: MIME_MARKDOWN,
    bytes: Buffer.from(buildChecklistMarkdown({ tender, checklist }), "utf8"),
  });
};
