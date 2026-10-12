/** Client-side ADAM parsing — keep in sync with src/saas/services/kimdis-search.ts */

const FULL_ADAM_RE = /^(\d{2})(REQ|PROC|AWRD|CONTRACT)(\d{6,12})$/i;
const PARTIAL_ADAM_HINT_RE = /^\d{0,2}(REQ|PROC|AWRD|CONTRACT)?\d*$/i;

export type ParsedKimdisAdam =
  | {
      status: "exact";
      adam: string;
      recordType: "REQ" | "PROC" | "AWRD" | "CONTRACT";
    }
  | { status: "empty" }
  | { status: "invalid"; normalized: string; reason: "adam_incomplete" | "adam_invalid" };

export const normalizeKimdisAdam = (raw: string): string =>
  raw.trim().replace(/\s+/g, "").toUpperCase();

export const parseKimdisAdamInput = (raw?: string | null): ParsedKimdisAdam => {
  if (raw == null || !String(raw).trim()) return { status: "empty" };
  const normalized = normalizeKimdisAdam(String(raw));
  const full = FULL_ADAM_RE.exec(normalized);
  if (full) {
    const recordType = full[2]!.toUpperCase() as
      | "REQ"
      | "PROC"
      | "AWRD"
      | "CONTRACT";
    return {
      status: "exact",
      adam: `${full[1]}${recordType}${full[3]}`,
      recordType,
    };
  }
  if (PARTIAL_ADAM_HINT_RE.test(normalized) && /\d/.test(normalized)) {
    return { status: "invalid", normalized, reason: "adam_incomplete" };
  }
  return { status: "invalid", normalized, reason: "adam_invalid" };
};

export const adamValidationMessageEl = (reason: string): string => {
  if (reason === "adam_incomplete") {
    return "Ο ΑΔΑΜ φαίνεται ημιτελής. Συμπληρώστε τον πλήρη αριθμό (π.χ. 26REQ019966624) για ακριβή αναζήτηση.";
  }
  if (reason.startsWith("adam_family_mismatch")) {
    return "Ο ΑΔΑΜ ανήκει σε άλλη κατηγορία πράξης από την επιλεγμένη καρτέλα. Αλλάξτε καρτέλα ή διορθώστε τον ΑΔΑΜ.";
  }
  if (reason.startsWith("adam_family_unsupported")) {
    return "Αυτός ο τύπος ΑΔΑΜ δεν υποστηρίζεται ακόμη στην αναζήτηση Αιτημάτων / Προσκλήσεων.";
  }
  return "Μη έγκυρος ΑΔΑΜ. Χρησιμοποιήστε τη μορφή έτους + τύπου + αριθμού (π.χ. 26REQ019966624).";
};

export const EXACT_ADAM_SEARCH_HINT_EL =
  "Αναζήτηση με ΑΔΑΜ. Τα υπόλοιπα φίλτρα δεν εφαρμόζονται.";
