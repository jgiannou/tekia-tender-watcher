import { describe, expect, it } from "vitest";
import {
  BASIC_PLAN,
  FREE_PLAN,
  HIGH_MATCH_SCORE_THRESHOLD,
  PRO_PLAN,
} from "../src/saas/plans/catalog.js";
import { decideProductEmail } from "../src/saas/services/email-channel-policy.js";
import type { NotificationPreferences } from "../src/saas/services/org-settings.js";

const prefs = (
  overrides: Partial<NotificationPreferences> = {},
): NotificationPreferences => ({
  emailEnabled: true,
  recipients: ["owner@example.com"],
  digestHours: ["08:00"],
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

describe("email channel policy", () => {
  it("defers Free product email to weekly digest", () => {
    const decision = decideProductEmail({
      plan: FREE_PLAN,
      prefs: prefs(),
      type: "OPPORTUNITY_DIGEST",
      hasNewItems: true,
    });
    expect(decision.allow).toBe(false);
    expect(decision.reason).toBe("deferred_to_weekly_digest");
  });

  it("blocks Free weekly when opted out", () => {
    const decision = decideProductEmail({
      plan: FREE_PLAN,
      prefs: prefs({ weeklyEmailEnabled: false }),
      type: "OPPORTUNITY_DIGEST",
    });
    expect(decision.allow).toBe(false);
    expect(decision.reason).toBe("weekly_opt_out");
  });

  it("allows Basic opportunity digest at digest hours", () => {
    const decision = decideProductEmail({
      plan: BASIC_PLAN,
      prefs: prefs(),
      type: "OPPORTUNITY_DIGEST",
      hasNewItems: true,
    });
    expect(decision).toEqual({
      allow: true,
      path: "digest_hours",
      reason: "opportunity_digest",
    });
  });

  it("skips quiet digests without new items", () => {
    const decision = decideProductEmail({
      plan: BASIC_PLAN,
      prefs: prefs(),
      type: "OPPORTUNITY_DIGEST",
      hasNewItems: false,
    });
    expect(decision.allow).toBe(false);
    expect(decision.reason).toBe("quiet_no_new_items");
  });

  it("allows Pro high-match immediate new opportunity", () => {
    const decision = decideProductEmail({
      plan: PRO_PLAN,
      prefs: prefs({ emailDeliveryMode: "IMMEDIATE" }),
      type: "NEW_OPPORTUNITY",
      matchScore: HIGH_MATCH_SCORE_THRESHOLD,
    });
    expect(decision.allow).toBe(true);
    if (decision.allow) expect(decision.path).toBe("immediate");
  });

  it("keeps Basic new opportunities out of immediate email", () => {
    const decision = decideProductEmail({
      plan: BASIC_PLAN,
      prefs: prefs({ emailDeliveryMode: "IMMEDIATE" }),
      type: "NEW_OPPORTUNITY",
      matchScore: 99,
    });
    expect(decision.allow).toBe(false);
  });
});

describe("commercial catalog limits", () => {
  it("locks Basic at 5 searches / 30 follows and Free weekly cadence", () => {
    expect(BASIC_PLAN.maxActiveWatchProfiles).toBe(5);
    expect(BASIC_PLAN.maxActiveFollowedTenders).toBe(30);
    expect(FREE_PLAN.emailCadence).toBe("WEEKLY");
    expect(FREE_PLAN.maxDigestHoursPerDay).toBe(0);
    expect(FREE_PLAN.periodicScansPerDay).toBe(0);
    expect(PRO_PLAN.maxDigestHoursPerDay).toBe(6);
    expect(PRO_PLAN.immediateNewOpportunity).toBe(true);
  });
});
