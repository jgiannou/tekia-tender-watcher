import { describe, expect, it } from "vitest";
import {
  evaluateRegionGate,
  normalizeRegionCodes,
  toNuts2,
} from "../src/saas/geo/nuts.js";
import { extractParticipationChecklist } from "../src/saas/services/participation-checklist.js";
import { buildPriceMemory } from "../src/saas/services/price-memory.js";
import { expiringWindow } from "../src/saas/services/expiring-contracts.js";
import { parseDiavgeiaSearch } from "../src/saas/services/diavgeia.js";
import {
  FREE_PLAN,
  PLAN_KEYS,
  BASIC_PLAN,
  PRO_PLAN,
  TRIAL_PLAN,
  entitlementsForPlanKey,
  normalizePlanKey,
  publicPlans,
} from "../src/saas/plans/catalog.js";

describe("competition PRD catalog", () => {
  it("exposes Free + Basic + Pro publicly", () => {
    const keys = publicPlans().map((plan) => plan.planKey);
    expect(keys).toEqual([PLAN_KEYS.free, PLAN_KEYS.basic, PLAN_KEYS.pro]);
    expect(FREE_PLAN.priceMonthlyEur).toBe(0);
    expect(FREE_PLAN.maxActiveFollowedTenders).toBe(5);
    expect(FREE_PLAN.companyVault).toBe(false);
    expect(FREE_PLAN.participationChecklist).toBe(false);
    expect(BASIC_PLAN.participationChecklist).toBe(true);
    expect(PRO_PLAN.priceMemory).toBe(true);
    expect(FREE_PLAN.slackNotifications).toBe(false);
    expect(BASIC_PLAN.slackNotifications).toBe(true);
    expect(PRO_PLAN.slackNotifications).toBe(true);
  });

  it("keeps trial as a Pro preview that does not replace Free", () => {
    expect(TRIAL_PLAN.plan).toBe("TRIAL");
    expect(TRIAL_PLAN.maxActiveFollowedTenders).toBe(PRO_PLAN.maxActiveFollowedTenders);
    expect(normalizePlanKey("free")).toBe(PLAN_KEYS.free);
    expect(entitlementsForPlanKey("free").plan).toBe("FREE");
  });
});

describe("NUTS region gate", () => {
  it("maps NUTS 3 to NUTS 2", () => {
    expect(toNuts2("EL411")).toBe("EL41");
    expect(toNuts2("el30")).toBe("EL30");
    expect(normalizeRegionCodes(["EL411", "EL30"])).toEqual(["EL41", "EL30"]);
  });

  it("treats empty selection as all of Greece", () => {
    expect(evaluateRegionGate("EL43", [], false)).toBe("ok");
  });

  it("excludes other regions and unclassified unless opted in", () => {
    expect(evaluateRegionGate("EL30", ["EL43"], false)).toBe("out_of_region");
    expect(evaluateRegionGate(null, ["EL43"], false)).toBe("unclassified");
    expect(evaluateRegionGate(null, ["EL43"], true)).toBe("ok");
    expect(evaluateRegionGate("EL43", ["EL43"], false)).toBe("ok");
  });
});

describe("participation checklist", () => {
  it("extracts fields and vault gaps without inventing values", () => {
    const text = `
      Προθεσμία υποβολής προσφορών: 15/12/2026
      Εγγυητική επιστολή συμμετοχής ύψους 1.000 €
      Κριτήριο κατακύρωσης: πλέον συμφέρουσα από οικονομική άποψη προσφορά
      Η σύμβαση διαιρείται σε 2 τμήματα
      Απαιτείται φορολογική ενημερότητα και ασφαλιστική ενημερότητα και ΓΕΜΗ.
    `;
    const checklist = extractParticipationChecklist(text, {
      vaultDocs: [{ name: "Φορολογική ενημερότητα.pdf", documentType: "Φορολογική" }],
    });
    expect(checklist.readable).toBe(true);
    expect(checklist.fields.find((f) => f.key === "deadline")?.value).toContain("15/12/2026");
    expect(checklist.fields.find((f) => f.key === "guarantee")?.status).toBe("found");
    expect(checklist.documents.find((d) => d.key === "tax")?.status).toBe(
      "needs_review",
    );
    expect(checklist.documents.find((d) => d.key === "insurance")?.status).toBe("missing");
    expect(checklist.documents.find((d) => d.key === "gemi")?.status).toBe("missing");
  });

  it("marks unread PDF without inventing fields", () => {
    const checklist = extractParticipationChecklist("short");
    expect(checklist.readable).toBe(false);
    expect(checklist.unreadMessage).toMatch(/χειροκίνητα|PDF/i);
    expect(checklist.fields).toEqual([]);
  });
});

describe("price memory and expiring window", () => {
  it("flags thin samples", () => {
    const memory = buildPriceMemory({
      cpv: "72000000",
      regionCode: "EL30",
      samples: [
        {
          referenceNumber: "26AWRD1",
          title: null,
          winnerName: "ΑΕ",
          awardAmount: 9000,
          budgetWithoutVat: 10000,
          ratio: 0.9,
          signedDate: null,
          publicKimdisUrl: null,
        },
      ],
    });
    expect(memory.thin).toBe(true);
    expect(memory.note).toBe("λίγες κατακυρώσεις");
  });

  it("uses a 3–9 month window", () => {
    const now = new Date("2026-10-09T12:00:00.000Z");
    const window = expiringWindow(now);
    const fromDays = (window.from.getTime() - now.getTime()) / (24 * 60 * 60 * 1000);
    const toDays = (window.to.getTime() - now.getTime()) / (24 * 60 * 60 * 1000);
    expect(fromDays).toBeCloseTo(90, 0);
    expect(toDays).toBeCloseTo(270, 0);
  });
});

describe("Diavgeia enrichment", () => {
  it("links ADA only when the decision mentions the ADAM", () => {
    const adam = "26PROC019704619";
    const hit = parseDiavgeiaSearch(
      {
        decisions: [
          {
            ada: "Ω123",
            subject: `Ανάθεση για ${adam}`,
            url: "https://diavgeia.gov.gr/decision/view/Ω123",
          },
        ],
      },
      adam,
    );
    expect(hit?.ada).toBe("Ω123");
    const miss = parseDiavgeiaSearch(
      { decisions: [{ ada: "Ω999", subject: "Άλλη απόφαση" }] },
      adam,
    );
    expect(miss).toBeNull();
  });
});
