/**
 * Local QA fixture: unverified Free user + paused saved search + captured
 * verification link (ARC_MAIL_CAPTURE — no SMTP).
 *
 * Uses the same DATABASE_URL / BETTER_AUTH_SECRET as the running saas:dev:api
 * so the session cookie and verify link work in the Vite browser.
 *
 * Run: pnpm exec tsx scripts/qa-free-unverified-fixture.ts
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { createSaasApp } from "../src/saas/app.js";
import { loadSaasConfig } from "../src/saas/config.js";
import {
  __enableMailCapture,
  __resetMailTestHooks,
} from "../src/saas/mail/mail.js";
import { PLAN_KEYS } from "../src/saas/plans/catalog.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outPath = join(root, "artifacts", "qa-free-unverified-fixture.json");

/** Minimal .env loader — do not print secrets. */
const loadDotEnv = () => {
  try {
    const raw = readFileSync(join(root, ".env"), "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = value;
    }
  } catch {
    // rely on process env
  }
};

const extractVerifyUrl = (text: string, html: string): string | null => {
  const fromText = text.match(/https?:\/\/\S*verify-email\S+/);
  if (fromText?.[0]) return fromText[0].replace(/[>\])]"'?.,]+$/, "");
  const fromHtml = html.match(/href="(https?:\/\/[^"]*verify-email[^"]*)"/);
  return fromHtml?.[1] ? fromHtml[1].replace(/&amp;/g, "&") : null;
};

const cookieHeaderFromResponse = (response: Response): string => {
  const setCookie = response.headers.getSetCookie?.() ?? [];
  if (setCookie.length > 0) {
    return setCookie.map((part) => part.split(";")[0]).join("; ");
  }
  return (
    response.headers
      .get("set-cookie")
      ?.split(",")
      .map((p) => p.split(";")[0].trim())
      .join("; ") ?? ""
  );
};

const parseCookies = (header: string) =>
  header
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const eq = part.indexOf("=");
      return {
        name: part.slice(0, eq),
        value: part.slice(eq + 1),
      };
    });

const main = async () => {
  loadDotEnv();
  // Capture BEFORE createSaasApp so auth hooks see email-enabled + no SMTP.
  const capture = __enableMailCapture();
  process.env.EMAIL_ENABLED = "true";
  process.env.ARC_MAIL_CAPTURE = "true";

  const config = loadSaasConfig();
  const prisma = new PrismaClient({
    datasources: { db: { url: config.DATABASE_URL } },
  });
  const { app } = createSaasApp({ prisma, config });

  const stamp = Date.now();
  const email = `qa-free-unverified-${stamp}@example.com`;
  const password = "qa-password-12345";
  const name = "QA Free Unverified";

  const signUp = await app.request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, password }),
  });
  const signUpBody = await signUp.text();
  if (!signUp.ok) {
    throw new Error(`sign-up failed ${signUp.status}: ${signUpBody}`);
  }
  const cookie = cookieHeaderFromResponse(signUp);
  const parsed = JSON.parse(signUpBody) as { user?: { id?: string } };
  const userId = parsed.user?.id;
  if (!userId) throw new Error("sign-up missing user id");

  // Ensure unverified even if a race auto-verified.
  await prisma.user.update({
    where: { id: userId },
    data: { emailVerified: false },
  });

  const mails = capture.getMails();
  const verificationMail = mails.find((m) =>
    /verify-email|επιβεβαίωση email|confirm your/i.test(
      `${m.subject} ${m.text} ${m.html}`,
    ),
  );
  const verifyUrl =
    (verificationMail
      ? extractVerifyUrl(verificationMail.text, verificationMail.html)
      : null) ?? null;
  if (!verifyUrl) {
    throw new Error(
      `verification link not captured (mails=${mails.length}). Refusing to proceed.`,
    );
  }

  // Point callback at saved-searches with verified=1 for AppShell refresh.
  const verifyUrlForBrowser = (() => {
    const url = new URL(verifyUrl);
    url.searchParams.set(
      "callbackURL",
      "http://127.0.0.1:5174/app/saved-searches?verified=1",
    );
    return url.toString();
  })();

  const orgRes = await app.request("/api/saas/organizations", {
    method: "POST",
    headers: {
      cookie,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name: `QA Free Org ${stamp}` }),
  });
  const orgJson = (await orgRes.json()) as {
    organization?: { id: string; name: string };
    error?: string;
  };
  if (!orgRes.ok || !orgJson.organization) {
    throw new Error(`org create failed ${orgRes.status}: ${JSON.stringify(orgJson)}`);
  }
  const organizationId = orgJson.organization.id;

  await prisma.subscription.update({
    where: { organizationId },
    data: {
      planKey: PLAN_KEYS.free,
      status: "ACTIVE",
      trialEndsAt: null,
    },
  });

  const profileRes = await app.request("/api/saas/watch-profiles", {
    method: "POST",
    headers: {
      cookie,
      "Content-Type": "application/json",
      "X-Organization-Id": organizationId,
    },
    body: JSON.stringify({
      name: "QA paused search",
      keywords: ["ιστοσελίδα"],
      enabled: false,
      skipSimilarCheck: true,
    }),
  });
  const profileJson = (await profileRes.json()) as {
    profile?: { id: string; enabled: boolean };
  };
  if (!profileRes.ok || !profileJson.profile) {
    throw new Error(
      `profile create failed ${profileRes.status}: ${JSON.stringify(profileJson)}`,
    );
  }

  const entitlements = await app.request(
    `/api/saas/entitlements?organizationId=${organizationId}`,
    { headers: { cookie, "X-Organization-Id": organizationId } },
  );
  const entitlementsJson = await entitlements.json();

  const fixture = {
    createdAt: new Date().toISOString(),
    email,
    password,
    userId,
    organizationId,
    profileId: profileJson.profile.id,
    profileEnabled: profileJson.profile.enabled,
    cookie,
    cookies: parseCookies(cookie),
    verifyUrl: verifyUrlForBrowser,
    verifyUrlRaw: verifyUrl,
    appOrigin: "http://127.0.0.1:5174",
    savedSearchesUrl: "http://127.0.0.1:5174/app/saved-searches",
    entitlements: entitlementsJson,
    note: "No SMTP — ARC_MAIL_CAPTURE. Session works against local API sharing this DB.",
  };

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(fixture, null, 2)}\n`);
  console.log(JSON.stringify({ ok: true, outPath, email, verifyUrl: fixture.verifyUrl }, null, 2));

  capture.disable();
  __resetMailTestHooks();
  await prisma.$disconnect();
};

main().catch(async (error) => {
  console.error(error);
  __resetMailTestHooks();
  process.exitCode = 1;
});
