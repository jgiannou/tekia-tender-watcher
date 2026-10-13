import { describe, expect, it } from "vitest";
import {
  cpvMatches,
  resolveExpiringMatchCriteria,
} from "../src/saas/services/expiring-contracts.js";

describe("expiring contract matching eligibility", () => {
  it("does not match all contracts when wanted CPV list is empty", () => {
    expect(cpvMatches("72000000-5", [])).toBe(false);
    expect(cpvMatches(null, [])).toBe(false);
  });

  it("matches CPV prefixes when criteria exist", () => {
    expect(cpvMatches("72000000-5", ["72000000-5"])).toBe(true);
    expect(cpvMatches("72212000-4", ["72212000-4"])).toBe(true);
    expect(cpvMatches("72212000-4", ["72000000-5"])).toBe(false);
    expect(cpvMatches("45000000-7", ["72000000-5"])).toBe(false);
  });

  it("marks matchingReady false with no activities and no watch CPVs", () => {
    const result = resolveExpiringMatchCriteria({
      activities: [],
      watchProfileCpvs: [],
    });
    expect(result.matchingReady).toBe(false);
    expect(result.matchBasis).toBe("none");
    expect(result.wantedCpvs).toEqual([]);
  });

  it("marks matchingReady false when activities exist but map to no CPVs", () => {
    const result = resolveExpiringMatchCriteria({
      activities: [{ code: "99.99", description: "Unknown division" }],
      watchProfileCpvs: [],
    });
    expect(result.matchingReady).toBe(false);
    expect(result.matchBasis).toBe("none");
  });

  it("uses KAD→CPV suggestions from activities", () => {
    const result = resolveExpiringMatchCriteria({
      activities: [{ code: "62.01", description: "Programming" }],
      watchProfileCpvs: [],
    });
    expect(result.matchingReady).toBe(true);
    expect(result.matchBasis).toBe("activities");
    expect(result.wantedCpvs.some((code) => code.startsWith("72"))).toBe(true);
  });

  it("uses explicit saved-search CPVs without company activities", () => {
    const result = resolveExpiringMatchCriteria({
      activities: [],
      watchProfileCpvs: ["45000000-7"],
    });
    expect(result.matchingReady).toBe(true);
    expect(result.matchBasis).toBe("watch_profiles");
    expect(result.wantedCpvs).toContain("45000000-7");
  });

  it("combines activity and watch-profile bases", () => {
    const result = resolveExpiringMatchCriteria({
      activities: [{ code: "62.01", description: "Programming" }],
      watchProfileCpvs: ["45000000-7"],
    });
    expect(result.matchingReady).toBe(true);
    expect(result.matchBasis).toBe("both");
    expect(result.wantedCpvs).toContain("45000000-7");
  });
});
