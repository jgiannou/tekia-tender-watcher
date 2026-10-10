import type { AttentionEventType } from "@prisma/client";
import {
  HIGH_MATCH_SCORE_THRESHOLD,
  entitlementsForPlanKey,
  type PlanEntitlements,
} from "../plans/catalog.js";
import type { NotificationPreferences } from "./org-settings.js";

const RELATED_TYPES = new Set<AttentionEventType>([
  "RELATED_PROC_DISCOVERED",
  "RELATED_APPROVED_REQUEST_DISCOVERED",
  "RELATED_AWARD_DISCOVERED",
  "RELATED_CONTRACT_DISCOVERED",
  "DEADLINE_CHANGED",
]);

export type EmailChannelDecision =
  | { allow: false; reason: string }
  | {
      allow: true;
      path: "weekly" | "digest_hours" | "immediate";
      reason: string;
    };

/**
 * Channel policy for product email — apply at enqueue and send.
 * In-app / push are never gated by weekly/digest cadence.
 */
export const decideProductEmail = (input: {
  plan: PlanEntitlements | string;
  prefs: NotificationPreferences;
  type: AttentionEventType;
  matchScore?: number | null;
  /** True when digest batch has genuinely new items since last send. */
  hasNewItems?: boolean;
}): EmailChannelDecision => {
  const plan =
    typeof input.plan === "string"
      ? entitlementsForPlanKey(input.plan)
      : input.plan;

  if (!input.prefs.emailEnabled) {
    return { allow: false, reason: "email_disabled" };
  }

  if (input.type === "SUBMISSION_RECORDED" || input.type === "OUTREACH_RECORDED") {
    if (!input.prefs.events.postSubmissionUpdate) {
      return { allow: false, reason: "event_pref_off" };
    }
    if (plan.emailCadence === "WEEKLY") {
      return { allow: false, reason: "free_weekly_only_product_digest" };
    }
    return { allow: true, path: "immediate", reason: "workflow_recorded" };
  }

  if (plan.emailCadence === "WEEKLY") {
    if (!input.prefs.weeklyEmailEnabled) {
      return { allow: false, reason: "weekly_opt_out" };
    }
    // Individual events never send on Free; weekly job aggregates.
    return { allow: false, reason: "deferred_to_weekly_digest" };
  }

  if (input.type === "DEADLINE_APPROACHING") {
    if (!plan.deadlineRadar || !input.prefs.events.deadlineRadar) {
      return { allow: false, reason: "deadline_radar_off" };
    }
    return { allow: true, path: "digest_hours", reason: "deadline_radar" };
  }

  if (input.type === "NEW_OPPORTUNITY") {
    if (!input.prefs.events.newOpportunity) {
      return { allow: false, reason: "event_pref_off" };
    }
    if (
      plan.immediateNewOpportunity &&
      input.prefs.emailDeliveryMode === "IMMEDIATE" &&
      typeof input.matchScore === "number" &&
      input.matchScore >= HIGH_MATCH_SCORE_THRESHOLD
    ) {
      return { allow: true, path: "immediate", reason: "high_match_immediate" };
    }
    return { allow: false, reason: "new_opportunity_digest_only" };
  }

  if (input.type === "OPPORTUNITY_DIGEST") {
    if (!input.prefs.events.newOpportunity) {
      return { allow: false, reason: "event_pref_off" };
    }
    if (input.hasNewItems === false) {
      return { allow: false, reason: "quiet_no_new_items" };
    }
    return { allow: true, path: "digest_hours", reason: "opportunity_digest" };
  }

  if (RELATED_TYPES.has(input.type)) {
    if (!input.prefs.events.relatedActOnFollowed) {
      return { allow: false, reason: "event_pref_off" };
    }
    if (
      plan.immediateFollowedDevelopments &&
      input.prefs.emailDeliveryMode === "IMMEDIATE"
    ) {
      return {
        allow: true,
        path: "immediate",
        reason: "followed_development_immediate",
      };
    }
    return { allow: true, path: "digest_hours", reason: "related_digest_hours" };
  }

  return { allow: false, reason: "unsupported_type" };
};

export const planAllowsDailyProductEmail = (planKey: string): boolean =>
  entitlementsForPlanKey(planKey).emailCadence !== "WEEKLY";

export const isRelatedAttentionType = (type: AttentionEventType): boolean =>
  RELATED_TYPES.has(type);
