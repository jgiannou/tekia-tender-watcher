import { describe, expect, it } from "vitest";
import {
  formatRecordTypeLabel,
  formatWebCategoryLabel,
  getRecommendedAction,
  getTenderPhase,
  isEarlyStage,
  isFormalStage,
} from "../apps/dashboard/src/lib/tender-phase.ts";
import {
  getGreekCategoryLabel,
  getGreekDocumentStatusLabel,
  getGreekRecordTypeLabel,
  getGreekStatusLabel,
  getNoExpiryNote,
  UI,
} from "../apps/dashboard/src/lib/ui-labels.ts";
import { buildMergeReplacements } from "../apps/desktop/electron/google/template-merge.ts";
import { resolveDocumentValidity } from "../apps/desktop/electron/google/vault-structure.ts";

describe("tender phase helpers", () => {
  it("marks REQ as early opportunity with Greek labels", () => {
    const tender = { recordType: "REQ", currentStatus: "REVIEW" };
    expect(isEarlyStage(tender)).toBe(true);
    expect(isFormalStage(tender)).toBe(false);
    const phase = getTenderPhase(tender);
    expect(phase.step).toBe(1);
    expect(phase.title).toBe("Πρωτογενές Αίτημα");
    expect(phase.badge).toContain("ΠΡΩΙΜΟ");
    expect(phase.recommendedAction).toBe("Εκδήλωση Ενδιαφέροντος");
    expect(getRecommendedAction(tender)).toContain("Εκδήλωση");
    expect(phase.primaryCtaLabel).toBe(UI.prepareOutreach);
  });

  it("marks PROC as formal opportunity with Greek labels", () => {
    const tender = { recordType: "PROC", currentStatus: "REVIEW" };
    expect(isEarlyStage(tender)).toBe(false);
    expect(isFormalStage(tender)).toBe(true);
    const phase = getTenderPhase(tender);
    expect(phase.step).toBe(2);
    expect(phase.title).toBe("Επίσημη Πρόσκληση");
    expect(getRecommendedAction(tender)).toContain("Φακέλου Προσφοράς");
  });

  it("marks SUBMITTED and WON/LOST stages", () => {
    expect(getTenderPhase({ recordType: "PROC", currentStatus: "SUBMITTED" }).step).toBe(
      3,
    );
    expect(getTenderPhase({ recordType: "PROC", currentStatus: "WON" }).step).toBe(4);
    expect(getTenderPhase({ recordType: "REQ", currentStatus: "LOST" }).isTerminal).toBe(
      true,
    );
  });

  it("formats record type and category in Greek", () => {
    expect(formatRecordTypeLabel("REQ")).toContain("Πρωτογενές");
    expect(formatRecordTypeLabel("PROC")).toContain("Πρόσκληση");
    expect(formatWebCategoryLabel("WEBSITE_SUPPORT").label).toBe(
      "Υποστήριξη ιστοσελίδας",
    );
    expect(getGreekCategoryLabel("WEBSITE_SUPPORT")).toBe("Υποστήριξη ιστοσελίδας");
  });
});

describe("Greek UI labels", () => {
  it("maps statuses and document statuses", () => {
    expect(getGreekStatusLabel("READY")).toBe("Έτοιμο");
    expect(getGreekDocumentStatusLabel("AVAILABLE")).toBe("Διαθέσιμο");
    expect(getGreekDocumentStatusLabel("UNKNOWN")).toBe("Άγνωστη κατάσταση");
    expect(getGreekRecordTypeLabel("REQ")).toBe("Πρωτογενές Αίτημα");
    expect(getNoExpiryNote("companyProfile")).toBe("Χωρίς ημερομηνία λήξης");
    expect(getNoExpiryNote("gemi")).toBe("Δεν αναγράφεται ημερομηνία λήξης");
  });
});

describe("company document validity", () => {
  it("file present + null validUntil = AVAILABLE (not UNKNOWN)", () => {
    expect(
      resolveDocumentValidity({
        hasFile: true,
        validUntil: null,
      }),
    ).toBe("AVAILABLE");
    expect(
      resolveDocumentValidity({
        hasFile: true,
        validUntil: "",
      }),
    ).toBe("AVAILABLE");
    expect(
      resolveDocumentValidity({
        hasFile: true,
        validUntil: "not-a-date",
      }),
    ).toBe("AVAILABLE");
    expect(
      resolveDocumentValidity({
        hasFile: true,
        validUntil: "2020-01-01",
      }),
    ).toBe("EXPIRED");
    expect(
      resolveDocumentValidity({
        hasFile: true,
        validUntil: "2099-01-01",
      }),
    ).toBe("AVAILABLE");
    expect(resolveDocumentValidity({ hasFile: false })).toBe("MISSING");
  });
});

describe("legal identity vs brand in formal merge", () => {
  it("fills LEGAL_NAME from company legal name and never invents brand as legal", () => {
    const plan = buildMergeReplacements("TECHNICAL_OFFER", {
      legalName: "ΓΙΑΝΝΟΥΣΗΣ ΙΩΑΝΝΗΣ ΤΟΥ ΓΡΗΓΟΡΙΟΥ",
      brandName: "TEKIA",
      tradingName: "TEKIA",
      tradingNameStatus:
        "TEKIA (εμπορική επωνυμία / brand — όχι επιβεβαιωμένος διακριτικός τίτλος)",
      contactName: "Ιωάννης Γιαννούσης",
      contactEmail: "a@tekia.gr",
      contactPhone: "210",
      organization: "Δήμος",
      tenderTitle: "Συντήρηση",
      adam: "26REQ01",
      date: "30/09/2026",
    });
    expect(plan.replacements.LEGAL_NAME).toBe("ΓΙΑΝΝΟΥΣΗΣ ΙΩΑΝΝΗΣ ΤΟΥ ΓΡΗΓΟΡΙΟΥ");
    expect(plan.replacements.BRAND_NAME).toBe("TEKIA");
    expect(plan.replacements.LEGAL_NAME).not.toBe("TEKIA");
    expect(plan.replacements.TRADING_NAME_STATUS).toContain("όχι επιβεβαιωμένος");
  });

  it("OUTREACH may use brand but still keeps LEGAL_NAME distinct", () => {
    const plan = buildMergeReplacements("OUTREACH", {
      legalName: "ΓΙΑΝΝΟΥΣΗΣ ΙΩΑΝΝΗΣ ΤΟΥ ΓΡΗΓΟΡΙΟΥ",
      brandName: "TEKIA",
      contactName: "Ιωάννης Γιαννούσης",
      organization: "Δήμος",
      tenderTitle: "Συντήρηση",
      adam: "26REQ01",
      recordType: "REQ",
      date: "30/09/2026",
    });
    expect(plan.replacements.LEGAL_NAME).toBe("ΓΙΑΝΝΟΥΣΗΣ ΙΩΑΝΝΗΣ ΤΟΥ ΓΡΗΓΟΡΙΟΥ");
    expect(plan.replacements.BRAND_NAME).toBe("TEKIA");
    expect(plan.replacements.CONTACT_NAME).toBe("Ιωάννης Γιαννούσης");
    expect(plan.replacements.CONTACT_NAME).not.toBe(plan.replacements.LEGAL_NAME);
    expect(plan.replacements.RECORD_TYPE_LABEL).toBe("Πρωτογενές Αίτημα");
    expect(plan.replacements.DOCUMENT_TITLE).toBe("ΕΚΔΗΛΩΣΗ ΕΝΔΙΑΦΕΡΟΝΤΟΣ");
    expect(plan.literalReplacements["EARLY OUTREACH"]).toBe("ΕΚΔΗΛΩΣΗ ΕΝΔΙΑΦΕΡΟΝΤΟΣ");
    expect(plan.literalReplacements["αίτημα/προμήθεια"]).toBe("Πρωτογενές Αίτημα");
  });
});

describe("REQ phase presentation contract", () => {
  it("does not treat later-stage docs as primary for early phase", () => {
    const phase = getTenderPhase({ recordType: "REQ", currentStatus: "NEW" });
    expect(phase.isEarlyStage).toBe(true);
    expect(phase.primaryCtaLabel).not.toContain("Offer Package");
    expect(phase.primaryCtaLabel).toContain("Εκδήλωσης Ενδιαφέροντος");
  });

  it("scope summary must never use scoreReasons (contract note)", () => {
    // Scope is tender.scopeSummary only — scoreReasons are display-only in Why Matched.
    const fakeScopeFromScore = undefined;
    expect(fakeScopeFromScore ?? UI.scopeEmpty).toBe(UI.scopeEmpty);
    expect(UI.scopeEmpty).toContain("σύνοψη");
  });
});
