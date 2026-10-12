import { createHash, randomBytes } from "node:crypto";
import type { Prisma, PrismaClient, SlackConnectionStatus } from "@prisma/client";
import { requireOrgMembership, requireOrgRole } from "../auth/org-context.js";
import { encryptSecret } from "../crypto/secrets.js";
import {
  badRequest,
  forbidden,
  notFound,
  serviceUnavailable,
} from "../errors.js";
import { entitlementsForPlanKey } from "../plans/catalog.js";
import {
  cancelPendingSlackJobsForOrg,
} from "../jobs/outbox.js";
import {
  getSaasSlackOAuthConfig,
  isSaasSlackNotificationsConfigured,
  isValidSlackIncomingWebhookUrl,
  SLACK_BOT_SCOPE,
  SLACK_OAUTH_ACCESS_URL,
  SLACK_OAUTH_AUTHORIZE_URL,
} from "./slack-config.js";
import {
  buildTestSlackMessage,
  formatChannelLabel,
} from "./slack-messages.js";
import {
  DEFAULT_SLACK_PREFERENCES,
  normalizeSlackPreferences,
  slackPreferencesHaveAnyEnabled,
  type SlackNotificationPreferences,
} from "./slack-preferences.js";
import {
  deriveSlackDeliveryState,
  SLACK_DELIVERY_STATE_LABEL_EL,
  slackTestResultMessageEl,
  type SlackDeliveryState,
  type SlackTestDelivery,
} from "./slack-delivery-state.js";
import { resolveOrganizationScanAccess } from "./scan-access.js";
import { postSlackIncomingWebhook } from "./slack-delivery.js";

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
/** Minimum gap between explicit Slack connection tests (server-side). */
const SLACK_TEST_MIN_INTERVAL_MS = 30_000;

export type SlackConnectionPublicView = {
  configured: boolean;
  entitled: boolean;
  featureAvailable: boolean;
  connection: null | {
    id: string;
    status: SlackConnectionStatus;
    deliveryState: SlackDeliveryState;
    deliveryStateLabelEl: string;
    teamName: string;
    channelName: string;
    channelLabel: string;
    notificationsArmed: boolean;
    preferences: SlackNotificationPreferences;
    lastTestSentAt: string | null;
    lastSuccessAt: string | null;
    lastErrorSafe: string | null;
    installedAt: string;
    updatedAt: string;
  };
  canManage: boolean;
  messages: {
    freeLockedEl: string;
    planPausedEl: string;
    needsReconnectEl: string;
    adminsOnlyEl: string;
    connectHintEl: string;
  };
};

const MESSAGES = {
  freeLockedEl:
    "Οι ειδοποιήσεις Slack είναι διαθέσιμες στα πακέτα Basic και Pro.",
  planPausedEl: SLACK_DELIVERY_STATE_LABEL_EL.PLAN_PAUSED,
  needsReconnectEl: SLACK_DELIVERY_STATE_LABEL_EL.NEEDS_RECONNECT,
  adminsOnlyEl: "Μόνο οι διαχειριστές μπορούν να αλλάξουν τη σύνδεση",
  connectHintEl:
    "Συνδέστε το Slack για να λαμβάνει η ομάδα σας ενημερώσεις στο κανάλι που θα επιλέξετε.",
  oauthCancelEl:
    "Η σύνδεση με το Slack δεν ολοκληρώθηκε. Μπορείτε να δοκιμάσετε ξανά.",
} as const;

const toPublicConnection = (
  row: {
    id: string;
    status: SlackConnectionStatus;
    slackTeamName: string;
    slackChannelName: string;
    notificationsArmed: boolean;
    preferences: unknown;
    lastTestSentAt: Date | null;
    lastSuccessAt: Date | null;
    lastErrorSafe: string | null;
    createdAt: Date;
    updatedAt: Date;
  },
): NonNullable<SlackConnectionPublicView["connection"]> => {
  const preferences = normalizeSlackPreferences(row.preferences);
  const deliveryState = deriveSlackDeliveryState({
    status: row.status,
    notificationsArmed: row.notificationsArmed,
    preferences,
  });
  return {
    id: row.id,
    status: row.status,
    deliveryState,
    deliveryStateLabelEl: SLACK_DELIVERY_STATE_LABEL_EL[deliveryState],
    teamName: row.slackTeamName,
    channelName: row.slackChannelName,
    channelLabel: formatChannelLabel(row.slackChannelName),
    notificationsArmed: row.notificationsArmed,
    preferences,
    lastTestSentAt: row.lastTestSentAt?.toISOString() ?? null,
    lastSuccessAt: row.lastSuccessAt?.toISOString() ?? null,
    lastErrorSafe: row.lastErrorSafe,
    installedAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
};

export const slackUiMessages = MESSAGES;

const requireSlackAdmin = async (
  prisma: PrismaClient,
  input: { userId: string; organizationId: string | null },
) => {
  const ctx = await requireOrgMembership(
    prisma,
    input.userId,
    input.organizationId,
  );
  requireOrgRole(ctx, ["OWNER", "ADMIN"]);
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { emailVerified: true },
  });
  if (!user?.emailVerified) {
    throw forbidden("email_not_verified");
  }
  return ctx;
};

const assertSlackEntitled = async (
  prisma: PrismaClient,
  input: { userId: string; organizationId: string },
) => {
  const scanAccess = await resolveOrganizationScanAccess(prisma, input);
  if (scanAccess.status !== "active" && scanAccess.status !== "trial") {
    throw forbidden("subscription_inactive");
  }
  const plan = entitlementsForPlanKey(scanAccess.planKey);
  if (!plan.slackNotifications) {
    throw forbidden("plan_feature_locked");
  }
  return { scanAccess, plan };
};

export const getSlackConnectionView = async (
  prisma: PrismaClient,
  input: { userId: string; organizationId: string | null },
): Promise<SlackConnectionPublicView> => {
  const ctx = await requireOrgMembership(
    prisma,
    input.userId,
    input.organizationId,
  );
  const canManage =
    ctx.membership.role === "OWNER" || ctx.membership.role === "ADMIN";
  const configured = isSaasSlackNotificationsConfigured();
  const scanAccess = await resolveOrganizationScanAccess(prisma, {
    userId: input.userId,
    organizationId: ctx.organizationId,
  });
  const plan = entitlementsForPlanKey(scanAccess.planKey);
  const entitled =
    plan.slackNotifications &&
    (scanAccess.status === "active" || scanAccess.status === "trial");

  const row = await prisma.organizationSlackConnection.findUnique({
    where: { organizationId: ctx.organizationId },
  });

  return {
    configured,
    entitled,
    featureAvailable: configured,
    canManage,
    messages: {
      freeLockedEl: MESSAGES.freeLockedEl,
      planPausedEl: MESSAGES.planPausedEl,
      needsReconnectEl: MESSAGES.needsReconnectEl,
      adminsOnlyEl: MESSAGES.adminsOnlyEl,
      connectHintEl: MESSAGES.connectHintEl,
    },
    connection: row ? toPublicConnection(row) : null,
  };
};

export const beginSlackOAuth = async (
  prisma: PrismaClient,
  input: {
    userId: string;
    organizationId: string | null;
    purpose?: "CONNECT" | "REPLACE";
  },
): Promise<{ authorizeUrl: string }> => {
  if (!isSaasSlackNotificationsConfigured()) {
    throw serviceUnavailable("slack_not_configured");
  }
  const oauth = getSaasSlackOAuthConfig();
  if (!oauth) throw serviceUnavailable("slack_not_configured");

  const ctx = await requireSlackAdmin(prisma, input);
  await assertSlackEntitled(prisma, {
    userId: ctx.userId,
    organizationId: ctx.organizationId,
  });

  const purpose = input.purpose ?? "CONNECT";
  if (purpose === "REPLACE") {
    const existing = await prisma.organizationSlackConnection.findUnique({
      where: { organizationId: ctx.organizationId },
      select: { id: true },
    });
    if (!existing) throw notFound("slack_connection_missing");
  }

  const state = randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + OAUTH_STATE_TTL_MS);
  await prisma.slackOAuthState.create({
    data: {
      state,
      userId: ctx.userId,
      organizationId: ctx.organizationId,
      purpose,
      expiresAt,
    },
  });

  const url = new URL(SLACK_OAUTH_AUTHORIZE_URL);
  url.searchParams.set("client_id", oauth.clientId);
  url.searchParams.set("scope", SLACK_BOT_SCOPE);
  url.searchParams.set("redirect_uri", oauth.redirectUri);
  url.searchParams.set("state", state);

  return { authorizeUrl: url.toString() };
};

type SlackOAuthAccessResponse = {
  ok: boolean;
  error?: string;
  team?: { id?: string; name?: string };
  incoming_webhook?: {
    url?: string;
    channel?: string;
    channel_id?: string;
    configuration_url?: string;
  };
  access_token?: string;
};

const exchangeSlackCode = async (
  code: string,
): Promise<SlackOAuthAccessResponse> => {
  const oauth = getSaasSlackOAuthConfig();
  if (!oauth) throw serviceUnavailable("slack_not_configured");
  const body = new URLSearchParams({
    client_id: oauth.clientId,
    client_secret: oauth.clientSecret,
    code,
    redirect_uri: oauth.redirectUri,
  });
  const res = await fetch(SLACK_OAUTH_ACCESS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    throw badRequest("slack_oauth_exchange_failed");
  }
  return (await res.json()) as SlackOAuthAccessResponse;
};

export type SlackOAuthCallbackResult = {
  ok: boolean;
  redirectPath: string;
  errorCode?: string;
};

/**
 * Complete OAuth. Does not auto-send a Slack message.
 * On REPLACE failure / cancel, previous connection is left intact.
 */
export const completeSlackOAuthCallback = async (
  prisma: PrismaClient,
  input: {
    code?: string | null;
    state?: string | null;
    error?: string | null;
  },
): Promise<SlackOAuthCallbackResult> => {
  const base = "/app/settings/connections";
  if (input.error) {
    return {
      ok: false,
      redirectPath: `${base}?slack=cancelled`,
      errorCode: "cancelled",
    };
  }
  if (!input.code || !input.state) {
    return {
      ok: false,
      redirectPath: `${base}?slack=error&reason=missing_params`,
      errorCode: "missing_params",
    };
  }

  const stateRow = await prisma.slackOAuthState.findUnique({
    where: { state: input.state },
  });
  if (!stateRow || stateRow.consumedAt) {
    return {
      ok: false,
      redirectPath: `${base}?slack=error&reason=invalid_state`,
      errorCode: "invalid_state",
    };
  }
  if (stateRow.expiresAt.getTime() < Date.now()) {
    return {
      ok: false,
      redirectPath: `${base}?slack=error&reason=expired_state`,
      errorCode: "expired_state",
    };
  }

  // Consume immediately (single-use) before external exchange.
  const consumed = await prisma.slackOAuthState.updateMany({
    where: { id: stateRow.id, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  if (consumed.count !== 1) {
    return {
      ok: false,
      redirectPath: `${base}?slack=error&reason=replayed_state`,
      errorCode: "replayed_state",
    };
  }

  try {
    await requireSlackAdmin(prisma, {
      userId: stateRow.userId,
      organizationId: stateRow.organizationId,
    });
    await assertSlackEntitled(prisma, {
      userId: stateRow.userId,
      organizationId: stateRow.organizationId,
    });
  } catch {
    return {
      ok: false,
      redirectPath: `${base}?slack=error&reason=forbidden`,
      errorCode: "forbidden",
    };
  }

  let access: SlackOAuthAccessResponse;
  try {
    access = await exchangeSlackCode(input.code);
  } catch {
    return {
      ok: false,
      redirectPath: `${base}?slack=error&reason=exchange_failed`,
      errorCode: "exchange_failed",
    };
  }

  if (!access.ok) {
    return {
      ok: false,
      redirectPath: `${base}?slack=error&reason=install_failed`,
      errorCode: access.error ?? "install_failed",
    };
  }

  const webhookUrl = access.incoming_webhook?.url?.trim() ?? "";
  if (!isValidSlackIncomingWebhookUrl(webhookUrl)) {
    return {
      ok: false,
      redirectPath: `${base}?slack=error&reason=invalid_webhook`,
      errorCode: "invalid_webhook",
    };
  }

  const teamId = access.team?.id?.trim() ?? "";
  const teamName = access.team?.name?.trim() || "Slack";
  const channelId = access.incoming_webhook?.channel_id?.trim() ?? "";
  let channelName =
    access.incoming_webhook?.channel?.trim() ||
    channelId ||
    "channel";
  if (channelName.startsWith("#")) {
    channelName = channelName.slice(1);
  }
  if (!teamId || !channelId) {
    return {
      ok: false,
      redirectPath: `${base}?slack=error&reason=incomplete_install`,
      errorCode: "incomplete_install",
    };
  }

  let encrypted: { ciphertext: string; nonce: string };
  try {
    encrypted = encryptSecret(webhookUrl);
  } catch {
    return {
      ok: false,
      redirectPath: `${base}?slack=error&reason=encryption_failed`,
      errorCode: "encryption_failed",
    };
  }

  const existing = await prisma.organizationSlackConnection.findUnique({
    where: { organizationId: stateRow.organizationId },
  });

  // Replacement: cancel pending jobs tied to the previous installation first.
  if (existing) {
    await cancelPendingSlackJobsForOrg(prisma, stateRow.organizationId);
  }

  const keepPrefs = existing
    ? normalizeSlackPreferences(existing.preferences)
    : DEFAULT_SLACK_PREFERENCES;
  const keepArmed = existing ? existing.notificationsArmed : false;
  // Preserve manual / plan pause. Never auto-resume after replace.
  // Reconnect from NEEDS_RECONNECT requires explicit resume/activation.
  let nextStatus: SlackConnectionStatus = "PAUSED";
  if (existing?.status === "ACTIVE") nextStatus = "ACTIVE";
  else if (existing?.status === "PAUSED") nextStatus = "PAUSED";
  else if (existing?.status === "PLAN_PAUSED") nextStatus = "PLAN_PAUSED";
  else if (existing?.status === "NEEDS_RECONNECT") nextStatus = "PAUSED";

  await prisma.organizationSlackConnection.upsert({
    where: { organizationId: stateRow.organizationId },
    create: {
      organizationId: stateRow.organizationId,
      status: "PAUSED",
      slackTeamId: teamId,
      slackTeamName: teamName,
      slackChannelId: channelId,
      slackChannelName: channelName,
      webhookUrlCiphertext: encrypted.ciphertext,
      webhookUrlNonce: encrypted.nonce,
      installedByUserId: stateRow.userId,
      preferences: keepPrefs as unknown as Prisma.InputJsonValue,
      notificationsArmed: false,
      lastErrorSafe: null,
      lastErrorAt: null,
      lastTestSentAt: null,
      lastSuccessAt: null,
    },
    update: {
      status: existing ? nextStatus : "PAUSED",
      slackTeamId: teamId,
      slackTeamName: teamName,
      slackChannelId: channelId,
      slackChannelName: channelName,
      webhookUrlCiphertext: encrypted.ciphertext,
      webhookUrlNonce: encrypted.nonce,
      installedByUserId: stateRow.userId,
      preferences: keepPrefs as unknown as Prisma.InputJsonValue,
      notificationsArmed: existing ? keepArmed : false,
      lastErrorSafe: null,
      lastErrorAt: null,
      // Test timestamp is per destination — never carry to a new channel.
      lastTestSentAt: null,
      lastSuccessAt: null,
    },
  });

  // Do not store bot access_token — incoming webhook URL is enough.
  return {
    ok: true,
    redirectPath: `${base}?slack=connected`,
  };
};

export const updateSlackPreferences = async (
  prisma: PrismaClient,
  input: {
    userId: string;
    organizationId: string | null;
    preferences: SlackNotificationPreferences;
    /**
     * First-time arm + activate only. Must not lift an existing manual pause
     * when saving later preference edits (`activate: false` / omitted).
     */
    activate?: boolean;
  },
) => {
  const ctx = await requireSlackAdmin(prisma, input);
  await assertSlackEntitled(prisma, {
    userId: ctx.userId,
    organizationId: ctx.organizationId,
  });
  const row = await prisma.organizationSlackConnection.findUnique({
    where: { organizationId: ctx.organizationId },
  });
  if (!row) throw notFound("slack_connection_missing");
  if (row.status === "NEEDS_RECONNECT") {
    throw badRequest("slack_needs_reconnect");
  }

  const preferences = normalizeSlackPreferences(input.preferences);
  const isFirstSetup = !row.notificationsArmed;
  const wantsActivate = input.activate === true;

  if (isFirstSetup || wantsActivate) {
    if (!slackPreferencesHaveAnyEnabled(preferences)) {
      throw badRequest("slack_prefs_required");
    }
  }

  let status: SlackConnectionStatus = row.status;
  let notificationsArmed = row.notificationsArmed;

  if (isFirstSetup && wantsActivate) {
    // Initial “Αποθήκευση και ενεργοποίηση”.
    notificationsArmed = true;
    if (row.status === "PLAN_PAUSED") {
      status = "PLAN_PAUSED";
    } else {
      status = "ACTIVE";
    }
  } else if (isFirstSetup && !wantsActivate) {
    // Prefs may be drafted before arming; stay unarmed / paused.
    notificationsArmed = false;
  } else {
    // Already configured: save prefs only — never lift PAUSED / PLAN_PAUSED.
    notificationsArmed = true;
    // status unchanged (including ACTIVE with all categories off).
  }

  const updated = await prisma.organizationSlackConnection.update({
    where: { id: row.id },
    data: {
      preferences: preferences as unknown as Prisma.InputJsonValue,
      notificationsArmed,
      status,
    },
  });

  return getSlackConnectionView(prisma, {
    userId: ctx.userId,
    organizationId: ctx.organizationId,
  }).then((view) => ({ ...view, connectionId: updated.id }));
};

export const setSlackNotificationsPaused = async (
  prisma: PrismaClient,
  input: {
    userId: string;
    organizationId: string | null;
    paused: boolean;
  },
) => {
  const ctx = await requireSlackAdmin(prisma, input);
  await assertSlackEntitled(prisma, {
    userId: ctx.userId,
    organizationId: ctx.organizationId,
  });
  const row = await prisma.organizationSlackConnection.findUnique({
    where: { organizationId: ctx.organizationId },
  });
  if (!row) throw notFound("slack_connection_missing");
  if (row.status === "NEEDS_RECONNECT") {
    throw badRequest("slack_needs_reconnect");
  }

  const prefs = normalizeSlackPreferences(row.preferences);

  if (input.paused) {
    await cancelPendingSlackJobsForOrg(prisma, ctx.organizationId);
    await prisma.organizationSlackConnection.update({
      where: { id: row.id },
      data: { status: "PAUSED" },
    });
    return getSlackConnectionView(prisma, input);
  }

  // Resume — no OAuth, no backfill. Uses saved prefs only.
  if (!row.notificationsArmed) {
    throw badRequest("slack_not_armed");
  }
  if (!slackPreferencesHaveAnyEnabled(prefs)) {
    throw badRequest("slack_prefs_required");
  }
  if (row.status === "PLAN_PAUSED") {
    // Allowed after upgrade when entitled (assertSlackEntitled already passed).
  }
  await prisma.organizationSlackConnection.update({
    where: { id: row.id },
    data: { status: "ACTIVE", lastErrorSafe: null },
  });
  return getSlackConnectionView(prisma, input);
};

export const disconnectSlack = async (
  prisma: PrismaClient,
  input: { userId: string; organizationId: string | null },
) => {
  const ctx = await requireSlackAdmin(prisma, input);
  const row = await prisma.organizationSlackConnection.findUnique({
    where: { organizationId: ctx.organizationId },
  });
  if (!row) {
    return getSlackConnectionView(prisma, input);
  }
  await cancelPendingSlackJobsForOrg(prisma, ctx.organizationId);
  await prisma.organizationSlackConnection.delete({
    where: { id: row.id },
  });
  return getSlackConnectionView(prisma, input);
};

export const sendSlackTestMessage = async (
  prisma: PrismaClient,
  input: { userId: string; organizationId: string | null },
): Promise<{
  ok: true;
  delivery: SlackTestDelivery;
  channelLabel: string;
  messageEl: string;
  lastTestSentAt: string;
}> => {
  const ctx = await requireSlackAdmin(prisma, input);
  await assertSlackEntitled(prisma, {
    userId: ctx.userId,
    organizationId: ctx.organizationId,
  });
  const row = await prisma.organizationSlackConnection.findUnique({
    where: { organizationId: ctx.organizationId },
  });
  if (!row) throw notFound("slack_connection_missing");
  if (row.status === "NEEDS_RECONNECT") {
    throw badRequest("slack_needs_reconnect");
  }
  if (row.status === "PLAN_PAUSED") {
    throw forbidden("plan_feature_locked");
  }

  if (
    row.lastTestSentAt &&
    Date.now() - row.lastTestSentAt.getTime() < SLACK_TEST_MIN_INTERVAL_MS
  ) {
    throw badRequest("slack_test_rate_limited");
  }

  const channelLabel = formatChannelLabel(row.slackChannelName);
  const payload = buildTestSlackMessage(row.slackChannelName);
  // Explicit test posts synchronously; timestamp only after Slack accepts.
  // (If a future path enqueues only, return delivery: "queued" without timestamp.)
  const result = await postSlackIncomingWebhook(prisma, {
    connectionId: row.id,
    payload,
    markSuccess: true,
  });
  if (!result.ok) {
    if (result.permanent) {
      throw badRequest("slack_needs_reconnect");
    }
    throw serviceUnavailable("slack_test_failed", result.errorSafe);
  }
  const deliveredAt = new Date();
  await prisma.organizationSlackConnection.update({
    where: { id: row.id },
    data: { lastTestSentAt: deliveredAt },
  });
  const delivery: SlackTestDelivery = "delivered";
  return {
    ok: true,
    delivery,
    channelLabel,
    messageEl: slackTestResultMessageEl({ delivery, channelLabel }),
    lastTestSentAt: deliveredAt.toISOString(),
  };
};

/** Pause sends + cancel jobs when org loses Slack entitlement (→ Free). */
export const onSlackPlanDowngradeToFree = async (
  prisma: PrismaClient,
  organizationId: string,
): Promise<{ cancelledJobs: number }> => {
  const cancelledJobs = await cancelPendingSlackJobsForOrg(
    prisma,
    organizationId,
  );
  await prisma.organizationSlackConnection.updateMany({
    where: {
      organizationId,
      status: { in: ["ACTIVE", "PAUSED"] },
    },
    data: {
      status: "PLAN_PAUSED",
      lastErrorSafe: "plan_paused",
      lastErrorAt: new Date(),
    },
  });
  return { cancelledJobs };
};

/** Hash for metrics — never log webhook URL. */
export const slackConnectionFingerprint = (connectionId: string): string =>
  createHash("sha256").update(connectionId).digest("hex").slice(0, 12);
