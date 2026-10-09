/**
 * Greek NUTS 2 regions. Official KIMDIS nutsCode values are often NUTS 3
 * (EL411). They map to the NUTS 2 parent (EL41). Never infer a region from a title.
 */

export type GreekRegion = {
  code: string;
  label: string;
};

export const GREEK_NUTS2_REGIONS: readonly GreekRegion[] = [
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

const REGION_CODES = new Set(GREEK_NUTS2_REGIONS.map((region) => region.code));

/** Map an official nuts code to NUTS 2. Returns null when it is not a Greek region code. */
export const toNuts2 = (raw: string | null | undefined): string | null => {
  if (!raw) return null;
  const code = raw.trim().toUpperCase();
  if (!code.startsWith("EL")) return null;
  if (code.length < 4) return null;
  const nuts2 = code.slice(0, 4);
  return REGION_CODES.has(nuts2) ? nuts2 : null;
};

export const normalizeRegionCodes = (values: string[] | undefined): string[] => {
  const seen = new Set<string>();
  for (const value of values ?? []) {
    const nuts2 = toNuts2(value) ?? (REGION_CODES.has(value.trim().toUpperCase())
      ? value.trim().toUpperCase()
      : null);
    if (nuts2) seen.add(nuts2);
  }
  return [...seen];
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
  const selected = normalizeRegionCodes(selectedRegions);
  if (selected.length === 0) return "ok";
  const nuts2 = toNuts2(nutsCode);
  if (!nuts2) return includeUnclassified ? "ok" : "unclassified";
  return selected.includes(nuts2) ? "ok" : "out_of_region";
};

export const regionLabel = (code: string | null | undefined): string | null => {
  const nuts2 = toNuts2(code);
  if (!nuts2) return null;
  return GREEK_NUTS2_REGIONS.find((region) => region.code === nuts2)?.label ?? null;
};
