/**
 * Public marketing pricing — keep in sync with src/saas/plans/catalog.ts.
 * Do not invent entitlements that the product does not enforce.
 */

/** Must match SLACK_NOTIFICATIONS_FEATURE_EL in catalog.ts */
export const SLACK_NOTIFICATIONS_FEATURE_EL =
  "Ειδοποιήσεις Slack σε 1 κανάλι της ομάδας σας";

/**
 * Hide Slack marketing until the feature flag is on in the web build.
 * Production stays quiet until SAAS Slack OAuth is live.
 */
export const slackMarketingEnabled = (): boolean =>
  String(import.meta.env.VITE_SAAS_SLACK_NOTIFICATIONS_ENABLED || "")
    .toLowerCase()
    .trim() === "true";

export const TRIAL_DAYS = 7;

/** Shown next to list prices; Stripe Tax adds VAT at checkout (exclusive prices). */
export const PRICING_TAX_LABEL = "Οι τιμές δεν περιλαμβάνουν ΦΠΑ.";

export const INGEST_SPEED_LABEL = "Αυτόματος έλεγχος του ΚΗΜΔΗΣ κάθε 2 λεπτά";
export const INGEST_SPEED_HELP =
  "Ο έλεγχος εκτελείται με την ίδια συχνότητα σε όλα τα πακέτα. Η εμφάνιση νέων δημοσιεύσεων εξαρτάται και από τη διαθεσιμότητα των δεδομένων στο ΚΗΜΔΗΣ.";

export const MARKETING_PLANS = {
  free: {
    key: "free",
    name: "Δωρεάν",
    priceMonthlyEur: 0,
    priceYearlyEur: 0,
    positioningEl:
      "Βρείτε δημόσιες ευκαιρίες που ταιριάζουν στην επιχείρησή σας.",
    shortPositioningEl: "Βρείτε τις ευκαιρίες.",
    includedSeats: 1,
    maxSeatsSelfService: 1,
    extraSeatMonthlyEur: null as number | null,
    maxActiveWatchProfiles: 1,
    maxActiveFollowedTenders: 5,
    storageLabel: "—",
    emailLabel: "Έως 1 εβδομαδιαία σύνοψη, όταν υπάρχουν νέα",
    emailShort: "1 εβδομαδιαία σύνοψη",
    emailTable: "Έως 1 εβδομαδιαία σύνοψη, όταν υπάρχουν νέα",
    advancedFilters: false,
    prioritySupport: false,
    deadlineRadar: false,
    includesLabel: null as string | null,
    footnoteEl:
      "Χωρίς κάρτα και χωρίς χρονικό περιορισμό. Η εβδομαδιαία σύνοψη αποστέλλεται σε έναν παραλήπτη ανά εταιρεία.",
    ctaEl: "Ξεκινήστε δωρεάν",
    teaserBullets: [
      "1 χρήστης",
      "1 ενεργή αποθηκευμένη αναζήτηση",
      "Έως 5 διαγωνισμοί σε παρακολούθηση",
      "Έως 1 εβδομαδιαία σύνοψη email, όταν υπάρχουν νέα",
      "Ειδοποιήσεις μέσα στην εφαρμογή και προαιρετικές ειδοποιήσεις push",
    ],
    fullBullets: [
      "1 χρήστης",
      "1 ενεργή αποθηκευμένη αναζήτηση",
      "Έως 5 διαγωνισμοί σε παρακολούθηση",
      "Αναζήτηση στο ΚΗΜΔΗΣ με λέξεις-κλειδιά, CPV και περιοχή",
      "Βαθμός συνάφειας με εξήγηση των αποτελεσμάτων",
      "Ειδοποιήσεις μέσα στην εφαρμογή και προαιρετικές ειδοποιήσεις push",
      "Έως 1 εβδομαδιαία σύνοψη email, όταν υπάρχουν νέα",
      "Προβολή πορείας διαγωνισμού και υπενθυμίσεις προθεσμιών στην εφαρμογή",
    ],
  },
  basic: {
    key: "basic",
    name: "Basic",
    priceMonthlyEur: 4.99,
    priceYearlyEur: 49,
    positioningEl:
      "Παρακολουθήστε διαγωνισμούς και οργανώστε τη συμμετοχή σας.",
    shortPositioningEl: "Παρακολουθήστε και οργανώστε τη συμμετοχή σας.",
    includedSeats: 1,
    maxSeatsSelfService: 1,
    extraSeatMonthlyEur: null as number | null,
    maxActiveWatchProfiles: 5,
    maxActiveFollowedTenders: 30,
    storageLabel: "250 MB",
    emailLabel: "Συγκεντρωτικά email έως 2 φορές την ημέρα",
    emailShort: "έως 2 ώρες / ημέρα",
    emailTable: "Συγκεντρωτικά email έως 2 φορές την ημέρα",
    advancedFilters: false,
    prioritySupport: false,
    deadlineRadar: false,
    includesLabel: null as string | null,
    footnoteEl: PRICING_TAX_LABEL,
    ctaEl: "Επιλέξτε Basic",
    teaserBullets: [
      "Έως 5 ενεργές αποθηκευμένες αναζητήσεις",
      "Έως 30 διαγωνισμοί σε παρακολούθηση",
      "250 MB χώρου για εταιρικά έγγραφα",
      "Λίστα δικαιολογητικών και έλεγχος με τα έγγραφά σας",
      "Συμβάσεις που λήγουν και ιστορικό αποτελεσμάτων",
    ],
    fullBullets: [
      "1 χρήστης",
      "Έως 5 ενεργές αποθηκευμένες αναζητήσεις",
      "Έως 30 διαγωνισμοί σε παρακολούθηση",
      "250 MB χώρου για εταιρικά έγγραφα",
      "Συγκεντρωτικά email έως 2 φορές την ημέρα",
      "Επιλογή άμεσων email για σημαντικές εξελίξεις στους διαγωνισμούς που παρακολουθείτε",
      "Λίστα δικαιολογητικών και έλεγχος με τα έγγραφά σας",
      "Οργάνωση προετοιμασίας και καταγραφή υποβολής προσφοράς",
      "Καταγραφή εκδήλωσης ενδιαφέροντος προς τον φορέα",
      "Συμβάσεις που λήγουν και ιστορικό αποτελεσμάτων",
    ],
  },
  pro: {
    key: "pro",
    name: "Pro",
    badge: "Προτεινόμενο",
    priceMonthlyEur: 9.99,
    priceYearlyEur: 99,
    positioningEl: "Μη χάσετε κρίσιμη εξέλιξη.",
    shortPositioningEl: "Μη χάσετε κρίσιμη εξέλιξη.",
    includedSeats: 3,
    maxSeatsSelfService: 20,
    extraSeatMonthlyEur: 2.49,
    maxActiveWatchProfiles: 15,
    maxActiveFollowedTenders: 100,
    storageLabel: "2 GB",
    emailLabel: "Συγκεντρωτικά email έως 6 φορές την ημέρα",
    emailShort: "έως 6 ώρες / ημέρα",
    emailTable: "Συγκεντρωτικά email έως 6 φορές την ημέρα + άμεσα υψηλής συνάφειας",
    advancedFilters: true,
    prioritySupport: true,
    deadlineRadar: true,
    includesLabel: "Όλες οι δυνατότητες του Basic, με:",
    footnoteEl: PRICING_TAX_LABEL,
    ctaEl: "Δείτε το Pro",
    teaserBullets: [
      "3 χρήστες",
      "Έως 15 ενεργές αποθηκευμένες αναζητήσεις",
      "Έως 100 διαγωνισμοί σε παρακολούθηση",
      "2 GB χώρου για εταιρικά έγγραφα",
      "Συγκεντρωτικά email έως 6 φορές την ημέρα",
    ],
    fullBullets: [
      "3 χρήστες",
      "Έως 15 ενεργές αποθηκευμένες αναζητήσεις",
      "Έως 100 διαγωνισμοί σε παρακολούθηση",
      "2 GB χώρου για εταιρικά έγγραφα",
      "Συγκεντρωτικά email έως 6 φορές την ημέρα",
      "Παρακολούθηση προτεραιότητας σε διαγωνισμούς που σας ενδιαφέρουν",
      "Άμεση ειδοποίηση για σχετικές προσκλήσεις και κρίσιμες εξελίξεις",
      "Άμεσες ειδοποιήσεις για νέες ευκαιρίες υψηλής συνάφειας",
      "Συγκεντρωτική προβολή επερχόμενων προθεσμιών",
      "Προηγμένα φίλτρα αναζήτησης",
      "Εξυπηρέτηση κατά προτεραιότητα",
    ],
  },
} as const;

export type MarketingPlanKey = keyof typeof MARKETING_PLANS;

/** Insert Slack bullet into Basic/Pro lists only when the feature is live. */
export const marketingFullBullets = (key: MarketingPlanKey): string[] => {
  const base: string[] = [...MARKETING_PLANS[key].fullBullets];
  if (!slackMarketingEnabled() || key === "free") return base;
  const after =
    key === "basic"
      ? "Επιλογή άμεσων email για σημαντικές εξελίξεις στους διαγωνισμούς που παρακολουθείτε"
      : "Άμεσες ειδοποιήσεις για νέες ευκαιρίες υψηλής συνάφειας";
  const idx = base.indexOf(after);
  if (idx < 0) return [...base, SLACK_NOTIFICATIONS_FEATURE_EL];
  return [
    ...base.slice(0, idx + 1),
    SLACK_NOTIFICATIONS_FEATURE_EL,
    ...base.slice(idx + 1),
  ];
};

export const marketingTeaserBullets = (key: MarketingPlanKey): string[] => {
  const base = [...MARKETING_PLANS[key].teaserBullets];
  if (!slackMarketingEnabled() || key === "free") return base;
  if (key === "basic") {
    return [...base.slice(0, 3), SLACK_NOTIFICATIONS_FEATURE_EL, ...base.slice(3)];
  }
  return [...base, SLACK_NOTIFICATIONS_FEATURE_EL];
};

export const formatEur = (amount: number): string =>
  amount.toLocaleString("el-GR", {
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });

export const priceWithTaxHint = (amount: number): string => {
  if (amount === 0) return "0 €";
  return `${formatEur(amount)} € / μήνα`;
};

export const COMPARISON_ROWS: Array<{
  label: string;
  free: string;
  basic: string;
  pro: string;
}> = [
  { label: "Χρήστες", free: "1", basic: "1", pro: "3 περιλαμβάνονται" },
  { label: "Αποθηκευμένες αναζητήσεις", free: "1", basic: "5", pro: "15" },
  { label: "Ενεργές παρακολουθήσεις", free: "5", basic: "30", pro: "100" },
  {
    label: "Έλεγχος ΚΗΜΔΗΣ",
    free: INGEST_SPEED_LABEL,
    basic: INGEST_SPEED_LABEL,
    pro: INGEST_SPEED_LABEL,
  },
  { label: "Φίλτρο περιφέρειας", free: "✓", basic: "✓", pro: "✓" },
  { label: "Πορεία διαγωνισμού", free: "✓", basic: "✓", pro: "✓" },
  { label: "Χώρος για εταιρικά έγγραφα", free: "—", basic: "250 MB", pro: "2 GB" },
  {
    label: "Λίστα δικαιολογητικών",
    free: "—",
    basic: "✓",
    pro: "✓",
  },
  { label: "Συμβάσεις που λήγουν", free: "Πλήθος", basic: "Λίστα + follow", pro: "Λίστα + follow" },
  { label: "Ιστορικό αποτελεσμάτων", free: "—", basic: "✓", pro: "✓" },
  {
    label: "Ειδοποιήσεις μέσω email",
    free: "Έως 1 εβδομαδιαία σύνοψη, όταν υπάρχουν νέα",
    basic: "Συγκεντρωτικά έως 2 φορές / ημέρα",
    pro: "Συγκεντρωτικά έως 6 φορές / ημέρα",
  },
  ...(slackMarketingEnabled()
    ? [
        {
          label: "Ειδοποιήσεις Slack",
          free: "—",
          basic: "1 κανάλι",
          pro: "1 κανάλι",
        },
      ]
    : []),
  { label: "Επερχόμενες προθεσμίες", free: "Στην εφαρμογή", basic: "Στην εφαρμογή", pro: "✓ email" },
  { label: "Προηγμένα φίλτρα αναζήτησης", free: "—", basic: "—", pro: "✓" },
];

export const FAQ_EMAIL_WHEN =
  "Στο δωρεάν πακέτο λαμβάνετε έως μία εβδομαδιαία σύνοψη, όταν υπάρχουν νέα. Στο Basic μπορείτε να επιλέξετε έως 2 καθημερινές ώρες ενημέρωσης ή άμεσα email για σημαντικές εξελίξεις στους διαγωνισμούς που παρακολουθείτε. Στο Pro έχετε έως 6 καθημερινές ώρες ενημέρωσης και επιλογή άμεσων email για νέες ευκαιρίες υψηλής συνάφειας.";

export const FAQ_WEEKLY_DELAY =
  "Όχι. Τα αποτελέσματα και οι νέες εξελίξεις εμφανίζονται στην εφαρμογή ανεξάρτητα από τη συχνότητα των email. Μπορείτε επίσης να ενεργοποιήσετε ειδοποιήσεις push.";

export const FAQ_USES_AI =
  "Όχι. Η αντιστοίχιση αποτελεσμάτων και ο εντοπισμός απαιτήσεων στα έγγραφα βασίζονται σε κανόνες. Ελέγχετε πάντα τις απαιτήσεις στο επίσημο έγγραφο του διαγωνισμού.";

export const FAQ_SUBMIT_OFFER =
  "Όχι. Υποβάλλετε την προσφορά σας με τον τρόπο που ορίζει η πρόσκληση ή η διακήρυξη. Στο ARC Tenders οργανώνετε την προετοιμασία σας, καταγράφετε την υποβολή και παρακολουθείτε τις εξελίξεις.";
