import { describe, expect, it } from "vitest";
import { isWebRelevant } from "../src/filters/web-relevance.js";
import { scoreOpportunity } from "../src/filters/scorer.js";
import { evaluateSlackEligibility } from "../src/filters/slack-eligibility.js";
import { classifyPdfText } from "../src/pdf/classify.js";

const scoreReq = (
  title: string,
  budget: number | null,
  extras?: { description?: string; cpvs?: string[]; hasNoticeRef?: boolean },
) => {
  const gate = isWebRelevant({
    title,
    description: extras?.description ?? "",
    cpvs: extras?.cpvs,
  });
  const scored = scoreOpportunity({
    recordType: "REQ",
    title,
    description: extras?.description ?? "",
    cpvs: extras?.cpvs ?? [],
    budgetWithoutVat: budget,
    minBudget: 1500,
    maxBudget: 30000,
    hasNoticeRef: Boolean(extras?.hasNoticeRef),
    isPrimaryRequest: true,
    webCategory: gate.category,
    mixedMarketing: gate.mixedMarketing,
  });
  const eligibility = evaluateSlackEligibility({
    recordType: "REQ",
    isWebRelevant: gate.isWebRelevant,
    category: gate.category,
    relevanceStatus: gate.status,
    score: scored.score,
    threshold: 60,
    hasNoticeRef: Boolean(extras?.hasNoticeRef),
    alreadyAdvanced: false,
    targetedSupplier: false,
    nonInvitedOffersRejected: false,
    pdfTextStatus: "skipped",
    finalSubmissionDate: null,
  });
  return { gate, scored, eligibility };
};

describe("refinement pass — real-world cases", () => {
  it("TEST 1: ΠΕΤΑ ΑΕ website maintenance REQ scores >= 70 and Slack allowed", () => {
    const { gate, scored, eligibility } = scoreReq(
      "Συντήρηση της ιστοσελίδας για την ΠΕΤΑ ΑΕ.",
      3500,
    );
    expect(gate.isWebRelevant).toBe(true);
    expect(gate.status).toBe("RELEVANT");
    expect(scored.score).toBeGreaterThanOrEqual(70);
    expect(scored.flags.earlyWebReqBonus).toBe(true);
    expect(eligibility.eligible).toBe(true);
  });

  it("TEST 2: Municipality new website REQ is high priority Slack", () => {
    const { gate, scored, eligibility } = scoreReq(
      "Δημιουργία νέας ιστοσελίδας Δήμου",
      8000,
      { cpvs: ["72413000-8"] },
    );
    expect(gate.isWebRelevant).toBe(true);
    expect(scored.score).toBeGreaterThanOrEqual(80);
    expect(eligibility.eligible).toBe(true);
  });

  it("TEST 3: Generic software maintenance is ignored", () => {
    const { gate, eligibility } = scoreReq("Συντήρηση εφαρμογών λογισμικού", 8000, {
      cpvs: ["72261000-2"],
    });
    expect(gate.isWebRelevant).toBe(false);
    expect(gate.status).toBe("IRRELEVANT");
    expect(eligibility.eligible).toBe(false);
  });

  it("TEST 4: PROC with unreadable PDF => Needs Review, no Slack", () => {
    const title = "Υπηρεσία αναβάθμισης/κατασκευής ιστοτόπου Δήμου";
    const gate = isWebRelevant({ title, description: "" });
    expect(gate.isWebRelevant).toBe(true);

    const eligibility = evaluateSlackEligibility({
      recordType: "PROC",
      isWebRelevant: true,
      category: gate.category,
      relevanceStatus: "NEEDS_REVIEW",
      score: 85,
      threshold: 60,
      hasNoticeRef: false,
      alreadyAdvanced: false,
      targetedSupplier: false,
      nonInvitedOffersRejected: false,
      pdfTextStatus: "unreadable",
      finalSubmissionDate: "2026-12-01T00:00:00.000Z",
    });
    expect(eligibility.eligible).toBe(false);
    expect(eligibility.reason).toMatch(/unreadable|Needs review/i);
  });

  it("TEST 5: PROC PDF with named recipient => Targeted, no Slack", () => {
    const pdf = classifyPdfText(`
      ΠΡΟΣ: COMPANY XYZ Α.Ε.
      Πρόσκληση υποβολής προσφοράς για αναβάθμιση ιστοτόπου
    `);
    expect(pdf.targetedSupplier).toBe(true);
    expect(pdf.targetedSupplierName).toContain("COMPANY XYZ");

    const eligibility = evaluateSlackEligibility({
      recordType: "PROC",
      isWebRelevant: true,
      category: "WEBSITE",
      relevanceStatus: "TARGETED",
      score: 90,
      threshold: 60,
      hasNoticeRef: false,
      alreadyAdvanced: false,
      targetedSupplier: true,
      nonInvitedOffersRejected: false,
      pdfTextStatus: "extracted",
      finalSubmissionDate: "2026-12-01T00:00:00.000Z",
    });
    expect(eligibility.eligible).toBe(false);
  });

  it("TEST 6: Open PROC with readable PDF and future deadline can Slack", () => {
    const title = "Υπηρεσία αναβάθμισης/κατασκευής ιστοτόπου Δήμου";
    const gate = isWebRelevant({ title, description: "" });
    const scored = scoreOpportunity({
      recordType: "PROC",
      title,
      description: "",
      cpvs: ["72413000-8"],
      budgetWithoutVat: 18000,
      minBudget: 1500,
      maxBudget: 30000,
      hasNoticeRef: false,
      isPrimaryRequest: false,
      webCategory: gate.category,
    });
    const eligibility = evaluateSlackEligibility({
      recordType: "PROC",
      isWebRelevant: gate.isWebRelevant,
      category: gate.category,
      relevanceStatus: "RELEVANT",
      score: scored.score,
      threshold: 60,
      hasNoticeRef: false,
      alreadyAdvanced: false,
      targetedSupplier: false,
      nonInvitedOffersRejected: false,
      pdfTextStatus: "extracted",
      finalSubmissionDate: "2099-12-01T00:00:00.000Z",
    });
    expect(gate.isWebRelevant).toBe(true);
    expect(eligibility.eligible).toBe(scored.score >= 60);
  });

  it("TEST 7: PROC with past deadline => Expired, no Slack", () => {
    const eligibility = evaluateSlackEligibility({
      recordType: "PROC",
      isWebRelevant: true,
      category: "WEBSITE",
      relevanceStatus: "EXPIRED",
      score: 90,
      threshold: 60,
      hasNoticeRef: false,
      alreadyAdvanced: false,
      targetedSupplier: false,
      nonInvitedOffersRejected: false,
      pdfTextStatus: "extracted",
      finalSubmissionDate: "2020-01-01T00:00:00.000Z",
    });
    expect(eligibility.eligible).toBe(false);
    expect(eligibility.reason).toMatch(/expired/i);
  });

  it("TEST 8: Social + website communications => Needs Review, no Slack", () => {
    const gate = isWebRelevant({
      title:
        "ΥΠΗΡΕΣΙΕΣ ΔΙΑΧΕΙΡΙΣΗΣ ΜΕΣΩΝ ΚΟΙΝΩΝΙΚΗΣ ΔΙΚΤΥΩΣΗΣ, ΙΣΤΟΤΟΠΟΥ ΚΑΙ ΕΠΙΚΟΙΝΩΝΙΑΣ ΔΡΑΣΕΩΝ",
      description: "",
    });
    expect(gate.isWebRelevant).toBe(false);
    expect(gate.status).toBe("NEEDS_REVIEW");
    expect(gate.mixedMarketing).toBe(true);

    const eligibility = evaluateSlackEligibility({
      recordType: "REQ",
      isWebRelevant: false,
      category: gate.category,
      relevanceStatus: gate.status,
      score: 70,
      threshold: 60,
      hasNoticeRef: false,
      alreadyAdvanced: false,
      targetedSupplier: false,
      nonInvitedOffersRejected: false,
      pdfTextStatus: "skipped",
      finalSubmissionDate: null,
    });
    expect(eligibility.eligible).toBe(false);
  });

  it("TEST 9: Substantial web + social remains Relevant with mixed penalty", () => {
    const title =
      "Αναβάθμιση ιστοσελίδας, WCAG, CMS και τεχνική υποστήριξη με παράλληλη υποστήριξη social media";
    const gate = isWebRelevant({ title, description: "" });
    expect(gate.isWebRelevant).toBe(true);
    expect(gate.status).toBe("RELEVANT");
    expect(gate.mixedMarketing).toBe(true);

    const scored = scoreOpportunity({
      recordType: "REQ",
      title,
      description: "",
      cpvs: [],
      budgetWithoutVat: 10000,
      minBudget: 1500,
      maxBudget: 30000,
      hasNoticeRef: false,
      isPrimaryRequest: true,
      webCategory: gate.category,
      mixedMarketing: true,
    });
    expect(scored.flags.mixedMarketing).toBe(true);
    expect(scored.reasons.some((r) => /Mixed marketing/i.test(r))).toBe(true);
  });

  it("TEST 10: Hosting-only information systems ignored", () => {
    const gate = isWebRelevant({
      title: "Αμοιβή για υπηρεσίες φιλοξενίας πληροφοριακών συστημάτων",
      description: "",
    });
    expect(gate.isWebRelevant).toBe(false);
    expect(["IRRELEVANT", "NEEDS_REVIEW"]).toContain(gate.status);
  });

  it("TEST 11: Hosting + website maintenance is Relevant", () => {
    const gate = isWebRelevant({
      title: "Φιλοξενία και συντήρηση ιστοσελίδας Δήμου",
      description: "",
    });
    expect(gate.isWebRelevant).toBe(true);
    expect(gate.status).toBe("RELEVANT");
  });

  it("TEST 12: Electronic protocol ignored", () => {
    const gate = isWebRelevant({
      title: "Συντήρηση/υποστήριξη ηλεκτρονικού πρωτοκόλλου",
      description: "",
    });
    expect(gate.isWebRelevant).toBe(false);
    expect(gate.status).toBe("IRRELEVANT");
  });

  it("REQ web application without notice is high priority", () => {
    const { gate, scored, eligibility } = scoreReq(
      "Ανάπτυξη web εφαρμογής",
      12000,
    );
    expect(gate.isWebRelevant).toBe(true);
    expect(scored.score).toBeGreaterThanOrEqual(70);
    expect(eligibility.eligible).toBe(true);
  });
});
