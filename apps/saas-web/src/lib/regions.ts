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

const REGION_CODES: ReadonlySet<string> = new Set(
  GREEK_NUTS2_REGIONS.map((region) => region.code),
);

/** Map an official nuts code to NUTS 2. Returns null when it is not a Greek region code. */
export const toNuts2 = (raw: string | null | undefined): string | null => {
  if (!raw) return null;
  const code = raw.trim().toUpperCase();
  if (!code.startsWith("EL") || code.length < 4) return null;
  const nuts2 = code.slice(0, 4);
  return REGION_CODES.has(nuts2) ? nuts2 : null;
};

export type RegionGate = "ok" | "out_of_region" | "unclassified";

/**
 * Empty selection = all of Greece.
 * A selected list excludes other regions.
 * Missing NUTS is unclassified, not a guessed region.
 */
export const evaluateRegionGate = (
  nutsCode: string | null | undefined,
  selectedRegions: string[],
  includeUnclassified: boolean,
): RegionGate => {
  const selected = [
    ...new Set(
      selectedRegions
        .map((value) => {
          const normalized = value.trim().toUpperCase();
          return toNuts2(value) ?? (REGION_CODES.has(normalized) ? normalized : null);
        })
        .filter((value): value is string => Boolean(value)),
    ),
  ];
  if (selected.length === 0) return "ok";
  const nuts2 = toNuts2(nutsCode);
  if (!nuts2) return includeUnclassified ? "ok" : "unclassified";
  return selected.includes(nuts2) ? "ok" : "out_of_region";
};
