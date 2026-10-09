/**
 * Cookie / tracker consent — GTM loads only after optional consent.
 *
 * Use GTM as the single loader. Keep GA4 (and later Ads) tags inside GTM.
 * Do NOT also paste the standalone gtag.js snippet into the HTML.
 */

import { redactSensitiveUrl } from "@/lib/safe-page-path";

export type ConsentCategory = "essential" | "analytics" | "marketing";

export type ConsentState = {
  /** ISO timestamp of last decision; null = no decision yet */
  decidedAt: string | null;
  analytics: boolean;
  marketing: boolean;
};

const STORAGE_KEY = "arc.cookieConsent.v1";

/** Public client IDs — overridable via Vite env. */
export const TRACKING_IDS = {
  gtm: import.meta.env.VITE_GTM_ID?.trim() || "GTM-KJ8T4GQ4",
  ga4: import.meta.env.VITE_GA4_MEASUREMENT_ID?.trim() || "G-WG2W3WE5QD",
} as const;

/**
 * Banner renders when any optional category is enabled.
 * Marketing on so Ads tags in GTM can be gated by Consent Mode.
 */
export const CONSENT_FEATURES = {
  analyticsEnabled: true,
  marketingEnabled: true,
} as const;

export const optionalConsentRequired = (): boolean =>
  CONSENT_FEATURES.analyticsEnabled || CONSENT_FEATURES.marketingEnabled;

export const defaultConsentState = (): ConsentState => ({
  decidedAt: null,
  analytics: false,
  marketing: false,
});

export const readConsentState = (): ConsentState => {
  if (typeof window === "undefined") return defaultConsentState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultConsentState();
    const parsed = JSON.parse(raw) as Partial<ConsentState>;
    return {
      decidedAt: typeof parsed.decidedAt === "string" ? parsed.decidedAt : null,
      analytics: Boolean(parsed.analytics),
      marketing: Boolean(parsed.marketing),
    };
  } catch {
    return defaultConsentState();
  }
};

export const writeConsentState = (next: ConsentState): void => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent("arc:cookie-consent", { detail: next }));
};

export const acceptAllOptionalConsent = (): ConsentState => {
  const next: ConsentState = {
    decidedAt: new Date().toISOString(),
    analytics: CONSENT_FEATURES.analyticsEnabled,
    marketing: CONSENT_FEATURES.marketingEnabled,
  };
  writeConsentState(next);
  return next;
};

export const rejectOptionalConsent = (): ConsentState => {
  const next: ConsentState = {
    decidedAt: new Date().toISOString(),
    analytics: false,
    marketing: false,
  };
  writeConsentState(next);
  return next;
};

export const saveCustomConsent = (input: {
  analytics: boolean;
  marketing: boolean;
}): ConsentState => {
  const next: ConsentState = {
    decidedAt: new Date().toISOString(),
    analytics: CONSENT_FEATURES.analyticsEnabled ? input.analytics : false,
    marketing: CONSENT_FEATURES.marketingEnabled ? input.marketing : false,
  };
  writeConsentState(next);
  return next;
};

/** Call before loading any optional third-party script. */
export const hasConsent = (category: ConsentCategory): boolean => {
  if (category === "essential") return true;
  if (category === "analytics" && !CONSENT_FEATURES.analyticsEnabled) return false;
  if (category === "marketing" && !CONSENT_FEATURES.marketingEnabled) return false;
  const state = readConsentState();
  if (category === "analytics") return state.analytics;
  if (category === "marketing") return state.marketing;
  return false;
};

type GtagConsentState = "granted" | "denied";

type GtagFn = (...args: unknown[]) => void;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: GtagFn;
  }
}

let gtmInjected = false;

const ensureGtag = (): GtagFn => {
  window.dataLayer = window.dataLayer || [];
  if (!window.gtag) {
    // Must push `arguments` (not a rest array) — matches Google's gtag bootstrap.
    window.gtag = function gtag(this: void) {
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer?.push(arguments);
    };
  }
  return window.gtag;
};

const consentValue = (granted: boolean): GtagConsentState =>
  granted ? "granted" : "denied";

const pushGoogleConsentUpdate = (analytics: boolean, marketing: boolean): void => {
  const gtag = ensureGtag();
  gtag("consent", "update", {
    analytics_storage: consentValue(analytics),
    ad_storage: consentValue(marketing),
    ad_user_data: consentValue(marketing),
    ad_personalization: consentValue(marketing),
  });
};

const injectGoogleTagManager = (
  containerId: string,
  analytics: boolean,
  marketing: boolean,
): void => {
  if (gtmInjected || typeof document === "undefined") return;
  if (!containerId.startsWith("GTM-")) return;
  if (document.getElementById("arc-gtm-script")) {
    gtmInjected = true;
    return;
  }

  gtmInjected = true;
  const gtag = ensureGtag();
  // We only inject after the user already chose — set that state BEFORE gtm.js
  // so All Pages / Google Tag evaluate with analytics_storage granted.
  // (Default=denied then later update is too late: All Pages will not re-fire.)
  gtag("consent", "default", {
    analytics_storage: consentValue(analytics),
    ad_storage: consentValue(marketing),
    ad_user_data: consentValue(marketing),
    ad_personalization: consentValue(marketing),
  });
  // Google reads window.location for page_view. Strip tokens before gtm.js.
  redactSensitiveUrl();
  window.dataLayer?.push({
    "gtm.start": new Date().getTime(),
    event: "gtm.js",
  });

  const script = document.createElement("script");
  script.id = "arc-gtm-script";
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(containerId)}`;
  document.head.appendChild(script);
};

/**
 * Load GTM after optional consent. GA4/Ads tags live inside the container.
 * Standalone gtag.js is intentionally not injected (avoids double counting).
 */
export const loadOptionalTrackersIfAllowed = (): void => {
  if (typeof window === "undefined") return;

  const analytics = hasConsent("analytics");
  const marketing = hasConsent("marketing");
  if (!analytics && !marketing) return;

  if (!gtmInjected && !document.getElementById("arc-gtm-script")) {
    injectGoogleTagManager(TRACKING_IDS.gtm, analytics, marketing);
  } else {
    gtmInjected = true;
    pushGoogleConsentUpdate(analytics, marketing);
  }

  window.dataLayer?.push({
    event: "arc_consent_update",
    arc_analytics: analytics,
    arc_marketing: marketing,
    arc_ga4: TRACKING_IDS.ga4,
  });
};
