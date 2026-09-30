import { describe, expect, it } from "vitest";
import { isWebRelevant } from "../src/filters/web-relevance.js";
import { scoreOpportunity } from "../src/filters/scorer.js";

describe("hard web relevance gate", () => {
  it("rejects PC repair / Η/Υ maintenance with broad CPV", () => {
    const result = isWebRelevant({
      title:
        "Για την παροχή υπηρεσιών επισκευής, συντήρησης και συναφών υπηρεσιών Η/Υ και λογισμικού",
      description: "",
      cpvs: ["72261000-2"],
    });
    expect(result.isWebRelevant).toBe(false);
    expect(result.status).toBe("IRRELEVANT");
  });

  it("rejects generic software maintenance", () => {
    const result = isWebRelevant({
      title: "Συντήρηση εφαρμογών λογισμικού του Δ.Λ.Τ.Λ.",
      description: "",
      cpvs: ["72261000-2"],
    });
    expect(result.isWebRelevant).toBe(false);
    expect(result.status).toBe("IRRELEVANT");
  });

  it("rejects electronic protocol maintenance", () => {
    const result = isWebRelevant({
      title:
        "Πρόσκληση υποβολής προσφοράς παροχής υπηρεσιών συντήρησης/υποστήριξης ηλεκτρονικού πρωτοκόλλου",
      description: "",
    });
    expect(result.isWebRelevant).toBe(false);
    expect(result.status).toBe("IRRELEVANT");
  });

  it("rejects hosting-only information systems", () => {
    const result = isWebRelevant({
      title: "Αμοιβή για υπηρεσίες φιλοξενίας πληροφοριακών συστημάτων",
      description: "Hosting υπηρεσιών",
    });
    expect(result.isWebRelevant).toBe(false);
    expect(result.ignoreReason).toMatch(/Hosting-only/i);
  });

  it("accepts municipality website creation", () => {
    const result = isWebRelevant({
      title: "Δημιουργία νέας ιστοσελίδας Δήμου και συντήρηση",
      description: "Ανάπτυξη και συντήρηση ιστοσελίδας",
      cpvs: ["72413000-8"],
    });
    expect(result.isWebRelevant).toBe(true);
    expect(result.status).toBe("RELEVANT");
    expect(["WEBSITE", "WEBSITE_SUPPORT"]).toContain(result.category);

    const score = scoreOpportunity({
      recordType: "REQ",
      title: "Δημιουργία νέας ιστοσελίδας Δήμου και συντήρηση",
      description: "Ανάπτυξη και συντήρηση ιστοσελίδας",
      cpvs: ["72413000-8"],
      budgetWithoutVat: 8000,
      minBudget: 1500,
      maxBudget: 30000,
      hasNoticeRef: false,
      isPrimaryRequest: true,
      webCategory: result.category,
    });
    expect(score.score).toBeGreaterThanOrEqual(80);
  });

  it("accepts website redesign", () => {
    const result = isWebRelevant({
      title: "Αναβάθμιση και επανασχεδιασμός ιστοσελίδας",
      description: "",
    });
    expect(result.isWebRelevant).toBe(true);
    expect(result.category).toBe("WEBSITE");
  });

  it("accepts web application for citizen requests", () => {
    const result = isWebRelevant({
      title: "Ανάπτυξη διαδικτυακής εφαρμογής διαχείρισης αιτημάτων πολιτών",
      description: "",
    });
    expect(result.isWebRelevant).toBe(true);
    expect(result.category).toBe("WEB_APPLICATION");

    const score = scoreOpportunity({
      recordType: "REQ",
      title: "Ανάπτυξη διαδικτυακής εφαρμογής διαχείρισης αιτημάτων πολιτών",
      description: "",
      cpvs: ["72200000-7"],
      budgetWithoutVat: 15000,
      minBudget: 1500,
      maxBudget: 30000,
      hasNoticeRef: false,
      isPrimaryRequest: true,
      webCategory: result.category,
    });
    expect(score.score).toBeGreaterThanOrEqual(70);
  });

  it("marks generic information system as needs review", () => {
    const result = isWebRelevant({
      title: "Ανάπτυξη πληροφοριακού συστήματος",
      description: "",
    });
    expect(result.isWebRelevant).toBe(false);
    expect(result.status).toBe("NEEDS_REVIEW");
  });

  it("accepts hosting when website is clearly in scope", () => {
    const result = isWebRelevant({
      title: "Φιλοξενία, τεχνική υποστήριξη και συντήρηση ιστοσελίδας Δήμου",
      description: "",
    });
    expect(result.isWebRelevant).toBe(true);
    expect(["WEBSITE", "WEBSITE_SUPPORT"]).toContain(result.category);
  });

  it("rejects hardware/software equipment procurement", () => {
    const result = isWebRelevant({
      title: "Προμήθεια εξοπλισμού πληροφορικής και λογισμικού",
      description: "",
    });
    expect(result.isWebRelevant).toBe(false);
    expect(result.status).toBe("IRRELEVANT");
  });

  it("does not let broad CPV alone produce a notify score path", () => {
    const gate = isWebRelevant({
      title: "Συντήρηση εφαρμογών λογισμικού",
      description: "",
      cpvs: ["72261000-2"],
    });
    expect(gate.isWebRelevant).toBe(false);
    // Gate fails ⇒ poll job forces score=0 / no Slack
  });
});
