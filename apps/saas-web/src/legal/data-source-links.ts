/**
 * Public data-source attribution & license URLs for ARC Tenders.
 * Keep URLs here — do not scatter across components.
 */
export const DATA_SOURCE_LINKS = {
  kimdis: {
    openDataPortal: "https://cerpp.eprocurement.gov.gr",
    openDataDocsHint:
      "https://cerpp.eprocurement.gov.gr/upgkimdis/unprotected/home.xhtml",
    licenseCcBy40: "https://creativecommons.org/licenses/by/4.0/deed.el",
  },
  gemi: {
    openDataPortal: "https://opendata.businessportal.gr/",
    techDocs: "https://opendata.businessportal.gr/techdocs/",
    apiDocs: "https://opendata-api.businessportal.gr/api-docs",
    licenseOdcBy10: "https://opendatacommons.org/licenses/by/1-0/",
  },
} as const;

export const DATA_SOURCE_ATTRIBUTION = {
  kimdisShort: "Πηγή: ΚΗΜΔΗΣ",
  kimdisFull:
    "Δεδομένα δημοσίων συμβάσεων: ΚΗΜΔΗΣ / ΟΠΣ ΕΣΗΔΗΣ — CC BY 4.0",
  kimdisOpenLabel: "Άνοιγμα στο ΚΗΜΔΗΣ",
  gemiFull: "Στοιχεία επιχειρήσεων: ΓΕΜΗ Open Data — ODC-BY 1.0",
} as const;
