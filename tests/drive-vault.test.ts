import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  buildVaultDiscovery,
  parseDriveFolderInput,
  resolveDocumentValidity,
  selectMasterTemplate,
  validateDriveVault,
  GOOGLE_DOC_MIME,
} from "../apps/desktop/electron/google/vault-structure.ts";

describe("drive vault discovery", () => {
  it("requires only the root folder and discovers known children by name", () => {
    const discovered = buildVaultDiscovery({
      root: { id: "root1", name: "Tenders" },
      topChildren: [
        { id: "cd", name: "Company Documents" },
        { id: "tp", name: "Templates" },
        { id: "sb", name: "Submissions" },
      ],
      companyDocChildren: [
        { id: "gemi", name: "GEMI" },
        { id: "tax", name: "Tax Clearance" },
        { id: "ins", name: "Insurance Clearance" },
        { id: "kad", name: "KAD" },
        { id: "cp", name: "Company Profile" },
      ],
      templateChildren: [
        { id: "eo", name: "Early Outreach" },
        { id: "tech", name: "Technical Offer" },
        { id: "econ", name: "Economic Offer" },
        { id: "dec", name: "Declarations" },
        { id: "cpt", name: "Company Profile" },
      ],
    });

    expect(discovered.missing).toEqual([]);
    expect(discovered.top.companyDocuments?.id).toBe("cd");
    expect(discovered.companyDocs.gemi?.id).toBe("gemi");
    expect(discovered.templates.technicalOffer?.id).toBe("tech");
    expect(discovered.templates.companyProfile?.id).toBe("cpt");
    expect(discovered.companyDocs.companyProfile?.id).toBe("cp");

    const health = validateDriveVault(discovered);
    expect(health.root.ok).toBe(true);
    expect(health.missing).toEqual([]);
    expect(health.companyDocuments.every((x) => x.ok)).toBe(true);
  });

  it("missing child folder produces warning, not crash", () => {
    const discovered = buildVaultDiscovery({
      root: { id: "root1", name: "Tenders" },
      topChildren: [
        { id: "cd", name: "Company Documents" },
        { id: "tp", name: "Templates" },
        { id: "sb", name: "Submissions" },
      ],
      companyDocChildren: [
        { id: "gemi", name: "GEMI" },
        { id: "tax", name: "Tax Clearance" },
        // Insurance Clearance missing
        { id: "kad", name: "KAD" },
        { id: "cp", name: "Company Profile" },
      ],
      templateChildren: [
        { id: "eo", name: "Early Outreach" },
        { id: "tech", name: "Technical Offer" },
        { id: "econ", name: "Economic Offer" },
        { id: "dec", name: "Declarations" },
        { id: "cpt", name: "Company Profile" },
      ],
    });

    expect(discovered.missing).toContain("Insurance Clearance");
    const health = validateDriveVault(discovered);
    const insurance = health.companyDocuments.find(
      (x) => x.name === "Insurance Clearance",
    );
    expect(insurance?.ok).toBe(false);
  });

  it("parses Drive folder URLs and raw IDs", () => {
    expect(
      parseDriveFolderInput(
        "https://drive.google.com/drive/folders/abcXYZ12345abcdefghijk",
      ),
    ).toBe("abcXYZ12345abcdefghijk");
    expect(parseDriveFolderInput("abcXYZ12345abcdefghijk")).toBe(
      "abcXYZ12345abcdefghijk",
    );
    expect(parseDriveFolderInput("not-a-folder")).toBeNull();
  });
});

describe("document validity + templates", () => {
  it("expired document appears EXPIRED; unknown expiry is not treated as valid", () => {
    expect(
      resolveDocumentValidity({
        hasFile: true,
        validUntil: "2020-01-01",
      }),
    ).toBe("EXPIRED");
    expect(
      resolveDocumentValidity({
        hasFile: true,
        validUntil: null,
      }),
    ).toBe("UNKNOWN");
    expect(
      resolveDocumentValidity({
        hasFile: true,
        validUntil: "2099-01-01",
      }),
    ).toBe("AVAILABLE");
    expect(resolveDocumentValidity({ hasFile: false })).toBe("MISSING");
  });

  it("selects single Google Doc master; multiple => Needs Configuration", () => {
    const one = selectMasterTemplate([
      {
        id: "1",
        name: "TEKIA – Technical Offer Template",
        mimeType: GOOGLE_DOC_MIME,
        webViewLink: "https://docs.google.com/document/d/1",
      },
    ]);
    expect(one.status).toBe("READY");

    const many = selectMasterTemplate([
      {
        id: "1",
        name: "A",
        mimeType: GOOGLE_DOC_MIME,
        webViewLink: "https://docs.google.com/document/d/1",
      },
      {
        id: "2",
        name: "B",
        mimeType: GOOGLE_DOC_MIME,
        webViewLink: "https://docs.google.com/document/d/2",
      },
    ]);
    expect(many.status).toBe("NEEDS_CONFIGURATION");
  });
});

describe("drive security boundary", () => {
  it("renderer preload never exposes Google OAuth tokens", () => {
    const preload = readFileSync(
      resolve(process.cwd(), "apps/desktop/electron/preload.cjs"),
      "utf8",
    );
    expect(preload).toContain("drive,");
    expect(preload).toContain("tekia:drive-connect");
    expect(preload).not.toContain("accessToken");
    expect(preload).not.toContain("refreshToken");
    expect(preload).not.toContain("getGoogleTokens");
    expect(preload).not.toContain("GOOGLE_OAUTH_CLIENT_SECRET");
    expect(preload).not.toContain("safeStorage");
  });

  it("Google API / OAuth code lives in Electron Main modules only", () => {
    const walk = (dirPath: string, files: string[] = []): string[] => {
      for (const entry of readdirSync(dirPath)) {
        const full = join(dirPath, entry);
        const st = statSync(full);
        if (st.isDirectory()) walk(full, files);
        else if (/\.(ts|tsx|cjs|js)$/.test(full)) files.push(full);
      }
      return files;
    };

    const dashboardFiles = walk(resolve(process.cwd(), "apps/dashboard/src"));
    for (const file of dashboardFiles) {
      const content = readFileSync(file, "utf8");
      expect(content.includes("googleapis.com/oauth2")).toBe(false);
      expect(content.includes("GOOGLE_OAUTH_CLIENT_SECRET")).toBe(false);
      expect(content.includes("VITE_GOOGLE")).toBe(false);
      expect(content.includes("refresh_token")).toBe(false);
    }

    const main = readFileSync(
      resolve(process.cwd(), "apps/desktop/electron/main.ts"),
      "utf8",
    );
    expect(main).toContain("tekia:drive-connect");
    expect(main).toContain("tekia:drive-create-workspace");
    expect(main).toContain("from \"./google/vault-service.js\"");
  });

  it("cloud watcher source has no Google OAuth credentials wiring", () => {
    const walk = (dirPath: string, files: string[] = []): string[] => {
      for (const entry of readdirSync(dirPath)) {
        const full = join(dirPath, entry);
        const st = statSync(full);
        if (st.isDirectory()) walk(full, files);
        else if (full.endsWith(".ts")) files.push(full);
      }
      return files;
    };

    for (const file of walk(resolve(process.cwd(), "src"))) {
      const content = readFileSync(file, "utf8");
      expect(content.includes("GOOGLE_OAUTH")).toBe(false);
      expect(content.includes("drive.file")).toBe(false);
    }
  });

  it("copy helper comments enforce master template is never edited", () => {
    const driveApi = readFileSync(
      resolve(process.cwd(), "apps/desktop/electron/google/drive-api.ts"),
      "utf8",
    );
    expect(driveApi).toContain("master template is never modified");
    expect(driveApi).toContain("/copy?");

    const service = readFileSync(
      resolve(process.cwd(), "apps/desktop/electron/google/vault-service.ts"),
      "utf8",
    );
    expect(service).toContain("masterUntouched: true");
    expect(service).toContain("createTenderWorkspace");
    expect(service).toContain("preparePackageReadiness");
    // Prepare package readiness does not send
    expect(service).not.toContain("sendEmail");
    expect(service).not.toContain("submitOffer");
  });

  it("disconnect clears auth without Drive delete helpers", () => {
    const store = readFileSync(
      resolve(process.cwd(), "apps/desktop/electron/google/vault-store.ts"),
      "utf8",
    );
    expect(store).toContain("clearGoogleAuth");
    expect(store).not.toContain("files.delete");
    expect(store).toContain("tenderDocuments"); // historical refs retained
  });
});
