/**
 * Cookie / tracker consent — optional tags load only after consent.
 *
 * - GTM loads analytics (GA4 tags live inside the container).
 * - Google Ads base tag (AW-…) loads only with marketing consent.
 * Do NOT paste gtag / GTM snippets into index.html (avoids double counting
 * and bypasses Consent Mode).
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
  /** Google Ads / Google tag ID from Ads → Tools → Google tag */
  ads: import.meta.env.VITE_GOOGLE_ADS_ID?.trim() || "AW-18392529196",
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
let adsInjected = false;
let consentDefaultPushed = false;

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

const pushGoogleConsentDefault = (analytics: boolean, marketing: boolean): void => {
  if (consentDefaultPushed) return;
  consentDefaultPushed = true;
  const gtag = ensureGtag();
  // Set BEFORE any gtm.js / gtag.js so tags evaluate with the user's choice.
  // (Default=denied then later update is too late: All Pages will not re-fire.)
  gtag("consent", "default", {
    analytics_storage: consentValue(analytics),
    ad_storage: consentValue(marketing),
    ad_user_data: consentValue(marketing),
    ad_personalization: consentValue(marketing),
  });
};

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
  pushGoogleConsentDefault(analytics, marketing);
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
 * Google Ads base tag (same as Ads UI gtag snippet). Only with marketing consent.
 * Do not also add this AW- ID as a Google tag inside GTM — conversion/remarketing
 * tags in GTM can still use the same account if needed.
 */
const injectGoogleAdsTag = (
  adsId: string,
  analytics: boolean,
  marketing: boolean,
): void => {
  if (adsInjected || typeof document === "undefined") return;
  if (!adsId.startsWith("AW-")) return;
  if (document.getElementById("arc-google-ads-script")) {
    adsInjected = true;
    return;
  }

  adsInjected = true;
  pushGoogleConsentDefault(analytics, marketing);
  redactSensitiveUrl();
  const gtag = ensureGtag();
  gtag("js", new Date());
  gtag("config", adsId);

  const script = document.createElement("script");
  script.id = "arc-google-ads-script";
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(adsId)}`;
  document.head.appendChild(script);
};

/**
 * Load optional trackers after consent.
 * GTM = analytics container (GA4). AW gtag = Google Ads base tag (marketing).
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

  if (marketing) {
    if (!adsInjected && !document.getElementById("arc-google-ads-script")) {
      injectGoogleAdsTag(TRACKING_IDS.ads, analytics, marketing);
    } else {
      adsInjected = true;
      pushGoogleConsentUpdate(analytics, marketing);
    }
  }

  window.dataLayer?.push({
    event: "arc_consent_update",
    arc_analytics: analytics,
    arc_marketing: marketing,
    arc_ga4: TRACKING_IDS.ga4,
    arc_google_ads: TRACKING_IDS.ads,
  });
};
