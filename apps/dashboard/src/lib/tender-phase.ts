/**
 * Phase-aware presentation helpers for Tender Detail.
 * Presentation only — no new workflow backend.
 */

export type TenderPhaseInput = {
  recordType: "REQ" | "PROC" | string;
  currentStatus: string;
  relevanceStatus?: string | null;
};

export type TenderPhaseId =
  | "EARLY"
  | "FORMAL"
  | "SUBMITTED"
  | "RESULT";

export type TenderPhaseInfo = {
  id: TenderPhaseId;
  step: 1 | 2 | 3 | 4;
  title: string;
  subtitle: string;
  badge: string;
  recommendedAction: string;
  explanation: string | null;
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
      title: `4 · Result — ${tender.currentStatus}`,
      subtitle:
        tender.currentStatus === "WON"
          ? "Αποτέλεσμα: επιτυχής / won."
          : "Αποτέλεσμα: lost.",
      badge: tender.currentStatus,
      recommendedAction: "Archive / follow up as needed",
      explanation: null,
      isEarlyStage: false,
      isFormalStage: false,
      isTerminal: true,
    };
  }

  if (tender.currentStatus === "SUBMITTED") {
    return {
      id: "SUBMITTED",
      step: 3,
      title: "3 · Submitted",
      subtitle: "Η προσφορά έχει καταγραφεί ως υποβληθείσα.",
      badge: "SUBMITTED",
      recommendedAction: "Monitor result / follow-up",
      explanation: "Generate actions are no longer primary — track outcome.",
      isEarlyStage: false,
      isFormalStage: false,
      isTerminal: false,
    };
  }

  if (tender.recordType === "PROC") {
    return {
      id: "FORMAL",
      step: 2,
      title: "2 · Formal Opportunity",
      subtitle: "Πρόσκληση / διαδικασία υποβολής προσφοράς.",
      badge: "FORMAL / PROCUREMENT",
      recommendedAction: "Review requirements → Prepare Offer Package",
      explanation:
        "Σε αυτό το στάδιο ετοιμάζονται τεχνική/οικονομική προσφορά και απαιτούμενα δικαιολογητικά, μόνο όσο απαιτείται από την πρόσκληση.",
      isEarlyStage: false,
      isFormalStage: true,
      isTerminal: false,
    };
  }

  // Default: REQ / early
  return {
    id: "EARLY",
    step: 1,
    title: "1 · Early Opportunity",
    subtitle:
      "Πρωτογενές Αίτημα — δεν έχει ανοίξει ακόμη επίσημη διαδικασία υποβολής προσφοράς.",
    badge: "EARLY STAGE",
    recommendedAction: "Review → Early Outreach",
    explanation:
      "Στόχος σε αυτό το στάδιο είναι η έγκαιρη επικοινωνία και η εκδήλωση ενδιαφέροντος.",
    isEarlyStage: true,
    isFormalStage: false,
    isTerminal: false,
  };
};

export const getRecommendedAction = (tender: TenderPhaseInput): string =>
  getTenderPhase(tender).recommendedAction;

export const formatRecordTypeLabel = (recordType: string): string => {
  if (recordType === "REQ") return "Primary Request / Πρωτογενές Αίτημα";
  if (recordType === "PROC") return "Procurement / Invitation";
  return recordType;
};

/** Human-readable category; raw code shown separately when different. */
export const formatWebCategoryLabel = (
  webCategory: string | null | undefined,
): { label: string; raw: string | null } => {
  if (!webCategory?.trim()) return { label: "—", raw: null };
  const raw = webCategory.trim();
  const label = raw
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
  return { label, raw: label.replace(/\s+/g, "_").toUpperCase() === raw ? null : raw };
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

export const extractionEmptyLabel = "Not found in source document";
