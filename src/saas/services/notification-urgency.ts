/**
 * Product notification urgency used for outbox priority, Slack batching,
 * and UI emphasis. Shared ingest remains plan-agnostic.
 */

import { HIGH_MATCH_SCORE_THRESHOLD } from "../plans/catalog.js";

export type NotificationUrgency = "NORMAL" | "IMPORTANT" | "URGENT";

export const OUTBOX_PRIORITY = {
  PRIORITY_RELATED_PROC: 100,
  IMMEDIATE_HIGH_MATCH: 90,
  RELATED_ACT: 80,
  NORMAL_NEW_OPPORTUNITY: 60,
  DIGEST: 40,
} as const;

export type UrgencyInput = {
  type: string;
  score?: number | null;
  priorityMonitoring?: boolean;
  invitationStatus?: string | null;
  planImmediateNewOpportunity?: boolean;
};

export const resolveNotificationUrgency = (
  input: UrgencyInput,
): NotificationUrgency => {
  if (
    input.type === "RELATED_PROC_DISCOVERED" &&
    (input.priorityMonitoring ||
      input.invitationStatus === "TARGETED_YOU" ||
      input.invitationStatus === "TARGETED_OTHER" ||
      input.invitationStatus === "NOT_INVITED")
  ) {
    return "URGENT";
  }
  if (
    input.type === "RELATED_PROC_DISCOVERED" ||
    input.type === "RELATED_APPROVED_REQUEST_DISCOVERED" ||
    input.type === "RELATED_AWARD_DISCOVERED" ||
    input.type === "RELATED_CONTRACT_DISCOVERED" ||
    input.type === "DEADLINE_APPROACHING"
  ) {
    return "IMPORTANT";
  }
  if (
    input.type === "NEW_OPPORTUNITY" &&
    input.planImmediateNewOpportunity &&
    (input.score ?? 0) >= HIGH_MATCH_SCORE_THRESHOLD
  ) {
    return "IMPORTANT";
  }
  return "NORMAL";
};

export const outboxPriorityForUrgency = (
  urgency: NotificationUrgency,
  type: string,
): number => {
  if (urgency === "URGENT") return OUTBOX_PRIORITY.PRIORITY_RELATED_PROC;
  if (type === "NEW_OPPORTUNITY" && urgency === "IMPORTANT") {
    return OUTBOX_PRIORITY.IMMEDIATE_HIGH_MATCH;
  }
  if (urgency === "IMPORTANT") return OUTBOX_PRIORITY.RELATED_ACT;
  if (type === "NEW_OPPORTUNITY") return OUTBOX_PRIORITY.NORMAL_NEW_OPPORTUNITY;
  return OUTBOX_PRIORITY.DIGEST;
};

/** Pro high-match / priority events skip the 15-minute Slack opportunity batch. */
export const shouldBypassSlackOpportunityBatch = (
  input: UrgencyInput,
): boolean => {
  const urgency = resolveNotificationUrgency(input);
  return urgency === "URGENT" || urgency === "IMPORTANT";
};
