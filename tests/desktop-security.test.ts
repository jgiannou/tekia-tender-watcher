import { describe, expect, it } from "vitest";
import { isAllowedExternalUrl, parseDeepLink } from "../apps/desktop/electron/url-safety.ts";
import {
  assertDesktopCannotAutoSend,
  DESKTOP_EXTERNAL_SENDING_ENABLED,
  FORBIDDEN_DESKTOP_SEND_SYMBOLS,
} from "../apps/desktop/electron/no-auto-send.ts";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

describe("desktop url safety", () => {
  it("allows https and blocks unsafe schemes", () => {
    expect(isAllowedExternalUrl("https://cerpp.eprocurement.gov.gr/x")).toBe(true);
    expect(isAllowedExternalUrl("http://example.com")).toBe(false);
    expect(isAllowedExternalUrl("file:///etc/passwd")).toBe(false);
    expect(isAllowedExternalUrl("javascript:alert(1)")).toBe(false);
  });

  it("optionally allows localhost http in development", () => {
    expect(
      isAllowedExternalUrl("http://127.0.0.1:5173", { allowHttpLocalhost: true }),
    ).toBe(true);
    expect(
      isAllowedExternalUrl("http://localhost:5173", { allowHttpLocalhost: true }),
    ).toBe(true);
  });

  it("parses tekia-tender deep links", () => {
    expect(parseDeepLink("tekia-tender://tender/26REQ019")).toEqual({
      type: "tender",
      referenceNumber: "26REQ019",
    });
    expect(parseDeepLink("https://example.com")).toBeNull();
  });
});

describe("desktop security boundary", () => {
  it("keeps auto-sending disabled", () => {
    assertDesktopCannotAutoSend();
    expect(DESKTOP_EXTERNAL_SENDING_ENABLED).toBe(false);
  });

  it("does not define automatic send helpers in desktop electron code", () => {
    const walk = (dirPath: string, files: string[] = []): string[] => {
      for (const entry of readdirSync(dirPath)) {
        const full = join(dirPath, entry);
        const st = statSync(full);
        if (st.isDirectory()) walk(full, files);
        else if (full.endsWith(".ts")) files.push(full);
      }
      return files;
    };

    const root = resolve(process.cwd(), "apps/desktop/electron");
    const files = walk(root).filter((f) => !f.endsWith("no-auto-send.ts"));

    for (const file of files) {
      const content = readFileSync(file, "utf8");
      for (const symbol of FORBIDDEN_DESKTOP_SEND_SYMBOLS) {
        expect(content.includes(`function ${symbol}`)).toBe(false);
        expect(content.includes(`const ${symbol}`)).toBe(false);
        expect(content.includes(`${symbol}(`)).toBe(false);
      }
    }
  });

  it("preload expose surface does not include token or node APIs", () => {
    const preload = readFileSync(
      resolve(process.cwd(), "apps/desktop/electron/preload.cjs"),
      "utf8",
    );
    expect(preload).toContain("contextBridge.exposeInMainWorld");
    expect(preload).not.toContain("getDecryptedToken");
    expect(preload).not.toContain("safeStorage");
    expect(preload).not.toContain("fs.");
    expect(preload).not.toContain("child_process");
    expect(preload).toContain("isDesktop: true");
  });

  it("main process owns API requests and token storage", () => {
    const main = readFileSync(
      resolve(process.cwd(), "apps/desktop/electron/main.ts"),
      "utf8",
    );
    expect(main).toContain("tekia:api-request");
    expect(main).toContain("requestSingleInstanceLock");
    expect(main).toContain("contextIsolation: true");
    expect(main).toContain("nodeIntegration: false");
    expect(main).toContain("sandbox: true");

    const store = readFileSync(
      resolve(process.cwd(), "apps/desktop/electron/secure-store.ts"),
      "utf8",
    );
    expect(store).toContain("safeStorage");
    expect(store).toContain("encryptString");
  });
});
