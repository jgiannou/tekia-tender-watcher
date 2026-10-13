export const formatMoney = (value: number | null | undefined) =>
  value == null
    ? "—"
    : new Intl.NumberFormat("el-GR", {
        style: "currency",
        currency: "EUR",
        maximumFractionDigits: 0,
      }).format(value);

export const formatDate = (value: string | null | undefined) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value.slice(0, 10)
    : date.toLocaleDateString("el-GR");
};

export const formatDateTime = (value: string | null | undefined) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("el-GR");
};

export const tenderKindLabel = (type: string | null | undefined) => {
  if (type === "PROC") {
    return {
      nominative: "διαγωνισμός",
      genitive: "διαγωνισμού",
      accusative: "τον διαγωνισμό",
    };
  }
  if (type === "AWRD") {
    return {
      nominative: "ανάθεση",
      genitive: "ανάθεσης",
      accusative: "την ανάθεση",
    };
  }
  return {
    nominative: "αίτημα",
    genitive: "αιτήματος",
    accusative: "το αίτημα",
  };
};

export const waitingStatusLabel = (input: {
  following: boolean;
  hasOutreach: boolean;
  hasSubmission: boolean;
  relatedProcCount: number;
  relatedAwardCount: number;
  recordType: string;
  nextActionCode?: string | null;
}): string | null => {
  if (!input.following) return null;
  if (input.relatedAwardCount > 0) return "Έλεγχος ανάθεσης";
  if (input.hasSubmission) return "Αναμονή αποτελέσματος";
  if (input.recordType === "PROC" || input.relatedProcCount > 0) {
    return input.nextActionCode === "RECORD_SUBMISSION"
      ? "Προετοιμασία / υποβολή"
      : "Προετοιμασία";
  }
  if (input.recordType === "REQ") return "Αναμονή πρόσκλησης";
  return "Παρακολουθείται";
};
