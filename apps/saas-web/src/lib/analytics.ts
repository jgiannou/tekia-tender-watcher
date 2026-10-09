/**
 * Product analytics events for GA4, sent through the existing GTM dataLayer.
 *
 * GTM is the only loader (see legal/consent.ts). These pushes do nothing until
 * the visitor accepts analytics cookies. A single GA4 Event tag in GTM must
 * forward the event names listed in ANALYTICS_EVENT_NAMES.
 */
import { hasConsent } from "@/legal/consent";
import { safePagePath } from "@/lib/safe-page-path";

export const ANALYTICS_EVENT_NAMES = [
  "login",
  "sign_up",
  "begin_checkout",
  "purchase",
  "organization_created",
  "watch_profile_created",
  "tender_followed",
  "button_click",
] as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENT_NAMES)[number];

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

declare global {
  interface Window {
    dataLayer?: unknown[];
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

const debugModeEnabled = (): boolean => {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("ga_debug") === "1";
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
  trackAnalyticsEvent("purchase", {
    plan: pending.plan,
    billing_interval: pending.billing_interval,
    value: pending.value,
    currency: pending.currency ?? "EUR",
  });
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
