import type { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import {
  activateArcProLaunch,
  getArcProLaunchAvailability,
  getArcProLaunchPublicState,
} from "../services/promotions.js";
import { isArcProLaunchEnabled } from "../promotions/arc-pro-launch.js";

type BillingVariables = {
  userId: string;
  sessionToken: string;
  activeOrganizationId: string | null;
};

type RegisterPromotionRoutesInput = {
  app: Hono<{ Variables: BillingVariables }>;
  prisma: PrismaClient;
  requireSession: MiddlewareHandler<{ Variables: BillingVariables }>;
  resolveOrgId: (c: {
    req: { header: (name: string) => string | undefined };
    get: (key: keyof BillingVariables) => string | null;
  }) => string | null;
};

const attributionSchema = z
  .object({
    utm_source: z.string().max(80).optional(),
    utm_medium: z.string().max(80).optional(),
    utm_campaign: z.string().max(120).optional(),
    utm_content: z.string().max(120).optional(),
    utm_term: z.string().max(120).optional(),
    source: z.string().max(80).optional(),
  })
  .strict()
  .optional();

export const registerPromotionRoutes = (
  input: RegisterPromotionRoutesInput,
) => {
  const { app, prisma, requireSession, resolveOrgId } = input;

  /** Public campaign availability — slots from successful activations only. */
  app.get("/api/saas/promotions/arc-pro-launch", async (c) => {
    const availability = await getArcProLaunchAvailability(prisma);
    return c.json(availability);
  });

  app.get(
    "/api/saas/promotions/arc-pro-launch/status",
    requireSession,
    async (c) => {
      const state = await getArcProLaunchPublicState(prisma, {
        userId: c.get("userId"),
        organizationId: resolveOrgId(c),
      });
      return c.json(state);
    },
  );

  app.post(
    "/api/saas/promotions/arc-pro-launch/activate",
    requireSession,
    async (c) => {
      if (!isArcProLaunchEnabled()) {
        return c.json({ error: "promo_disabled" }, 503);
      }
      const body = attributionSchema.parse(
        (await c.req.json().catch(() => ({}))) ?? {},
      );
      const result = await activateArcProLaunch(prisma, {
        userId: c.get("userId"),
        organizationId: resolveOrgId(c),
        attribution: body ?? null,
      });
      return c.json(result, result.already ? 200 : 201);
    },
  );
};
