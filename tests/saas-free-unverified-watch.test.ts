import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  FREE_PLAN,
  PLAN_KEYS,
} from "../src/saas/plans/catalog.js";
import { decideProductEmail } from "../src/saas/services/email-channel-policy.js";
import { assertCanActivateWatchProfile } from "../src/saas/services/entitlements.js";
import type { NotificationPreferences } from "../src/saas/services/org-settings.js";
import {
  assertCanRunWatchProfileScan,
  organizationHasVerifiedOperator,
  resolveOrganizationScanAccess,
} from "../src/saas/services/scan-access.js";
import { SaasError } from "../src/saas/errors.js";
import {
  authedJson,
  createSaasTestApp,
  getSaasTestPrisma,
  markUserEmailVerified,
  resetSaasDatabase,
  setOrgPlan,
  signUpAndGetCookie,
} from "./helpers/saas-test.js";

const prisma = getSaasTestPrisma();

const seedUnverifiedFree = async (
  app: ReturnType<typeof createSaasTestApp>["app"],
  label: string,
) => {
  const { cookie } = await signUpAndGetCookie(
    app,
    {
      name: `${label} User`,
      email: `${label}-${Date.now()}@example.com`,
      password: "password123",
    },
    { leaveUnverified: true },
  );
  const me = await authedJson<{
    userId: string;
    user: { emailVerified: boolean | null };
  }>(app, "/api/saas/me", { cookie });
  expect(me.status).toBe(200);
  expect(me.json.user.emailVerified).toBe(false);

  const org = await authedJson<{ organization: { id: string } }>(
    app,
    "/api/saas/organizations",
    { cookie, body: { name: `${label} Org` } },
  );
  expect(org.status).toBe(201);
  const organizationId = org.json.organization.id;
  await setOrgPlan(prisma, organizationId, PLAN_KEYS.free);
  return { cookie, userId: me.json.userId, organizationId };
};

const freePrefs = (
  overrides: Partial<NotificationPreferences> = {},
): NotificationPreferences => ({
  emailEnabled: true,
  recipients: ["owner@example.com"],
  digestHours: [],
  emailDeliveryMode: "DIGEST",
  weeklyEmailEnabled: true,
  weeklyRecipient: "owner@example.com",
  weeklyDigestWeekday: 1,
  weeklyDigestHour: "08:00",
  weeklyLastSentAt: null,
  events: {
    newOpportunity: true,
    relatedActOnFollowed: true,
    postSubmissionUpdate: true,
    deadlineRadar: true,
  },
  ...overrides,
});

describe("Free plan: email verify vs watch-profile limits", () => {
  beforeEach(async () => {
    await resetSaasDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("shows Free plan limit 1 while unverified — not a 0/0 package", async () => {
    const { app } = createSaasTestApp(prisma);
    const { cookie, userId, organizationId } = await seedUnverifiedFree(
      app,
      "unverified-free",
    );

    const access = await resolveOrganizationScanAccess(prisma, {
      userId,
      organizationId,
    });
    expect(access.status).toBe("unverified");
    expect(access.emailVerified).toBe(false);
    expect(access.limits.maxActiveWatchProfiles).toBe(1);
    expect(access.canRunManualProfileScan).toBe(false);
    expect(access.canRunPeriodicScan).toBe(false);
    expect(access.blockCode).toBe("email_not_verified");

    const entitlements = await authedJson<{
      entitlements: { maxActiveWatchProfiles: number };
      usage: { activeWatchProfiles: number };
      scanAccess: { status: string; limits: { maxActiveWatchProfiles: number } };
    }>(app, `/api/saas/entitlements?organizationId=${organizationId}`, {
      cookie,
    });
    expect(entitlements.status).toBe(200);
    expect(entitlements.json.entitlements.maxActiveWatchProfiles).toBe(1);
    expect(entitlements.json.usage.activeWatchProfiles).toBe(0);
    expect(entitlements.json.scanAccess.limits.maxActiveWatchProfiles).toBe(1);
  });

  it("allows paused create while unverified and rejects activation + scan", async () => {
    const { app } = createSaasTestApp(prisma);
    const { cookie, userId, organizationId } = await seedUnverifiedFree(
      app,
      "pause-first",
    );

    const paused = await authedJson<{
      profile: { id: string; enabled: boolean };
    }>(app, "/api/saas/watch-profiles", {
      cookie,
      method: "POST",
      organizationId,
      body: {
        name: "Paused search",
        keywords: ["ιστοσελίδα"],
        enabled: false,
        skipSimilarCheck: true,
      },
    });
    expect(paused.status).toBe(201);
    expect(paused.json.profile.enabled).toBe(false);

    await expect(
      assertCanActivateWatchProfile(prisma, { userId, organizationId }),
    ).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof SaasError && err.message === "email_not_verified",
    );

    await expect(
      assertCanRunWatchProfileScan(prisma, {
        userId,
        organizationId,
        kind: "manual",
      }),
    ).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof SaasError && err.message === "email_not_verified",
    );

    const enableRes = await authedJson<{ error?: string; message?: string }>(
      app,
      `/api/saas/watch-profiles/${paused.json.profile.id}/enabled`,
      {
        cookie,
        method: "PATCH",
        organizationId,
        body: { enabled: true },
      },
    );
    expect(enableRes.status).toBe(403);
    expect(enableRes.json.message).toBe("email_not_verified");

    const activeCreate = await authedJson<{ error?: string; message?: string }>(
      app,
      "/api/saas/watch-profiles",
      {
        cookie,
        method: "POST",
        organizationId,
        body: {
          name: "Active attempt",
          keywords: ["portal"],
          enabled: true,
          skipSimilarCheck: true,
        },
      },
    );
    expect(activeCreate.status).toBe(403);
    expect(activeCreate.json.message).toBe("email_not_verified");

    // Paused profiles no-op on /scan; force-enable in DB to assert the gate
    // still blocks direct API execution for unverified accounts.
    await prisma.watchProfile.update({
      where: { id: paused.json.profile.id },
      data: { enabled: true },
    });
    const scanRes = await authedJson<{ error?: string; message?: string }>(
      app,
      `/api/saas/watch-profiles/${paused.json.profile.id}/scan`,
      {
        cookie,
        method: "POST",
        organizationId,
        body: {},
      },
    );
    expect(scanRes.status).toBe(403);
    expect(scanRes.json.message).toBe("email_not_verified");
  });

  it("after verify keeps paused profiles paused and unlocks Free 0/1 then 1/1", async () => {
    const { app } = createSaasTestApp(prisma);
    const { cookie, userId, organizationId } = await seedUnverifiedFree(
      app,
      "verify-later",
    );

    const paused = await authedJson<{
      profile: { id: string; enabled: boolean };
    }>(app, "/api/saas/watch-profiles", {
      cookie,
      method: "POST",
      organizationId,
      body: {
        name: "Stays paused",
        keywords: ["cms"],
        enabled: false,
        skipSimilarCheck: true,
      },
    });
    expect(paused.status).toBe(201);

    await markUserEmailVerified(userId, true);

    // Same session cookie — entitlements refresh without re-login.
    const meAfter = await authedJson<{
      user: { emailVerified: boolean | null };
    }>(app, "/api/saas/me", { cookie });
    expect(meAfter.json.user.emailVerified).toBe(true);

    const afterVerify = await resolveOrganizationScanAccess(prisma, {
      userId,
      organizationId,
    });
    expect(afterVerify.status).toBe("active");
    expect(afterVerify.emailVerified).toBe(true);
    expect(afterVerify.limits.maxActiveWatchProfiles).toBe(1);
    expect(afterVerify.canRunManualProfileScan).toBe(true);
    expect(await organizationHasVerifiedOperator(prisma, organizationId)).toBe(
      true,
    );

    const stillPaused = await prisma.watchProfile.findUniqueOrThrow({
      where: { id: paused.json.profile.id },
    });
    expect(stillPaused.enabled).toBe(false);

    const entitlementsPaused = await authedJson<{
      usage: { activeWatchProfiles: number };
      entitlements: { maxActiveWatchProfiles: number };
    }>(app, `/api/saas/entitlements?organizationId=${organizationId}`, {
      cookie,
    });
    expect(entitlementsPaused.json.usage.activeWatchProfiles).toBe(0);
    expect(entitlementsPaused.json.entitlements.maxActiveWatchProfiles).toBe(1);

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

    const entitlementsActive = await authedJson<{
      usage: { activeWatchProfiles: number };
    }>(app, `/api/saas/entitlements?organizationId=${organizationId}`, {
      cookie,
    });
    expect(entitlementsActive.json.usage.activeWatchProfiles).toBe(1);

    const second = await authedJson(app, "/api/saas/watch-profiles", {
      cookie,
      method: "POST",
      organizationId,
      body: {
        name: "Second active",
        keywords: ["wordpress"],
        enabled: true,
        skipSimilarCheck: true,
      },
    });
    expect(second.status).toBe(409);

    const paused2 = await authedJson<{ profile: { id: string } }>(
      app,
      "/api/saas/watch-profiles",
      {
        cookie,
        method: "POST",
        organizationId,
        body: {
          name: "Second paused",
          keywords: ["hosting"],
          enabled: false,
          skipSimilarCheck: true,
        },
      },
    );
    expect(paused2.status).toBe(201);

    const [a, b] = await Promise.all([
      authedJson(
        app,
        `/api/saas/watch-profiles/${paused2.json.profile.id}/enabled`,
        {
          cookie,
          method: "PATCH",
          organizationId,
          body: { enabled: true },
        },
      ),
      authedJson(
        app,
        `/api/saas/watch-profiles/${paused2.json.profile.id}/enabled`,
        {
          cookie,
          method: "PATCH",
          organizationId,
          body: { enabled: true },
        },
      ),
    ]);
    expect(
      [a.status, b.status].every((s) => s === 409 || s === 403 || s === 200),
    ).toBe(true);
    const activeCount = await prisma.watchProfile.count({
      where: { organizationId, enabled: true },
    });
    expect(activeCount).toBeLessThanOrEqual(1);
  });

  it("keeps Free product email weekly-only; email opt-out does not gate matching catalog", async () => {
    expect(
      decideProductEmail({
        plan: FREE_PLAN,
        prefs: freePrefs(),
        type: "OPPORTUNITY_DIGEST",
        hasNewItems: true,
      }).reason,
    ).toBe("deferred_to_weekly_digest");

    expect(
      decideProductEmail({
        plan: FREE_PLAN,
        prefs: freePrefs({ emailEnabled: false }),
        type: "OPPORTUNITY_DIGEST",
        hasNewItems: true,
      }).reason,
    ).toBe("email_disabled");

    expect(
      decideProductEmail({
        plan: FREE_PLAN,
        prefs: freePrefs({ emailDeliveryMode: "IMMEDIATE" }),
        type: "NEW_OPPORTUNITY",
        matchScore: 99,
      }).reason,
    ).toBe("deferred_to_weekly_digest");

    // Shared ingest matching is gated by verified operator + enabled profile,
    // not by email prefs or periodicScansPerDay (digest-hour alias).
    expect(FREE_PLAN.periodicScansPerDay).toBe(0);
    expect(FREE_PLAN.maxDigestHoursPerDay).toBe(0);
    expect(FREE_PLAN.emailCadence).toBe("WEEKLY");
    expect(FREE_PLAN.maxActiveWatchProfiles).toBe(1);
  });

  it("does not degrade Basic limits for verified paid orgs", async () => {
    const { app } = createSaasTestApp(prisma);
    const { cookie } = await signUpAndGetCookie(app, {
      name: "Basic User",
      email: `basic-${Date.now()}@example.com`,
      password: "password123",
    });
    const me = await authedJson<{ userId: string }>(app, "/api/saas/me", {
      cookie,
    });
    const org = await authedJson<{ organization: { id: string } }>(
      app,
      "/api/saas/organizations",
      { cookie, body: { name: "Basic Org" } },
    );
    const organizationId = org.json.organization.id;
    await setOrgPlan(prisma, organizationId, PLAN_KEYS.basic);

    const access = await resolveOrganizationScanAccess(prisma, {
      userId: me.json.userId,
      organizationId,
    });
    expect(access.status).toBe("active");
    expect(access.limits.maxActiveWatchProfiles).toBe(5);
    expect(access.limits.periodicScansPerDay).toBe(2);
    expect(access.canRunManualProfileScan).toBe(true);
  });
});
