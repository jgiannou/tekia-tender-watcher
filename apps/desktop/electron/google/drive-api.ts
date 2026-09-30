import {
  GOOGLE_FOLDER_MIME,
  type DriveFolderRef,
} from "./vault-structure.js";

export class DriveApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

type DriveFileResource = {
  id?: string;
  name?: string;
  mimeType?: string;
  createdTime?: string;
  modifiedTime?: string;
  webViewLink?: string;
  parents?: string[];
};

const driveFetch = async <T>(
  accessToken: string,
  path: string,
  init?: RequestInit,
): Promise<T> => {
  const response = await fetch(`https://www.googleapis.com/drive/v3${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const json = (await response.json().catch(() => ({}))) as {
    error?: { message?: string; code?: number; errors?: Array<{ reason?: string }> };
  } & T;

  if (!response.ok) {
    const message =
      json.error?.message ||
      `Google Drive API HTTP ${response.status}`;
    const reason = json.error?.errors?.[0]?.reason ?? "drive_error";

    if (response.status === 401) {
      throw new DriveApiError(401, "unauthorized", "Google Drive authorization expired. Reconnect.");
    }
    if (response.status === 403) {
      throw new DriveApiError(
        403,
        reason,
        `${message} — scope may be insufficient for this existing folder (drive.file).`,
      );
    }
    if (response.status === 404) {
      throw new DriveApiError(404, "not_found", "Vault folder/file no longer accessible.");
    }
    throw new DriveApiError(response.status, reason, message);
  }

  return json as T;
};

export const getDriveFile = async (
  accessToken: string,
  fileId: string,
): Promise<DriveFileResource> =>
  driveFetch(
    accessToken,
    `/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,webViewLink,parents,createdTime,modifiedTime&supportsAllDrives=true`,
  );

export const listChildFolders = async (
  accessToken: string,
  parentId: string,
): Promise<DriveFolderRef[]> => {
  const q = `'${parentId}' in parents and mimeType = '${GOOGLE_FOLDER_MIME}' and trashed = false`;
  const result = await driveFetch<{ files?: DriveFileResource[] }>(
    accessToken,
    `/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType)&pageSize=100&supportsAllDrives=true`,
  );
  return (result.files ?? [])
    .filter((f) => f.id && f.name)
    .map((f) => ({ id: f.id!, name: f.name! }));
};

export const listChildFiles = async (
  accessToken: string,
  parentId: string,
): Promise<
  Array<{
    id: string;
    name: string;
    mimeType: string;
    createdTime: string | null;
    modifiedTime: string | null;
    webViewLink: string;
  }>
> => {
  const q = `'${parentId}' in parents and mimeType != '${GOOGLE_FOLDER_MIME}' and trashed = false`;
  const result = await driveFetch<{ files?: DriveFileResource[] }>(
    accessToken,
    `/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,createdTime,modifiedTime,webViewLink)&pageSize=100&supportsAllDrives=true`,
  );
  return (result.files ?? [])
    .filter((f) => f.id && f.name)
    .map((f) => ({
      id: f.id!,
      name: f.name!,
      mimeType: f.mimeType ?? "application/octet-stream",
      createdTime: f.createdTime ?? null,
      modifiedTime: f.modifiedTime ?? null,
      webViewLink:
        f.webViewLink ??
        `https://drive.google.com/file/d/${f.id}/view`,
    }));
};

export const createFolder = async (
  accessToken: string,
  name: string,
  parentId: string,
): Promise<DriveFolderRef> => {
  const created = await driveFetch<DriveFileResource>(accessToken, "/files?supportsAllDrives=true", {
    method: "POST",
    body: JSON.stringify({
      name,
      mimeType: GOOGLE_FOLDER_MIME,
      parents: [parentId],
    }),
  });
  if (!created.id || !created.name) {
    throw new DriveApiError(500, "create_failed", "Failed to create Drive folder");
  }
  return { id: created.id, name: created.name };
};

export const findChildFolderByName = async (
  accessToken: string,
  parentId: string,
  name: string,
): Promise<DriveFolderRef | null> => {
  const children = await listChildFolders(accessToken, parentId);
  return (
    children.find(
      (child) => child.name.trim().toLowerCase() === name.trim().toLowerCase(),
    ) ?? null
  );
};

export const ensureChildFolder = async (
  accessToken: string,
  parentId: string,
  name: string,
): Promise<DriveFolderRef> => {
  const existing = await findChildFolderByName(accessToken, parentId, name);
  if (existing) return existing;
  return createFolder(accessToken, name, parentId);
};

/**
 * Copy a Drive file into a destination folder.
 * Always returns a NEW file — master template is never modified.
 */
export const copyFileToFolder = async (
  accessToken: string,
  sourceFileId: string,
  destinationFolderId: string,
  newName: string,
): Promise<{ id: string; name: string; webViewLink: string }> => {
  const copied = await driveFetch<DriveFileResource>(
    accessToken,
    `/files/${encodeURIComponent(sourceFileId)}/copy?supportsAllDrives=true&fields=id,name,webViewLink`,
    {
      method: "POST",
      body: JSON.stringify({
        name: newName,
        parents: [destinationFolderId],
      }),
    },
  );
  if (!copied.id || !copied.name) {
    throw new DriveApiError(500, "copy_failed", "Failed to copy Drive file");
  }
  return {
    id: copied.id,
    name: copied.name,
    webViewLink:
      copied.webViewLink ??
      `https://drive.google.com/file/d/${copied.id}/view`,
  };
};
