import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import {
  authedJson,
  createSaasTestApp,
  getSaasTestPrisma,
  resetSaasDatabase,
  setOrgPlan,
  signUpAndGetCookie,
} from "./helpers/saas-test.js";
import { encryptSecret } from "../src/saas/crypto/secrets.js";
import {
  BASIC_PLAN,
  FREE_PLAN,
  GOOGLE_CALENDAR_FEATURE_EL,
  PLAN_KEYS,
  PRO_PLAN,
  TRIAL_PLAN,
  featuresElForDisplay,
} from "../src/saas/plans/catalog.js";
import {
  addUtcDays,
  buildDeadlineEventContent,
  formatUtcDateOnly,
  isFutureOrTodayDeadline,
  isUtcMidnight,
  parseTenderDeadline,
} from "../src/saas/services/google-calendar-events.js";
import { processGoogleCalendarFullSyncJob } from "../src/saas/services/google-calendar-sync.js";
import { SAAS_JOB_TYPES } from "../src/saas/jobs/outbox.js";
import { onGooglePlanDowngradeToFree } from "../src/saas/services/google-connection.js";

const encryptionKey = randomBytes(32).toString("hex");

const enableGoogleCalendarEnv = () => {
  process.env.SAAS_GOOGLE_CALENDAR_ENABLED = "true";
  process.env.SAAS_GOOGLE_CLIENT_ID = "test-google-client";
  process.env.SAAS_GOOGLE_CLIENT_SECRET = "test-google-secret";
  process.env.SAAS_GOOGLE_REDIRECT_URI =
    "http://127.0.0.1:3000/api/saas/integrations/google/oauth/callback";
  process.env.SAAS_SECRETS_ENCRYPTION_KEY = encryptionKey;
};

const disableGoogleEnv = () => {
  delete process.env.SAAS_GOOGLE_CALENDAR_ENABLED;
  delete process.env.SAAS_GOOGLE_DRIVE_ENABLED;
  delete process.env.SAAS_GOOGLE_SHEETS_ENABLED;
  delete process.env.SAAS_GOOGLE_CLIENT_ID;
  delete process.env.SAAS_GOOGLE_CLIENT_SECRET;
  delete process.env.SAAS_GOOGLE_REDIRECT_URI;
  delete process.env.SAAS_SECRETS_ENCRYPTION_KEY;
};

describe("Google catalog entitlements", () => {
  it("gates Calendar by plan and hides marketing until live", () => {
    expect(FREE_PLAN.googleCalendar).toBe(false);
    expect(BASIC_PLAN.googleCalendar).toBe(true);
    expect(PRO_PLAN.googleCalendar).toBe(true);
    expect(TRIAL_PLAN.googleCalendar).toBe(true);
    expect(BASIC_PLAN.featuresEl).toContain(GOOGLE_CALENDAR_FEATURE_EL);
    expect(
      featuresElForDisplay(BASIC_PLAN, { slack: true, googleCalendar: false }),
    ).not.toContain(GOOGLE_CALENDAR_FEATURE_EL);
    expect(
      featuresElForDisplay(BASIC_PLAN, { slack: true, googleCalendar: true }),
    ).toContain(GOOGLE_CALENDAR_FEATURE_EL);
  });
});

describe("Google Calendar deadline parsing", () => {
  it("treats UTC midnight as all-day with exclusive end", () => {
    const d = new Date("2026-11-15T00:00:00.000Z");
    expect(isUtcMidnight(d)).toBe(true);
    const parsed = parseTenderDeadline(d)!;
    expect(parsed.kind).toBe("all_day");
    expect(parsed.date).toBe("2026-11-15");
    expect(parsed.endDateExclusive).toBe(
      formatUtcDateOnly(addUtcDays(d, 1)),
    );
    const content = buildDeadlineEventContent({
      title: "Τίτλος",
      authority: "Δήμος",
      source: "PROC",
      reference: "26PROC1",
      arcUrl: "https://example.test/app/tenders/1",
      deadline: parsed,
    });
    expect(content.start).toEqual({ date: "2026-11-15" });
    expect(content.end).toEqual({ date: "2026-11-16" });
    expect(content.description).toContain("Προθεσμία υποβολής");
  });

  it("keeps timed deadlines exact and never invents 23:59", () => {
    const d = new Date("2026-11-15T14:30:00.000Z");
    const parsed = parseTenderDeadline(d)!;
    expect(parsed.kind).toBe("timed");
    expect(parsed.dateTime).toBe(d.toISOString());
    expect(JSON.stringify(parsed)).not.toContain("23:59");
  });

  it("filters past deadlines from initial sync", () => {
    const past = new Date("2020-01-01T00:00:00.000Z");
    const future = new Date(Date.now() + 86400000);
    future.setUTCHours(0, 0, 0, 0);
    expect(isFutureOrTodayDeadline(past)).toBe(false);
    expect(isFutureOrTodayDeadline(future)).toBe(true);
  });
});

describe("Google Calendar SaaS API + sync (mocked Google)", () => {
  const prisma = getSaasTestPrisma();
  const { app } = createSaasTestApp(prisma);
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetSaasDatabase(prisma);
    enableGoogleCalendarEnv();
    fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("oauth2.googleapis.com/token")) {
        return new Response(
          JSON.stringify({
            access_token: "ya29.test-access",
            expires_in: 3600,
            refresh_token: "1//test-refresh",
            scope:
              "openid email https://www.googleapis.com/auth/calendar.app.created",
            token_type: "Bearer",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.includes("openidconnect.googleapis.com/v1/userinfo")) {
        return new Response(
          JSON.stringify({
            sub: "google-sub-1",
            email: "user@gmail.com",
            email_verified: true,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (
        url.includes("/calendar/v3/calendars") &&
        (!init?.method || init.method === "POST") &&
        !url.includes("/events")
      ) {
        return new Response(
          JSON.stringify({
            id: "cal_arc_1",
            summary: "ARC Tenders — Org",
            htmlLink: "https://calendar.google.com/calendar/r?cid=cal_arc_1",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.includes("/calendar/v3/calendars/cal_arc_1") && !url.includes("/events")) {
        return new Response(
          JSON.stringify({ id: "cal_arc_1", summary: "ARC Tenders — Org" }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.includes("/events") && init?.method === "POST") {
        return new Response(
          JSON.stringify({ id: "evt_1", htmlLink: "https://calendar.google.com/event?eid=1" }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.includes("/events/") && init?.method === "PATCH") {
        return new Response(JSON.stringify({ id: "evt_1" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.includes("/events/") && init?.method === "DELETE") {
        return new Response(null, { status: 204 });
      }
      return new Response("not mocked", { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    disableGoogleEnv();
  });

  const signupOrg = async (
    email: string,
    plan: "free" | "basic" | "pro" | "trial" = "basic",
  ) => {
    const { cookie } = await signUpAndGetCookie(app, {
      name: "Owner",
      email,
      password: "Password123!",
    });
    const me = await authedJson<{ userId: string }>(app, "/api/saas/me", {
      cookie,
    });
    const org = await authedJson<{ organization: { id: string } }>(
      app,
      "/api/saas/organizations",
      { cookie, body: { name: `Org ${email}` } },
    );
    const orgId = org.json.organization.id;
    await setOrgPlan(prisma, orgId, PLAN_KEYS[plan]);
    return { cookie, orgId, userId: me.json.userId };
  };

  it("hides Calendar when flag/secrets missing", async () => {
    disableGoogleEnv();
    const { cookie, orgId } = await signupOrg("g-off@example.com", "basic");
    enableGoogleCalendarEnv();
    delete process.env.SAAS_GOOGLE_CALENDAR_ENABLED;
    const res = await authedJson<{
      calendar: { featureAvailable: boolean };
    }>(app, "/api/saas/integrations/google", {
      cookie,
      organizationId: orgId,
    });
    expect(res.status).toBe(200);
    expect(res.json.calendar.featureAvailable).toBe(false);
  });

  it("blocks Free from OAuth start", async () => {
    const { cookie, orgId } = await signupOrg("g-free@example.com", "free");
    const res = await authedJson(app, "/api/saas/integrations/google/oauth/start", {
      method: "POST",
      cookie,
      organizationId: orgId,
      body: { capabilities: ["calendar"] },
    });
    expect(res.status).toBe(403);
  });

  it("blocks unverified users", async () => {
    const { cookie, orgId, userId } = await signupOrg(
      "g-unverified@example.com",
      "basic",
    );
    await prisma.user.update({
      where: { id: userId },
      data: { emailVerified: false },
    });
    const res = await authedJson(app, "/api/saas/integrations/google/oauth/start", {
      method: "POST",
      cookie,
      organizationId: orgId,
      body: { capabilities: ["calendar"] },
    });
    expect(res.status).toBe(403);
  });

  it("completes OAuth with PKCE, creates calendar, never leaks tokens", async () => {
    const { cookie, orgId, userId } = await signupOrg(
      "g-oauth@example.com",
      "basic",
    );
    const start = await authedJson<{ authorizeUrl: string }>(
      app,
      "/api/saas/integrations/google/oauth/start",
      {
        method: "POST",
        cookie,
        organizationId: orgId,
        body: { capabilities: ["calendar"] },
      },
    );
    expect(start.status).toBe(200);
    expect(start.json.authorizeUrl).toContain("accounts.google.com");
    expect(start.json.authorizeUrl).toContain("code_challenge");
    expect(start.json.authorizeUrl).toContain("calendar.app.created");
    expect(start.json.authorizeUrl).toContain("access_type=offline");
    const state = new URL(start.json.authorizeUrl).searchParams.get("state")!;

    const callback = await app.request(
      `/api/saas/integrations/google/oauth/callback?code=test-code&state=${state}`,
      { redirect: "manual" },
    );
    expect(callback.status).toBe(302);
    expect(callback.headers.get("location")).toContain("google=connected");

    const row = await prisma.userOrganizationGoogleConnection.findUniqueOrThrow({
      where: {
        organizationId_userId: { organizationId: orgId, userId },
      },
    });
    expect(row.googleEmail).toBe("user@gmail.com");
    expect(row.calendarId).toBe("cal_arc_1");
    expect(row.calendarStatus).toBe("SYNCING");
    expect(JSON.stringify(row)).not.toContain("1//test-refresh");
    expect(JSON.stringify(row)).not.toContain("ya29.test-access");

    const view = await authedJson<{
      calendar: { status: string; googleEmail: string };
    }>(app, "/api/saas/integrations/google", {
      cookie,
      organizationId: orgId,
    });
    expect(view.json.calendar.googleEmail).toBe("user@gmail.com");
    expect(JSON.stringify(view.json)).not.toContain("ya29");
    expect(JSON.stringify(view.json)).not.toContain("1//");

    // Replay rejected.
    const replay = await app.request(
      `/api/saas/integrations/google/oauth/callback?code=test-code&state=${state}`,
      { redirect: "manual" },
    );
    expect(replay.headers.get("location")).toMatch(/invalid_state|replayed_state/);
  });

  it("full sync creates idempotent event links without duplicate inserts", async () => {
    const { orgId, userId } = await signupOrg("g-sync@example.com", "pro");
    const enc = encryptSecret("1//refresh");
    const access = encryptSecret("ya29.access");
    const conn = await prisma.userOrganizationGoogleConnection.create({
      data: {
        organizationId: orgId,
        userId,
        googleAccountId: "sub1",
        googleEmail: "u@gmail.com",
        refreshTokenCiphertext: enc.ciphertext,
        refreshTokenNonce: enc.nonce,
        accessTokenCiphertext: access.ciphertext,
        accessTokenNonce: access.nonce,
        accessTokenExpiresAt: new Date(Date.now() + 3600_000),
        grantedScopes:
          "openid email https://www.googleapis.com/auth/calendar.app.created",
        tokenStatus: "ACTIVE",
        calendarStatus: "SYNCING",
        calendarId: "cal_arc_1",
        calendarSummary: "ARC Tenders — Org",
      },
    });
    const deadline = new Date(Date.now() + 5 * 86400000);
    deadline.setUTCHours(0, 0, 0, 0);
    const tender = await prisma.tender.create({
      data: {
        referenceNumber: "REQ-GCAL-1",
        recordType: "REQ",
        title: "Δοκιμή ημερολογίου",
        contractingAuthority: "Δήμος",
        finalSubmissionDate: deadline,
        firstSeenAt: new Date(),
        lastSeenAt: new Date(),
      },
    });
    const ot = await prisma.organizationTender.create({
      data: {
        organizationId: orgId,
        tenderId: tender.id,
        following: true,
        monitoringActive: true,
      },
    });

    const job = await prisma.saasJob.create({
      data: {
        type: SAAS_JOB_TYPES.googleCalendarFullSync,
        deliveryKey: `GICAL_FULL:${conn.id}:test`,
        organizationId: orgId,
        payload: {
          connectionId: conn.id,
          userId,
          organizationId: orgId,
        },
        status: "PENDING",
      },
    });

    const first = await processGoogleCalendarFullSyncJob(prisma, job);
    expect(first).toBe("ok");
    const links1 = await prisma.googleCalendarEventLink.findMany({
      where: { connectionId: conn.id },
    });
    expect(links1).toHaveLength(1);
    expect(links1[0]?.organizationTenderId).toBe(ot.id);

    const second = await processGoogleCalendarFullSyncJob(prisma, job);
    expect(second).toBe("ok");
    const links2 = await prisma.googleCalendarEventLink.findMany({
      where: { connectionId: conn.id },
    });
    expect(links2).toHaveLength(1);

    const postCalls = fetchMock.mock.calls.filter(
      (c) =>
        String(c[0]).includes("/events") &&
        (c[1] as RequestInit | undefined)?.method === "POST",
    );
    expect(postCalls.length).toBe(1);

    const updated = await prisma.userOrganizationGoogleConnection.findUniqueOrThrow({
      where: { id: conn.id },
    });
    expect(updated.calendarStatus).toBe("ACTIVE");
    expect(updated.calendarLastSuccessAt).not.toBeNull();
  });

  it("pause keeps connection and cancels pending sync jobs", async () => {
    const { cookie, orgId, userId } = await signupOrg("g-pause@example.com", "basic");
    const enc = encryptSecret("1//r");
    const conn = await prisma.userOrganizationGoogleConnection.create({
      data: {
        organizationId: orgId,
        userId,
        googleAccountId: "sub",
        googleEmail: "u@gmail.com",
        refreshTokenCiphertext: enc.ciphertext,
        refreshTokenNonce: enc.nonce,
        grantedScopes:
          "openid email https://www.googleapis.com/auth/calendar.app.created",
        tokenStatus: "ACTIVE",
        calendarStatus: "ACTIVE",
        calendarId: "cal_arc_1",
      },
    });
    await prisma.saasJob.create({
      data: {
        type: SAAS_JOB_TYPES.googleCalendarFullSync,
        deliveryKey: `GICAL_FULL:${conn.id}:pending`,
        organizationId: orgId,
        payload: { connectionId: conn.id, userId, organizationId: orgId },
        status: "PENDING",
      },
    });
    const res = await authedJson<{
      calendar: { status: string };
    }>(app, "/api/saas/integrations/google/calendar/pause", {
      method: "POST",
      cookie,
      organizationId: orgId,
      body: { paused: true },
    });
    expect(res.status).toBe(200);
    expect(res.json.calendar.status).toBe("PAUSED");
    const jobs = await prisma.saasJob.findMany({
      where: { deliveryKey: `GICAL_FULL:${conn.id}:pending` },
    });
    expect(jobs[0]?.status).toBe("CANCELLED");
  });

  it("downgrade to Free plan-pauses Calendar", async () => {
    const { orgId, userId } = await signupOrg("g-down@example.com", "basic");
    const enc = encryptSecret("1//r");
    await prisma.userOrganizationGoogleConnection.create({
      data: {
        organizationId: orgId,
        userId,
        googleAccountId: "sub",
        googleEmail: "u@gmail.com",
        refreshTokenCiphertext: enc.ciphertext,
        refreshTokenNonce: enc.nonce,
        grantedScopes: "openid email",
        tokenStatus: "ACTIVE",
        calendarStatus: "ACTIVE",
        calendarId: "cal_arc_1",
      },
    });
    await onGooglePlanDowngradeToFree(prisma, orgId);
    const row = await prisma.userOrganizationGoogleConnection.findFirstOrThrow({
      where: { organizationId: orgId },
    });
    expect(row.calendarStatus).toBe("PLAN_PAUSED");
  });

  it("cancel OAuth keeps previous connection", async () => {
    const { orgId, userId } = await signupOrg("g-cancel@example.com", "basic");
    const enc = encryptSecret("1//r");
    await prisma.userOrganizationGoogleConnection.create({
      data: {
        organizationId: orgId,
        userId,
        googleAccountId: "old",
        googleEmail: "old@gmail.com",
        refreshTokenCiphertext: enc.ciphertext,
        refreshTokenNonce: enc.nonce,
        grantedScopes: "openid email",
        tokenStatus: "ACTIVE",
        calendarStatus: "ACTIVE",
        calendarId: "cal_old",
      },
    });
    const cancel = await app.request(
      `/api/saas/integrations/google/oauth/callback?error=access_denied&state=x`,
      { redirect: "manual" },
    );
    expect(cancel.headers.get("location")).toContain("google=cancelled");
    const still = await prisma.userOrganizationGoogleConnection.findFirstOrThrow({
      where: { organizationId: orgId },
    });
    expect(still.calendarId).toBe("cal_old");
    expect(still.googleEmail).toBe("old@gmail.com");
  });
});
