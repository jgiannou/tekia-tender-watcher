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
import {
  deriveSlackDeliveryState,
  slackDeliveryStateIsLive,
  slackTestResultMessageEl,
} from "../src/saas/services/slack-delivery-state.js";
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

describe("Slack delivery state (UI)", () => {
  const prefsOn = {
    newOpportunity: true,
    relatedActOnFollowed: false,
    deadlineRadar: false,
  };
  const prefsOff = {
    newOpportunity: false,
    relatedActOnFollowed: false,
    deadlineRadar: false,
  };

  it("maps active / paused / setup / none / reconnect / plan-paused", () => {
    expect(
      deriveSlackDeliveryState({
        status: "ACTIVE",
        notificationsArmed: true,
        preferences: prefsOn,
      }),
    ).toBe("ACTIVE");
    expect(
      deriveSlackDeliveryState({
        status: "PAUSED",
        notificationsArmed: true,
        preferences: prefsOn,
      }),
    ).toBe("PAUSED");
    expect(
      deriveSlackDeliveryState({
        status: "PAUSED",
        notificationsArmed: false,
        preferences: prefsOff,
      }),
    ).toBe("SETUP_INCOMPLETE");
    expect(
      deriveSlackDeliveryState({
        status: "ACTIVE",
        notificationsArmed: true,
        preferences: prefsOff,
      }),
    ).toBe("NO_CATEGORIES");
    expect(
      deriveSlackDeliveryState({
        status: "NEEDS_RECONNECT",
        notificationsArmed: true,
        preferences: prefsOn,
      }),
    ).toBe("NEEDS_RECONNECT");
    expect(
      deriveSlackDeliveryState({
        status: "PLAN_PAUSED",
        notificationsArmed: true,
        preferences: prefsOn,
      }),
    ).toBe("PLAN_PAUSED");
  });

  it("only ACTIVE is a live (green) delivery indicator", () => {
    expect(slackDeliveryStateIsLive("ACTIVE")).toBe(true);
    expect(slackDeliveryStateIsLive("PAUSED")).toBe(false);
    expect(slackDeliveryStateIsLive("NO_CATEGORIES")).toBe(false);
    expect(slackDeliveryStateIsLive("SETUP_INCOMPLETE")).toBe(false);
    expect(slackDeliveryStateIsLive("NEEDS_RECONNECT")).toBe(false);
    expect(slackDeliveryStateIsLive("PLAN_PAUSED")).toBe(false);
  });

  it("distinguishes queued vs delivered test copy", () => {
    expect(
      slackTestResultMessageEl({ delivery: "queued", channelLabel: "#ops" }),
    ).toContain("προγραμματίστηκε");
    expect(
      slackTestResultMessageEl({ delivery: "delivered", channelLabel: "#ops" }),
    ).toBe("Η δοκιμαστική ειδοποίηση στάλθηκε στο #ops.");
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

  it("exposes deliveryState and never returns webhook secrets", async () => {
    const { cookie, orgId } = await signupOrg("view-state@example.com", "basic");
    const enc = encryptSecret("https://hooks.slack.com/services/T1/B1/secret");
    await prisma.organizationSlackConnection.create({
      data: {
        organizationId: orgId,
        status: "PAUSED",
        slackTeamId: "T1",
        slackTeamName: "TEKIA",
        slackChannelId: "C1",
        slackChannelName: "arc-tenders",
        webhookUrlCiphertext: enc.ciphertext,
        webhookUrlNonce: enc.nonce,
        notificationsArmed: false,
        preferences: {
          newOpportunity: false,
          relatedActOnFollowed: false,
          deadlineRadar: false,
        },
      },
    });
    const res = await authedJson<{
      connection: {
        deliveryState: string;
        deliveryStateLabelEl: string;
        channelLabel: string;
      } | null;
    }>(app, "/api/saas/integrations/slack", {
      cookie,
      organizationId: orgId,
    });
    expect(res.status).toBe(200);
    expect(res.json.connection?.deliveryState).toBe("SETUP_INCOMPLETE");
    expect(res.json.connection?.channelLabel).toBe("#arc-tenders");
    expect(JSON.stringify(res.json)).not.toContain("hooks.slack.com");
    expect(JSON.stringify(res.json)).not.toContain("Add to Slack");
  });

  it("saves preferences without lifting an existing pause", async () => {
    const { cookie, orgId } = await signupOrg("pref-pause@example.com", "basic");
    const enc = encryptSecret("https://hooks.slack.com/services/T1/B1/x");
    await prisma.organizationSlackConnection.create({
      data: {
        organizationId: orgId,
        status: "PAUSED",
        slackTeamId: "T1",
        slackTeamName: "T",
        slackChannelId: "C1",
        slackChannelName: "ops",
        webhookUrlCiphertext: enc.ciphertext,
        webhookUrlNonce: enc.nonce,
        notificationsArmed: true,
        preferences: {
          newOpportunity: true,
          relatedActOnFollowed: false,
          deadlineRadar: false,
        },
      },
    });
    const res = await authedJson<{
      connection: { status: string; preferences: { deadlineRadar: boolean } };
    }>(app, "/api/saas/integrations/slack/preferences", {
      method: "PUT",
      cookie,
      organizationId: orgId,
      body: {
        activate: false,
        preferences: {
          newOpportunity: true,
          relatedActOnFollowed: true,
          deadlineRadar: true,
        },
      },
    });
    expect(res.status).toBe(200);
    expect(res.json.connection.status).toBe("PAUSED");
    expect(res.json.connection.preferences.deadlineRadar).toBe(true);
  });

  it("allows saving all categories off without disconnecting", async () => {
    const { cookie, orgId } = await signupOrg("pref-off@example.com", "basic");
    const enc = encryptSecret("https://hooks.slack.com/services/T1/B1/x");
    await prisma.organizationSlackConnection.create({
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
          newOpportunity: true,
          relatedActOnFollowed: false,
          deadlineRadar: false,
        },
      },
    });
    const res = await authedJson<{
      connection: { status: string; deliveryState: string };
    }>(app, "/api/saas/integrations/slack/preferences", {
      method: "PUT",
      cookie,
      organizationId: orgId,
      body: {
        activate: false,
        preferences: {
          newOpportunity: false,
          relatedActOnFollowed: false,
          deadlineRadar: false,
        },
      },
    });
    expect(res.status).toBe(200);
    expect(res.json.connection.status).toBe("ACTIVE");
    expect(res.json.connection.deliveryState).toBe("NO_CATEGORIES");
  });

  it("rejects first activate without a category; pause/resume without OAuth", async () => {
    const { cookie, orgId } = await signupOrg("pause-resume@example.com", "basic");
    const enc = encryptSecret("https://hooks.slack.com/services/T1/B1/x");
    await prisma.organizationSlackConnection.create({
      data: {
        organizationId: orgId,
        status: "PAUSED",
        slackTeamId: "T1",
        slackTeamName: "T",
        slackChannelId: "C1",
        slackChannelName: "ops",
        webhookUrlCiphertext: enc.ciphertext,
        webhookUrlNonce: enc.nonce,
        notificationsArmed: false,
        preferences: {
          newOpportunity: false,
          relatedActOnFollowed: false,
          deadlineRadar: false,
        },
      },
    });
    const badArm = await authedJson(
      app,
      "/api/saas/integrations/slack/preferences",
      {
        method: "PUT",
        cookie,
        organizationId: orgId,
        body: {
          activate: true,
          preferences: {
            newOpportunity: false,
            relatedActOnFollowed: false,
            deadlineRadar: false,
          },
        },
      },
    );
    expect(badArm.status).toBe(400);

    const arm = await authedJson<{ connection: { status: string } }>(
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
            relatedActOnFollowed: false,
            deadlineRadar: false,
          },
        },
      },
    );
    expect(arm.status).toBe(200);
    expect(arm.json.connection.status).toBe("ACTIVE");

    await enqueueSaasJob(prisma, {
      type: SAAS_JOB_TYPES.slackAttention,
      deliveryKey: `SLACK:pause-test:1`,
      organizationId: orgId,
      payload: { connectionId: "x", attentionEventId: "1" },
    });
    const paused = await authedJson<{ connection: { status: string } }>(
      app,
      "/api/saas/integrations/slack/pause",
      {
        method: "POST",
        cookie,
        organizationId: orgId,
        body: { paused: true },
      },
    );
    expect(paused.status).toBe(200);
    expect(paused.json.connection.status).toBe("PAUSED");
    const jobs = await prisma.saasJob.findMany({ where: { organizationId: orgId } });
    expect(jobs.every((j) => j.status === "CANCELLED")).toBe(true);

    const oauthCallsBefore = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes("oauth"),
    ).length;
    const resumed = await authedJson<{ connection: { status: string } }>(
      app,
      "/api/saas/integrations/slack/pause",
      {
        method: "POST",
        cookie,
        organizationId: orgId,
        body: { paused: false },
      },
    );
    expect(resumed.status).toBe(200);
    expect(resumed.json.connection.status).toBe("ACTIVE");
    const oauthCallsAfter = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes("oauth"),
    ).length;
    expect(oauthCallsAfter).toBe(oauthCallsBefore);
  });

  it("blocks resume without categories; test sets timestamp only after delivery", async () => {
    const { cookie, orgId } = await signupOrg("test-ts@example.com", "basic");
    const enc = encryptSecret("https://hooks.slack.com/services/T1/B1/ok");
    await prisma.organizationSlackConnection.create({
      data: {
        organizationId: orgId,
        status: "PAUSED",
        slackTeamId: "T1",
        slackTeamName: "T",
        slackChannelId: "C1",
        slackChannelName: "ops",
        webhookUrlCiphertext: enc.ciphertext,
        webhookUrlNonce: enc.nonce,
        notificationsArmed: true,
        preferences: {
          newOpportunity: false,
          relatedActOnFollowed: false,
          deadlineRadar: false,
        },
      },
    });
    const noResume = await authedJson(
      app,
      "/api/saas/integrations/slack/pause",
      {
        method: "POST",
        cookie,
        organizationId: orgId,
        body: { paused: false },
      },
    );
    expect(noResume.status).toBe(400);

    // Explicit test may run while manually paused.
    const testRes = await authedJson<{
      ok: boolean;
      delivery: string;
      messageEl: string;
      lastTestSentAt: string;
    }>(app, "/api/saas/integrations/slack/test", {
      method: "POST",
      cookie,
      organizationId: orgId,
      body: {},
    });
    expect(testRes.status).toBe(200);
    expect(testRes.json.delivery).toBe("delivered");
    expect(testRes.json.messageEl).toContain("στάλθηκε");
    expect(testRes.json.lastTestSentAt).toBeTruthy();
    const stillPaused = await prisma.organizationSlackConnection.findUniqueOrThrow({
      where: { organizationId: orgId },
    });
    expect(stillPaused.status).toBe("PAUSED");
    expect(stillPaused.lastTestSentAt).not.toBeNull();

    const rate = await authedJson(
      app,
      "/api/saas/integrations/slack/test",
      { method: "POST", cookie, organizationId: orgId, body: {} },
    );
    expect(rate.status).toBe(400);
  });

  it("does not stamp lastTestSentAt when webhook fails", async () => {
    const { cookie, orgId } = await signupOrg("test-fail@example.com", "basic");
    const enc = encryptSecret("https://hooks.slack.com/services/T1/B1/dead");
    await prisma.organizationSlackConnection.create({
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
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      if (String(input).includes("hooks.slack.com")) {
        return new Response("fail", { status: 500 });
      }
      return new Response("ok", { status: 200 });
    });
    const testRes = await authedJson(
      app,
      "/api/saas/integrations/slack/test",
      { method: "POST", cookie, organizationId: orgId, body: {} },
    );
    expect(testRes.status).toBeGreaterThanOrEqual(400);
    const row = await prisma.organizationSlackConnection.findUniqueOrThrow({
      where: { organizationId: orgId },
    });
    expect(row.lastTestSentAt).toBeNull();
  });

  it("REPLACE clears lastTestSentAt and cancels old pending jobs", async () => {
    const { cookie, orgId, userId } = await signupOrg(
      "replace-clear@example.com",
      "basic",
    );
    const enc = encryptSecret("https://hooks.slack.com/services/T_OLD/B/old");
    const conn = await prisma.organizationSlackConnection.create({
      data: {
        organizationId: orgId,
        status: "PAUSED",
        slackTeamId: "T_OLD",
        slackTeamName: "Old WS",
        slackChannelId: "C_OLD",
        slackChannelName: "old-channel",
        webhookUrlCiphertext: enc.ciphertext,
        webhookUrlNonce: enc.nonce,
        notificationsArmed: true,
        preferences: {
          newOpportunity: true,
          relatedActOnFollowed: false,
          deadlineRadar: false,
        },
        lastTestSentAt: new Date("2026-01-01T12:00:00.000Z"),
        installedByUserId: userId,
      },
    });
    await enqueueSaasJob(prisma, {
      type: SAAS_JOB_TYPES.slackAttention,
      deliveryKey: `SLACK:${conn.id}:old`,
      organizationId: orgId,
      payload: { connectionId: conn.id, attentionEventId: "old" },
    });

    const start = await authedJson<{ authorizeUrl: string }>(
      app,
      "/api/saas/integrations/slack/oauth/start",
      {
        method: "POST",
        cookie,
        organizationId: orgId,
        body: { purpose: "REPLACE" },
      },
    );
    expect(start.status).toBe(200);
    const state = new URL(start.json.authorizeUrl).searchParams.get("state")!;
    const callback = await app.request(
      `/api/saas/integrations/slack/oauth/callback?code=replace&state=${state}`,
      { redirect: "manual" },
    );
    expect(callback.headers.get("location")).toContain("slack=connected");

    const updated = await prisma.organizationSlackConnection.findUniqueOrThrow({
      where: { organizationId: orgId },
    });
    expect(updated.slackTeamId).toBe("T_TEST");
    expect(updated.slackChannelName).toBe("ops");
    expect(updated.lastTestSentAt).toBeNull();
    expect(updated.status).toBe("PAUSED");
    expect(updated.notificationsArmed).toBe(true);
    const jobs = await prisma.saasJob.findMany({ where: { organizationId: orgId } });
    expect(jobs.every((j) => j.status === "CANCELLED")).toBe(true);
  });

  it("allows disconnect after Free downgrade without OAuth", async () => {
    const { cookie, orgId } = await signupOrg("disc-free@example.com", "basic");
    const enc = encryptSecret("https://hooks.slack.com/services/T1/B1/x");
    await prisma.organizationSlackConnection.create({
      data: {
        organizationId: orgId,
        status: "PLAN_PAUSED",
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
    await setOrgPlan(prisma, orgId, PLAN_KEYS.free);
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
  });
});
