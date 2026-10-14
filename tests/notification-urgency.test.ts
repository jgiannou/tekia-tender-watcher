import { describe, expect, it } from "vitest";
import {
  outboxPriorityForUrgency,
  resolveNotificationUrgency,
  shouldBypassSlackOpportunityBatch,
} from "../src/saas/services/notification-urgency.js";

describe("notification urgency", () => {
  it("marks priority related PROC as URGENT and bypasses Slack batch", () => {
    const input = {
      type: "RELATED_PROC_DISCOVERED",
      priorityMonitoring: true,
    };
    expect(resolveNotificationUrgency(input)).toBe("URGENT");
    expect(shouldBypassSlackOpportunityBatch(input)).toBe(true);
    expect(outboxPriorityForUrgency("URGENT", input.type)).toBe(100);
  });

  it("marks Pro high-match NEW_OPPORTUNITY as IMPORTANT (no 15m batch)", () => {
    const input = {
      type: "NEW_OPPORTUNITY",
      score: 85,
      planImmediateNewOpportunity: true,
    };
    expect(resolveNotificationUrgency(input)).toBe("IMPORTANT");
    expect(shouldBypassSlackOpportunityBatch(input)).toBe(true);
  });

  it("keeps normal NEW_OPPORTUNITY batched", () => {
    const input = {
      type: "NEW_OPPORTUNITY",
      score: 40,
      planImmediateNewOpportunity: true,
    };
    expect(resolveNotificationUrgency(input)).toBe("NORMAL");
    expect(shouldBypassSlackOpportunityBatch(input)).toBe(false);
  });

  it("Basic followed related stays IMPORTANT (prompt, not priority Hot Watch)", () => {
    const input = {
      type: "RELATED_PROC_DISCOVERED",
      priorityMonitoring: false,
    };
    expect(resolveNotificationUrgency(input)).toBe("IMPORTANT");
  });
});
