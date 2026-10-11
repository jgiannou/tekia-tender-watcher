# Analytics / marketing cookies (GTM + Google Ads)

Consent is gated in `apps/saas-web/src/legal/consent.ts` via `CONSENT_FEATURES`.

| Tag | ID source | When it loads |
| --- | --- | --- |
| GTM (single loader) | `TRACKING_IDS.gtm` / `VITE_GTM_ID` | analytics **or** marketing consent |
| GA4 + Google Ads AW base tag | configured **inside GTM** | Consent Mode (`analytics_storage` / `ad_storage`) |

Do **not** paste Google’s HTML snippets into `index.html`. Do **not** inject a second `gtag/js?id=AW-…` from app code (double counting — production already loads AW via GTM).

**Signup conversion** (`AW-…/label`) is fired from `trackSignUpSuccess` in `lib/analytics.ts` after a successful Better Auth `signUp.email` — once per user id, marketing-consent gated. Keep the AW Google tag in GTM; do not add a second conversion tag on All Pages / signup page views.
