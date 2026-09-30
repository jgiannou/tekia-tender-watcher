/**
 * Phase-aware presentation helpers for Tender Detail.
 * Presentation only — no new workflow backend.
 */

import {
  getGreekCategoryLabel,
  getGreekPhaseStepLabel,
  getGreekRecordTypeLabel,
} from "./ui-labels";

export type TenderPhaseInput = {
  recordType: "REQ" | "PROC" | string;
  currentStatus: string;
  relevanceStatus?: string | null;
};

export type TenderPhaseId = "EARLY" | "FORMAL" | "SUBMITTED" | "RESULT";

export type TenderPhaseInfo = {
  id: TenderPhaseId;
  step: 1 | 2 | 3 | 4;
  title: string;
  subtitle: string;
  badge: string;
  recommendedAction: string;
  explanation: string | null;
  primaryCtaLabel: string;
  isEarlyStage: boolean;
  isFormalStage: boolean;
  isTerminal: boolean;
};

export const isEarlyStage = (tender: TenderPhaseInput): boolean => {
  if (tender.currentStatus === "SUBMITTED") return false;
  if (tender.currentStatus === "WON" || tender.currentStatus === "LOST") return false;
  return tender.recordType === "REQ";
};

export const isFormalStage = (tender: TenderPhaseInput): boolean => {
  if (tender.currentStatus === "SUBMITTED") return false;
  if (tender.currentStatus === "WON" || tender.currentStatus === "LOST") return false;
  return tender.recordType === "PROC";
};

export const getTenderPhase = (tender: TenderPhaseInput): TenderPhaseInfo => {
  if (tender.currentStatus === "WON" || tender.currentStatus === "LOST") {
    return {
      id: "RESULT",
      step: 4,
      title: "Αποτέλεσμα",
      subtitle:
        tender.currentStatus === "WON"
          ? "Αποτέλεσμα: επιτυχής συμμετοχή."
          : "Αποτέλεσμα: ανεπιτυχής συμμετοχή.",
      badge: tender.currentStatus === "WON" ? "ΕΠΙΤΥΧΕΣ" : "ΑΝΕΠΙΤΥΧΕΣ",
      recommendedAction: "Αρχειοθέτηση / follow-up κατά περίπτωση",
      explanation: null,
      primaryCtaLabel: "Προβολή ιστορικού",
      isEarlyStage: false,
      isFormalStage: false,
      isTerminal: true,
    };
  }

  if (tender.currentStatus === "SUBMITTED") {
    return {
      id: "SUBMITTED",
      step: 3,
      title: "Υποβλήθηκε",
      subtitle: "Η προσφορά έχει καταγραφεί ως υποβληθείσα.",
      badge: "ΥΠΟΒΛΗΘΗΚΕ",
      recommendedAction: "Παρακολούθηση αποτελέσματος",
      explanation: "Η δημιουργία εγγράφων δεν είναι πλέον η κύρια ενέργεια.",
      primaryCtaLabel: "Παρακολούθηση αποτελέσματος",
      isEarlyStage: false,
      isFormalStage: false,
      isTerminal: false,
    };
  }

  if (tender.recordType === "PROC") {
    return {
      id: "FORMAL",
      step: 2,
      title: "Επίσημη Πρόσκληση",
      subtitle: "Έχει ανοίξει διαδικασία υποβολής προσφοράς.",
      badge: "ΕΠΙΣΗΜΗ ΔΙΑΔΙΚΑΣΙΑ",
      recommendedAction: "Προετοιμασία Φακέλου Προσφοράς",
      explanation:
        "Σε αυτό το στάδιο ετοιμάζονται τεχνική/οικονομική προσφορά και απαιτούμενα δικαιολογητικά, μόνο όσο απαιτείται από την πρόσκληση.",
      primaryCtaLabel: "Προετοιμασία Φακέλου Προσφοράς",
      isEarlyStage: false,
      isFormalStage: true,
      isTerminal: false,
    };
  }

  return {
    id: "EARLY",
    step: 1,
    title: "Πρωτογενές Αίτημα",
    subtitle: "Δεν έχει ανοίξει ακόμη επίσημη διαδικασία υποβολής προσφοράς.",
    badge: "ΠΡΩΙΜΟ ΣΤΑΔΙΟ",
    recommendedAction: "Εκδήλωση Ενδιαφέροντος",
    explanation:
      "Στόχος σε αυτό το στάδιο είναι η έγκαιρη επικοινωνία και η εκδήλωση ενδιαφέροντος.",
    primaryCtaLabel: "Προετοιμασία Εκδήλωσης Ενδιαφέροντος",
    isEarlyStage: true,
    isFormalStage: false,
    isTerminal: false,
  };
};

export const getRecommendedAction = (tender: TenderPhaseInput): string =>
  getTenderPhase(tender).recommendedAction;

export const formatRecordTypeLabel = (recordType: string): string =>
  getGreekRecordTypeLabel(recordType);

/** Prefer getGreekCategoryLabel — kept for tests/compat */
export const formatWebCategoryLabel = (
  webCategory: string | null | undefined,
): { label: string; raw: string | null } => {
  if (!webCategory?.trim()) return { label: "—", raw: null };
  return { label: getGreekCategoryLabel(webCategory), raw: null };
};

export const EARLY_PHASE_DOC_KEYS = new Set([
  "earlyOutreach",
  "companyProfile",
  "company_profile",
  "outreach",
]);

export const FORMAL_LATER_DOC_KEYS = new Set([
  "gemi",
  "taxClearance",
  "tax_clearance",
  "insuranceClearance",
  "insurance_clearance",
  "kad",
  "declarations",
  "declaration",
  "technicalOffer",
  "technical",
  "economicOffer",
  "economic",
]);

export const FORMAL_DRIVE_DOC_TYPES = new Set([
  "TECHNICAL_OFFER",
  "ECONOMIC_OFFER",
  "DECLARATIONS",
  "DECLARATION",
]);

export const OUTREACH_DRIVE_DOC_TYPES = new Set([
  "OUTREACH",
  "EARLY_OUTREACH",
]);

export const PHASE_PROGRESS_STEPS = [
  { step: 1 as const, label: getGreekPhaseStepLabel(1) },
  { step: 2 as const, label: getGreekPhaseStepLabel(2) },
  { step: 3 as const, label: getGreekPhaseStepLabel(3) },
  { step: 4 as const, label: getGreekPhaseStepLabel(4) },
];

export const extractionEmptyLabel = "Δεν βρέθηκε στο επίσημο έγγραφο";
