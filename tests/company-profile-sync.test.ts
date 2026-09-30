import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  applyReplacementsToMasterText,
  buildCompanyProfileReplacements,
  buildTradingNameStatus,
  COMPANY_PROFILE_MANUAL_PLACEHOLDERS,
  companyProfileReplaceRequests,
  findUnresolvedPlaceholders,
} from "../apps/desktop/electron/google/company-profile-merge.ts";

const baseCompany = {
  legal_name: "TEKIA IKE",
  brand_name: "TEKIA",
  trading_name: "TEKIA",
  contact_name: "Μαρία Παπαδοπούλου",
  email: "maria@tekia.gr",
  phone: "+30 210 0000000",
  address: "Αθήνα",
  vat_number: "123456789",
  tax_office: "Α' Αθηνών",
  gemi_number: "123456789000",
  distinctive_title_confirmed: false,
  legal_form: "IKE",
  website: "https://tekia.gr",
};

const REAL_MASTER = [
  "Legal: {{LEGAL_NAME}}",
  "Trading: {{TRADING_NAME_STATUS}}",
  "Form: {{LEGAL_FORM}}",
  "VAT: {{VAT_NUMBER}}",
  "Tax: {{TAX_OFFICE}}",
  "GEMI: {{GEMI_NUMBER}}",
  "Address: {{ADDRESS}}",
  "Email: {{CONTACT_EMAIL}}",
  "Phone: {{CONTACT_PHONE}}",
  "Web: {{WEBSITE}}",
  "Portfolio: {{PORTFOLIO_REFERENCES}}",
  "Stack: {{TECH_STACK}}",
  "Public: {{PUBLIC_SECTOR_NOTES}}",
].join("\n");

describe("company profile real-template mapping", () => {
  it("maps only placeholders that exist on the real Company Profile doc", () => {
    const plan = buildCompanyProfileReplacements(baseCompany);
    expect(plan.replacements).toMatchObject({
      LEGAL_NAME: "TEKIA IKE",
      BRAND_NAME: "TEKIA",
      TRADING_NAME: "TEKIA",
      LEGAL_FORM: "IKE",
      VAT_NUMBER: "123456789",
      TAX_OFFICE: "Α' Αθηνών",
      GEMI_NUMBER: "123456789000",
      ADDRESS: "Αθήνα",
      CONTACT_EMAIL: "maria@tekia.gr",
      CONTACT_PHONE: "+30 210 0000000",
      WEBSITE: "https://tekia.gr",
    });
    expect(plan.replacements.DISTINCTIVE_TITLE_CONFIRMED).toBeUndefined();
    expect(plan.replacements.CONTACT_NAME).toBeUndefined();
  });

  it("does not represent distinctive title as confirmed when flag is false", () => {
    expect(
      buildTradingNameStatus("TEKIA", false),
    ).toBe(
      "TEKIA (trading / brand name — not a confirmed registered distinctive title)",
    );
    expect(buildTradingNameStatus("TEKIA", true)).toBe(
      "TEKIA (confirmed registered distinctive title)",
    );
    const plan = buildCompanyProfileReplacements(baseCompany);
    expect(plan.replacements.TRADING_NAME_STATUS).toContain("not a confirmed");
    expect(plan.replacements.TRADING_NAME_STATUS.startsWith("TEKIA (confirmed")).toBe(
      false,
    );
  });

  it("does not invent blank values", () => {
    const plan = buildCompanyProfileReplacements({
      ...baseCompany,
      legal_name: "",
      website: "  ",
      legal_form: "",
    });
    expect(plan.replacements.LEGAL_NAME).toBeUndefined();
    expect(plan.replacements.WEBSITE).toBeUndefined();
    expect(plan.replacements.LEGAL_FORM).toBeUndefined();
    expect(plan.skippedUnknown).toEqual(
      expect.arrayContaining(["LEGAL_NAME", "WEBSITE", "LEGAL_FORM"]),
    );
  });

  it("leaves manual placeholders unresolved when blank, fills when operator provides them", () => {
    const blank = buildCompanyProfileReplacements(baseCompany);
    expect(blank.replacements.PORTFOLIO_REFERENCES).toBeUndefined();
    expect(blank.manualLeftIntact).toEqual(
      expect.arrayContaining(["PORTFOLIO_REFERENCES", "TECH_STACK", "PUBLIC_SECTOR_NOTES"]),
    );

    const filledPlan = buildCompanyProfileReplacements({
      ...baseCompany,
      portfolio_references: "Ref A, Ref B",
      tech_stack: "React / Node",
      public_sector_notes: "ESIDIS experience",
    });
    expect(filledPlan.replacements.PORTFOLIO_REFERENCES).toBe("Ref A, Ref B");
    expect(filledPlan.replacements.TECH_STACK).toBe("React / Node");
    expect(filledPlan.replacements.PUBLIC_SECTOR_NOTES).toBe("ESIDIS experience");
    expect(filledPlan.manualLeftIntact).toEqual([]);

    const filled = applyReplacementsToMasterText(REAL_MASTER, filledPlan.replacements);
    expect(findUnresolvedPlaceholders(filled)).toEqual([]);
  });
});

describe("company profile idempotent master→copy merge", () => {
  it("sync → change legal_name → sync again yields the new legal_name from master", () => {
    const master = REAL_MASTER;

    const sync1 = applyReplacementsToMasterText(
      master,
      buildCompanyProfileReplacements({
        ...baseCompany,
        legal_name: "Old Legal Name SA",
      }).replacements,
    );
    expect(sync1).toContain("Old Legal Name SA");
    expect(sync1).not.toContain("{{LEGAL_NAME}}");

    // Architecture: next Sync always starts from untouched master, not sync1
    const sync2 = applyReplacementsToMasterText(
      master,
      buildCompanyProfileReplacements({
        ...baseCompany,
        legal_name: "New Legal Name IKE",
      }).replacements,
    );
    expect(sync2).toContain("New Legal Name IKE");
    expect(sync2).not.toContain("Old Legal Name SA");
    expect(master).toContain("{{LEGAL_NAME}}");
  });

  it("Company Profile master remains unchanged conceptually (copy path only)", () => {
    const service = readFileSync(
      resolve(process.cwd(), "apps/desktop/electron/google/vault-service.ts"),
      "utf8",
    );
    expect(service).toContain("cloneGoogleDocToFolder(");
    expect(service).toContain("GENERATED_COMPANY_PROFILE_NAME");
    expect(service).toContain("masterUntouched: true");
    expect(service).toContain("trashDriveFile");
    expect(service).toContain("cleanupWarnings");
    expect(service).toContain("best-effort");
    expect(service).toContain(
      "await batchReplaceAllText(accessToken, copied.id, requests)",
    );
    expect(service).not.toMatch(
      /syncCompanyProfileFromSettings[\s\S]*batchReplaceAllText\(accessToken, master/,
    );
    // Must not abort Sync solely because an old manually created file cannot be trashed
    expect(service).not.toContain(
      "Failed to replace previous Company Profile copy",
    );
  });

  it("builds ReplaceAllText requests for known auto fields only", () => {
    const plan = buildCompanyProfileReplacements(baseCompany);
    const requests = companyProfileReplaceRequests(plan.replacements);
    expect(
      requests.every((r) => r.replaceAllText.replaceText.trim().length > 0),
    ).toBe(true);
    expect(
      requests.some(
        (r) => r.replaceAllText.containsText.text === "{{LEGAL_NAME}}",
      ),
    ).toBe(true);
    expect(
      requests.some(
        (r) =>
          r.replaceAllText.containsText.text === "{{PORTFOLIO_REFERENCES}}",
      ),
    ).toBe(false);
  });
});

describe("company profile sync safety", () => {
  it("is controlled — not auto on save; no send", () => {
    const settingsUi = readFileSync(
      resolve(process.cwd(), "apps/dashboard/src/pages/SettingsPage.tsx"),
      "utf8",
    );
    expect(settingsUi).toContain("Save company settings");
    expect(settingsUi).not.toContain("syncCompanyProfile()");
    expect(settingsUi).toContain("legal_form");
    expect(settingsUi).toContain("website");

    const panel = readFileSync(
      resolve(process.cwd(), "apps/dashboard/src/components/DriveVaultPanel.tsx"),
      "utf8",
    );
    expect(panel).toContain("Sync Company Profile");
    expect(panel).toContain("Templates/Company Profile");

    const merge = readFileSync(
      resolve(
        process.cwd(),
        "apps/desktop/electron/google/company-profile-merge.ts",
      ),
      "utf8",
    );
    expect(merge).not.toContain("sendEmail");
    expect(merge).not.toContain("submitOffer");
    expect(merge).not.toContain("submitToPortal");
  });

  it("clones pre-existing vault docs via export/import when native copy is forbidden", () => {
    const driveApi = readFileSync(
      resolve(process.cwd(), "apps/desktop/electron/google/drive-api.ts"),
      "utf8",
    );
    expect(driveApi).toContain("cloneGoogleDocToFolder");
    expect(driveApi).toContain("exportGoogleDocAsDocx");
    expect(driveApi).toContain("uploadDocxAsGoogleDoc");
    expect(driveApi).toContain('method: "export_import"');

    const service = readFileSync(
      resolve(process.cwd(), "apps/desktop/electron/google/vault-service.ts"),
      "utf8",
    );
    expect(service).toContain("cloneGoogleDocToFolder");
  });
});
