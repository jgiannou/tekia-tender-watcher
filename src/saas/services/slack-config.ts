/**
 * Customer Slack notifications (OAuth + incoming webhooks).
 * Independent of the internal ops `SLACK_WEBHOOK_URL`.
 */

import { isSecretsEncryptionConfigured } from "../crypto/secrets.js";

export const SLACK_OAUTH_AUTHORIZE_URL =
  "https://slack.com/oauth/v2/authorize";
export const SLACK_OAUTH_ACCESS_URL = "https://slack.com/api/oauth.v2.access";
export const SLACK_BOT_SCOPE = "incoming-webhook";

/** 15-minute coalesce window for Free→paid new-opportunity Slack batches. */
export const SLACK_OPPORTUNITY_BATCH_MS = 15 * 60 * 1000;
export const SLACK_OPPORTUNITY_BATCH_MAX_ITEMS = 5;

export const isSaasSlackNotificationsConfigured = (
  env: NodeJS.ProcessEnv = process.env,
): boolean => {
  const flag =
    String(env.SAAS_SLACK_NOTIFICATIONS_ENABLED || "")
      .toLowerCase()
      .trim() === "true";
  if (!flag) return false;
  const clientId = String(env.SAAS_SLACK_CLIENT_ID || "").trim();
  const clientSecret = String(env.SAAS_SLACK_CLIENT_SECRET || "").trim();
  const redirectUri = String(env.SAAS_SLACK_REDIRECT_URI || "").trim();
  return (
    Boolean(clientId && clientSecret && redirectUri) &&
    isSecretsEncryptionConfigured(env)
  );
};

export const getSaasSlackOAuthConfig = (
  env: NodeJS.ProcessEnv = process.env,
): {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
} | null => {
  if (!isSaasSlackNotificationsConfigured(env)) return null;
  return {
    clientId: String(env.SAAS_SLACK_CLIENT_ID || "").trim(),
    clientSecret: String(env.SAAS_SLACK_CLIENT_SECRET || "").trim(),
    redirectUri: String(env.SAAS_SLACK_REDIRECT_URI || "").trim(),
  };
};

export const isValidSlackIncomingWebhookUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    if (parsed.hostname !== "hooks.slack.com") return false;
    return parsed.pathname.startsWith("/services/");
  } catch {
    return false;
  }
};
