/**
 * Company Profile merge — matches the REAL "TEKIA – Tender Company Profile" placeholders.
 * Master template stays untouched; only generated copies are merged.
 * Never invents missing values. Never auto-syncs on save.
 */

import {
  buildReplaceAllTextRequests,
  findUnresolvedPlaceholders,
  placeholderToken,
} from "./template-merge.js";

/** Placeholders filled only from known Company Settings (or derived status text). */
export const COMPANY_PROFILE_AUTO_PLACEHOLDERS = [
  "LEGAL_NAME",
  "BRAND_NAME",
  "TRADING_NAME",
  "TRADING_NAME_STATUS",
  "LEGAL_FORM",
  "VAT_NUMBER",
  "TAX_OFFICE",
  "GEMI_NUMBER",
  "ADDRESS",
  "CONTACT_EMAIL",
  "CONTACT_PHONE",
  "WEBSITE",
] as const;

/**
 * Manual / narrative placeholders in the real template.
 * Filled only when the operator provides them in Company Settings — never invented.
 */
export const COMPANY_PROFILE_MANUAL_PLACEHOLDERS = [
  "PORTFOLIO_REFERENCES",
  "TECH_STACK",
  "PUBLIC_SECTOR_NOTES",
] as const;

export type CompanyProfileSettingsInput = {
  legal_name: string;
  brand_name: string;
  trading_name: string;
  contact_name: string;
  email: string;
  phone: string;
  address: string;
  vat_number: string;
  tax_office: string;
  gemi_number: string;
  distinctive_title_confirmed: boolean;
  legal_form: string;
  website: string;
  portfolio_references?: string;
  tech_stack?: string;
  public_sector_notes?: string;
};

export type CompanyProfileMergePlan = {
  replacements: Record<string, string>;
  skippedUnknown: string[];
  manualLeftIntact: string[];
  mapping: Array<{ settingsKey: string; placeholder: string; applied: boolean }>;
};

const nonEmpty = (value: string | null | undefined): string | null => {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

/**
 * Trading-name display for {{TRADING_NAME_STATUS}}.
 * Never claims a confirmed distinctive title when the flag is false.
 */
export const buildTradingNameStatus = (
  tradingName: string | null | undefined,
  distinctiveTitleConfirmed: boolean,
): string | null => {
  const name = nonEmpty(tradingName);
  if (!name) return null;
  if (distinctiveTitleConfirmed) {
    return `${name} (confirmed registered distinctive title)`;
  }
  return `${name} (trading / brand name — not a confirmed registered distinctive title)`;
};

/**
 * Build ReplaceAllText replacements from Company Settings for the real template.
 * Missing/blank settings values are omitted. Manual placeholders are never filled.
 */
export const buildCompanyProfileReplacements = (
  company: CompanyProfileSettingsInput,
): CompanyProfileMergePlan => {
  const replacements: Record<string, string> = {};
  const skippedUnknown: string[] = [];
  const mapping: CompanyProfileMergePlan["mapping"] = [];

  const setIfKnown = (
    placeholder: string,
    settingsKey: string,
    value: string | null | undefined,
  ) => {
    const v = nonEmpty(value);
    if (v) {
      replacements[placeholder] = v;
      mapping.push({ settingsKey, placeholder, applied: true });
    } else {
      skippedUnknown.push(placeholder);
      mapping.push({ settingsKey, placeholder, applied: false });
    }
  };

  setIfKnown("LEGAL_NAME", "legal_name", company.legal_name);
  setIfKnown("BRAND_NAME", "brand_name", company.brand_name);
  setIfKnown("TRADING_NAME", "trading_name", company.trading_name);
  setIfKnown(
    "TRADING_NAME_STATUS",
    "trading_name+distinctive_title_confirmed",
    buildTradingNameStatus(
      company.trading_name,
      company.distinctive_title_confirmed,
    ),
  );
  setIfKnown("LEGAL_FORM", "legal_form", company.legal_form);
  setIfKnown("VAT_NUMBER", "vat_number", company.vat_number);
  setIfKnown("TAX_OFFICE", "tax_office", company.tax_office);
  setIfKnown("GEMI_NUMBER", "gemi_number", company.gemi_number);
  setIfKnown("ADDRESS", "address", company.address);
  setIfKnown("CONTACT_EMAIL", "email", company.email);
  setIfKnown("CONTACT_PHONE", "phone", company.phone);
  setIfKnown("WEBSITE", "website", company.website);

  // Optional narrative fields — only when operator fills them in Settings
  setIfKnown(
    "PORTFOLIO_REFERENCES",
    "portfolio_references",
    company.portfolio_references,
  );
  setIfKnown("TECH_STACK", "tech_stack", company.tech_stack);
  setIfKnown(
    "PUBLIC_SECTOR_NOTES",
    "public_sector_notes",
    company.public_sector_notes,
  );

  const manualLeftIntact = COMPANY_PROFILE_MANUAL_PLACEHOLDERS.filter(
    (key) => !replacements[key],
  );

  return {
    replacements,
    skippedUnknown: [...new Set([...skippedUnknown, ...manualLeftIntact])],
    manualLeftIntact,
    mapping,
  };
};

/**
 * Simulate regenerate-from-master merge (idempotent Sync architecture).
 * Always starts from master text — never from a previously filled copy.
 */
export const applyReplacementsToMasterText = (
  masterText: string,
  replacements: Record<string, string>,
): string => {
  let out = masterText;
  for (const [key, value] of Object.entries(replacements)) {
    out = out.split(placeholderToken(key)).join(value);
  }
  return out;
};

export const companyProfileReplaceRequests = (
  replacements: Record<string, string>,
) => buildReplaceAllTextRequests(replacements);

export const GENERATED_COMPANY_PROFILE_NAME = "TEKIA – Tender Company Profile";
export const COMPANY_PROFILE_MASTER_NAME_HINT = "TEKIA – Company Profile Template";

export { findUnresolvedPlaceholders, placeholderToken };
