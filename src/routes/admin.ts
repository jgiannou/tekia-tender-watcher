import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { z } from "zod";
import type { Config } from "../config.js";
import type { Repository } from "../db/repository.js";
import type { PollJob } from "../jobs/poll-kimdis.js";
import {
  reevaluateStoredTenders,
  resendMatchingAlerts,
} from "../jobs/reevaluate.js";
import type { SlackClient } from "../slack/client.js";
import { formatTestSlackMessage } from "../slack/format-message.js";

type AdminEnv = {
  Variables: {
    adminOk: boolean;
  };
};

const resendBodySchema = z.object({
  force: z.boolean().optional().default(false),
  dryRun: z.boolean().optional().default(false),
  limit: z.coerce.number().int().positive().max(200).optional().default(50),
});

export const createAdminRoutes = (deps: {
  adminToken: string;
  pollJob: PollJob;
  slack: SlackClient;
  config: Config;
  repo: Repository;
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

  app.post("/admin/reevaluate", async (c) => {
    try {
      const result = reevaluateStoredTenders(deps.repo, deps.config);
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

  app.post("/admin/resend", async (c) => {
    let body: unknown = {};
    try {
      body = await c.req.json();
    } catch {
      body = {};
    }

    const parsed = resendBodySchema.safeParse(body ?? {});
    if (!parsed.success) {
      return c.json(
        {
          ok: false,
          error: parsed.error.issues.map((i) => i.message).join("; "),
        },
        400,
      );
    }

    try {
      const result = await resendMatchingAlerts(
        {
          repo: deps.repo,
          slack: deps.slack,
          config: deps.config,
        },
        parsed.data,
      );
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

  return app;
};
