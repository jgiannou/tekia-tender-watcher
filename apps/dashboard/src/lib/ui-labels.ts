/**
 * Central Greek operator UI labels.
 * Keep raw enums/API codes unchanged — map only for display.
 */

export const getGreekRecordTypeLabel = (recordType: string): string => {
  if (recordType === "REQ") return "Πρωτογενές Αίτημα";
  if (recordType === "PROC") return "Πρόσκληση / Διαδικασία Προμήθειας";
  return recordType;
};

export const getGreekStatusLabel = (status: string): string => {
  const map: Record<string, string> = {
    NEW: "Νέο",
    REVIEW: "Υπό εξέταση",
    READY: "Έτοιμο",
    APPROVED: "Εγκεκριμένο",
    SUBMITTED: "Υποβλήθηκε",
    SENT: "Στάλθηκε",
    WON: "Επιτυχές",
    LOST: "Ανεπιτυχές",
    PENDING: "Εκκρεμεί",
    DRAFT: "Πρόχειρο",
    NOT_STARTED: "Δεν έχει ξεκινήσει",
  };
  return map[status] ?? status;
};

export const getGreekDocumentStatusLabel = (status: string): string => {
  const map: Record<string, string> = {
    AVAILABLE: "Διαθέσιμο",
    MISSING: "Λείπει",
    EXPIRED: "Έχει λήξει",
    UNKNOWN: "Άγνωστη κατάσταση",
    NOT_REQUIRED: "Δεν απαιτείται",
    REQUIRED: "Απαιτείται",
    TO_GENERATE: "Προς δημιουργία",
    NOT_PREPARED: "Δεν έχει προετοιμαστεί",
    NEEDS_CONFIGURATION: "Απαιτεί ρύθμιση",
    DRAFT: "Πρόχειρο",
    READY: "Έτοιμο",
    SENT: "Στάλθηκε",
    NOT_STARTED: "Δεν έχει ξεκινήσει",
  };
  return map[status] ?? status;
};

export const getGreekCategoryLabel = (
  webCategory: string | null | undefined,
): string => {
  if (!webCategory?.trim()) return "—";
  const map: Record<string, string> = {
    WEBSITE: "Ιστοσελίδα",
    WEBSITE_SUPPORT: "Υποστήριξη ιστοσελίδας",
    WEB_APPLICATION: "Διαδικτυακή εφαρμογή",
    WEB_PLATFORM: "Διαδικτυακή πλατφόρμα",
    WEB_API_INTEGRATION: "Διασύνδεση / API",
    UNKNOWN: "Άγνωστη κατηγορία",
  };
  return map[webCategory] ?? webCategory.replace(/_/g, " ");
};

export const getGreekEventTypeLabel = (eventType: string): string => {
  const map: Record<string, string> = {
    DETECTED: "Εντοπίστηκε",
    REVIEWED: "Υπό εξέταση",
    READY: "Έτοιμο",
    APPROVED: "Εγκρίθηκε",
    SUBMITTED: "Υποβλήθηκε επίσημη προσφορά",
    WON: "Επιτυχές αποτέλεσμα",
    LOST: "Ανεπιτυχές αποτέλεσμα",
    RELATED_PROC: "Εντοπίστηκε σχετική πρόσκληση",
    RELATION_CONFIRMED: "Επιβεβαιώθηκε σύνδεση",
    RELATION_DISMISSED: "Απορρίφθηκε σύνδεση",
    OUTREACH_READY: "Εκδήλωση ενδιαφέροντος έτοιμη",
    OUTREACH_SENT: "Η Εκδήλωση Ενδιαφέροντος στάλθηκε",
    MONITORING_STARTED: "Ξεκίνησε παρακολούθηση",
    INVITATION_CLASSIFIED: "Ταξινομήθηκε πρόσκληση",
  };
  return map[eventType] ?? eventType;
};

export const getGreekPhaseStepLabel = (step: 1 | 2 | 3 | 4): string => {
  const map = {
    1: "Πρωτογενές Αίτημα",
    2: "Επίσημη Πρόσκληση",
    3: "Υποβολή",
    4: "Αποτέλεσμα",
  } as const;
  return map[step];
};

export const getGreekDraftLabel = (
  key: "outreach" | "technical" | "economic" | "declarations",
): string => {
  const map = {
    outreach: "Εκδήλωση Ενδιαφέροντος",
    technical: "Τεχνική Προσφορά",
    economic: "Οικονομική Προσφορά",
    declarations: "Δηλώσεις",
  } as const;
  return map[key];
};

export const getGreekDriveDocTypeLabel = (type: string): string => {
  const map: Record<string, string> = {
    OUTREACH: "Εκδήλωση Ενδιαφέροντος",
    EARLY_OUTREACH: "Εκδήλωση Ενδιαφέροντος",
    TECHNICAL_OFFER: "Τεχνική Προσφορά",
    ECONOMIC_OFFER: "Οικονομική Προσφορά",
    DECLARATIONS: "Δηλώσεις",
    DECLARATION: "Δήλωση",
    COMPANY_PROFILE: "Εταιρικό Προφίλ",
  };
  return map[type] ?? type;
};

export const getGreekChecklistLabel = (key: string, fallback: string): string => {
  const map: Record<string, string> = {
    company_profile: "Εταιρικό Προφίλ",
    companyProfile: "Εταιρικό Προφίλ",
    gemi: "ΓΕΜΗ",
    tax_clearance: "Φορολογική Ενημερότητα",
    taxClearance: "Φορολογική Ενημερότητα",
    insurance_clearance: "Ασφαλιστική Ενημερότητα",
    insuranceClearance: "Ασφαλιστική Ενημερότητα",
    kad: "ΚΑΔ",
    declaration: "Δήλωση",
    declarations: "Δηλώσεις",
    economic_offer: "Οικονομική Προσφορά",
    economicOffer: "Οικονομική Προσφορά",
    technical_offer: "Τεχνική Προσφορά",
    technicalOffer: "Τεχνική Προσφορά",
    earlyOutreach: "Εκδήλωση Ενδιαφέροντος",
    outreach: "Εκδήλωση Ενδιαφέροντος",
  };
  return map[key] ?? fallback;
};

export const getGreekSubmissionMethodLabel = (method: string): string => {
  const map: Record<string, string> = {
    EMAIL: "Email",
    PORTAL: "Πλατφόρμα",
    ESIDIS: "ΕΣΗΔΗΣ",
    PHYSICAL: "Φυσική υποβολή",
    OTHER: "Άλλο",
    UNKNOWN: "Άγνωστο",
  };
  return map[method] ?? method;
};

export const getGreekRelevanceLabel = (status: string | null | undefined): string => {
  if (!status) return "—";
  const map: Record<string, string> = {
    RELEVANT: "Σχετικό",
    IRRELEVANT: "Μη σχετικό",
    NEEDS_REVIEW: "Χρειάζεται έλεγχο",
    TARGETED: "Στοχευμένη πρόσκληση",
    EXPIRED: "Έχει λήξει",
  };
  return map[status] ?? status;
};

/** Human note when a file exists but has no expiry date. */
export const getNoExpiryNote = (docKey: string): string => {
  if (docKey === "gemi" || docKey.toLowerCase().includes("gemi")) {
    return "Δεν αναγράφεται ημερομηνία λήξης";
  }
  return "Χωρίς ημερομηνία λήξης";
};

export const UI = {
  navOpportunities: "Ευκαιρίες",
  navSubmitted: "Υποβληθέντα",
  navSettings: "Ρυθμίσεις / Έγγραφα",
  brandSubtitleDesktop: "Διαχείριση διαγωνισμών · desktop",
  brandSubtitleWeb: "Διαχείριση διαγωνισμών · τοπικό web",
  backToOpportunities: "← Ευκαιρίες",
  open: "Άνοιγμα",
  openInKimdis: "Άνοιγμα στο ΚΗΜΔΗΣ",
  openOfficialPdf: "Άνοιγμα Επίσημου PDF",
  openInDrive: "Άνοιγμα στο Drive",
  edit: "Επεξεργασία",
  save: "Αποθήκευση",
  close: "Κλείσιμο",
  cancel: "Ακύρωση",
  markReady: "Σήμανση ως Έτοιμο",
  markOutreachSent: "Σημείωσε ως σταλμένη",
  recordOutreachSent: "Καταχώριση αποστολής εκδήλωσης ενδιαφέροντος",
  approve: "Έγκριση",
  nextAction: "Επόμενη ενέργεια",
  prepareOutreach: "Προετοιμασία Εκδήλωσης Ενδιαφέροντος",
  createWorkspace: "Δημιουργία Φακέλου Διαγωνισμού",
  generateDriveDoc: "Δημιουργία εγγράφου στο Drive",
  prepareOfferPackage: "Προετοιμασία Φακέλου Προσφοράς",
  whyMatched: "Γιατί αυτή η ευκαιρία ταιριάζει στην TEKIA",
  timeline: "Ιστορικό",
  scopeSummary: "Σύνοψη αντικειμένου",
  scopeEmpty: "Δεν έχει εξαχθεί σύνοψη από το επίσημο έγγραφο.",
  contactSection: "Στοιχεία επικοινωνίας φορέα",
  contactPerson: "Υπεύθυνος επικοινωνίας",
  department: "Τμήμα / Υπηρεσία",
  contactEmail: "Email επικοινωνίας",
  contactPhone: "Τηλέφωνο επικοινωνίας",
  formalSubmission: "Στοιχεία επίσημης υποβολής",
  formalSubmissionHelper:
    "Συμπληρώνεται όταν η επίσημη πρόσκληση ορίζει τρόπο υποβολής προσφοράς.",
  submissionMethod: "Τρόπος υποβολής",
  submissionEmail: "Email υποβολής",
  portalOther: "Πλατφόρμα / άλλο",
  instructions: "Οδηγίες υποβολής",
  currentPhaseDocs: "Έγγραφα τρέχοντος σταδίου",
  laterStageDocs: "Έγγραφα επόμενου σταδίου",
  laterStageHelper: "Δεν απαιτούνται στο στάδιο του Πρωτογενούς Αιτήματος.",
  laterStageTestDocs: "Έγγραφα επόμενου σταδίου / Δοκιμαστικά έγγραφα",
  moreActions: "Περισσότερες ενέργειες",
  recordSubmission: "Καταχώριση ήδη πραγματοποιημένης υποβολής",
  recordSubmissionHelper:
    "Χρησιμοποίησέ το μόνο εάν η υποβολή έγινε εκτός της εφαρμογής.",
  safetyGenerate: "Η δημιουργία εγγράφου δεν πραγματοποιεί αποστολή.",
  safetyReady: "Η σήμανση ως Έτοιμο δεν πραγματοποιεί αποστολή.",
  safetyOutreachSent:
    "Καταγράφηκε ότι στάλθηκε χειροκίνητα. Η εφαρμογή δεν έστειλε email. Δεν πρόκειται για επίσημη υποβολή.",
  safetyApprove: "Η Έγκριση δεν πραγματοποιεί αποστολή.",
  safetyNoAutoSend:
    "Καμία εξωτερική αποστολή δεν πραγματοποιείται χωρίς ρητή ενέργεια του χρήστη.",
  safetyCloud:
    "Ο cloud watcher δεν αποστέλλει προσφορές ή email.",
  safetyCompact:
    "Η δημιουργία, η σήμανση ως έτοιμο και η έγκριση δεν αποστέλλουν τίποτα αυτόματα.",
  approveHelper: "Η έγκριση δεν αποστέλλει το έγγραφο.",
  notCreated: "Δεν έχει δημιουργηθεί",
  missingPrefix: "Λείπει",
  legalIdentity: "Νομικά στοιχεία",
  legalName: "Νομική επωνυμία",
  legalForm: "Νομική μορφή",
  vatNumber: "ΑΦΜ",
  taxOffice: "ΔΟΥ",
  gemiNumber: "Αριθμός ΓΕΜΗ",
  brandIdentity: "Εμπορική ταυτότητα",
  brandName: "Brand",
  tradingName: "Διακριτικός τίτλος",
  distinctiveConfirmed: "Επιβεβαιωμένος διακριτικός τίτλος",
  legalBrandHelper:
    "Η νομική επωνυμία χρησιμοποιείται σε επίσημες προσφορές και δηλώσεις. Το brand χρησιμοποιείται για εμπορική παρουσίαση.",
  extractionEmpty: "Δεν βρέθηκε στο επίσημο έγγραφο",
  loading: "Φόρτωση…",
  notFound: "Δεν βρέθηκε ο διαγωνισμός",
  score: "Βαθμολογία",
  budgetExVat: "Προϋπολογισμός (χωρίς ΦΠΑ)",
  budgetIncVat: "Προϋπολογισμός (με ΦΠΑ)",
  deadline: "Προθεσμία",
  kimdisPublication: "Δημοσίευση ΚΗΜΔΗΣ",
  type: "Τύπος",
  category: "Κατηγορία",
  alreadySubmitted: "Ήδη υποβληθέν",
  procVerification: "Έλεγχος πρόσκλησης",
  companyDocuments: "Εταιρικά Δικαιολογητικά",
  readiness: "Ετοιμότητα Φακέλου",
} as const;
