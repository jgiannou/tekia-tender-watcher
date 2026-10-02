import { existsSync, statSync } from "node:fs";
import { Hono } from "hono";
import type { Repository } from "../db/repository.js";

export const createHealthRoutes = (
  repo: Repository,
  options?: { databasePath?: string },
) => {
  const app = new Hono();

  app.get("/health", (c) => {
    const stats = repo.getPollStats();
    const databasePath = options?.databasePath ?? null;
    let database: {
      path: string;
      exists: boolean;
      sizeBytes: number | null;
      mtime: string | null;
      onPersistentDataMount: boolean;
      warning: string | null;
    } | null = null;

    if (databasePath) {
      const exists = existsSync(databasePath);
      let sizeBytes: number | null = null;
      let mtime: string | null = null;
      if (exists) {
        try {
          const st = statSync(databasePath);
          sizeBytes = st.size;
          mtime = st.mtime.toISOString();
        } catch {
          // ignore stat errors
        }
      }
      const onPersistentDataMount =
        databasePath === "/data/tenders.db" ||
        databasePath.startsWith("/data/");
      const warning = onPersistentDataMount
        ? null
        : `Database is not under /data (got ${databasePath}). Coolify volume must mount at /data and DATABASE_PATH must be /data/tenders.db — otherwise every redeploy wipes outreach/SENT data.`;

      database = {
        path: databasePath,
        exists,
        sizeBytes,
        mtime,
        onPersistentDataMount,
        warning,
      };
    }

    return c.json({
      status: "ok",
      lastPollAt: stats.lastPollAt,
      lastPollSuccess: stats.lastPollSuccess,
      totalSeen: stats.totalSeen,
      totalAlerts: stats.totalAlerts,
      bootstrapDone: stats.bootstrapDone,
      database,
    });
  });

  return app;
};
