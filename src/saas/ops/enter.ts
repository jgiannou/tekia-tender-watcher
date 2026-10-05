import type { PrismaClient } from "@prisma/client";
import type { Context } from "hono";
import { loadSaasConfig } from "../config.js";
import { buildSessionCookie, consumeOpsEnterCode } from "./session.js";

export const createOpsEnterHandler =
  (prisma: PrismaClient) => async (c: Context) => {
    const code = c.req.query("code")?.trim();
    if (!code) {
      return c.text("Missing code", 400);
    }

    const consumed = await consumeOpsEnterCode(prisma, code);
    if (!consumed) {
      return c.text("Invalid or expired code", 410);
    }

    const config = loadSaasConfig();
    const secure = c.req.url.startsWith("https://");
    const cookie = await buildSessionCookie(
      consumed.sessionToken,
      config.BETTER_AUTH_SECRET,
      secure,
    );

    const appUrl = config.SAAS_APP_URL.replace(/\/$/, "");
    c.header("Set-Cookie", cookie.options);
    return c.redirect(`${appUrl}/app`, 302);
  };
