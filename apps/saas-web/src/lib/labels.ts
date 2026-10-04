/** Shared human labels for stored enum/code values shown in Greek SaaS UI. */

export const SUBMISSION_METHOD_LABELS: Record<string, string> = {
  PORTAL: "Ηλεκτρονική πλατφόρμα",
  EMAIL: "Email",
  PHYSICAL: "Φυσική παράδοση",
  OTHER: "Άλλο",
  ESIDIS: "ΕΣΗΔΗΣ",
  UNKNOWN: "Άγνωστο",
};

export const OUTREACH_METHOD_LABELS: Record<string, string> = {
  EMAIL: "Email",
  PHONE: "Τηλέφωνο",
  PORTAL: "Ηλεκτρονική πλατφόρμα",
  PHYSICAL: "Δια ζώσης / φυσική",
  OTHER: "Άλλο",
};

export const submissionMethodLabel = (code: string | null | undefined): string => {
  if (!code) return "—";
  return SUBMISSION_METHOD_LABELS[code] ?? code;
};

export const outreachMethodLabel = (code: string | null | undefined): string => {
  if (!code) return "—";
  return OUTREACH_METHOD_LABELS[code] ?? code;
};

export const humanSaasError = (message: string): string => {
  if (
    message.includes("watch_profile_similar_exists") ||
    message.includes("similar_exists")
  ) {
    return "Υπάρχει ήδη αποθηκευμένη αναζήτηση με τα ίδια κριτήρια. Ανοίξτε την υπάρχουσα ή αλλάξτε τα κριτήρια.";
  }
  if (message.includes("watch_profile_active_limit")) {
    return "Έχετε φτάσει το όριο ενεργών αποθηκευμένων αναζητήσεων.";
  }
  if (message.includes("watch_profile_requires_keywords_or_cpvs")) {
    return "Απαιτείται τουλάχιστον μία λέξη-κλειδί ή CPV.";
  }
  return message;
};
