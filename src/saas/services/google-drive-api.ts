import { GOOGLE_DRIVE_API, GOOGLE_DRIVE_UPLOAD_API } from "./google-config.js";

/**
 * Minimal Google Drive v3 client (per-file Drive scope).
 * Never logs or returns access tokens, response bodies, or file contents in errors.
 */

export type GoogleDriveErrorKind =
  | "auth" // 401 / revoked token → needs reconnect
  | "scope" // insufficient permissions for the OAuth grant
  | "not_found" // missing, or not shared with ARC via Picker
  | "forbidden" // file-level denial (not downloadable, no access)
  | "too_large" // Google export limit
  | "rate_limited" // transient quota
  | "transient" // 5xx / network
  | "other";

export type GoogleDriveApiError = {
  status: number;
  code?: string;
  messageSafe: string;
  /** Permanent errors must not be retried. */
  permanent: boolean;
  kind: GoogleDriveErrorKind;
};

export type GoogleDriveFileMetadata = {
  id: string;
  name: string;
  mimeType: string;
  /** Bytes — absent for Google-native files (Docs, Sheets). */
  sizeBytes: number | null;
  modifiedTime: string | null;
  md5Checksum: string | null;
  version: string | null;
  trashed: boolean;
};

const FILE_FIELDS = "id,name,mimeType,size,modifiedTime,md5Checksum,version,trashed";

const classifyError = (status: number, body: string): GoogleDriveApiError => {
  let reason = "";
  try {
    const json = JSON.parse(body) as {
      error?: { status?: string; errors?: Array<{ reason?: string }> };
    };
    reason = json.error?.errors?.[0]?.reason || json.error?.status || "";
  } catch {
    // ignore non-JSON bodies
  }
  const code = String(reason || `http_${status}`).slice(0, 80);
  const messageSafe = `google_drive_${code}`.slice(0, 120);

  let kind: GoogleDriveErrorKind = "other";
  if (status === 401 || /invalid_grant|invalid_credentials/i.test(body)) {
    kind = "auth";
  } else if (reason === "insufficientPermissions" || reason === "insufficientScopes") {
    kind = "scope";
  } else if (
    status === 429 ||
    reason === "rateLimitExceeded" ||
    reason === "userRateLimitExceeded" ||
    reason === "backendError"
  ) {
    kind = "rate_limited";
  } else if (status >= 500) {
    kind = "transient";
  } else if (reason === "exportSizeLimitExceeded") {
    kind = "too_large";
  } else if (status === 404) {
    kind = "not_found";
  } else if (status === 403) {
    kind = "forbidden";
  }
  const permanent = kind !== "rate_limited" && kind !== "transient";
  return { status, code, messageSafe, permanent, kind };
};

const networkError = (): GoogleDriveApiError => ({
  status: 0,
  code: "network_error",
  messageSafe: "google_drive_network_error",
  permanent: false,
  kind: "transient",
});

const driveRequest = async (
  accessToken: string,
  path: string,
  init?: RequestInit,
): Promise<{ ok: true; res: Response } | { ok: false; error: GoogleDriveApiError }> => {
  try {
    // Absolute URLs (upload endpoints, resumable session URIs) pass through as-is.
    const url = path.startsWith("https://") ? path : `${GOOGLE_DRIVE_API}${path}`;
    const res = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(init?.headers ?? {}),
      },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: classifyError(res.status, text) };
    }
    return { ok: true, res };
  } catch {
    return { ok: false, error: networkError() };
  }
};

export const getFileMetadata = async (input: {
  accessToken: string;
  fileId: string;
}): Promise<
  { ok: true; file: GoogleDriveFileMetadata } | { ok: false; error: GoogleDriveApiError }
> => {
  const result = await driveRequest(
    input.accessToken,
    `/files/${encodeURIComponent(input.fileId)}?fields=${encodeURIComponent(FILE_FIELDS)}&supportsAllDrives=true`,
  );
  if (!result.ok) return result;
  let json: {
    id?: string;
    name?: string;
    mimeType?: string;
    size?: string;
    modifiedTime?: string;
    md5Checksum?: string;
    version?: string;
    trashed?: boolean;
  };
  try {
    json = (await result.res.json()) as typeof json;
  } catch {
    return {
      ok: false,
      error: {
        status: 502,
        code: "invalid_metadata",
        messageSafe: "google_drive_invalid_metadata",
        permanent: false,
        kind: "transient",
      },
    };
  }
  if (!json.id || !json.mimeType) {
    return {
      ok: false,
      error: {
        status: 404,
        code: "notFound",
        messageSafe: "google_drive_not_found",
        permanent: true,
        kind: "not_found",
      },
    };
  }
  const size = json.size !== undefined ? Number(json.size) : NaN;
  return {
    ok: true,
    file: {
      id: json.id,
      name: json.name ?? json.id,
      mimeType: json.mimeType,
      sizeBytes: Number.isFinite(size) ? size : null,
      modifiedTime: json.modifiedTime ?? null,
      md5Checksum: json.md5Checksum ?? null,
      version: json.version ?? null,
      trashed: Boolean(json.trashed),
    },
  };
};

const readBytes = async (
  result: { ok: true; res: Response } | { ok: false; error: GoogleDriveApiError },
): Promise<{ ok: true; bytes: Buffer } | { ok: false; error: GoogleDriveApiError }> => {
  if (!result.ok) return result;
  try {
    return { ok: true, bytes: Buffer.from(await result.res.arrayBuffer()) };
  } catch {
    return { ok: false, error: networkError() };
  }
};

/** Download a binary (non-Google-native) file. */
export const downloadFileMedia = async (input: {
  accessToken: string;
  fileId: string;
}) =>
  readBytes(
    await driveRequest(
      input.accessToken,
      `/files/${encodeURIComponent(input.fileId)}?alt=media&supportsAllDrives=true`,
    ),
  );

/** Export a Google Doc as PDF (Drive export limit ≈ 10 MB). */
export const exportGoogleDocAsPdf = async (input: {
  accessToken: string;
  fileId: string;
}) =>
  readBytes(
    await driveRequest(
      input.accessToken,
      `/files/${encodeURIComponent(input.fileId)}/export?mimeType=${encodeURIComponent("application/pdf")}`,
    ),
  );

// ---------------------------------------------------------------------------
// Folder + upload helpers (Phase 3 — files created by ARC under drive.file)
// ---------------------------------------------------------------------------

export const GOOGLE_DRIVE_FOLDER_MIME = "application/vnd.google-apps.folder";
/** Above this size multipart is unreliable — use a resumable upload session. */
export const MULTIPART_MAX_BYTES = 5 * 1024 * 1024;
/** appProperties key ARC stamps on every folder/file it creates (idempotency lookup). */
export const ARC_APP_KEY_PROPERTY = "arcKey";

const CREATED_FIELDS = "id,name,mimeType,webViewLink,trashed";

export type GoogleDriveCreatedItem = {
  id: string;
  name: string;
  mimeType: string;
  webViewLink: string | null;
};

type ApiResult<T> = Promise<
  { ok: true; value: T } | { ok: false; error: GoogleDriveApiError }
>;

const escapeQueryValue = (value: string): string =>
  value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

const invalidResponse = (): GoogleDriveApiError => ({
  status: 502,
  code: "invalid_response",
  messageSafe: "google_drive_invalid_response",
  permanent: false,
  kind: "transient",
});

const parseCreated = async (
  result: { ok: true; res: Response } | { ok: false; error: GoogleDriveApiError },
): ApiResult<GoogleDriveCreatedItem> => {
  if (!result.ok) return result;
  try {
    const json = (await result.res.json()) as {
      id?: string;
      name?: string;
      mimeType?: string;
      webViewLink?: string;
    };
    if (!json.id) return { ok: false, error: invalidResponse() };
    return {
      ok: true,
      value: {
        id: json.id,
        name: json.name ?? "",
        mimeType: json.mimeType ?? "",
        webViewLink: json.webViewLink ?? null,
      },
    };
  } catch {
    return { ok: false, error: invalidResponse() };
  }
};

const jsonHeaders = { "Content-Type": "application/json; charset=UTF-8" };

/** Create a folder. `parentId` omitted → My Drive root. */
export const createFolder = async (input: {
  accessToken: string;
  name: string;
  parentId?: string;
  appKey?: string;
}): ApiResult<GoogleDriveCreatedItem> =>
  parseCreated(
    await driveRequest(
      input.accessToken,
      `/files?fields=${encodeURIComponent(CREATED_FIELDS)}&supportsAllDrives=true`,
      {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({
          name: input.name,
          mimeType: GOOGLE_DRIVE_FOLDER_MIME,
          ...(input.parentId ? { parents: [input.parentId] } : {}),
          ...(input.appKey
            ? { appProperties: { [ARC_APP_KEY_PROPERTY]: input.appKey } }
            : {}),
        }),
      },
    ),
  );

/** Find a non-trashed item ARC created, by its idempotency key (and optional parent). */
export const findItemByAppKey = async (input: {
  accessToken: string;
  appKey: string;
  parentId?: string;
}): ApiResult<GoogleDriveCreatedItem | null> => {
  const clauses = [
    `appProperties has { key='${ARC_APP_KEY_PROPERTY}' and value='${escapeQueryValue(input.appKey)}' }`,
    "trashed=false",
    ...(input.parentId ? [`'${escapeQueryValue(input.parentId)}' in parents`] : []),
  ];
  const listed = await driveRequest(
    input.accessToken,
    `/files?q=${encodeURIComponent(clauses.join(" and "))}&fields=${encodeURIComponent(`files(${CREATED_FIELDS})`)}&pageSize=2&supportsAllDrives=true&includeItemsFromAllDrives=true`,
  );
  if (!listed.ok) return listed;
  try {
    const json = (await listed.res.json()) as {
      files?: Array<{ id?: string; name?: string; mimeType?: string; webViewLink?: string; trashed?: boolean }>;
    };
    const hit = json.files?.find((f) => f.id && !f.trashed);
    if (!hit?.id) return { ok: true, value: null };
    return {
      ok: true,
      value: {
        id: hit.id,
        name: hit.name ?? "",
        mimeType: hit.mimeType ?? "",
        webViewLink: hit.webViewLink ?? null,
      },
    };
  } catch {
    return { ok: false, error: invalidResponse() };
  }
};

/**
 * Idempotent folder creation: reuse a non-trashed folder with the same name under
 * `parentId` (or the same ARC key for the root folder), otherwise create it.
 */
export const getOrCreateChildFolder = async (input: {
  accessToken: string;
  name: string;
  parentId?: string;
  appKey?: string;
}): ApiResult<GoogleDriveCreatedItem> => {
  if (input.appKey) {
    // Root folders carry an ARC key: never adopt a user's folder that merely shares a name.
    const byKey = await findItemByAppKey({
      accessToken: input.accessToken,
      appKey: input.appKey,
      parentId: input.parentId,
    });
    if (!byKey.ok) return byKey;
    if (byKey.value) return { ok: true, value: byKey.value };
  } else if (input.parentId) {
    const clauses = [
      `name='${escapeQueryValue(input.name)}'`,
      `mimeType='${GOOGLE_DRIVE_FOLDER_MIME}'`,
      "trashed=false",
      `'${escapeQueryValue(input.parentId)}' in parents`,
    ];
    const listed = await driveRequest(
      input.accessToken,
      `/files?q=${encodeURIComponent(clauses.join(" and "))}&fields=${encodeURIComponent(`files(${CREATED_FIELDS})`)}&pageSize=1&supportsAllDrives=true&includeItemsFromAllDrives=true`,
    );
    if (!listed.ok) return listed;
    try {
      const json = (await listed.res.json()) as {
        files?: Array<{ id?: string; name?: string; mimeType?: string; webViewLink?: string }>;
      };
      const hit = json.files?.[0];
      if (hit?.id) {
        return {
          ok: true,
          value: {
            id: hit.id,
            name: hit.name ?? input.name,
            mimeType: hit.mimeType ?? GOOGLE_DRIVE_FOLDER_MIME,
            webViewLink: hit.webViewLink ?? null,
          },
        };
      }
    } catch {
      return { ok: false, error: invalidResponse() };
    }
  }
  return createFolder(input);
};

const multipartBody = (
  metadata: Record<string, unknown>,
  mimeType: string,
  bytes: Buffer,
): { body: Buffer; contentType: string } => {
  const boundary = `arc-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  const head = Buffer.from(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
    "utf8",
  );
  const tail = Buffer.from(`\r\n--${boundary}--`, "utf8");
  return {
    body: Buffer.concat([head, bytes, tail]),
    contentType: `multipart/related; boundary=${boundary}`,
  };
};

/** Upload a small file (≤ 5 MB) in a single multipart request. */
export const uploadMultipartFile = async (input: {
  accessToken: string;
  name: string;
  mimeType: string;
  bytes: Buffer;
  parentId: string;
  appKey?: string;
}): ApiResult<GoogleDriveCreatedItem> => {
  const { body, contentType } = multipartBody(
    {
      name: input.name,
      parents: [input.parentId],
      ...(input.appKey
        ? { appProperties: { [ARC_APP_KEY_PROPERTY]: input.appKey } }
        : {}),
    },
    input.mimeType,
    input.bytes,
  );
  return parseCreated(
    await driveRequest(
      input.accessToken,
      `${GOOGLE_DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=${encodeURIComponent(CREATED_FIELDS)}&supportsAllDrives=true`,
      {
        method: "POST",
        headers: { "Content-Type": contentType },
        body: new Uint8Array(body),
      },
    ),
  );
};

/** Upload via a resumable session (used above the multipart ceiling). */
const uploadResumableFile = async (input: {
  accessToken: string;
  name: string;
  mimeType: string;
  bytes: Buffer;
  parentId: string;
  appKey?: string;
}): ApiResult<GoogleDriveCreatedItem> => {
  const started = await driveRequest(
    input.accessToken,
    `${GOOGLE_DRIVE_UPLOAD_API}/files?uploadType=resumable&fields=${encodeURIComponent(CREATED_FIELDS)}&supportsAllDrives=true`,
    {
      method: "POST",
      headers: {
        ...jsonHeaders,
        "X-Upload-Content-Type": input.mimeType,
        "X-Upload-Content-Length": String(input.bytes.byteLength),
      },
      body: JSON.stringify({
        name: input.name,
        parents: [input.parentId],
        ...(input.appKey
          ? { appProperties: { [ARC_APP_KEY_PROPERTY]: input.appKey } }
          : {}),
      }),
    },
  );
  if (!started.ok) return started;
  const sessionUrl = started.res.headers.get("location");
  if (!sessionUrl || !sessionUrl.startsWith("https://")) {
    return { ok: false, error: invalidResponse() };
  }
  return parseCreated(
    await driveRequest(input.accessToken, sessionUrl, {
      method: "PUT",
      headers: { "Content-Type": input.mimeType },
      body: new Uint8Array(input.bytes),
    }),
  );
};

/** Multipart for small files, resumable for larger ones. */
export const uploadFile = (input: {
  accessToken: string;
  name: string;
  mimeType: string;
  bytes: Buffer;
  parentId: string;
  appKey?: string;
}): ApiResult<GoogleDriveCreatedItem> =>
  input.bytes.byteLength <= MULTIPART_MAX_BYTES
    ? uploadMultipartFile(input)
    : uploadResumableFile(input);
