/**
 * Local Company Settings for Electron — survives app rebuilds/releases.
 * Stored under Electron userData (not inside the app bundle).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";

export type LocalCompanySettings = {
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
  portfolio_references: string;
  tech_stack: string;
  public_sector_notes: string;
};

export type LocalOperatorSettingsBundle = {
  company: LocalCompanySettings;
  updatedAt: string;
};

const ensureDir = (): void => {
  mkdirSync(app.getPath("userData"), { recursive: true });
};

export const companySettingsPath = (): string =>
  join(app.getPath("userData"), "company-settings.json");

export const defaultLocalCompanySettings = (): LocalCompanySettings => ({
  legal_name: "",
  brand_name: "TEKIA",
  trading_name: "TEKIA",
  contact_name: "",
  email: "",
  phone: "",
  address: "",
  vat_number: "",
  tax_office: "",
  gemi_number: "",
  distinctive_title_confirmed: false,
  legal_form: "",
  website: "",
  portfolio_references: "",
  tech_stack: "",
  public_sector_notes: "",
});

const normalizeCompany = (
  raw: Partial<LocalCompanySettings> | null | undefined,
): LocalCompanySettings => ({
  ...defaultLocalCompanySettings(),
  ...(raw ?? {}),
  legal_form: raw?.legal_form ?? "",
  website: raw?.website ?? "",
  portfolio_references: raw?.portfolio_references ?? "",
  tech_stack: raw?.tech_stack ?? "",
  public_sector_notes: raw?.public_sector_notes ?? "",
  distinctive_title_confirmed: Boolean(raw?.distinctive_title_confirmed),
});

export const hasLocalCompanySettings = (): boolean => {
  const path = companySettingsPath();
  if (!existsSync(path)) return false;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as {
      company?: Partial<LocalCompanySettings>;
    };
    const company = normalizeCompany(parsed.company);
    return Object.values(company).some((v) =>
      typeof v === "string" ? v.trim().length > 0 : v === true,
    );
  } catch {
    return false;
  }
};

export const getLocalCompanySettings = (): LocalOperatorSettingsBundle => {
  const path = companySettingsPath();
  if (!existsSync(path)) {
    return {
      company: defaultLocalCompanySettings(),
      updatedAt: new Date(0).toISOString(),
    };
  }
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<LocalOperatorSettingsBundle>;
    return {
      company: normalizeCompany(parsed.company),
      updatedAt: parsed.updatedAt ?? new Date(0).toISOString(),
    };
  } catch {
    return {
      company: defaultLocalCompanySettings(),
      updatedAt: new Date(0).toISOString(),
    };
  }
};

export const saveLocalCompanySettings = (
  company: LocalCompanySettings,
): LocalOperatorSettingsBundle => {
  ensureDir();
  const next: LocalOperatorSettingsBundle = {
    company: normalizeCompany(company),
    updatedAt: new Date().toISOString(),
  };
  writeFileSync(companySettingsPath(), JSON.stringify(next, null, 2), "utf8");
  return next;
};

/** True when path is under Electron userData (outside app.asar / release bundle). */
export const assertCompanySettingsOutsideBundle = (
  userDataPath: string,
  settingsFilePath: string,
): boolean =>
  settingsFilePath.startsWith(userDataPath) &&
  !settingsFilePath.includes("app.asar") &&
  !settingsFilePath.includes("/Contents/Resources/");
