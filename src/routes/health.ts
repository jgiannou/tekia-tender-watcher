import { Hono } from "hono";
import type { Repository } from "../db/repository.js";

export const createHealthRoutes = (repo: Repository) => {
  const app = new Hono();

  app.get("/health", (c) => {
    const stats = repo.getPollStats();
    return c.json({
      status: "ok",
      lastPollAt: stats.lastPollAt,
      lastPollSuccess: stats.lastPollSuccess,
      totalSeen: stats.totalSeen,
      totalAlerts: stats.totalAlerts,
    });
  });

  return app;
};
