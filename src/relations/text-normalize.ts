/**
 * Lightweight deterministic text normalization for REQ↔PROC matching.
 * Explainable — no embeddings / LLM.
 */

const BOILERPLATE = [
  "προσκληση υποβολης προσφορας",
  "προσκληση ενδιαφεροντος",
  "πρωτογενες αιτημα",
  "παροχη υπηρεσιων",
  "απευθειας αναθεση",
  "διακηρυξη",
  "προσκληση",
  "προσφορα",
  "υπηρεσιες",
] as const;

/** Strip Greek accents / diacritics and lowercase. */
export const stripAccents = (text: string): string =>
  text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();

export const normalizeProcurementText = (text: string): string => {
  let t = stripAccents(text ?? "");
  t = t.replace(/[^\p{L}\p{N}\s]/gu, " ");
  t = t.replace(/\s+/g, " ").trim();
  for (const phrase of BOILERPLATE) {
    t = t.replaceAll(phrase, " ");
  }
  return t.replace(/\s+/g, " ").trim();
};

export const tokenizeSignificant = (text: string): string[] => {
  const normalized = normalizeProcurementText(text);
  return normalized
    .split(" ")
    .map((t) => t.trim())
    .filter((t) => t.length >= 3);
};

/** Jaccard similarity over significant tokens. */
export const tokenJaccard = (a: string, b: string): number => {
  const sa = new Set(tokenizeSignificant(a));
  const sb = new Set(tokenizeSignificant(b));
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  for (const t of sa) {
    if (sb.has(t)) inter += 1;
  }
  const union = sa.size + sb.size - inter;
  return union === 0 ? 0 : inter / union;
};

export const normalizeAuthority = (name: string): string =>
  normalizeProcurementText(name)
    .replace(/\bδημοσ\b/g, "δημος")
    .replace(/\bδημου\b/g, "δημος");

/**
 * Conservative authority equality.
 * Same string after normalize, or one contains the other if both long enough.
 */
export const authoritiesMatch = (a: string | null | undefined, b: string | null | undefined): boolean => {
  const na = normalizeAuthority(a ?? "");
  const nb = normalizeAuthority(b ?? "");
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.length >= 8 && nb.length >= 8 && (na.includes(nb) || nb.includes(na))) {
    return true;
  }
  return false;
};

/** Extract duration in months if clearly stated (e.g. "12 μήνες"). */
export const extractDurationMonths = (text: string): number | null => {
  const n = stripAccents(text ?? "");
  const match = n.match(/(\d{1,3})\s*(μηνεσ|μηνα|μηνων|months?|μηναδες)/u);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0 ? value : null;
};

export const normalizeLegalIdentity = (name: string): string => {
  let t = stripAccents(name ?? "");
  t = t.replace(/[^\p{L}\p{N}\s]/gu, " ");
  // Strip common company form suffixes for comparison only
  t = t.replace(
    /\b(ο\.?\s*ε\.?|α\.?\s*ε\.?|ι\.?\s*κ\.?\s*ε\.?|ε\.?\s*π\.?\s*ε\.?|μονοπροσωπη|εταιρεια|εταιρεία)\b/giu,
    " ",
  );
  return t.replace(/\s+/g, " ").trim();
};

export const normalizeVat = (vat: string | null | undefined): string =>
  String(vat ?? "").replace(/\D/g, "");
