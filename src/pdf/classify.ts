import { repairGreekPdfText, softNormalizeGreek } from "./greek-text.js";

export type PdfClassification = {
  stage: "UNKNOWN" | "EARLY" | "ALREADY_ADVANCED";
  targetedSupplier: boolean;
  targetedSupplierName: string | null;
  nonInvitedOffersRejected: boolean;
  advancedPhraseHits: number;
};

const ADVANCED_PHRASES = [
  "αναθετει",
  "ανατεθηκε",
  "αναθεση στην",
  "πλεον συμφερουσα",
  "υποβληθηκαν προσφορες",
  "οικονομικες προσφορες",
  "ερευνα αγορας",
  "προσφορα της εταιρειας",
  "αποφασιζει την αναθεση",
] as const;

/** Single-hit phrases that strongly indicate award / advanced stage.
 *  Do NOT include "πλέον συμφέρουσα" alone — it appears as award *criterion*
 *  boilerplate on nearly every Greek tender ("κριτήριο ανάθεσης: …").
 */
const STRONG_AWARD_PHRASES = [
  "ανατεθηκε",
  "αναθεση στην",
  "αποφασιζει την αναθεση",
] as const;

const NON_INVITED_EXACT = [
  "δεν λαμβάνονται υπόψη προσφορές οικονομικών φορέων που δεν προσκλήθηκαν",
  "δεν γίνονται δεκτές προσφορές οικονομικών φορέων που δεν προσκλήθηκαν",
  "προσφορές οικονομικών φορέων που δεν προσκλήθηκαν δεν λαμβάνονται υπόψη",
] as const;

/** Internal org units — ΠΡΟΣ here is routing, not a named economic operator. */
const INTERNAL_RECIPIENT =
  /^(τμημα|σμημα|διευθυνση|υπηρεσια|γραφειο|νομαρχ|δημο[συ]?|περιφερ|τομεα[σς]?|συμβουλιο|επιτροπη)(?:\s|$|[,.:·])/iu;

const COMPANY_MARKER =
  /\b(α\.?\s*ε\.?|αε\b|ι\.?κ\.?ε\.?|ικε\b|ε\.?π\.?ε\.?|επε\b|ο\.?\s*ε\.?|ε\.?\s*ε\.?|ltd|llc|s\.?a\.?)\b/iu;

/**
 * ΠΡΟΣ / Αποδέκτης — tolerate mis-encoded Σ (U+03A2), optional colon,
 * and vendor name on the following line. Do not match ΠΡΟΣΚΛΗΣΗ.
 */
const PROS_LABEL =
  /(?:^|[\s\n\r])(?:ΠΡΟΣ|Προς|ΠΡΟ[\u03A3\u03A2ςσ])(?!\p{L})\s*[:：]?\s*(?:\r?\n\s*)?([^\n\r]{2,120})/u;

const normalize = softNormalizeGreek;

/**
 * Fuzzy: "δεν λαμβάνονται … προσφορ… οικονομικ… φορ… που δεν προσκληθ…"
 * Survives common glyph swaps (υπόψθ, προςφορζσ, φορζων, …).
 */
const fuzzyNonInvitedRejected = (soft: string): boolean => {
  if (
    /δεν\s+λαμβαν\w{0,12}\s+υπο\w{0,8}\s+προ[σς]φορ.{0,80}?οικονομικ.{0,40}?φορ.{0,50}?δεν\s+προ[σς]κληθ/u.test(
      soft,
    )
  ) {
    return true;
  }
  if (
    /δεν\s+(γινονται|γινονται)\s+δεκτ\w{0,8}\s+προ[σς]φορ.{0,80}?δεν\s+προ[σς]κληθ/u.test(
      soft,
    )
  ) {
    return true;
  }
  // Short bridge: δεν λαμβαν… + δεν προσκληθ within a window
  if (
    /δεν\s+λαμβαν\w{0,12}.{0,120}?δεν\s+προ[σς]κληθ/u.test(soft) &&
    /προ[σς]φορ|οικονομικ|φορ[εε]ων|φορζων/u.test(soft)
  ) {
    return true;
  }
  return false;
};

export const extractTargetAfterLabel = (rawText: string): string | null => {
  const repaired = repairGreekPdfText(rawText);
  const match = repaired.match(PROS_LABEL);
  if (!match?.[1]) return null;

  const candidate = match[1]
    .replace(/\s{2,}/g, " ")
    .replace(/[·•].*$/u, "")
    .trim();

  if (candidate.length < 3) return null;

  // "Προς τεκμηρίωση της…", "προς τον φορέα…" — prose, not a named recipient.
  if (/^\p{Ll}/u.test(candidate)) return null;

  const soft = normalize(candidate);
  if (
    /γενικ[ηη]|κοιν[οο]|ενδιαφερομεν|οικονομικ[οο]υς\s*φορε|ολουσ\s*τουσ/u.test(
      soft,
    )
  ) {
    return null;
  }

  // Internal memo routing (e.g. ΠΡΟΣ: Τμήμα Προμηθειών) is not a supplier.
  if (INTERNAL_RECIPIENT.test(soft)) return null;

  // Prefer clear economic-operator markers; otherwise accept non-internal names
  // of reasonable length (covers "Dotsoft Α.Ε." and similar).
  if (!COMPANY_MARKER.test(candidate) && candidate.length < 5) return null;

  return candidate.slice(0, 120);
};

export const classifyPdfText = (text: string): PdfClassification => {
  if (!text.trim()) {
    return {
      stage: "UNKNOWN",
      targetedSupplier: false,
      targetedSupplierName: null,
      nonInvitedOffersRejected: false,
      advancedPhraseHits: 0,
    };
  }

  const repaired = repairGreekPdfText(text);
  const soft = normalize(repaired);
  let advancedPhraseHits = 0;

  for (const phrase of ADVANCED_PHRASES) {
    if (soft.includes(phrase)) {
      advancedPhraseHits += 1;
    }
  }

  const strongAward = STRONG_AWARD_PHRASES.some((phrase) => soft.includes(phrase));

  const nonInvitedExact = NON_INVITED_EXACT.some((phrase) =>
    soft.includes(normalize(phrase)),
  );
  const nonInvitedOffersRejected =
    nonInvitedExact || fuzzyNonInvitedRejected(soft);

  const targetedSupplierName = extractTargetAfterLabel(repaired);
  const targetedSupplier =
    Boolean(targetedSupplierName) || nonInvitedOffersRejected;

  const stage =
    strongAward || advancedPhraseHits >= 2 ? "ALREADY_ADVANCED" : "EARLY";

  return {
    stage,
    targetedSupplier,
    targetedSupplierName,
    nonInvitedOffersRejected,
    advancedPhraseHits,
  };
};
