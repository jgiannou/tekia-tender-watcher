export type PdfClassification = {
  stage: "UNKNOWN" | "EARLY" | "ALREADY_ADVANCED";
  targetedSupplier: boolean;
  targetedSupplierName: string | null;
  nonInvitedOffersRejected: boolean;
  advancedPhraseHits: number;
};

const ADVANCED_PHRASES = [
  "αναθέτει",
  "ανατέθηκε",
  "ανάθεση στην",
  "πλέον συμφέρουσα",
  "υποβλήθηκαν προσφορές",
  "οικονομικές προσφορές",
  "έρευνα αγοράς",
  "προσφορά της εταιρείας",
  "αποφασίζει την ανάθεση",
] as const;

/** Single-hit phrases that strongly indicate award / advanced stage. */
const STRONG_AWARD_PHRASES = [
  "ανατέθηκε",
  "ανάθεση στην",
  "αποφασίζει την ανάθεση",
  "πλέον συμφέρουσα",
] as const;

const NON_INVITED_PHRASES = [
  "δεν λαμβάνονται υπόψη προσφορές οικονομικών φορέων που δεν προσκλήθηκαν",
  "δεν γίνονται δεκτές προσφορές οικονομικών φορέων που δεν προσκλήθηκαν",
  "προσφορές οικονομικών φορέων που δεν προσκλήθηκαν δεν λαμβάνονται υπόψη",
] as const;

const normalize = (text: string): string =>
  text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();

const extractTargetAfterLabel = (rawText: string): string | null => {
  const match = rawText.match(
    /(?:ΠΡΟΣ|Προς|Αποδέκτης|Παραλήπτης)\s*[:：]\s*([^\n\r]{3,120})/u,
  );
  if (!match?.[1]) return null;

  const candidate = match[1]
    .replace(/\s{2,}/g, " ")
    .replace(/[·•].*$/u, "")
    .trim();

  if (candidate.length < 3) return null;

  const generic = /γενικ[ήη]|κοιν[όο]|ενδιαφερομεν|οικονομικ[οό]υς φορε/iu;
  if (generic.test(candidate)) return null;

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

  const normalized = normalize(text);
  let advancedPhraseHits = 0;

  for (const phrase of ADVANCED_PHRASES) {
    if (normalized.includes(normalize(phrase))) {
      advancedPhraseHits += 1;
    }
  }

  const strongAward = STRONG_AWARD_PHRASES.some((phrase) =>
    normalized.includes(normalize(phrase)),
  );

  const nonInvitedOffersRejected = NON_INVITED_PHRASES.some((phrase) =>
    normalized.includes(normalize(phrase)),
  );
  const targetedSupplierName = extractTargetAfterLabel(text);
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
