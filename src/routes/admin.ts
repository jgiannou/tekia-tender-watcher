import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import type { PollJob } from "../jobs/poll-kimdis.js";
import type { SlackClient } from "../slack/client.js";
import { formatTestSlackMessage } from "../slack/format-message.js";

type AdminEnv = {
  Variables: {
    adminOk: boolean;
  };
};

export const createAdminRoutes = (deps: {
  adminToken: string;
  pollJob: PollJob;
  slack: SlackClient;
}) => {
  const app = new Hono<AdminEnv>();

  const requireAdmin = createMiddleware(async (c, next) => {
    const token = c.req.header("X-Admin-Token");
    if (!token || token !== deps.adminToken) {
      return c.json({ error: "unauthorized" }, 401);
    }
    await next();
  });

  app.use("*", requireAdmin);

  app.post("/admin/run", async (c) => {
    if (deps.pollJob.isRunning()) {
      return c.json({ ok: false, error: "poll already running" }, 409);
    }

    try {
      const result = await deps.pollJob.run();
      return c.json({ ok: true, result });
    } catch (error) {
      return c.json(
        {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        },
        500,
      );
    }
  });

  app.post("/admin/test-slack", async (c) => {
    const sent = await deps.slack.sendText(formatTestSlackMessage());
    if (!sent) {
      return c.json({ ok: false, error: "failed to send slack message" }, 500);
    }
    return c.json({ ok: true });
  });

  return app;
};
