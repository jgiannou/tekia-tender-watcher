/**
 * Cookie / tracker consent scaffolding for future analytics & ads.
 *
 * TODAY: only essential cookies are used → banner is OFF.
 * When you enable analytics or marketing pixels, flip the feature flags
 * and wire loaders that check `hasConsent(...)` BEFORE injecting scripts.
 *
 * Do not show a fake banner that does not control trackers.
 */

export type ConsentCategory = "essential" | "analytics" | "marketing";

export type ConsentState = {
  /** ISO timestamp of last decision; null = no decision yet */
  decidedAt: string | null;
  analytics: boolean;
  marketing: boolean;
};

const STORAGE_KEY = "arc.cookieConsent.v1";

/**
 * Flip these when a real tracker is integrated.
 * Banner renders only if any optional category is enabled.
 */
export const CONSENT_FEATURES = {
  analyticsEnabled: false,
  marketingEnabled: false,
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

/**
 * Placeholder loaders — implement real script injection when flags turn on.
 * They no-op unless consent was granted.
 */
export const loadOptionalTrackersIfAllowed = (): void => {
  if (hasConsent("analytics")) {
    // e.g. injectAnalytics();
  }
  if (hasConsent("marketing")) {
    // e.g. injectMarketingPixels();
  }
};
