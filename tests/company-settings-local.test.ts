import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  assertCompanySettingsOutsideBundle,
  defaultLocalCompanySettings,
} from "../apps/desktop/electron/company-settings-store.ts";

describe("local company settings persistence", () => {
  it("stores under Electron userData outside the app bundle", () => {
    const userData = "/Users/me/Library/Application Support/TEKIA Tender Watcher";
    const path = `${userData}/company-settings.json`;
    expect(assertCompanySettingsOutsideBundle(userData, path)).toBe(true);
    expect(
      assertCompanySettingsOutsideBundle(
        userData,
        "/Applications/TEKIA Tender Watcher.app/Contents/Resources/app.asar/company-settings.json",
      ),
    ).toBe(false);
  });

  it("desktop save/load wiring uses local store as source of truth", () => {
    const main = readFileSync(
      resolve(process.cwd(), "apps/desktop/electron/main.ts"),
      "utf8",
    );
    expect(main).toContain("tekia:company-settings-get");
    expect(main).toContain("tekia:company-settings-save");
    expect(main).toContain("saveLocalCompanySettings");

    const preload = readFileSync(
      resolve(process.cwd(), "apps/desktop/electron/preload.cjs"),
      "utf8",
    );
    expect(preload).toContain("companySettings");
    expect(preload).toContain("tekia:company-settings-save");

    const settingsUi = readFileSync(
      resolve(process.cwd(), "apps/dashboard/src/pages/SettingsPage.tsx"),
      "utf8",
    );
    expect(settingsUi).toContain("companySettings.save");
    expect(settingsUi).toContain("survive rebuilds");

    const vault = readFileSync(
      resolve(process.cwd(), "apps/desktop/electron/google/vault-service.ts"),
      "utf8",
    );
    expect(vault).toContain("getLocalCompanySettings()");
  });

  it("defaults include legal_form and website without inventing values", () => {
    const defaults = defaultLocalCompanySettings();
    expect(defaults.legal_form).toBe("");
    expect(defaults.website).toBe("");
    expect(defaults.distinctive_title_confirmed).toBe(false);
  });
});
