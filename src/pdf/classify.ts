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

const NON_INVITED_PHRASE =
  "δεν λαμβάνονται υπόψη προσφορές οικονομικών φορέων που δεν προσκλήθηκαν";

const normalize = (text: string): string =>
  text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();

const extractTargetAfterPros = (rawText: string): string | null => {
  const match = rawText.match(/(?:ΠΡΟΣ|Προς)\s*[:：]\s*([^\n\r]{3,120})/u);
  if (!match?.[1]) return null;

  const candidate = match[1]
    .replace(/\s{2,}/g, " ")
    .replace(/[·•].*$/u, "")
    .trim();

  if (candidate.length < 3) return null;

  // Ignore generic recipients.
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

  const nonInvitedOffersRejected = normalized.includes(normalize(NON_INVITED_PHRASE));
  const targetedSupplierName = extractTargetAfterPros(text);
  const targetedSupplier =
    Boolean(targetedSupplierName) || nonInvitedOffersRejected;

  const stage =
    advancedPhraseHits >= 2 ? "ALREADY_ADVANCED" : "EARLY";

  return {
    stage,
    targetedSupplier,
    targetedSupplierName,
    nonInvitedOffersRejected,
    advancedPhraseHits,
  };
};
