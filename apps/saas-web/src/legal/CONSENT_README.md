# Enabling analytics / marketing cookies later

Today ARC Tenders uses **essential cookies only**. No consent banner is shown.

When you are ready to add analytics (or ads):

1. Open `apps/saas-web/src/legal/consent.ts`
2. Set `CONSENT_FEATURES.analyticsEnabled = true` and/or `marketingEnabled = true`
3. Implement real script injection inside `loadOptionalTrackersIfAllowed()` (guarded by `hasConsent(...)`)
4. Deploy — the `CookieConsentBanner` will appear automatically and will not load trackers before consent

Do **not** inject tracker scripts outside this consent gate.
