import { describe, expect, it } from "vitest";
import {
  formatRecordTypeLabel,
  formatWebCategoryLabel,
  getRecommendedAction,
  getTenderPhase,
  isEarlyStage,
  isFormalStage,
} from "../apps/dashboard/src/lib/tender-phase.ts";
import { buildMergeReplacements } from "../apps/desktop/electron/google/template-merge.ts";

describe("tender phase helpers", () => {
  it("marks REQ as early opportunity", () => {
    const tender = { recordType: "REQ", currentStatus: "REVIEW" };
    expect(isEarlyStage(tender)).toBe(true);
    expect(isFormalStage(tender)).toBe(false);
    const phase = getTenderPhase(tender);
    expect(phase.step).toBe(1);
    expect(phase.badge).toContain("EARLY");
    expect(getRecommendedAction(tender)).toContain("Early Outreach");
  });

  it("marks PROC as formal opportunity", () => {
    const tender = { recordType: "PROC", currentStatus: "REVIEW" };
    expect(isEarlyStage(tender)).toBe(false);
    expect(isFormalStage(tender)).toBe(true);
    const phase = getTenderPhase(tender);
    expect(phase.step).toBe(2);
    expect(getRecommendedAction(tender)).toContain("Prepare Offer Package");
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

  it("formats record type and category for humans", () => {
    expect(formatRecordTypeLabel("REQ")).toContain("Πρωτογενές");
    expect(formatRecordTypeLabel("PROC")).toContain("Procurement");
    expect(formatWebCategoryLabel("WEBSITE_SUPPORT").label).toBe("Website Support");
  });
});

describe("legal identity vs brand in formal merge", () => {
  it("fills LEGAL_NAME from company legal name and never invents brand as legal", () => {
    const plan = buildMergeReplacements("TECHNICAL_OFFER", {
      legalName: "ΓΙΑΝΝΟΥΣΗΣ ΙΩΑΝΝΗΣ ΤΟΥ ΓΡΗΓΟΡΙΟΥ",
      brandName: "TEKIA",
      tradingName: "TEKIA",
      tradingNameStatus:
        "TEKIA (trading / brand name — not a confirmed registered distinctive title)",
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
    expect(plan.replacements.TRADING_NAME_STATUS).toContain("not a confirmed");
  });
});
