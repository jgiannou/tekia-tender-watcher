import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { safeStorage, app } from "electron";

export type ConnectionRecord = {
  apiUrl: string;
  hasToken: boolean;
};

type StoredConnection = {
  apiUrl: string;
  tokenEncryptedBase64?: string;
};

const connectionPath = (): string =>
  join(app.getPath("userData"), "connection.json");

const ensureDir = (): void => {
  mkdirSync(app.getPath("userData"), { recursive: true });
};

export const readConnection = (): StoredConnection | null => {
  const path = connectionPath();
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as StoredConnection;
  } catch {
    return null;
  }
};

export const getConnectionPublic = (): ConnectionRecord => {
  const stored = readConnection();
  return {
    apiUrl: stored?.apiUrl?.replace(/\/$/, "") ?? "",
    hasToken: Boolean(stored?.tokenEncryptedBase64),
  };
};

export const getDecryptedToken = (): string | null => {
  const stored = readConnection();
  if (!stored?.tokenEncryptedBase64) return null;
  if (!safeStorage.isEncryptionAvailable()) {
    // Fallback for CI/headless: treat as base64 of utf8 (dev only warning)
    try {
      return Buffer.from(stored.tokenEncryptedBase64, "base64").toString("utf8");
    } catch {
      return null;
    }
  }
  try {
    const buf = Buffer.from(stored.tokenEncryptedBase64, "base64");
    return safeStorage.decryptString(buf);
  } catch {
    return null;
  }
};

export const saveConnection = (input: {
  apiUrl: string;
  token?: string | null;
}): ConnectionRecord => {
  ensureDir();
  const existing = readConnection();
  const apiUrl = input.apiUrl.trim().replace(/\/$/, "");

  let tokenEncryptedBase64 = existing?.tokenEncryptedBase64;
  if (typeof input.token === "string" && input.token.trim().length > 0) {
    const token = input.token.trim();
    if (safeStorage.isEncryptionAvailable()) {
      tokenEncryptedBase64 = safeStorage.encryptString(token).toString("base64");
    } else {
      // Development / CI environments without keychain encryption
      tokenEncryptedBase64 = Buffer.from(token, "utf8").toString("base64");
      console.warn(
        "[desktop] safeStorage encryption unavailable — token stored obfuscated only",
      );
    }
  }

  const next: StoredConnection = {
    apiUrl,
    tokenEncryptedBase64,
  };
  writeFileSync(connectionPath(), JSON.stringify(next, null, 2), "utf8");

  return {
    apiUrl,
    hasToken: Boolean(tokenEncryptedBase64),
  };
};

export type ConnectionStatus =
  | "connected"
  | "disconnected"
  | "invalid_token"
  | "unreachable"
  | "not_configured";
