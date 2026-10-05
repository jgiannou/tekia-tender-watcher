/**
 * Legal document metadata for ARC Tenders (SaaS).
 * Update versions when substantive text changes; signup stores the accepted version.
 * Company identity sourced from GEMI Open Data (ΑΦΜ 150707361).
 */
export const LEGAL_CONTROLLER = {
  productName: "ARC Tenders",
  legalName: "ΓΙΑΝΝΟΥΣΗΣ ΙΩΑΝΝΗΣ ΤΟΥ ΓΡΗΓΟΡΙΟΥ",
  tradingName: "TEKIA",
  legalType: "Ατομική επιχείρηση",
  email: "contact@tekia.gr",
  afm: "150707361",
  gemiNumber: "195930203000",
  address:
    "Σαρανταπόρου 12, Τ.Κ. 13451, Άγιοι Ανάργυροι – Καματερό, Περιφερειακή Ενότητα Αθηνών, Ελλάδα",
  gemiService: "Επαγγελματικό Επιμελητήριο Αθηνών",
  country: "Ελλάδα",
} as const;

export const LEGAL_VERSIONS = {
  terms: "2026-10-05",
  privacy: "2026-10-05",
  cookies: "2026-10-05",
} as const;

export const LEGAL_EFFECTIVE_DATE = "5 Οκτωβρίου 2026";

export type LegalDocId = "terms" | "privacy" | "cookies";

export type LegalSection = {
  id: string;
  title: string;
  paragraphs: string[];
  bullets?: string[];
  /** Optional paragraphs rendered after the bullet list */
  closing?: string[];
};

export type LegalDocument = {
  id: LegalDocId;
  title: string;
  version: string;
  effectiveDate: string;
  summary: string;
  sections: LegalSection[];
};
