import { describe, expect, it } from "vitest";
import { classifyPdfText } from "../src/pdf/classify.js";
import { repairGreekPdfText } from "../src/pdf/greek-text.js";
import {
  CLASSIFICATION_VERSION,
  buildSourceFingerprint,
  shouldReevaluateTender,
} from "../src/filters/classification-meta.js";
import { evaluateSlackEligibility } from "../src/filters/slack-eligibility.js";
import { scoreOpportunity } from "../src/filters/scorer.js";
import { isWebRelevant } from "../src/filters/web-relevance.js";
import { assessInvitation } from "../src/relations/invitation-identity.js";
import { formatBootstrapSummaryMessage } from "../src/slack/format-message.js";

describe("pdf classify", () => {
  it("detects already-targeted invitation text", () => {
    const text = `
      ΠΡΟΣ: ΑΒΓ Πληροφορική Α.Ε.
      Η παρούσα πρόσκληση απευθύνεται στον ανωτέρω οικονομικό φορέα.
      Δεν λαμβάνονται υπόψη προσφορές οικονομικών φορέων που δεν προσκλήθηκαν.
    `;

    const result = classifyPdfText(text);
    expect(result.targetedSupplier).toBe(true);
    expect(result.targetedSupplierName).toContain("ΑΒΓ");
    expect(result.nonInvitedOffersRejected).toBe(true);
  });

  it("marks already advanced award language", () => {
    const text = `
      Αποφασίζει την ανάθεση στην εταιρεία Χ.
      Η πλέον συμφέρουσα προσφορά της εταιρείας επελέγη μετά από έρευνα αγοράς.
    `;

    const result = classifyPdfText(text);
    expect(result.stage).toBe("ALREADY_ADVANCED");
    expect(result.advancedPhraseHits).toBeGreaterThanOrEqual(2);
  });

  it("does not treat internal ΠΡΟΣ department as targeted supplier (Kamatero REQ)", () => {
    const text = `
      ΔΗΜΟΣ ΑΓΙΩΝ ΑΝΑΡΓΥΡΩΝ – ΚΑΜΑΤΕΡΟΥ
      ΠΡΟΣ: Τμήμα Προμηθειών
      ΘΕΜΑ: Διαβίβαση της υπ’ αριθ. 36/2026 μελέτης
      για την ανάθεση υπηρεσιών διαδικτυακής πλατφόρμας
      Διαδικασία ανάθεσης: Απευθείας ανάθεση
    `;
    const result = classifyPdfText(text);
    expect(result.targetedSupplierName).toBeNull();
    expect(result.targetedSupplier).toBe(false);
    expect(result.nonInvitedOffersRejected).toBe(false);
  });

  it("detects Evrotas-style mojibake ΠΡΟΣ + non-invited clause", () => {
    // Real pdf-parse artifacts: U+03A2 instead of Σ, glyph swaps in exclusion clause
    const text = `
ΣΜΗΜΑ  ΠΡΟΜΗΘΕΙΩΝ 
ΠΡΟ\u03A2 
Dotsoft Α.Ε. 
ΠΡΟ\u03A2ΚΛΗ\u03A2Η 
  \u03A2θμειϊνεται  ότι  δεν  λαμβάνονται  υπόψθ  προςφορζσ  οικονομικϊν  φορζων που  δεν 
προςκλήθηκαν  να  υποβάλουν  προςφορά.  (άρκρο  120)
    `;

    expect(repairGreekPdfText("ΠΡΟ\u03A2")).toBe("ΠΡΟΣ");

    const result = classifyPdfText(text);
    expect(result.targetedSupplierName).toMatch(/Dotsoft/i);
    expect(result.nonInvitedOffersRejected).toBe(true);
    expect(result.targetedSupplier).toBe(true);

    const invitation = assessInvitation(result, {
      legalName: "TEKIA ΙΚΕ",
      vatNumber: null,
    });
    expect(invitation.invitationType).toBe("TARGETED");
    expect(invitation.invitedVendorName).toMatch(/Dotsoft/i);
    expect(invitation.ourInvitationStatus).toBe("NOT_INVITED");
  });

  it("still detects clean OPEN PROC without named supplier", () => {
    const text = `
      ΠΡΟΣ: Όλους τους ενδιαφερόμενους οικονομικούς φορείς
      Πρόσκληση υποβολής προσφοράς για αναβάθμιση ιστοτόπου δήμου.
      Η διαδικασία είναι ανοικτή.
    `;
    const result = classifyPdfText(text);
    expect(result.targetedSupplier).toBe(false);
    expect(result.nonInvitedOffersRejected).toBe(false);
  });
});

describe("Kamatero REQ scoring acceptance", () => {
  const title =
    "Υπηρεσίες παροχής, φιλοξενίας, λειτουργίας & υποστήριξης διαδικτυακής πλατφόρμας ΔΑΑΚ";
  const description =
    "παροχή ολοκληρωμένου συνόλου αλληλένδετων υπηρεσιών στο πλαίσιο συνδρομητικής διαδικτυακής υπηρεσίας τύπου Software as a Service – SaaS";

  it("26REQ019899344: RELEVANT WEB_PLATFORM score >= 60, Slack eligible", () => {
    const pdf = classifyPdfText(`
      ΠΡΟΣ: Τμήμα Προμηθειών
      ΘΕΜΑ: Διαβίβαση μελέτης για διαδικτυακή πλατφόρμα
    `);
    expect(pdf.targetedSupplier).toBe(false);

    const gate = isWebRelevant({
      title,
      description,
      cpvs: ["72260000-5"],
    });
    expect(gate.isWebRelevant).toBe(true);
    expect(["WEB_PLATFORM", "WEB_APPLICATION", "WEBSITE"]).toContain(
      gate.category,
    );

    const scored = scoreOpportunity({
      recordType: "REQ",
      title,
      description,
      cpvs: ["72260000-5"],
      budgetWithoutVat: 30000,
      minBudget: 1500,
      maxBudget: 80000,
      hasNoticeRef: false,
      isPrimaryRequest: true,
      webCategory: gate.category,
      pdf: {
        alreadyAdvanced: false,
        targetedSupplier: pdf.targetedSupplier,
        nonInvitedOffersRejected: pdf.nonInvitedOffersRejected,
      },
    });

    expect(scored.score).toBeGreaterThanOrEqual(60);
    expect(scored.score).not.toBe(0);

    const eligibility = evaluateSlackEligibility({
      recordType: "REQ",
      isWebRelevant: true,
      category: gate.category,
      relevanceStatus: "RELEVANT",
      score: scored.score,
      threshold: 60,
      hasNoticeRef: false,
      alreadyAdvanced: false,
      targetedSupplier: false,
      nonInvitedOffersRejected: false,
      pdfTextStatus: "extracted",
      finalSubmissionDate: null,
    });
    expect(eligibility.eligible).toBe(true);
    expect(eligibility.code).toBe("ELIGIBLE");
  });

  it("stale score=0 can heal after re-eval decision", () => {
    const fp = buildSourceFingerprint({
      recordType: "REQ",
      title,
      description,
      organization: "ΔΗΜΟΣ ΑΓΙΩΝ ΑΝΑΡΓΥΡΩΝ - ΚΑΜΑΤΕΡΟΥ",
      cpvs: ["72260000-5"],
      budgetWithoutVat: 30000,
      finalSubmissionDate: null,
      hasNoticeRef: false,
    });

    expect(
      shouldReevaluateTender({
        storedVersion: 1,
        storedFingerprint: fp,
        currentFingerprint: fp,
        score: 0,
        relevanceStatus: "RELEVANT",
        pdfTextStatus: "extracted",
        recordType: "REQ",
        webRelevant: 1,
      }),
    ).toBe(true);

    expect(
      shouldReevaluateTender({
        storedVersion: CLASSIFICATION_VERSION,
        storedFingerprint: fp,
        currentFingerprint: fp,
        score: 75,
        relevanceStatus: "RELEVANT",
        pdfTextStatus: "extracted",
        recordType: "REQ",
        webRelevant: 1,
      }),
    ).toBe(false);
  });
});

describe("Evrotas PROC Slack gate", () => {
  it("26PROC019894972 must NOT alert as OPEN PROC", () => {
    const text = `
ΠΡΟ\u03A2 
Dotsoft Α.Ε. 
  δεν  λαμβάνονται  υπόψθ  προςφορζσ  οικονομικϊν  φορζων που  δεν 
προςκλήθηκαν  να  υποβάλουν  προςφορά.
    `;
    const pdf = classifyPdfText(text);
    expect(pdf.targetedSupplier).toBe(true);
    expect(pdf.nonInvitedOffersRejected).toBe(true);

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
      nonInvitedOffersRejected: true,
      pdfTextStatus: "extracted",
      finalSubmissionDate: "2099-12-01T00:00:00.000Z",
    });
    expect(eligibility.eligible).toBe(false);
    expect(eligibility.code).toBe("TARGETED_OTHER");
  });

  it("actually open PROC remains Slack eligible", () => {
    const eligibility = evaluateSlackEligibility({
      recordType: "PROC",
      isWebRelevant: true,
      category: "WEBSITE",
      relevanceStatus: "RELEVANT",
      score: 80,
      threshold: 60,
      hasNoticeRef: false,
      alreadyAdvanced: false,
      targetedSupplier: false,
      nonInvitedOffersRejected: false,
      pdfTextStatus: "extracted",
      finalSubmissionDate: "2099-12-01T00:00:00.000Z",
    });
    expect(eligibility.eligible).toBe(true);
    expect(eligibility.code).toBe("ELIGIBLE");
  });
});

describe("bootstrap summary", () => {
  it("summarizes high-priority leads without implying a flood", () => {
    const text = formatBootstrapSummaryMessage({
      highPriorityCount: 5,
      recentHours: 48,
      examples: [
        {
          adam: "26REQ019899344",
          title: "Διαδικτυακή πλατφόρμα",
          score: 80,
          organization: "Δήμος Καματερού",
        },
      ],
    });
    expect(text).toContain("Bootstrap completed");
    expect(text).toContain("5 high-priority");
    expect(text).toContain("26REQ019899344");
    expect(text).toMatch(/suppressed|flooding/i);
  });
});
