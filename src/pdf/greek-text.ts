/**
 * Repair common Greek PDF extraction artifacts (font encoding / mojibake)
 * so downstream classifiers can match ΠΡΟΣ, exclusion clauses, etc.
 */

/** Unicode "Greek capital letter final sigma" — often emitted instead of Σ (U+03A3). */
const MISENCODED_CAPITAL_SIGMA = /\u03A2/g;

/**
 * Soften Greek for fuzzy phrase matching: NFD, strip accents, lowercase,
 * collapse whitespace, map a few frequent PDF glyph substitutions.
 */
export const softNormalizeGreek = (text: string): string =>
  text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/ς/g, "σ")
    // Common pdf-parse glyph swaps seen in KIMDIS PDFs
    .replace(/ψθ/g, "ψη")
    .replace(/ϊ/g, "ω")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Best-effort repair of extracted PDF text before classification.
 * Does not attempt a full encoding reverse-map — only high-signal fixes.
 */
export const repairGreekPdfText = (text: string): string => {
  if (!text) return text;
  return text
    .replace(MISENCODED_CAPITAL_SIGMA, "Σ")
    .replace(/\u0000/g, "");
};
