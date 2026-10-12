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
import {
  encryptSecret,
  decryptSecret,
} from "../src/saas/crypto/secrets.js";
import { decideSlackSend } from "../src/saas/services/slack-channel-policy.js";
import { sanitizeSlackText } from "../src/saas/services/slack-messages.js";
import {
  BASIC_PLAN,
  FREE_PLAN,
  PLAN_KEYS,
  PRO_PLAN,
  SLACK_NOTIFICATIONS_FEATURE_EL,
  TRIAL_PLAN,
  featuresElForDisplay,
} from "../src/saas/plans/catalog.js";
import { onSlackPlanDowngradeToFree } from "../src/saas/services/slack-connection.js";
import {
  postSlackIncomingWebhook,
  processSlackAttentionJob,
} from "../src/saas/services/slack-delivery.js";
import { enqueueSaasJob, SAAS_JOB_TYPES } from "../src/saas/jobs/outbox.js";
import { runSaasOutboxWorker } from "../src/saas/jobs/process-outbox.js";

const encryptionKey = randomBytes(32).toString("hex");

const enableSlackEnv = () => {
  process.env.SAAS_SLACK_NOTIFICATIONS_ENABLED = "true";
  process.env.SAAS_SLACK_CLIENT_ID = "test-client-id";
  process.env.SAAS_SLACK_CLIENT_SECRET = "test-client-secret";
  process.env.SAAS_SLACK_REDIRECT_URI =
    "http://127.0.0.1:3000/api/saas/integrations/slack/oauth/callback";
  process.env.SAAS_SECRETS_ENCRYPTION_KEY = encryptionKey;
};

const disableSlackEnv = () => {
  delete process.env.SAAS_SLACK_NOTIFICATIONS_ENABLED;
  delete process.env.SAAS_SLACK_CLIENT_ID;
  delete process.env.SAAS_SLACK_CLIENT_SECRET;
  delete process.env.SAAS_SLACK_REDIRECT_URI;
  delete process.env.SAAS_SECRETS_ENCRYPTION_KEY;
};

describe("Slack catalog entitlements", () => {
  it("gates Slack by plan", () => {
    expect(FREE_PLAN.slackNotifications).toBe(false);
    expect(BASIC_PLAN.slackNotifications).toBe(true);
    expect(PRO_PLAN.slackNotifications).toBe(true);
    expect(TRIAL_PLAN.slackNotifications).toBe(true);
    expect(BASIC_PLAN.featuresEl).toContain(SLACK_NOTIFICATIONS_FEATURE_EL);
    expect(featuresElForDisplay(BASIC_PLAN, false)).not.toContain(
      SLACK_NOTIFICATIONS_FEATURE_EL,
    );
    expect(featuresElForDisplay(BASIC_PLAN, true)).toContain(
      SLACK_NOTIFICATIONS_FEATURE_EL,
    );
  });
});

describe("Slack crypto + sanitize", () => {
  beforeEach(() => {
    process.env.SAAS_SECRETS_ENCRYPTION_KEY = encryptionKey;
  });
  afterEach(() => {
    delete process.env.SAAS_SECRETS_ENCRYPTION_KEY;
  });

  it("round-trips webhook encryption", () => {
    const url = "https://hooks.slack.com/services/T1/B1/xxx";
    const enc = encryptSecret(url);
    expect(enc.ciphertext).not.toContain("hooks.slack.com");
    expect(decryptSecret(enc)).toBe(url);
  });

  it("neutralizes @channel-style mentions in external text", () => {
    expect(sanitizeSlackText("Hello @channel and <!everyone>")).not.toMatch(
      /@channel|<!everyone>/,
    );
  });
});

describe("Slack channel policy", () => {
  it("blocks Free and unarmed connections", () => {
    expect(
      decideSlackSend({
        planKey: PLAN_KEYS.free,
        connectionStatus: "ACTIVE",
        notificationsArmed: true,
        preferences: { newOpportunity: true },
        type: "NEW_OPPORTUNITY",
        configured: true,
      }).allow,
    ).toBe(false);
    expect(
      decideSlackSend({
        planKey: PLAN_KEYS.basic,
        connectionStatus: "ACTIVE",
        notificationsArmed: false,
        preferences: { newOpportunity: true },
        type: "NEW_OPPORTUNITY",
        configured: true,
      }).reason,
    ).toBe("not_armed");
    expect(
      decideSlackSend({
        planKey: PLAN_KEYS.basic,
        connectionStatus: "ACTIVE",
        notificationsArmed: true,
        preferences: {
          newOpportunity: true,
          relatedActOnFollowed: false,
          deadlineRadar: false,
        },
        type: "NEW_OPPORTUNITY",
        configured: true,
      }).allow,
    ).toBe(true);
  });

  it("is independent of email being disabled", () => {
    process.env.EMAIL_ENABLED = "false";
    expect(
      decideSlackSend({
        planKey: PLAN_KEYS.pro,
        connectionStatus: "ACTIVE",
        notificationsArmed: true,
        preferences: { relatedActOnFollowed: true },
        type: "RELATED_PROC_DISCOVERED",
        configured: true,
      }).allow,
    ).toBe(true);
  });
});

describe("Slack SaaS API + delivery", () => {
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
    enableSlackEnv();
    fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("oauth.v2.access")) {
        return new Response(
          JSON.stringify({
            ok: true,
            team: { id: "T_TEST", name: "Acme Workspace" },
            incoming_webhook: {
              url: "https://hooks.slack.com/services/T_TEST/B_TEST/secret",
              channel: "#ops",
              channel_id: "C_TEST",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.includes("hooks.slack.com")) {
        return new Response("ok", { status: 200 });
      }
      return new Response("not mocked", { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    disableSlackEnv();
  });

  const signupOrg = async (email: string, plan: "free" | "basic" | "pro" | "trial" = "basic") => {
    const { cookie } = await signUpAndGetCookie(app, {
      name: "Owner",
      email,
      password: "Password123!",
    });
    const me = await authedJson<{
      userId: string;
      user: { id: string; emailVerified: boolean };
    }>(app, "/api/saas/me", { cookie });
    expect(me.status).toBe(200);
    const org = await authedJson<{ organization: { id: string } }>(
      app,
      "/api/saas/organizations",
      { cookie, body: { name: `Org ${email}` } },
    );
    expect(org.status).toBe(201);
    const orgId = org.json.organization.id;
    if (plan !== "free") {
      await setOrgPlan(prisma, orgId, PLAN_KEYS[plan]);
    } else {
      await setOrgPlan(prisma, orgId, PLAN_KEYS.free);
    }
    return { cookie, orgId, userId: me.json.userId };
  };

  it("hides feature when not configured", async () => {
    disableSlackEnv();
    const { cookie, orgId } = await signupOrg("nocfg@example.com", "basic");
    const res = await authedJson<{ configured: boolean; featureAvailable: boolean }>(
      app,
      "/api/saas/integrations/slack",
      { cookie, organizationId: orgId },
    );
    expect(res.status).toBe(200);
    expect(res.json.configured).toBe(false);
    expect(res.json.featureAvailable).toBe(false);
  });

  it("blocks Free from OAuth start", async () => {
    const { cookie, orgId } = await signupOrg("free@example.com", "free");
    const res = await authedJson<{ code?: string }>(
      app,
      "/api/saas/integrations/slack/oauth/start",
      { method: "POST", cookie, organizationId: orgId, body: {} },
    );
    expect(res.status).toBe(403);
  });

  it("blocks MEMBER and unverified OWNER", async () => {
    const owner = await signupOrg("owner-slack@example.com", "basic");
    const memberSignup = await signUpAndGetCookie(app, {
      name: "Member",
      email: "member-slack@example.com",
      password: "Password123!",
    });
    const memberMe = await authedJson<{ user: { id: string } }>(app, "/api/saas/me", {
      cookie: memberSignup.cookie,
    });
    await prisma.organizationMember.create({
      data: {
        organizationId: owner.orgId,
        userId: memberMe.json.user.id,
        role: "MEMBER",
      },
    });
    const memberRes = await authedJson(
      app,
      "/api/saas/integrations/slack/oauth/start",
      {
        method: "POST",
        cookie: memberSignup.cookie,
        organizationId: owner.orgId,
        body: {},
      },
    );
    expect(memberRes.status).toBe(403);

    await prisma.user.update({
      where: { id: owner.userId },
      data: { emailVerified: false },
    });
    const unverified = await authedJson(
      app,
      "/api/saas/integrations/slack/oauth/start",
      {
        method: "POST",
        cookie: owner.cookie,
        organizationId: owner.orgId,
        body: {},
      },
    );
    expect(unverified.status).toBe(403);
  });

  it("completes OAuth, keeps prefs paused until arm, and sends mock test", async () => {
    const { cookie, orgId, userId } = await signupOrg("oauth@example.com", "basic");
    const start = await authedJson<{ authorizeUrl: string }>(
      app,
      "/api/saas/integrations/slack/oauth/start",
      { method: "POST", cookie, organizationId: orgId, body: { purpose: "CONNECT" } },
    );
    expect(start.status).toBe(200);
    expect(start.json.authorizeUrl).toContain("slack.com/oauth/v2/authorize");
    expect(start.json.authorizeUrl).toContain("incoming-webhook");
    const state = new URL(start.json.authorizeUrl).searchParams.get("state")!;

    const callback = await app.request(
      `/api/saas/integrations/slack/oauth/callback?code=test-code&state=${state}`,
      { method: "GET", redirect: "manual" },
    );
    expect(callback.status).toBe(302);
    const location = callback.headers.get("location") ?? "";
    expect(location).toContain("slack=connected");

    const row = await prisma.organizationSlackConnection.findUniqueOrThrow({
      where: { organizationId: orgId },
    });
    expect(row.status).toBe("PAUSED");
    expect(row.notificationsArmed).toBe(false);
    expect(row.installedByUserId).toBe(userId);
    expect(row.webhookUrlCiphertext).toBeTruthy();
    expect(JSON.stringify(row)).not.toContain("hooks.slack.com/services");

    const view = await authedJson<{
      connection: { status: string; channelLabel: string } | null;
    }>(app, "/api/saas/integrations/slack", {
      cookie,
      organizationId: orgId,
    });
    expect(view.json.connection?.channelLabel).toBe("#ops");
    expect(JSON.stringify(view.json)).not.toContain("hooks.slack.com");

    const prefs = await authedJson(
      app,
      "/api/saas/integrations/slack/preferences",
      {
        method: "PUT",
        cookie,
        organizationId: orgId,
        body: {
          activate: true,
          preferences: {
            newOpportunity: true,
            relatedActOnFollowed: true,
            deadlineRadar: false,
          },
        },
      },
    );
    expect(prefs.status).toBe(200);

    const armed = await prisma.organizationSlackConnection.findUniqueOrThrow({
      where: { organizationId: orgId },
    });
    expect(armed.status).toBe("ACTIVE");
    expect(armed.notificationsArmed).toBe(true);

    const testRes = await authedJson<{ ok: boolean; messageEl: string }>(
      app,
      "/api/saas/integrations/slack/test",
      { method: "POST", cookie, organizationId: orgId, body: {} },
    );
    expect(testRes.status).toBe(200);
    expect(testRes.json.messageEl).toContain("#ops");
    expect(
      fetchMock.mock.calls.some((call) =>
        String(call[0]).includes("hooks.slack.com"),
      ),
    ).toBe(true);
  });

  it("rejects invalid / expired / replayed OAuth state", async () => {
    const { cookie, orgId } = await signupOrg("state@example.com", "basic");
    const start = await authedJson<{ authorizeUrl: string }>(
      app,
      "/api/saas/integrations/slack/oauth/start",
      { method: "POST", cookie, organizationId: orgId, body: {} },
    );
    const state = new URL(start.json.authorizeUrl).searchParams.get("state")!;

    const bad = await app.request(
      `/api/saas/integrations/slack/oauth/callback?code=x&state=not-real`,
      { redirect: "manual" },
    );
    expect(bad.headers.get("location")).toContain("invalid_state");

    await prisma.slackOAuthState.update({
      where: { state },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const expired = await app.request(
      `/api/saas/integrations/slack/oauth/callback?code=x&state=${state}`,
      { redirect: "manual" },
    );
    expect(expired.headers.get("location")).toContain("expired_state");

    await prisma.slackOAuthState.update({
      where: { state },
      data: { expiresAt: new Date(Date.now() + 60_000), consumedAt: null },
    });
    const ok = await app.request(
      `/api/saas/integrations/slack/oauth/callback?code=ok&state=${state}`,
      { redirect: "manual" },
    );
    expect(ok.headers.get("location")).toContain("slack=connected");
    const replay = await app.request(
      `/api/saas/integrations/slack/oauth/callback?code=ok&state=${state}`,
      { redirect: "manual" },
    );
    expect(replay.headers.get("location")).toMatch(/invalid_state|replayed_state/);
  });

  it("keeps previous connection when OAuth cancel happens", async () => {
    const { cookie, orgId } = await signupOrg("replace@example.com", "pro");
    const enc = encryptSecret("https://hooks.slack.com/services/T1/B1/old");
    await prisma.organizationSlackConnection.create({
      data: {
        organizationId: orgId,
        status: "ACTIVE",
        slackTeamId: "T_OLD",
        slackTeamName: "Old",
        slackChannelId: "C_OLD",
        slackChannelName: "alerts",
        webhookUrlCiphertext: enc.ciphertext,
        webhookUrlNonce: enc.nonce,
        notificationsArmed: true,
        preferences: {
          newOpportunity: true,
          relatedActOnFollowed: true,
          deadlineRadar: true,
        },
      },
    });
    const cancel = await app.request(
      `/api/saas/integrations/slack/oauth/callback?error=access_denied&state=x`,
      { redirect: "manual" },
    );
    expect(cancel.headers.get("location")).toContain("slack=cancelled");
    const still = await prisma.organizationSlackConnection.findUniqueOrThrow({
      where: { organizationId: orgId },
    });
    expect(still.slackTeamId).toBe("T_OLD");
    expect(still.slackChannelId).toBe("C_OLD");
  });

  it("cancels pending jobs and PLAN_PAUSES on Free downgrade", async () => {
    const { orgId } = await signupOrg("down@example.com", "basic");
    const enc = encryptSecret("https://hooks.slack.com/services/T1/B1/x");
    const conn = await prisma.organizationSlackConnection.create({
      data: {
        organizationId: orgId,
        status: "ACTIVE",
        slackTeamId: "T1",
        slackTeamName: "T",
        slackChannelId: "C1",
        slackChannelName: "ops",
        webhookUrlCiphertext: enc.ciphertext,
        webhookUrlNonce: enc.nonce,
        notificationsArmed: true,
        preferences: { newOpportunity: true },
      },
    });
    await enqueueSaasJob(prisma, {
      type: SAAS_JOB_TYPES.slackAttention,
      deliveryKey: `SLACK:${conn.id}:evt1`,
      organizationId: orgId,
      payload: { connectionId: conn.id, attentionEventId: "evt1" },
    });
    await onSlackPlanDowngradeToFree(prisma, orgId);
    const updated = await prisma.organizationSlackConnection.findUniqueOrThrow({
      where: { id: conn.id },
    });
    expect(updated.status).toBe("PLAN_PAUSED");
    const jobs = await prisma.saasJob.findMany({ where: { organizationId: orgId } });
    expect(jobs.every((j) => j.status === "CANCELLED")).toBe(true);
  });

  it("disconnect deletes credentials and cancels jobs", async () => {
    const { cookie, orgId } = await signupOrg("disc@example.com", "basic");
    const enc = encryptSecret("https://hooks.slack.com/services/T1/B1/x");
    const conn = await prisma.organizationSlackConnection.create({
      data: {
        organizationId: orgId,
        status: "ACTIVE",
        slackTeamId: "T1",
        slackTeamName: "T",
        slackChannelId: "C1",
        slackChannelName: "ops",
        webhookUrlCiphertext: enc.ciphertext,
        webhookUrlNonce: enc.nonce,
        notificationsArmed: true,
        preferences: { newOpportunity: true },
      },
    });
    await enqueueSaasJob(prisma, {
      type: SAAS_JOB_TYPES.slackOpportunityBatch,
      deliveryKey: `SLACK_OPP_BATCH:${conn.id}:1`,
      organizationId: orgId,
      payload: { connectionId: conn.id, windowKey: "1" },
    });
    const res = await authedJson(app, "/api/saas/integrations/slack/disconnect", {
      method: "POST",
      cookie,
      organizationId: orgId,
      body: {},
    });
    expect(res.status).toBe(200);
    expect(
      await prisma.organizationSlackConnection.findUnique({
        where: { organizationId: orgId },
      }),
    ).toBeNull();
    const jobs = await prisma.saasJob.findMany({ where: { organizationId: orgId } });
    expect(jobs.every((j) => j.status === "CANCELLED")).toBe(true);
  });

  it("marks NEEDS_RECONNECT on permanent webhook failure and skips retries", async () => {
    const { orgId } = await signupOrg("revoked@example.com", "basic");
    const enc = encryptSecret("https://hooks.slack.com/services/T1/B1/dead");
    const conn = await prisma.organizationSlackConnection.create({
      data: {
        organizationId: orgId,
        status: "ACTIVE",
        slackTeamId: "T1",
        slackTeamName: "T",
        slackChannelId: "C1",
        slackChannelName: "ops",
        webhookUrlCiphertext: enc.ciphertext,
        webhookUrlNonce: enc.nonce,
        notificationsArmed: true,
        preferences: { relatedActOnFollowed: true },
      },
    });
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      if (String(input).includes("hooks.slack.com")) {
        return new Response("no_service", { status: 404 });
      }
      return new Response("ok", { status: 200 });
    });
    const result = await postSlackIncomingWebhook(prisma, {
      connectionId: conn.id,
      payload: { text: "hi", blocks: [] },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.permanent).toBe(true);
    const updated = await prisma.organizationSlackConnection.findUniqueOrThrow({
      where: { id: conn.id },
    });
    expect(updated.status).toBe("NEEDS_RECONNECT");
  });

  it("processes Slack attention job with mock webhook (no external send)", async () => {
    const { orgId } = await signupOrg("job@example.com", "basic");
    const enc = encryptSecret("https://hooks.slack.com/services/T1/B1/ok");
    const conn = await prisma.organizationSlackConnection.create({
      data: {
        organizationId: orgId,
        status: "ACTIVE",
        slackTeamId: "T1",
        slackTeamName: "T",
        slackChannelId: "C1",
        slackChannelName: "ops",
        webhookUrlCiphertext: enc.ciphertext,
        webhookUrlNonce: enc.nonce,
        notificationsArmed: true,
        preferences: {
          newOpportunity: false,
          relatedActOnFollowed: true,
          deadlineRadar: false,
        },
      },
    });
    const tender = await prisma.tender.create({
      data: {
        referenceNumber: "REQ-SLACK-1",
        recordType: "REQ",
        title: "Δοκιμή @channel",
        contractingAuthority: "Δήμος",
        budgetWithoutVat: 10000,
        finalSubmissionDate: new Date(Date.now() + 86400000),
        firstSeenAt: new Date(),
        lastSeenAt: new Date(),
      },
    });
    const orgTender = await prisma.organizationTender.create({
      data: {
        organizationId: orgId,
        tenderId: tender.id,
        following: true,
        relevanceStatus: "RELEVANT",
      },
    });
    const event = await prisma.organizationAttentionEvent.create({
      data: {
        organizationId: orgId,
        organizationTenderId: orgTender.id,
        type: "RELATED_PROC_DISCOVERED",
        title: "Νέα σχετική πράξη",
        dedupeKey: `RELATED:${tender.id}`,
      },
    });
    const { job } = await enqueueSaasJob(prisma, {
      type: SAAS_JOB_TYPES.slackAttention,
      deliveryKey: `SLACK:${conn.id}:${event.id}`,
      organizationId: orgId,
      payload: { connectionId: conn.id, attentionEventId: event.id },
      availableAt: new Date(Date.now() - 1000),
    });
    const outcome = await processSlackAttentionJob(prisma, job);
    expect(outcome).toBe("ok");
    const delivery = await prisma.notificationDelivery.findFirst({
      where: { organizationId: orgId, channel: "SLACK" },
    });
    expect(delivery?.status).toBe("SENT");
    const body = fetchMock.mock.calls.find((c) =>
      String(c[0]).includes("hooks.slack.com"),
    )?.[1]?.body;
    expect(String(body)).toContain("Προβολή στο ARC Tenders");
    expect(String(body)).not.toContain("@channel");
  });

  it("trial plan can start OAuth; expired trial path uses Free entitlement", async () => {
    const { cookie, orgId } = await signupOrg("trial@example.com", "trial");
    const start = await authedJson(
      app,
      "/api/saas/integrations/slack/oauth/start",
      { method: "POST", cookie, organizationId: orgId, body: {} },
    );
    expect(start.status).toBe(200);

    await setOrgPlan(prisma, orgId, PLAN_KEYS.free);
    const freeStart = await authedJson(
      app,
      "/api/saas/integrations/slack/oauth/start",
      { method: "POST", cookie, organizationId: orgId, body: {} },
    );
    expect(freeStart.status).toBe(403);
  });

  it("outbox worker routes Slack job types", async () => {
    const { orgId } = await signupOrg("worker@example.com", "basic");
    // No connection → handler skips
    await enqueueSaasJob(prisma, {
      type: SAAS_JOB_TYPES.slackOpportunityBatch,
      deliveryKey: `SLACK_OPP_BATCH:missing:1`,
      organizationId: orgId,
      payload: { connectionId: "missing", windowKey: "1" },
      availableAt: new Date(Date.now() - 1000),
    });
    const result = await runSaasOutboxWorker(prisma, { limit: 5 });
    expect(result.processed).toBeGreaterThanOrEqual(1);
  });
});
