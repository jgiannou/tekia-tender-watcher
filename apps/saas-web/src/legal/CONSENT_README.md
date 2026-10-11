# Analytics / marketing cookies (GTM + Google Ads)

Consent is gated in `apps/saas-web/src/legal/consent.ts` via `CONSENT_FEATURES`.

| Tag | ID source | When it loads |
| --- | --- | --- |
| GTM (+ GA4 inside container) | `TRACKING_IDS.gtm` / `VITE_GTM_ID` | analytics **or** marketing consent |
| Google Ads base tag | `TRACKING_IDS.ads` / `VITE_GOOGLE_ADS_ID` (`AW-…`) | marketing consent only |

Do **not** paste Google’s HTML snippets into `index.html`. Do **not** also add the same `AW-` Google tag inside GTM (double counting). Conversion actions can still use `gtag('event', 'conversion', …)` or GTM conversion tags that send to the same Ads account.
