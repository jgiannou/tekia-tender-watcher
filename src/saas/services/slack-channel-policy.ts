import type { AttentionEventType, SlackConnectionStatus } from "@prisma/client";
import { entitlementsForPlanKey } from "../plans/catalog.js";
import { isSaasSlackNotificationsConfigured } from "./slack-config.js";
import {
  normalizeSlackPreferences,
  type SlackNotificationPreferences,
} from "./slack-preferences.js";

const RELATED_TYPES = new Set<AttentionEventType>([
  "RELATED_PROC_DISCOVERED",
  "RELATED_APPROVED_REQUEST_DISCOVERED",
  "RELATED_AWARD_DISCOVERED",
  "RELATED_CONTRACT_DISCOVERED",
  "DEADLINE_CHANGED",
]);

export type SlackPrefKind =
  | "newOpportunity"
  | "relatedActOnFollowed"
  | "deadlineRadar";

export const slackPrefKindForAttentionType = (
  type: AttentionEventType,
): SlackPrefKind | null => {
  if (type === "NEW_OPPORTUNITY" || type === "OPPORTUNITY_DIGEST") {
    return "newOpportunity";
  }
  if (RELATED_TYPES.has(type)) return "relatedActOnFollowed";
  if (type === "DEADLINE_APPROACHING") return "deadlineRadar";
  return null;
};

export type SlackSendDecision = {
  allow: boolean;
  reason: string;
  prefKind: SlackPrefKind | null;
};

/**
 * Channel policy for customer Slack — apply at enqueue and send.
 * Independent of email prefs / EMAIL_ENABLED.
 */
export const decideSlackSend = (input: {
  planKey: string;
  connectionStatus: SlackConnectionStatus | null;
  notificationsArmed: boolean;
  preferences: unknown;
  type: AttentionEventType;
  configured?: boolean;
}): SlackSendDecision => {
  const prefKind = slackPrefKindForAttentionType(input.type);
  if (!prefKind) {
    return { allow: false, reason: "unsupported_event_type", prefKind: null };
  }
  if (!(input.configured ?? isSaasSlackNotificationsConfigured())) {
    return { allow: false, reason: "slack_not_configured", prefKind };
  }
  const plan = entitlementsForPlanKey(input.planKey);
  if (!plan.slackNotifications) {
    return { allow: false, reason: "plan_no_slack", prefKind };
  }
  if (!input.connectionStatus) {
    return { allow: false, reason: "no_connection", prefKind };
  }
  if (input.connectionStatus === "DISCONNECTED") {
    return { allow: false, reason: "disconnected", prefKind };
  }
  if (input.connectionStatus === "PLAN_PAUSED") {
    return { allow: false, reason: "plan_paused", prefKind };
  }
  if (input.connectionStatus === "PAUSED") {
    return { allow: false, reason: "paused", prefKind };
  }
  if (input.connectionStatus === "NEEDS_RECONNECT") {
    return { allow: false, reason: "needs_reconnect", prefKind };
  }
  if (input.connectionStatus !== "ACTIVE") {
    return { allow: false, reason: "inactive_status", prefKind };
  }
  if (!input.notificationsArmed) {
    return { allow: false, reason: "not_armed", prefKind };
  }
  const prefs: SlackNotificationPreferences = normalizeSlackPreferences(
    input.preferences,
  );
  if (!prefs[prefKind]) {
    return { allow: false, reason: `pref_disabled:${prefKind}`, prefKind };
  }
  return { allow: true, reason: "ok", prefKind };
};
