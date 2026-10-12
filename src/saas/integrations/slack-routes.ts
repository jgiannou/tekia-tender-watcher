import type { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { resolveSaasAppUrl } from "../mail/mail.js";
import {
  beginSlackOAuth,
  completeSlackOAuthCallback,
  disconnectSlack,
  getSlackConnectionView,
  sendSlackTestMessage,
  setSlackNotificationsPaused,
  updateSlackPreferences,
} from "../services/slack-connection.js";

type SlackVariables = {
  userId: string;
  sessionToken: string;
  activeOrganizationId: string | null;
};

type RegisterSlackRoutesInput = {
  app: Hono<{ Variables: SlackVariables }>;
  prisma: PrismaClient;
  requireSession: MiddlewareHandler<{ Variables: SlackVariables }>;
  resolveOrgId: (c: {
    req: { header: (name: string) => string | undefined };
    get: (key: keyof SlackVariables) => string | null;
  }) => string | null;
};

const prefsSchema = z.object({
  newOpportunity: z.boolean(),
  relatedActOnFollowed: z.boolean(),
  deadlineRadar: z.boolean(),
});

export const registerSlackIntegrationRoutes = (
  input: RegisterSlackRoutesInput,
): void => {
  const { app, prisma, requireSession, resolveOrgId } = input;

  app.get("/api/saas/integrations/slack", requireSession, async (c) => {
    const view = await getSlackConnectionView(prisma, {
      userId: c.get("userId"),
      organizationId: resolveOrgId(c),
    });
    return c.json(view);
  });

  app.post("/api/saas/integrations/slack/oauth/start", requireSession, async (c) => {
    const body = z
      .object({
        purpose: z.enum(["CONNECT", "REPLACE"]).optional(),
      })
      .parse(await c.req.json().catch(() => ({})));
    const result = await beginSlackOAuth(prisma, {
      userId: c.get("userId"),
      organizationId: resolveOrgId(c),
      purpose: body.purpose,
    });
    return c.json(result);
  });

  /** Slack OAuth redirect target — no session cookie required beyond state binding. */
  app.get("/api/saas/integrations/slack/oauth/callback", async (c) => {
    const code = c.req.query("code");
    const state = c.req.query("state");
    const error = c.req.query("error");
    const result = await completeSlackOAuthCallback(prisma, {
      code,
      state,
      error,
    });
    const appUrl = resolveSaasAppUrl().replace(/\/+$/, "");
    return c.redirect(`${appUrl}${result.redirectPath}`, 302);
  });

  app.put("/api/saas/integrations/slack/preferences", requireSession, async (c) => {
    const body = z
      .object({
        preferences: prefsSchema,
        activate: z.boolean().optional(),
      })
      .parse(await c.req.json());
    const view = await updateSlackPreferences(prisma, {
      userId: c.get("userId"),
      organizationId: resolveOrgId(c),
      preferences: body.preferences,
      activate: body.activate,
    });
    return c.json(view);
  });

  app.post("/api/saas/integrations/slack/pause", requireSession, async (c) => {
    const body = z
      .object({ paused: z.boolean() })
      .parse(await c.req.json());
    const view = await setSlackNotificationsPaused(prisma, {
      userId: c.get("userId"),
      organizationId: resolveOrgId(c),
      paused: body.paused,
    });
    return c.json(view);
  });

  app.post("/api/saas/integrations/slack/test", requireSession, async (c) => {
    const result = await sendSlackTestMessage(prisma, {
      userId: c.get("userId"),
      organizationId: resolveOrgId(c),
    });
    return c.json({
      ok: true,
      messageEl: `Η δοκιμαστική ειδοποίηση στάλθηκε στο ${result.channelLabel}.`,
      channelLabel: result.channelLabel,
    });
  });

  app.post("/api/saas/integrations/slack/disconnect", requireSession, async (c) => {
    const view = await disconnectSlack(prisma, {
      userId: c.get("userId"),
      organizationId: resolveOrgId(c),
    });
    return c.json(view);
  });
};
