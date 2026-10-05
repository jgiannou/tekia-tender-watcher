/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SAAS_API_URL?: string;
  /** Google Tag Manager container, e.g. GTM-XXXX */
  readonly VITE_GTM_ID?: string;
  /** GA4 measurement id (configured inside GTM), e.g. G-XXXX */
  readonly VITE_GA4_MEASUREMENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
