import { describe, expect, it } from "vitest";
import { scoreOpportunity } from "../src/filters/scorer.js";

describe("scoring", () => {
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
    });

    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.flags.earlyStage).toBe(true);
    expect(result.flags.stronglyRelevantCpv).toBe(true);
  });

  it("excludes obvious hardware procurement", () => {
    const result = scoreOpportunity({
      recordType: "REQ",
      title: "Προμήθεια Η/Υ και εκτυπωτών",
      description: "Αγορά εξοπλισμού hardware και τηλεπικοινωνιακός εξοπλισμός",
      cpvs: ["30200000-1"],
      budgetWithoutVat: 12000,
      minBudget: 1500,
      maxBudget: 30000,
      hasNoticeRef: false,
      isPrimaryRequest: true,
    });

    expect(result.score).toBeLessThan(40);
    expect(result.flags.hardwareDominant).toBe(true);
  });
});
