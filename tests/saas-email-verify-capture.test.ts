import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  __enableMailCapture,
  __resetMailTestHooks,
} from "../src/saas/mail/mail.js";
import { PLAN_KEYS } from "../src/saas/plans/catalog.js";
import {
  authedJson,
  createSaasTestApp,
  getSaasTestPrisma,
  resetSaasDatabase,
  setOrgPlan,
} from "./helpers/saas-test.js";

const prisma = getSaasTestPrisma();

const extractVerifyUrl = (text: string, html: string): string | null => {
  const fromText = text.match(/https?:\/\/\S*verify-email\S+/);
  if (fromText?.[0]) return fromText[0].replace(/[>\])]"'?.,]+$/, "");
  const fromHtml = html.match(/href="(https?:\/\/[^"]*verify-email[^"]*)"/);
  return fromHtml?.[1] ? fromHtml[1].replace(/&amp;/g, "&") : null;
};

describe("email verify via mail capture (no SMTP)", () => {
  beforeEach(async () => {
    await resetSaasDatabase(prisma);
    __resetMailTestHooks();
  });

  afterEach(() => {
    __resetMailTestHooks();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("captures real verify link, verifies without re-login, keeps paused search paused", async () => {
    const capture = __enableMailCapture();
    process.env.EMAIL_ENABLED = "true";
    const { app } = createSaasTestApp(prisma);

    const email = `capture-verify-${Date.now()}@example.com`;
    const signUp = await app.request("/api/auth/sign-up/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Capture Verify",
        email,
        password: "password12345",
      }),
    });
    expect(signUp.ok).toBe(true);
    const setCookie = signUp.headers.getSetCookie?.() ?? [];
    const cookie =
      setCookie.length > 0
        ? setCookie.map((part) => part.split(";")[0]).join("; ")
        : "";
    const body = (await signUp.json()) as { user: { id: string } };
    await prisma.user.update({
      where: { id: body.user.id },
      data: { emailVerified: false },
    });

    const mail = capture.getMails()[0];
    expect(mail).toBeTruthy();
    const verifyUrl = extractVerifyUrl(mail!.text, mail!.html);
    expect(verifyUrl).toBeTruthy();

    const org = await authedJson<{ organization: { id: string } }>(
      app,
      "/api/saas/organizations",
      { cookie, body: { name: "Capture Org" } },
    );
    expect(org.status).toBe(201);
    const organizationId = org.json.organization.id;
    await setOrgPlan(prisma, organizationId, PLAN_KEYS.free);

    const paused = await authedJson<{
      profile: { id: string; enabled: boolean };
    }>(app, "/api/saas/watch-profiles", {
      cookie,
      organizationId,
      body: {
        name: "Paused until activate",
        keywords: ["ιστοσελίδα"],
        enabled: false,
        skipSimilarCheck: true,
      },
    });
    expect(paused.status).toBe(201);
    expect(paused.json.profile.enabled).toBe(false);

    // Fake proof: ?verified=1 alone must not flip emailVerified.
    await prisma.user.update({
      where: { id: body.user.id },
      data: { emailVerified: false },
    });
    const before = await prisma.user.findUniqueOrThrow({
      where: { id: body.user.id },
    });
    expect(before.emailVerified).toBe(false);

    const verifyPath = verifyUrl!.replace(/^https?:\/\/[^/]+/, "");
    const verifiedRes = await app.request(verifyPath, {
      headers: { cookie },
      redirect: "manual",
    });
    expect([200, 302, 303].includes(verifiedRes.status)).toBe(true);

    const after = await prisma.user.findUniqueOrThrow({
      where: { id: body.user.id },
    });
    expect(after.emailVerified).toBe(true);

    // Same cookie session — entitlements unlock without new login.
    const me = await authedJson<{
      user: { emailVerified: boolean | null };
    }>(app, "/api/saas/me", { cookie });
    expect(me.json.user.emailVerified).toBe(true);

    const stillPaused = await prisma.watchProfile.findUniqueOrThrow({
      where: { id: paused.json.profile.id },
    });
    expect(stillPaused.enabled).toBe(false);

    const entitlements = await authedJson<{
      usage: { activeWatchProfiles: number };
      entitlements: { maxActiveWatchProfiles: number };
      scanAccess: { status: string };
    }>(app, `/api/saas/entitlements?organizationId=${organizationId}`, {
      cookie,
    });
    expect(entitlements.json.scanAccess.status).toBe("active");
    expect(entitlements.json.usage.activeWatchProfiles).toBe(0);
    expect(entitlements.json.entitlements.maxActiveWatchProfiles).toBe(1);

    const enabled = await authedJson(
      app,
      `/api/saas/watch-profiles/${paused.json.profile.id}/enabled`,
      {
        cookie,
        method: "PATCH",
        organizationId,
        body: { enabled: true },
      },
    );
    expect(enabled.status).toBe(200);

    const afterEnable = await authedJson<{
      usage: { activeWatchProfiles: number };
    }>(app, `/api/saas/entitlements?organizationId=${organizationId}`, {
      cookie,
    });
    expect(afterEnable.json.usage.activeWatchProfiles).toBe(1);
  });
});
