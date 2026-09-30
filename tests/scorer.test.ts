import { describe, expect, it } from "vitest";
import { scoreOpportunity } from "../src/filters/scorer.js";

describe("scoring (post web-gate)", () => {
  it("scores a relevant website opportunity highly", () => {
    const result = scoreOpportunity({
      recordType: "REQ",
      title: "Δημιουργία νέας ιστοσελίδας και συντήρηση",
      description: "Ανάπτυξη web εφαρμογής και φιλοξενία CMS WordPress",
      cpvs: ["72413000-8"],
      budgetWithoutVat: 8000,
      minBudget: 1500,
      maxBudget: 30000,
      hasNoticeRef: false,
      isPrimaryRequest: true,
      webCategory: "WEBSITE",
    });

    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.flags.earlyStage).toBe(true);
    expect(result.flags.highConfidenceWebCpv).toBe(true);
  });

  it("does not score broad CPV hardware as highly relevant on its own", () => {
    const result = scoreOpportunity({
      recordType: "REQ",
      title: "Προμήθεια Η/Υ και εκτυπωτών",
      description: "Αγορά εξοπλισμού hardware",
      cpvs: ["72261000-2"],
      budgetWithoutVat: 12000,
      minBudget: 1500,
      maxBudget: 30000,
      hasNoticeRef: false,
      isPrimaryRequest: true,
      webCategory: "UNKNOWN",
    });

    expect(result.score).toBeLessThan(60);
  });
});
