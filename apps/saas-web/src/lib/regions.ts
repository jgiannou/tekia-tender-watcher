/** Greek NUTS 2 — keep in sync with src/saas/geo/nuts.ts */
export const GREEK_NUTS2_REGIONS = [
  { code: "EL30", label: "Αττική" },
  { code: "EL41", label: "Βόρειο Αιγαίο" },
  { code: "EL42", label: "Νότιο Αιγαίο" },
  { code: "EL43", label: "Κρήτη" },
  { code: "EL51", label: "Ανατολική Μακεδονία και Θράκη" },
  { code: "EL52", label: "Κεντρική Μακεδονία" },
  { code: "EL53", label: "Δυτική Μακεδονία" },
  { code: "EL54", label: "Ήπειρος" },
  { code: "EL61", label: "Θεσσαλία" },
  { code: "EL62", label: "Ιόνια Νησιά" },
  { code: "EL63", label: "Δυτική Ελλάδα" },
  { code: "EL64", label: "Στερεά Ελλάδα" },
  { code: "EL65", label: "Πελοπόννησος" },
] as const;

export type GreekRegionCode = (typeof GREEK_NUTS2_REGIONS)[number]["code"];
