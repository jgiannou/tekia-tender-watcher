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

  // Scope admin auth to /admin/* only — must not block /api/auth or /api/saas.
  app.use("/admin/*", requireAdmin);

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

  /**
   * Ops bootstrap: verify email + set org plan (trial|basic|pro) without Stripe.
   * Used by ARC Tenders Ops Desk / one-shot grants. Requires SAAS_ENABLED + Prisma.
   */
  app.post("/admin/saas/grant-plan", async (c) => {
    const schema = z.object({
      email: z.string().email(),
      planKey: z.enum(["trial", "basic", "pro"]).default("pro"),
      organizationId: z.string().min(1).optional(),
      verifyEmail: z.boolean().optional().default(true),
    });
    let body: unknown = {};
    try {
      body = await c.req.json();
    } catch {
      body = {};
    }
    const parsed = schema.safeParse(body ?? {});
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
      const { getPrisma } = await import("../db/prisma.js");
      const { PLAN_KEYS, TRIAL_DURATION_MS } = await import(
        "../saas/plans/catalog.js"
      );
      const prisma = getPrisma();
      const email = parsed.data.email.trim().toLowerCase();
      const user = await prisma.user.findFirst({
        where: { email: { equals: email, mode: "insensitive" } },
      });
      if (!user) {
        return c.json({ ok: false, error: "user_not_found" }, 404);
      }

      if (parsed.data.verifyEmail && !user.emailVerified) {
        await prisma.user.update({
          where: { id: user.id },
          data: { emailVerified: true },
        });
      }

      const memberships = await prisma.organizationMember.findMany({
        where: { userId: user.id },
        include: { organization: true },
        orderBy: { createdAt: "asc" },
      });
      if (memberships.length === 0) {
        return c.json({ ok: false, error: "organization_not_found" }, 404);
      }

      const membership =
        (parsed.data.organizationId
          ? memberships.find(
              (m) => m.organizationId === parsed.data.organizationId,
            )
          : null) ?? memberships[0];
      if (!membership) {
        return c.json({ ok: false, error: "organization_not_found" }, 404);
      }

      const planKey = parsed.data.planKey;
      const now = new Date();
      const status =
        planKey === PLAN_KEYS.trial
          ? ("TRIALING" as const)
          : ("ACTIVE" as const);
      const trialEndsAt =
        planKey === PLAN_KEYS.trial
          ? new Date(now.getTime() + TRIAL_DURATION_MS)
          : null;

      const subscription = await prisma.subscription.upsert({
        where: { organizationId: membership.organizationId },
        create: {
          organizationId: membership.organizationId,
          status,
          planKey,
          trialEndsAt,
          extraSeats: 0,
        },
        update: {
          status,
          planKey,
          trialEndsAt,
          cancelAtPeriodEnd: false,
          canceledAt: null,
        },
      });

      return c.json({
        ok: true,
        user: {
          id: user.id,
          email: user.email,
          emailVerified: true,
        },
        organization: {
          id: membership.organization.id,
          name: membership.organization.name,
        },
        subscription: {
          planKey: subscription.planKey,
          status: subscription.status,
          trialEndsAt: subscription.trialEndsAt?.toISOString() ?? null,
        },
      });
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
