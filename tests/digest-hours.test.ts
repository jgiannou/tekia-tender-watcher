import { describe, expect, it } from "vitest";
import {
  defaultDigestHoursForPlanKey,
  normalizeDigestHours,
  orgIsDueAtHour,
} from "../src/saas/services/digest-hours.js";
import { PLAN_KEYS } from "../src/saas/plans/catalog.js";
import { normalizeNotifications } from "../src/saas/services/org-settings.js";

describe("digest hours", () => {
  it("caps hours by plan periodic limit", () => {
    const hours = normalizeDigestHours(
      ["08:00", "10:00", "12:00", "14:00", "16:00", "18:00", "20:00"],
      2,
      PLAN_KEYS.basic,
    );
    expect(hours).toEqual(["08:00", "10:00"]);
  });

  it("falls back to plan defaults when empty/invalid", () => {
    expect(normalizeDigestHours([], 2, PLAN_KEYS.basic)).toEqual(
      defaultDigestHoursForPlanKey(PLAN_KEYS.basic),
    );
    expect(normalizeDigestHours(["25:00", "noon"], 1, PLAN_KEYS.trial)).toEqual(
      ["08:00"],
    );
  });

  it("Pro defaults to six daytime slots", () => {
    expect(defaultDigestHoursForPlanKey(PLAN_KEYS.pro)).toEqual([
      "08:00",
      "10:00",
      "12:00",
      "14:00",
      "16:00",
      "18:00",
    ]);
  });

  it("orgIsDueAtHour matches selected slots only", () => {
    expect(
      orgIsDueAtHour({ digestHours: ["08:00", "18:00"], hourKey: "08:00" }),
    ).toBe(true);
    expect(
      orgIsDueAtHour({ digestHours: ["08:00", "18:00"], hourKey: "12:00" }),
    ).toBe(false);
  });

  it("forces deadlineRadar off outside Pro", () => {
    const basic = normalizeNotifications(
      {
        emailEnabled: true,
        recipients: [],
        digestHours: ["08:00", "18:00"],
        events: {
          newOpportunity: true,
          relatedActOnFollowed: true,
          postSubmissionUpdate: true,
          deadlineRadar: true,
        },
      },
      PLAN_KEYS.basic,
    );
    expect(basic.events.deadlineRadar).toBe(false);

    const pro = normalizeNotifications(
      {
        emailEnabled: true,
        recipients: [],
        digestHours: ["08:00"],
        events: {
          newOpportunity: true,
          relatedActOnFollowed: true,
          postSubmissionUpdate: true,
          deadlineRadar: true,
        },
      },
      PLAN_KEYS.pro,
    );
    expect(pro.events.deadlineRadar).toBe(true);
    expect(pro.digestHours.length).toBe(1);
  });
});
