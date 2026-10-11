/**
 * Product analytics (GA4 via GTM dataLayer) + Google Ads conversions (gtag event).
 *
 * GTM is the only Google Tag loader (legal/consent.ts). Conversion events call
 * gtag('event','conversion') and reuse the GTM-provided gtag — never inject AW again.
 * GA4 events need analytics consent. Ads conversions need marketing consent.
 */
import {
  CONSENT_FEATURES,
  hasConsent,
  readConsentState,
  TRACKING_IDS,
} from "@/legal/consent";
import { safePagePath } from "@/lib/safe-page-path";

export const ANALYTICS_EVENT_NAMES = [
  "login",
  "sign_up",
  "onboarding_completed",
  "first_saved_search",
  "begin_checkout",
  "purchase",
  "subscription_started",
  "organization_created",
  "watch_profile_created",
  "tender_followed",
  "button_click",
] as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENT_NAMES)[number];

/** Google Ads → ARC Tenders - Free Signup */
export const GOOGLE_ADS_SIGNUP_CONVERSION =
  import.meta.env.VITE_GOOGLE_ADS_SIGNUP_CONVERSION?.trim() ||
  `${TRACKING_IDS.ads}/xvBLCNXjwZkdEKzynsJE`;

const PARAM_KEYS = new Set([
  "page_path",
  "page_title",
  "page_location",
  "button_name",
  "link_url",
  "method",
  "plan",
  "billing_interval",
  "value",
  "currency",
  "content_type",
  "item_id",
  "source",
]);

const CHECKOUT_KEY = "arc.analytics.checkout";
const PURCHASE_SENT_KEY = "arc.analytics.purchaseSent";
const SIGNUP_PENDING_PREFIX = "arc.analytics.signUpPending.";
const SIGNUP_GA4_SENT_PREFIX = "arc.analytics.signUpSent.ga4.";
const SIGNUP_ADS_SENT_PREFIX = "arc.analytics.signUpSent.ads.";
const ONBOARDING_SENT_PREFIX = "arc.analytics.onboardingCompleted.";
const FIRST_SAVED_SENT_PREFIX = "arc.analytics.firstSavedSearch.";

type AnalyticsParamValue = string | number | boolean;
type AnalyticsParams = Record<string, AnalyticsParamValue | null | undefined>;

type PendingCheckout = {
  plan?: string;
  billing_interval?: string;
  value?: number;
  currency?: string;
};

type DataLayerModel = {
  set?: (key: string, value: unknown) => void;
};

type GtagFn = (...args: unknown[]) => void;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: GtagFn;
  }
}

let currentUserId: string | null = null;

const cleanText = (value: string, max = 100): string => {
  const clean = value.replace(/\s+/g, " ").trim().slice(0, max);
  if (!clean || clean.includes("@")) return "";
  return clean;
};

const normalizeUserId = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed.includes("@") || trimmed.length < 8 || trimmed.length > 256) return null;
  if (!/^[A-Za-z0-9._:-]+$/.test(trimmed)) return null;
  return trimmed;
};

const readSessionItem = (key: string): string | null => {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
};

const writeSessionItem = (key: string, value: string): void => {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // Private mode can block storage. The event still sends without the stash.
  }
};

const removeSessionItem = (key: string): void => {
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // Ignore storage failures.
  }
};

const readLocalItem = (key: string): string | null => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

const writeLocalItem = (key: string, value: string): void => {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore storage failures.
  }
};

const removeLocalItem = (key: string): void => {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore storage failures.
  }
};

/** Returns true only the first time for this key (persistent across reloads). */
const claimOnceLocal = (key: string): boolean => {
  if (typeof window === "undefined") return false;
  if (readLocalItem(key) === "1") return false;
  writeLocalItem(key, "1");
  return true;
};

const debugModeEnabled = (): boolean => {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("ga_debug") === "1";
};

/** Reuse the same gtag stub as consent.ts — queues until AW gtag.js loads. */
const ensureGtag = (): GtagFn => {
  window.dataLayer = window.dataLayer || [];
  if (!window.gtag) {
    window.gtag = function gtag(this: void) {
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer?.push(arguments);
    };
  }
  return window.gtag;
};

/** Internal account id only. Never an email. Cleared on sign-out. */
export const setAnalyticsUserId = (userId: string | null | undefined): void => {
  currentUserId = normalizeUserId(userId);
};

export const trackAnalyticsEvent = (
  name: AnalyticsEventName,
  params: AnalyticsParams = {},
): void => {
  if (typeof window === "undefined") return;
  if (!hasConsent("analytics")) return;

  const payload: Record<string, AnalyticsParamValue> = {};
  for (const [key, value] of Object.entries(params)) {
    if (!PARAM_KEYS.has(key) || value == null) continue;
    if (typeof value === "number") {
      if (Number.isFinite(value)) payload[key] = value;
      continue;
    }
    if (typeof value === "boolean") {
      payload[key] = value;
      continue;
    }
    const clean = cleanText(value);
    if (clean) payload[key] = clean;
  }

  window.dataLayer = window.dataLayer || [];
  const userId = currentUserId;
  window.dataLayer.push(function (this: DataLayerModel) {
    this.set?.("user_id", userId ?? undefined);
  });
  window.dataLayer.push({
    event: name,
    ...payload,
    ...(userId ? { user_id: userId } : {}),
    ...(debugModeEnabled() ? { debug_mode: true } : {}),
  });
};

const fireGoogleAdsSignupConversion = (): void => {
  if (!GOOGLE_ADS_SIGNUP_CONVERSION.startsWith("AW-")) return;
  const gtag = ensureGtag();
  gtag("event", "conversion", {
    send_to: GOOGLE_ADS_SIGNUP_CONVERSION,
  });
};

/**
 * Flush a pending signup (after consent or on later page loads).
 * Safe to call often — each channel claims once per user id.
 */
export const flushPendingSignUpTracking = (userId?: string | null): void => {
  if (typeof window === "undefined") return;
  const id = normalizeUserId(userId ?? currentUserId);
  if (!id) return;

  const pendingMethod = readLocalItem(`${SIGNUP_PENDING_PREFIX}${id}`);
  if (!pendingMethod) return;

  const ga4Sent = readLocalItem(`${SIGNUP_GA4_SENT_PREFIX}${id}`) === "1";
  const adsSent = readLocalItem(`${SIGNUP_ADS_SENT_PREFIX}${id}`) === "1";

  if (!ga4Sent && hasConsent("analytics") && claimOnceLocal(`${SIGNUP_GA4_SENT_PREFIX}${id}`)) {
    trackAnalyticsEvent("sign_up", { method: pendingMethod });
  }
  if (!adsSent && hasConsent("marketing") && claimOnceLocal(`${SIGNUP_ADS_SENT_PREFIX}${id}`)) {
    fireGoogleAdsSignupConversion();
  }

  const state = readConsentState();
  if (!state.decidedAt) return;

  const ga4Settled =
    !CONSENT_FEATURES.analyticsEnabled ||
    !state.analytics ||
    readLocalItem(`${SIGNUP_GA4_SENT_PREFIX}${id}`) === "1";
  const adsSettled =
    !CONSENT_FEATURES.marketingEnabled ||
    !state.marketing ||
    readLocalItem(`${SIGNUP_ADS_SENT_PREFIX}${id}`) === "1";

  if (ga4Settled && adsSettled) {
    removeLocalItem(`${SIGNUP_PENDING_PREFIX}${id}`);
  }
};

/**
 * Call only after Better Auth sign-up returns a created user id.
 * Does not require an active session cookie (verification-gated configs).
 * Stores a non-PII pending marker, then fires GA4 / Ads when consent allows.
 * Does not run on login, session refresh, failed signup, or email-verify clicks.
 */
export const trackSignUpSuccess = (input: {
  userId: string;
  method: string;
}): void => {
  if (typeof window === "undefined") return;
  const id = normalizeUserId(input.userId);
  if (!id) return;
  setAnalyticsUserId(id);

  const method = cleanText(input.method, 40) || "email";
  if (!readLocalItem(`${SIGNUP_PENDING_PREFIX}${id}`)) {
    writeLocalItem(`${SIGNUP_PENDING_PREFIX}${id}`, method);
  }
  flushPendingSignUpTracking(id);
};

/** Optional onboarding finished (setup COMPLETED). Once per user. */
export const trackOnboardingCompleted = (userId?: string | null): void => {
  const id = normalizeUserId(userId ?? currentUserId);
  if (!id) return;
  if (!claimOnceLocal(`${ONBOARDING_SENT_PREFIX}${id}`)) return;
  trackAnalyticsEvent("onboarding_completed", { method: "setup" });
};

/**
 * First watch profile / saved search for the org.
 * Pass the count *before* create. Once per user (localStorage).
 */
export const trackFirstSavedSearchIfNeeded = (
  existingCountBeforeCreate: number,
  userId?: string | null,
): void => {
  if (existingCountBeforeCreate > 0) return;
  const id = normalizeUserId(userId ?? currentUserId);
  if (!id) return;
  if (!claimOnceLocal(`${FIRST_SAVED_SENT_PREFIX}${id}`)) return;
  trackAnalyticsEvent("first_saved_search", { content_type: "watch_profile" });
};

export const rememberPendingCheckout = (input: PendingCheckout): void => {
  if (typeof window === "undefined") return;
  removeSessionItem(PURCHASE_SENT_KEY);
  writeSessionItem(
    CHECKOUT_KEY,
    JSON.stringify({
      plan: input.plan,
      billing_interval: input.billing_interval,
      value: input.value,
      currency: input.currency ?? "EUR",
    }),
  );
};

/** Fires once per successful Stripe return, even if the page reloads. */
export const trackPurchaseFromReturn = (): void => {
  if (typeof window === "undefined") return;
  if (!hasConsent("analytics")) return;
  if (readSessionItem(PURCHASE_SENT_KEY) === "1") return;
  writeSessionItem(PURCHASE_SENT_KEY, "1");
  const raw = readSessionItem(CHECKOUT_KEY);
  removeSessionItem(CHECKOUT_KEY);
  let pending: PendingCheckout = {};
  if (raw) {
    try {
      pending = JSON.parse(raw) as PendingCheckout;
    } catch {
      pending = {};
    }
  }
  const params = {
    plan: pending.plan,
    billing_interval: pending.billing_interval,
    value: pending.value,
    currency: pending.currency ?? "EUR",
  };
  trackAnalyticsEvent("purchase", params);
  trackAnalyticsEvent("subscription_started", params);
};

const linkUrlFrom = (href: string | null): string | undefined => {
  if (!href || href.startsWith("#") || href.toLowerCase().startsWith("javascript:")) {
    return undefined;
  }
  if (href.startsWith("/")) {
    return href.split("#")[0]?.split("?")[0]?.slice(0, 100) || undefined;
  }
  try {
    const url = new URL(href, window.location.origin);
    if (url.origin === window.location.origin) return url.pathname.slice(0, 100);
    return url.hostname.slice(0, 100);
  } catch {
    return undefined;
  }
};

const labelFrom = (element: HTMLElement): string => {
  const aria = element.getAttribute("aria-label");
  if (aria) return cleanText(aria, 80);
  return cleanText(element.textContent || "", 80);
};

let lastClickSignature = "";
let lastClickAt = 0;

/** Clicks on buttons and links. Ignores form fields so typed data never leaves the page. */
export const handleAnalyticsClick = (event: MouseEvent): void => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (target.closest("input, textarea, select, [contenteditable='true']")) return;
  const control = target.closest("a, button, summary, [role='button']");
  if (!(control instanceof HTMLElement)) return;
  const buttonName = labelFrom(control);
  if (!buttonName) return;

  const pagePath = safePagePath(window.location.pathname, window.location.search);
  const signature = `${buttonName}|${pagePath}`;
  const now = Date.now();
  if (signature === lastClickSignature && now - lastClickAt < 400) return;
  lastClickSignature = signature;
  lastClickAt = now;

  const href = control.getAttribute("href");
  trackAnalyticsEvent("button_click", {
    button_name: buttonName,
    link_url: linkUrlFrom(href),
    page_path: pagePath,
  });
};
