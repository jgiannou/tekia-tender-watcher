import { describe, expect, it } from "vitest";
import {
  assignWeeklyDigestSlot,
  isWeeklySlotDue,
  weeklyCycleId,
} from "../src/saas/services/weekly-digest-schedule.js";

describe("weekly digest schedule", () => {
  it("assigns stable weekday/hour from organization id", () => {
    const a = assignWeeklyDigestSlot("org-stable-1");
    const b = assignWeeklyDigestSlot("org-stable-1");
    const c = assignWeeklyDigestSlot("org-stable-2");
    expect(a).toEqual(b);
    expect(a.weeklyDigestWeekday).toBeGreaterThanOrEqual(0);
    expect(a.weeklyDigestWeekday).toBeLessThanOrEqual(6);
    expect(a.weeklyDigestHour).toMatch(/^\d{2}:00$/);
    expect(
      a.weeklyDigestWeekday !== c.weeklyDigestWeekday ||
        a.weeklyDigestHour !== c.weeklyDigestHour,
    ).toBe(true);
  });

  it("detects due slot in Europe/Athens", () => {
    const slot = assignWeeklyDigestSlot("due-org");
    // Construct a Date that formats to the slot in Athens by scanning.
    let found: Date | null = null;
    const start = new Date("2026-10-05T00:00:00.000Z");
    for (let i = 0; i < 60 * 24 * 8; i += 30) {
      const candidate = new Date(start.getTime() + i * 60_000);
      if (
        isWeeklySlotDue({
          weeklyDigestWeekday: slot.weeklyDigestWeekday,
          weeklyDigestHour: slot.weeklyDigestHour,
          now: candidate,
        })
      ) {
        found = candidate;
        break;
      }
    }
    expect(found).not.toBeNull();
  });

  it("produces an ISO week cycle id", () => {
    expect(weeklyCycleId(new Date("2026-10-10T12:00:00.000Z"))).toMatch(
      /^\d{4}-W\d{2}$/,
    );
  });
});
