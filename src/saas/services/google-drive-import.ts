import type { GoogleDriveImportRecord, PrismaClient, SaasJob } from "@prisma/client";
import { SaasError, badRequest, forbidden, notFound, serviceUnavailable, conflict } from "../errors.js";
import { enqueueSaasJob, SAAS_JOB_TYPES } from "../jobs/outbox.js";
import type { SaasJobHandler } from "../jobs/outbox.js";
import { entitlementsForPlanKey } from "../plans/catalog.js";
import { requireOrgMembership } from "../auth/org-context.js";
import { assertPlanFeature } from "./entitlements.js";
import { resolveOrganizationScanAccess } from "./scan-access.js";
import { uploadDocument } from "./vault.js";
import {
  assertGoogleEntitled,
  getValidGoogleAccessToken,
  requireVerifiedMember,
} from "./google-connection.js";
import {
  GOOGLE_DRIVE_IMPORT_COPY_HINT_EL,
  GOOGLE_SCOPE_DRIVE_FILE,
  getSaasGooglePickerConfig,
  hasGrantedScope,
  isSaasGoogleDriveEnabled,
  isSaasGooglePickerConfigured,
} from "./google-config.js";
import {
  downloadFileMedia,
  exportGoogleDocAsPdf,
  getFileMetadata,
  type GoogleDriveApiError,
  type GoogleDriveFileMetadata,
} from "./google-drive-api.js";

/** Max files per import request (also the per-batch concurrency cap). */
export const MAX_IMPORT_FILES_PER_BATCH = 10;
/** Same ceiling as the vault upload route. */
export const MAX_IMPORT_FILE_BYTES = 25 * 1024 * 1024;
/** A batch with PENDING rows older than this no longer blocks new imports. */
const ACTIVE_BATCH_STALE_MS = 15 * 60 * 1000;
const IMPORT_JOB_MAX_ATTEMPTS = 3;

const MIME_PDF = "application/pdf";
const MIME_DOCX =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const MIME_MSWORD = "application/msword";
const MIME_GOOGLE_DOC = "application/vnd.google-apps.document";
const MIME_GOOGLE_SHEET = "application/vnd.google-apps.spreadsheet";
const MIME_GOOGLE_SLIDES = "application/vnd.google-apps.presentation";
const MIME_GOOGLE_FOLDER = "application/vnd.google-apps.folder";

/** Greek copy for every safe error code stored on an import record. */
const IMPORT_ERROR_EL = {
  unsupported_type:
    "Ο τύπος αρχείου δεν υποστηρίζεται. Επιλέξτε PDF, DOCX ή Google Docs.",
  unsupported_legacy_doc:
    "Τα αρχεία .doc δεν υποστηρίζονται. Αποθηκεύστε το ως DOCX ή PDF και δοκιμάστε ξανά.",
  unsupported_spreadsheet:
    "Τα Google Sheets δεν υποστηρίζονται ακόμη. Εξαγάγετέ το ως PDF και δοκιμάστε ξανά.",
  unsupported_presentation:
    "Οι παρουσιάσεις Google Slides δεν υποστηρίζονται ακόμη. Εξαγάγετέ την ως PDF και δοκιμάστε ξανά.",
  unsupported_folder:
    "Οι φάκελοι δεν μπορούν να εισαχθούν. Επιλέξτε τα αρχεία μέσα από τον φάκελο.",
  file_too_large: "Το αρχείο ξεπερνά το όριο των 25 MB.",
  file_empty: "Το αρχείο είναι κενό.",
  export_too_large:
    "Το Google Docs είναι πολύ μεγάλο για εξαγωγή σε PDF.",
  export_failed: "Η εξαγωγή του Google Docs σε PDF δεν ολοκληρώθηκε.",
  download_failed:
    "Η λήψη του αρχείου από το Google Drive δεν ολοκληρώθηκε. Δοκιμάστε ξανά.",
  not_found:
    "Το αρχείο δεν βρέθηκε ή το ARC δεν έχει πρόσβαση σε αυτό. Επιλέξτε το ξανά από το Google Drive.",
  access_denied:
    "Το ARC δεν έχει δικαίωμα πρόσβασης στο αρχείο. Επιλέξτε το ξανά από το Google Drive.",
  quota_exceeded:
    "Δεν υπάρχει αρκετός αποθηκευτικός χώρος στο πακέτο σας.",
  needs_reconnect: "Χρειάζεται επανασύνδεση με το Google.",
  plan_locked:
    "Η εισαγωγή από Google Drive δεν είναι διαθέσιμη για το τρέχον πακέτο.",
  folder_not_found: "Ο φάκελος προορισμού δεν βρέθηκε.",
  connection_stopped: "Η σύνδεση με το Google Drive διακόπηκε.",
  import_failed: "Η εισαγωγή δεν ολοκληρώθηκε. Δοκιμάστε ξανά.",
} as const;

export type GoogleDriveImportErrorCode = keyof typeof IMPORT_ERROR_EL;

export const driveImportErrorEl = (code: string | null | undefined): string | null => {
  if (!code) return null;
  return (
    IMPORT_ERROR_EL[code as GoogleDriveImportErrorCode] ??
    IMPORT_ERROR_EL.import_failed
  );
};

const MIME_LABEL_EL: Record<string, string> = {
  [MIME_PDF]: "PDF",
  [MIME_DOCX]: "DOCX",
  [MIME_MSWORD]: "DOC",
  [MIME_GOOGLE_DOC]: "Google Docs",
  [MIME_GOOGLE_SHEET]: "Google Sheets",
  [MIME_GOOGLE_SLIDES]: "Google Slides",
  [MIME_GOOGLE_FOLDER]: "Φάκελος",
};

export const EXPORT_AS_PDF_EL = "Θα εξαχθεί ως PDF";

const mimeLabelEl = (mimeType: string): string =>
  MIME_LABEL_EL[mimeType] ?? "Άλλος τύπος";

// ---------------------------------------------------------------------------
// Import plan (pure — no I/O)
// ---------------------------------------------------------------------------

export type ImportPlan =
  | {
      ok: true;
      targetFilename: string;
      targetMime: string;
      needsExport: boolean;
      exportMimeType: string | null;
      formatLabelEl: string;
    }
  | {
      ok: false;
      code: GoogleDriveImportErrorCode;
      reasonEl: string;
    };

export const sanitizeFilename = (name: string): string =>
  name
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);

const withExtension = (name: string, ext: ".pdf" | ".docx"): string => {
  const clean = sanitizeFilename(name) || "έγγραφο";
  return clean.toLowerCase().endsWith(ext)
    ? `${clean.slice(0, -ext.length)}${ext}`
    : `${clean}${ext}`;
};

const unsupported = (code: GoogleDriveImportErrorCode): ImportPlan => ({
  ok: false,
  code,
  reasonEl: IMPORT_ERROR_EL[code],
});

/**
 * Decide how a Drive file can be copied into the vault.
 * PDF / DOCX copy as-is; Google Docs are exported as PDF; everything else is unsupported.
 */
export const resolveImportPlan = (file: {
  name: string;
  mimeType: string;
  sizeBytes: number | null;
}): ImportPlan => {
  const lowerName = file.name.toLowerCase();
  let kind: "pdf" | "docx" | "gdoc" | null = null;

  switch (file.mimeType) {
    case MIME_PDF:
      kind = "pdf";
      break;
    case MIME_DOCX:
      kind = "docx";
      break;
    case MIME_GOOGLE_DOC:
      kind = "gdoc";
      break;
    case MIME_MSWORD:
      return unsupported("unsupported_legacy_doc");
    case MIME_GOOGLE_SHEET:
      return unsupported("unsupported_spreadsheet");
    case MIME_GOOGLE_SLIDES:
      return unsupported("unsupported_presentation");
    case MIME_GOOGLE_FOLDER:
      return unsupported("unsupported_folder");
    default:
      // Drive sometimes labels uploads as octet-stream; trust only the extension.
      if (file.mimeType === "application/octet-stream") {
        if (lowerName.endsWith(".pdf")) kind = "pdf";
        else if (lowerName.endsWith(".docx")) kind = "docx";
      }
  }
  if (!kind) return unsupported("unsupported_type");

  if (kind !== "gdoc") {
    if (file.sizeBytes !== null && file.sizeBytes > MAX_IMPORT_FILE_BYTES) {
      return unsupported("file_too_large");
    }
    if (file.sizeBytes === 0) return unsupported("file_empty");
  }

  if (kind === "gdoc") {
    return {
      ok: true,
      targetFilename: withExtension(file.name, ".pdf"),
      targetMime: MIME_PDF,
      needsExport: true,
      exportMimeType: MIME_PDF,
      formatLabelEl: EXPORT_AS_PDF_EL,
    };
  }
  return {
    ok: true,
    targetFilename: withExtension(file.name, kind === "pdf" ? ".pdf" : ".docx"),
    targetMime: kind === "pdf" ? MIME_PDF : MIME_DOCX,
    needsExport: false,
    exportMimeType: null,
    formatLabelEl: kind === "pdf" ? "PDF" : "DOCX",
  };
};

const stripExtension = (filename: string): string =>
  filename.replace(/\.(pdf|docx)$/i, "") || filename;

// ---------------------------------------------------------------------------
// Access / entitlement guard
// ---------------------------------------------------------------------------

export type ImportContext = {
  userId: string;
  organizationId: string;
  connectionId: string;
};

export const markDriveNeedsReconnect = async (
  prisma: PrismaClient,
  connectionId: string,
  errorSafe: string,
  tokenInvalid: boolean,
) => {
  await prisma.userOrganizationGoogleConnection.updateMany({
    where: { id: connectionId },
    data: {
      driveStatus: "NEEDS_RECONNECT",
      driveLastErrorAt: new Date(),
      driveLastErrorSafe: errorSafe.slice(0, 120),
      ...(tokenInvalid ? { tokenStatus: "NEEDS_RECONNECT" as const } : {}),
    },
  });
};

/**
 * Enforces: flag + OAuth config, membership, verified email, active plan with
 * googleDrive AND companyVault, an ACTIVE Drive connection holding the per-file Drive scope.
 */
export const requireDriveImportContext = async (
  prisma: PrismaClient,
  input: { userId: string; organizationId: string | null },
  options?: { requirePicker?: boolean; requireVault?: boolean },
): Promise<ImportContext> => {
  if (!isSaasGoogleDriveEnabled()) {
    throw serviceUnavailable("google_drive_disabled");
  }
  if (options?.requirePicker && !isSaasGooglePickerConfigured()) {
    throw serviceUnavailable("google_picker_not_configured");
  }
  const ctx = await requireVerifiedMember(prisma, input);
  const scope = { userId: ctx.userId, organizationId: ctx.organizationId };
  await assertGoogleEntitled(prisma, scope, "drive");
  if (options?.requireVault !== false) {
    await assertPlanFeature(prisma, scope, "companyVault");
  }

  const row = await prisma.userOrganizationGoogleConnection.findUnique({
    where: {
      organizationId_userId: {
        organizationId: ctx.organizationId,
        userId: ctx.userId,
      },
    },
  });
  if (!row || row.driveStatus === "DISABLED") {
    throw notFound("google_drive_not_connected");
  }
  if (row.tokenStatus === "NEEDS_RECONNECT" || row.driveStatus === "NEEDS_RECONNECT") {
    throw badRequest("google_needs_reconnect");
  }
  if (!hasGrantedScope(row.grantedScopes, GOOGLE_SCOPE_DRIVE_FILE)) {
    await markDriveNeedsReconnect(prisma, row.id, "missing_drive_scope", false);
    throw forbidden("google_drive_scope_missing");
  }
  return { ...scope, connectionId: row.id };
};

export const requireAccessToken = async (
  prisma: PrismaClient,
  connectionId: string,
): Promise<string> => {
  const token = await getValidGoogleAccessToken(prisma, connectionId);
  if (!token.ok) {
    await markDriveNeedsReconnect(prisma, connectionId, token.errorSafe, true);
    throw badRequest("google_needs_reconnect");
  }
  return token.accessToken;
};

// ---------------------------------------------------------------------------
// Picker token (short-lived, client keeps it in memory only)
// ---------------------------------------------------------------------------

export type PickerAccessTokenResult = {
  /** Google OAuth access token — for the browser Picker only. Never persist client-side. */
  accessToken: string;
  /** Seconds until the token expires. */
  expiresIn: number;
  pickerApiKey: string;
  appId: string;
};

export const mintPickerAccessToken = async (
  prisma: PrismaClient,
  input: { userId: string; organizationId: string | null },
): Promise<PickerAccessTokenResult> => {
  const ctx = await requireDriveImportContext(prisma, input, {
    requirePicker: true,
  });
  const picker = getSaasGooglePickerConfig();
  if (!picker) throw serviceUnavailable("google_picker_not_configured");
  const accessToken = await requireAccessToken(prisma, ctx.connectionId);
  const row = await prisma.userOrganizationGoogleConnection.findUniqueOrThrow({
    where: { id: ctx.connectionId },
    select: { accessTokenExpiresAt: true },
  });
  const remainingSeconds = row.accessTokenExpiresAt
    ? Math.floor((row.accessTokenExpiresAt.getTime() - Date.now()) / 1000)
    : 3000;
  return {
    accessToken,
    expiresIn: Math.max(60, Math.min(3600, remainingSeconds)),
    pickerApiKey: picker.apiKey,
    appId: picker.appId,
  };
};

// ---------------------------------------------------------------------------
// Inspect (shared by preview + import)
// ---------------------------------------------------------------------------

type InspectedFile =
  | { ok: true; meta: GoogleDriveFileMetadata; plan: Extract<ImportPlan, { ok: true }> }
  | {
      ok: false;
      meta: GoogleDriveFileMetadata | null;
      code: GoogleDriveImportErrorCode;
      reasonEl: string;
    };

const codeForApiError = (error: GoogleDriveApiError): GoogleDriveImportErrorCode => {
  switch (error.kind) {
    case "auth":
    case "scope":
      return "needs_reconnect";
    case "not_found":
      return "not_found";
    case "forbidden":
      return "access_denied";
    case "too_large":
      return "export_too_large";
    default:
      return "download_failed";
  }
};

const inspectFile = async (
  prisma: PrismaClient,
  input: { connectionId: string; accessToken: string; fileId: string },
): Promise<InspectedFile> => {
  const result = await getFileMetadata({
    accessToken: input.accessToken,
    fileId: input.fileId,
  });
  if (!result.ok) {
    if (result.error.kind === "auth" || result.error.kind === "scope") {
      await markDriveNeedsReconnect(
        prisma,
        input.connectionId,
        result.error.messageSafe,
        result.error.kind === "auth",
      );
      throw badRequest("google_needs_reconnect");
    }
    const code = codeForApiError(result.error);
    return { ok: false, meta: null, code, reasonEl: IMPORT_ERROR_EL[code] };
  }
  const meta = result.file;
  if (meta.trashed) {
    return { ok: false, meta, code: "not_found", reasonEl: IMPORT_ERROR_EL.not_found };
  }
  const plan = resolveImportPlan({
    name: meta.name,
    mimeType: meta.mimeType,
    sizeBytes: meta.sizeBytes,
  });
  if (!plan.ok) {
    return { ok: false, meta, code: plan.code, reasonEl: plan.reasonEl };
  }
  return { ok: true, meta, plan };
};

const uniqueIds = (ids: string[]): string[] => [...new Set(ids)];

const assertBatchSize = (count: number) => {
  if (count === 0) throw badRequest("google_drive_files_required");
  if (count > MAX_IMPORT_FILES_PER_BATCH) {
    throw badRequest("google_drive_too_many_files");
  }
};

// ---------------------------------------------------------------------------
// Preview
// ---------------------------------------------------------------------------

export type GoogleDriveFilePreview = {
  id: string;
  name: string;
  mimeType: string;
  mimeLabelEl: string;
  sizeBytes: number | null;
  supported: boolean;
  targetFilename: string | null;
  needsExport: boolean;
  /** «Θα εξαχθεί ως PDF» for Google Docs; plain format label otherwise. */
  formatLabelEl: string | null;
  errorCode: GoogleDriveImportErrorCode | null;
  reasonEl: string | null;
};

export const previewGoogleDriveFiles = async (
  prisma: PrismaClient,
  input: {
    userId: string;
    organizationId: string | null;
    files: Array<{ id: string; name?: string; mimeType?: string; sizeBytes?: number }>;
  },
): Promise<{ files: GoogleDriveFilePreview[]; copyHintEl: string }> => {
  const hints = new Map(input.files.map((f) => [f.id, f]));
  const ids = uniqueIds(input.files.map((f) => f.id));
  assertBatchSize(ids.length);
  const ctx = await requireDriveImportContext(prisma, input);
  const accessToken = await requireAccessToken(prisma, ctx.connectionId);

  const previews: GoogleDriveFilePreview[] = [];
  for (const id of ids) {
    const inspected = await inspectFile(prisma, {
      connectionId: ctx.connectionId,
      accessToken,
      fileId: id,
    });
    const hint = hints.get(id);
    if (inspected.ok) {
      previews.push({
        id,
        name: inspected.meta.name,
        mimeType: inspected.meta.mimeType,
        mimeLabelEl: mimeLabelEl(inspected.meta.mimeType),
        sizeBytes: inspected.meta.sizeBytes,
        supported: true,
        targetFilename: inspected.plan.targetFilename,
        needsExport: inspected.plan.needsExport,
        formatLabelEl: inspected.plan.formatLabelEl,
        errorCode: null,
        reasonEl: null,
      });
      continue;
    }
    previews.push({
      id,
      name: inspected.meta?.name ?? hint?.name ?? id,
      mimeType: inspected.meta?.mimeType ?? hint?.mimeType ?? "",
      mimeLabelEl: mimeLabelEl(inspected.meta?.mimeType ?? hint?.mimeType ?? ""),
      sizeBytes: inspected.meta?.sizeBytes ?? hint?.sizeBytes ?? null,
      supported: false,
      targetFilename: null,
      needsExport: false,
      formatLabelEl: null,
      errorCode: inspected.code,
      reasonEl: inspected.reasonEl,
    });
  }
  return {
    files: previews,
    copyHintEl: GOOGLE_DRIVE_IMPORT_COPY_HINT_EL,
  };
};

// ---------------------------------------------------------------------------
// Import records (public view)
// ---------------------------------------------------------------------------

export type GoogleDriveImportRecordView = {
  id: string;
  googleFileId: string;
  googleFileName: string;
  googleMimeType: string;
  status: "PENDING" | "SUCCEEDED" | "FAILED";
  errorCode: string | null;
  errorEl: string | null;
  vaultDocumentId: string | null;
  importedAt: string | null;
};

const toRecordView = (r: GoogleDriveImportRecord): GoogleDriveImportRecordView => ({
  id: r.id,
  googleFileId: r.googleFileId,
  googleFileName: r.googleFileName,
  googleMimeType: r.googleMimeType,
  status: r.status,
  errorCode: r.errorSafe,
  errorEl: driveImportErrorEl(r.errorSafe),
  vaultDocumentId: r.vaultDocumentId,
  importedAt: r.importedAt?.toISOString() ?? null,
});

export type GoogleDriveImportBatchResult = {
  records: GoogleDriveImportRecordView[];
  /** True while at least one record is still PENDING. */
  active: boolean;
};

const batchResult = (rows: GoogleDriveImportRecord[]): GoogleDriveImportBatchResult => ({
  records: rows.map(toRecordView),
  active: rows.some((r) => r.status === "PENDING"),
});

// ---------------------------------------------------------------------------
// Start import (enqueue jobs — payload carries IDs only)
// ---------------------------------------------------------------------------

export const startGoogleDriveImport = async (
  prisma: PrismaClient,
  input: {
    userId: string;
    organizationId: string | null;
    folderId: string;
    files: Array<{ googleFileId: string; name?: string }>;
  },
): Promise<GoogleDriveImportBatchResult> => {
  const ids = uniqueIds(input.files.map((f) => f.googleFileId));
  assertBatchSize(ids.length);
  const ctx = await requireDriveImportContext(prisma, input);

  const folder = await prisma.vaultFolder.findFirst({
    where: { id: input.folderId, organizationId: ctx.organizationId },
    select: { id: true },
  });
  if (!folder) throw notFound("vault_folder_not_found");

  const accessToken = await requireAccessToken(prisma, ctx.connectionId);
  const nameHints = new Map(input.files.map((f) => [f.googleFileId, f.name]));
  const inspected: Array<{ id: string; result: InspectedFile }> = [];
  for (const id of ids) {
    inspected.push({
      id,
      result: await inspectFile(prisma, {
        connectionId: ctx.connectionId,
        accessToken,
        fileId: id,
      }),
    });
  }

  const created = await prisma.$transaction(async (tx) => {
    // Serialise concurrent starts for the same connection (one active batch).
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${ctx.connectionId}))`;
    const active = await tx.googleDriveImportRecord.count({
      where: {
        connectionId: ctx.connectionId,
        status: "PENDING",
        createdAt: { gt: new Date(Date.now() - ACTIVE_BATCH_STALE_MS) },
      },
    });
    if (active > 0) throw conflict("google_drive_import_in_progress");

    const rows: GoogleDriveImportRecord[] = [];
    for (const { id, result } of inspected) {
      const meta = result.meta;
      rows.push(
        await tx.googleDriveImportRecord.create({
          data: {
            connectionId: ctx.connectionId,
            organizationId: ctx.organizationId,
            userId: ctx.userId,
            googleFileId: id,
            googleFileName: (meta?.name ?? nameHints.get(id) ?? id).slice(0, 255),
            googleMimeType: meta?.mimeType ?? "unknown",
            googleModifiedTime: meta?.modifiedTime ? new Date(meta.modifiedTime) : null,
            googleMd5Checksum: meta?.md5Checksum ?? null,
            googleVersion: meta?.version ?? null,
            exportMimeType: result.ok ? result.plan.exportMimeType : null,
            targetFolderId: folder.id,
            status: result.ok ? "PENDING" : "FAILED",
            errorSafe: result.ok ? null : result.code,
          },
        }),
      );
    }
    return rows;
  });

  for (const row of created) {
    if (row.status !== "PENDING") continue;
    await enqueueSaasJob(prisma, {
      type: SAAS_JOB_TYPES.googleDriveImport,
      deliveryKey: `GDRIVE_IMPORT:${row.id}`,
      organizationId: ctx.organizationId,
      // IDs only — never tokens, file names or contents.
      payload: {
        importRecordId: row.id,
        connectionId: ctx.connectionId,
        userId: ctx.userId,
        organizationId: ctx.organizationId,
      },
      priority: 60,
      maxAttempts: IMPORT_JOB_MAX_ATTEMPTS,
    });
  }
  return batchResult(created);
};

export const getGoogleDriveImportStatus = async (
  prisma: PrismaClient,
  input: { userId: string; organizationId: string | null; recordIds: string[] },
): Promise<GoogleDriveImportBatchResult> => {
  const ctx = await requireOrgMembership(
    prisma,
    input.userId,
    input.organizationId,
  );
  const ids = uniqueIds(input.recordIds).slice(0, MAX_IMPORT_FILES_PER_BATCH);
  if (ids.length === 0) return { records: [], active: false };
  const rows = await prisma.googleDriveImportRecord.findMany({
    where: {
      id: { in: ids },
      organizationId: ctx.organizationId,
      userId: ctx.userId,
    },
    orderBy: { createdAt: "asc" },
  });
  return batchResult(rows);
};

// ---------------------------------------------------------------------------
// Job processor
// ---------------------------------------------------------------------------

const asPayload = (job: SaasJob): Record<string, unknown> =>
  job.payload && typeof job.payload === "object"
    ? (job.payload as Record<string, unknown>)
    : {};

const failRecord = async (
  prisma: PrismaClient,
  record: GoogleDriveImportRecord,
  code: GoogleDriveImportErrorCode,
) => {
  await prisma.googleDriveImportRecord.update({
    where: { id: record.id },
    data: { status: "FAILED", errorSafe: code },
  });
  await prisma.userOrganizationGoogleConnection.updateMany({
    where: { id: record.connectionId },
    data: { driveLastErrorAt: new Date(), driveLastErrorSafe: code },
  });
  return "ok" as const;
};

const stillAllowed = async (
  prisma: PrismaClient,
  record: GoogleDriveImportRecord,
): Promise<GoogleDriveImportErrorCode | null> => {
  if (!isSaasGoogleDriveEnabled()) return "plan_locked";
  const member = await prisma.organizationMember.findUnique({
    where: {
      organizationId_userId: {
        organizationId: record.organizationId,
        userId: record.userId,
      },
    },
  });
  if (!member) return "plan_locked";
  const scan = await resolveOrganizationScanAccess(prisma, {
    userId: record.userId,
    organizationId: record.organizationId,
  });
  if (scan.status !== "active" && scan.status !== "trial") return "plan_locked";
  const plan = entitlementsForPlanKey(scan.planKey);
  if (!plan.googleDrive || !plan.companyVault) return "plan_locked";

  const connection = await prisma.userOrganizationGoogleConnection.findUnique({
    where: { id: record.connectionId },
  });
  if (!connection || connection.driveStatus === "DISABLED") {
    return "connection_stopped";
  }
  if (
    connection.tokenStatus === "NEEDS_RECONNECT" ||
    connection.driveStatus === "NEEDS_RECONNECT" ||
    !hasGrantedScope(connection.grantedScopes, GOOGLE_SCOPE_DRIVE_FILE)
  ) {
    return "needs_reconnect";
  }
  return null;
};

const uploadErrorCode = (error: unknown): GoogleDriveImportErrorCode | null => {
  if (!(error instanceof SaasError)) return null;
  switch (error.message) {
    case "vault_storage_limit_reached":
      return "quota_exceeded";
    case "vault_folder_not_found":
      return "folder_not_found";
    case "vault_file_too_large":
      return "file_too_large";
    case "vault_empty_file":
      return "file_empty";
    case "vault_unsupported_file_type":
      return "unsupported_type";
    default:
      return "import_failed";
  }
};

export const processGoogleDriveImportJob: SaasJobHandler = async (prisma, job) => {
  const payload = asPayload(job);
  const recordId =
    typeof payload.importRecordId === "string" ? payload.importRecordId : null;
  if (!recordId) return "skip";

  const record = await prisma.googleDriveImportRecord.findUnique({
    where: { id: recordId },
  });
  if (!record) return "skip";
  if (record.status !== "PENDING") return "ok";
  if (
    payload.connectionId !== record.connectionId ||
    payload.userId !== record.userId ||
    payload.organizationId !== record.organizationId
  ) {
    return failRecord(prisma, record, "import_failed");
  }

  const blocked = await stillAllowed(prisma, record);
  if (blocked) return failRecord(prisma, record, blocked);

  const finalAttempt = job.attempts >= job.maxAttempts;
  const retryOrFail = (code: GoogleDriveImportErrorCode) =>
    finalAttempt ? failRecord(prisma, record, code) : ("retry" as const);

  const token = await getValidGoogleAccessToken(prisma, record.connectionId);
  if (!token.ok) {
    await markDriveNeedsReconnect(prisma, record.connectionId, token.errorSafe, true);
    return failRecord(prisma, record, "needs_reconnect");
  }

  const handleApiError = async (error: GoogleDriveApiError, fallback: GoogleDriveImportErrorCode) => {
    if (error.kind === "auth" || error.kind === "scope") {
      await markDriveNeedsReconnect(
        prisma,
        record.connectionId,
        error.messageSafe,
        error.kind === "auth",
      );
      return failRecord(prisma, record, "needs_reconnect");
    }
    if (!error.permanent) return retryOrFail(fallback);
    const code = error.kind === "other" ? fallback : codeForApiError(error);
    return failRecord(prisma, record, code);
  };

  // Re-read metadata: the file may have changed or lost access since the preview.
  const metaResult = await getFileMetadata({
    accessToken: token.accessToken,
    fileId: record.googleFileId,
  });
  if (!metaResult.ok) return handleApiError(metaResult.error, "download_failed");
  const meta = metaResult.file;
  if (meta.trashed) return failRecord(prisma, record, "not_found");

  const plan = resolveImportPlan({
    name: meta.name,
    mimeType: meta.mimeType,
    sizeBytes: meta.sizeBytes,
  });
  if (!plan.ok) return failRecord(prisma, record, plan.code);

  const fetched = plan.needsExport
    ? await exportGoogleDocAsPdf({
        accessToken: token.accessToken,
        fileId: record.googleFileId,
      })
    : await downloadFileMedia({
        accessToken: token.accessToken,
        fileId: record.googleFileId,
      });
  if (!fetched.ok) {
    return handleApiError(
      fetched.error,
      plan.needsExport ? "export_failed" : "download_failed",
    );
  }
  const bytes = fetched.bytes;
  // Re-check after download/export: Google-native files have no size up front.
  if (bytes.byteLength === 0) return failRecord(prisma, record, "file_empty");
  if (bytes.byteLength > MAX_IMPORT_FILE_BYTES) {
    return failRecord(prisma, record, "file_too_large");
  }

  const importedAt = new Date();
  let documentId: string;
  try {
    const { document } = await uploadDocument(prisma, {
      userId: record.userId,
      organizationId: record.organizationId,
      folderId: record.targetFolderId,
      name: stripExtension(plan.targetFilename),
      originalFilename: plan.targetFilename,
      bytes,
      declaredMimeType: plan.targetMime,
      notes: `Εισήχθη από Google Drive στις ${importedAt.toLocaleDateString("el-GR")}.`,
      source: "IMPORTED",
    });
    documentId = document.id;
  } catch (error) {
    const code = uploadErrorCode(error);
    if (code) return failRecord(prisma, record, code);
    // Unexpected infrastructure error (DB / storage): retry, then give up safely.
    return retryOrFail("import_failed");
  }

  await prisma.googleDriveImportRecord.update({
    where: { id: record.id },
    data: {
      status: "SUCCEEDED",
      vaultDocumentId: documentId,
      importedAt,
      errorSafe: null,
      googleFileName: meta.name.slice(0, 255),
      googleMimeType: meta.mimeType,
      googleModifiedTime: meta.modifiedTime ? new Date(meta.modifiedTime) : null,
      googleMd5Checksum: meta.md5Checksum,
      googleVersion: meta.version,
      exportMimeType: plan.exportMimeType,
    },
  });
  await prisma.userOrganizationGoogleConnection.updateMany({
    where: { id: record.connectionId },
    data: {
      driveLastSuccessAt: importedAt,
      driveLastErrorSafe: null,
      driveLastErrorAt: null,
    },
  });
  return "ok";
};
