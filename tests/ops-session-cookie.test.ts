import { describe, expect, it } from "vitest";
import { buildSessionCookie } from "../src/saas/ops/session.js";

describe("buildSessionCookie", () => {
  it("uses __Secure prefix for https app URL", async () => {
    const cookie = await buildSessionCookie(
      "tok123",
      "dev-better-auth-secret-change-me",
      "https://arc-tenders.tekia.gr",
    );
    expect(cookie.name).toBe("__Secure-better-auth.session_token");
    expect(cookie.header).toContain("Secure");
    expect(cookie.header).toContain("Max-Age=");
    expect(cookie.value.startsWith("tok123.")).toBe(true);
  });

  it("omits Secure for http app URL", async () => {
    const cookie = await buildSessionCookie(
      "tok123",
      "dev-better-auth-secret-change-me",
      "http://127.0.0.1:5174",
    );
    expect(cookie.name).toBe("better-auth.session_token");
    expect(cookie.header).not.toContain("Secure");
  });
});
