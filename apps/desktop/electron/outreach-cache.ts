/**
 * Durable local cache of early-outreach drafts on the desktop.
 * Survives Coolify SQLite wipes — on next open we re-push to the server.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { app } from "electron";

export type CachedOutreach = {
  referenceNumber: string;
  status: string;
  subject: string | null;
  body: string | null;
  notes: string | null;
  recipient: string | null;
  sentAt: string | null;
  updatedAt: string;
};

type CacheFile = {
  version: 1;
  byAdam: Record<string, CachedOutreach>;
};

const cachePath = (): string =>
  join(app.getPath("userData"), "outreach-cache.json");

const readCache = (): CacheFile => {
  const path = cachePath();
  if (!existsSync(path)) return { version: 1, byAdam: {} };
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as CacheFile;
    if (!parsed || parsed.version !== 1 || typeof parsed.byAdam !== "object") {
      return { version: 1, byAdam: {} };
    }
    return parsed;
  } catch {
    return { version: 1, byAdam: {} };
  }
};

const writeCache = (cache: CacheFile): void => {
  const path = cachePath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(cache, null, 2), "utf8");
};

export const getCachedOutreach = (
  referenceNumber: string,
): CachedOutreach | null => {
  const entry = readCache().byAdam[referenceNumber];
  return entry ?? null;
};

export const saveCachedOutreach = (input: CachedOutreach): CachedOutreach => {
  const cache = readCache();
  const next: CachedOutreach = {
    ...input,
    referenceNumber: input.referenceNumber,
    updatedAt: input.updatedAt || new Date().toISOString(),
  };
  cache.byAdam[input.referenceNumber] = next;
  writeCache(cache);
  return next;
};

const statusRank = (status: string | null | undefined): number => {
  switch (status) {
    case "SENT":
      return 4;
    case "READY":
      return 3;
    case "DRAFT":
      return 2;
    case "NOT_STARTED":
      return 1;
    default:
      return 0;
  }
};

/** True when local cache should win over server outreach. */
export const localOutreachIsNewer = (
  local: CachedOutreach | null,
  server: {
    status?: string | null;
    updatedAt?: string | null;
    sentAt?: string | null;
    subject?: string | null;
    body?: string | null;
  } | null,
): boolean => {
  if (!local) return false;
  if (!server) return true;
  if (statusRank(local.status) > statusRank(server.status)) return true;
  if (statusRank(local.status) < statusRank(server.status)) return false;
  const localTs = Date.parse(local.updatedAt || local.sentAt || "");
  const serverTs = Date.parse(server.updatedAt || server.sentAt || "");
  if (Number.isFinite(localTs) && Number.isFinite(serverTs)) {
    return localTs > serverTs;
  }
  // Same status, server missing body/subject that local has
  if ((local.body || local.subject) && !(server.body || server.subject)) {
    return true;
  }
  return false;
};
