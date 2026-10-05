import type { PrismaClient } from "@prisma/client";
import type { Context } from "hono";
import { loadSaasConfig } from "../config.js";
import {
  buildSessionCookie,
  consumeOpsEnterCode,
  resolveSaasAppUrl,
} from "./session.js";

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
    const appUrl = resolveSaasAppUrl();
    // Cookie name/Secure must match better-auth baseURL, not the inbound proxy URL.
    const authBase = String(config.BETTER_AUTH_URL || appUrl).replace(/\/$/, "");
    const cookie = await buildSessionCookie(
      consumed.sessionToken,
      config.BETTER_AUTH_SECRET,
      authBase.startsWith("https://") ? authBase : appUrl,
    );

    // Drop any stale opposite-prefix session cookie (http↔https mismatch).
    const dropName = cookie.name.startsWith("__Secure-")
      ? "better-auth.session_token"
      : "__Secure-better-auth.session_token";

    c.header("Set-Cookie", cookie.header);
    const dropParts = [
      `${dropName}=`,
      "Path=/",
      "Max-Age=0",
      "HttpOnly",
      "SameSite=Lax",
    ];
    if (dropName.startsWith("__Secure-")) dropParts.push("Secure");
    c.header("Set-Cookie", dropParts.join("; "), { append: true });
    return c.redirect(`${appUrl}/app`, 302);
  };
