/**
 * Signup conversion / GA4 consent + idempotency for saas-web analytics helpers.
 * Uses a minimal localStorage polyfill (vitest node env).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const memory = new Map<string, string>();

const installStorage = () => {
  const storage = {
    getItem: (key: string) => (memory.has(key) ? memory.get(key)! : null),
    setItem: (key: string, value: string) => {
      memory.set(key, String(value));
    },
    removeItem: (key: string) => {
      memory.delete(key);
    },
    clear: () => memory.clear(),
    key: (index: number) => Array.from(memory.keys())[index] ?? null,
    get length() {
      return memory.size;
    },
  };
  class FakeCustomEvent {
    type: string;
    detail: unknown;
    constructor(type: string, init?: { detail?: unknown }) {
      this.type = type;
      this.detail = init?.detail;
    }
  }
  vi.stubGlobal("CustomEvent", FakeCustomEvent);
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("sessionStorage", storage);
  vi.stubGlobal("window", {
    localStorage: storage,
    sessionStorage: storage,
    dataLayer: [] as unknown[],
    gtag: undefined as undefined | ((...args: unknown[]) => void),
    location: { search: "", pathname: "/", origin: "https://arc-tenders.tekia.gr" },
    dispatchEvent: () => true,
  });
};

beforeEach(() => {
  memory.clear();
  installStorage();
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const setConsent = async (input: { analytics: boolean; marketing: boolean }) => {
  const consent = await import("@/legal/consent");
  consent.writeConsentState({
    decidedAt: new Date().toISOString(),
    analytics: input.analytics,
    marketing: input.marketing,
  });
};

describe("saas-web signup analytics", () => {
  it("does not fire Ads conversion or GA4 sign_up before consent", async () => {
    const analytics = await import("@/lib/analytics");
    const gtag = vi.fn();
    window.gtag = gtag;
    window.dataLayer = [];

    analytics.trackSignUpSuccess({
      userId: "user_signup_noconsent_abcdefgh",
      method: "email",
    });

    expect(gtag).not.toHaveBeenCalled();
    expect(
      (window.dataLayer as unknown[]).some(
        (entry) =>
          entry &&
          typeof entry === "object" &&
          "event" in entry &&
          (entry as { event: string }).event === "sign_up",
      ),
    ).toBe(false);
    expect(
      localStorage.getItem("arc.analytics.signUpPending.user_signup_noconsent_abcdefgh"),
    ).toBe("email");
  });

  it("fires conversion once after marketing consent and ignores reload/login flush", async () => {
    const analytics = await import("@/lib/analytics");
    const gtag = vi.fn();
    window.gtag = gtag;
    window.dataLayer = [];

    const userId = "user_signup_marketing_abcdefgh";
    analytics.trackSignUpSuccess({ userId, method: "email" });
    expect(gtag).not.toHaveBeenCalled();

    await setConsent({ analytics: false, marketing: true });
    analytics.flushPendingSignUpTracking(userId);

    expect(gtag).toHaveBeenCalledTimes(1);
    expect(gtag).toHaveBeenCalledWith("event", "conversion", {
      send_to: "AW-18392529196/xvBLCNXjwZkdEKzynsJE",
    });

    // Reload / login flush must not duplicate Ads conversion.
    analytics.flushPendingSignUpTracking(userId);
    analytics.trackSignUpSuccess({ userId, method: "email" });
    expect(gtag).toHaveBeenCalledTimes(1);

    // GA4 sign_up still blocked without analytics consent.
    expect(
      (window.dataLayer as unknown[]).some(
        (entry) =>
          entry &&
          typeof entry === "object" &&
          "event" in entry &&
          (entry as { event: string }).event === "sign_up",
      ),
    ).toBe(false);
  });

  it("fires GA4 sign_up once with analytics consent and not on subsequent flush", async () => {
    await setConsent({ analytics: true, marketing: false });
    const analytics = await import("@/lib/analytics");
    window.dataLayer = [];
    const gtag = vi.fn();
    window.gtag = gtag;

    const userId = "user_signup_analytics_abcdefgh";
    analytics.trackSignUpSuccess({ userId, method: "email" });

    const signUps = (window.dataLayer as unknown[]).filter(
      (entry) =>
        entry &&
        typeof entry === "object" &&
        "event" in entry &&
        (entry as { event: string }).event === "sign_up",
    );
    expect(signUps).toHaveLength(1);
    expect(gtag).not.toHaveBeenCalled();

    analytics.flushPendingSignUpTracking(userId);
    const signUpsAfter = (window.dataLayer as unknown[]).filter(
      (entry) =>
        entry &&
        typeof entry === "object" &&
        "event" in entry &&
        (entry as { event: string }).event === "sign_up",
    );
    expect(signUpsAfter).toHaveLength(1);
  });
});
