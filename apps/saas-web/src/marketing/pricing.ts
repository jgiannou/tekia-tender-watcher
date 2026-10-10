/**
 * Public marketing pricing — keep in sync with src/saas/plans/catalog.ts.
 * Do not invent entitlements that the product does not enforce.
 */

export const TRIAL_DAYS = 7;

/** Shown next to list prices; Stripe Tax adds VAT at checkout (exclusive prices). */
export const PRICING_TAX_LABEL = "+ ΦΠΑ";

export const MARKETING_PLANS = {
  free: {
    key: "free",
    name: "Δωρεάν",
    priceMonthlyEur: 0,
    priceYearlyEur: 0,
    positioningEl:
      "Ξεκινήστε την αναζήτηση και παρακολουθήστε έως 5 διαγωνισμούς δωρεάν.",
    shortPositioningEl: "Δωρεάν χρήση, χωρίς κάρτα.",
    includedSeats: 1,
    maxSeatsSelfService: 1,
    extraSeatMonthlyEur: null as number | null,
    maxActiveWatchProfiles: 1,
    maxActiveFollowedTenders: 5,
    storageLabel: "—",
    emailLabel: "1 συγκεντρωτικό email την ημέρα",
    emailShort: "1 email / ημέρα",
    emailTable: "1 συγκεντρωτικό email την ημέρα",
    advancedFilters: false,
    prioritySupport: false,
    deadlineRadar: false,
    includesLabel: null as string | null,
    teaserBullets: [
      "1 χρήστης",
      "1 αποθηκευμένη αναζήτηση",
      "Έως 5 διαγωνισμοί σε παρακολούθηση",
      "Αυτόματη ενημέρωση δεδομένων από το ΚΗΜΔΗΣ σε όλα τα πακέτα",
      "Φίλτρο περιφέρειας",
    ],
    fullBullets: [
      "1 χρήστης",
      "1 ενεργή αποθηκευμένη αναζήτηση",
      "Έως 5 διαγωνισμοί σε παρακολούθηση",
      "Αυτόματη ενημέρωση δεδομένων από το ΚΗΜΔΗΣ σε όλα τα πακέτα",
      "Ειδοποιήσεις push και ειδοποιήσεις μέσα στην εφαρμογή",
      "1 συγκεντρωτικό email την ημέρα",
      "Φίλτρο περιφέρειας",
      "Προβολή της πορείας και του ιστορικού κάθε διαγωνισμού",
      "Αναζήτηση στο ΚΗΜΔΗΣ",
    ],
  },
  basic: {
    key: "basic",
    name: "Basic",
    priceMonthlyEur: 4.99,
    priceYearlyEur: 49,
    positioningEl:
      "Για επαγγελματίες και μικρές επιχειρήσεις που αναζητούν δημόσιους διαγωνισμούς και οργανώνουν τη συμμετοχή τους.",
    shortPositioningEl: "Για επαγγελματίες και μικρές επιχειρήσεις.",
    includedSeats: 1,
    maxSeatsSelfService: 1,
    extraSeatMonthlyEur: null as number | null,
    maxActiveWatchProfiles: 3,
    maxActiveFollowedTenders: 20,
    storageLabel: "250 MB",
    emailLabel: "Συγκεντρωτικά email στις ώρες που επιλέγετε",
    emailShort: "συγκεντρωτικά email · επιλογή ωρών",
    emailTable: "Συγκεντρωτικά email στις ώρες που επιλέγετε",
    advancedFilters: false,
    prioritySupport: false,
    deadlineRadar: false,
    includesLabel: "Όλες οι δυνατότητες του δωρεάν πακέτου, με:",
    teaserBullets: [
      "Έως 3 αποθηκευμένες αναζητήσεις",
      "Έως 20 διαγωνισμοί σε παρακολούθηση",
      "250 MB χώρου για εταιρικά έγγραφα",
      "Έλεγχος δικαιολογητικών συμμετοχής",
      "Συμβάσεις που λήγουν + ιστορικό τιμών",
    ],
    fullBullets: [
      "Έως 3 ενεργές αποθηκευμένες αναζητήσεις",
      "Έως 20 διαγωνισμοί σε παρακολούθηση",
      "250 MB χώρου για εταιρικά έγγραφα",
      "Καταγραφή εκδήλωσης ενδιαφέροντος προς τον φορέα",
      "Χώρος προετοιμασίας συμμετοχής στον διαγωνισμό",
      "Καταγραφή υποβολής προσφοράς",
      "Έλεγχος δικαιολογητικών συμμετοχής",
      "Εντοπισμός και παρακολούθηση συμβάσεων που λήγουν",
      "Ιστορικό τιμών στον διαγωνισμό",
      "Συγκεντρωτικά email στις ώρες που επιλέγετε, με ώρα Ελλάδας",
    ],
  },
  pro: {
    key: "pro",
    name: "Pro",
    badge: "Προτεινόμενο",
    priceMonthlyEur: 9.99,
    priceYearlyEur: 99,
    positioningEl:
      "Για επιχειρήσεις που παρακολουθούν περισσότερους διαγωνισμούς και συνεργάζονται ως ομάδα.",
    shortPositioningEl: "Για περισσότερους διαγωνισμούς και συνεργασία με την ομάδα σας.",
    includedSeats: 3,
    maxSeatsSelfService: 20,
    extraSeatMonthlyEur: 2.49,
    maxActiveWatchProfiles: 15,
    maxActiveFollowedTenders: 100,
    storageLabel: "2 GB",
    emailLabel: "Άμεσα email για νέες εξελίξεις και προβολή επερχόμενων προθεσμιών",
    emailShort: "άμεσα email + προθεσμίες",
    emailTable: "Άμεσα email για νέες εξελίξεις",
    advancedFilters: true,
    prioritySupport: true,
    deadlineRadar: true,
    includesLabel: "Όλες οι δυνατότητες του Basic, με:",
    teaserBullets: [
      "Περιλαμβάνονται 3 χρήστες. Επιπλέον χρήστες με 2,49 € ανά χρήστη τον μήνα.",
      "Έως 15 αποθηκευμένες αναζητήσεις",
      "Έως 100 διαγωνισμοί σε παρακολούθηση",
      "2 GB χώρου για εταιρικά έγγραφα",
      "Άμεσα email για νέες εξελίξεις και προβολή επερχόμενων προθεσμιών",
    ],
    fullBullets: [
      "Περιλαμβάνονται 3 χρήστες. Προσθέστε επιπλέον χρήστες με 2,49 € ανά χρήστη τον μήνα, έως 20 συνολικά.",
      "Έως 15 ενεργές αποθηκευμένες αναζητήσεις",
      "Έως 100 διαγωνισμοί σε παρακολούθηση",
      "2 GB χώρου για εταιρικά έγγραφα",
      "Άμεσες ειδοποιήσεις μέσω email για νέες εξελίξεις",
      "Συγκεντρωτική προβολή επερχόμενων προθεσμιών",
      "Προηγμένα φίλτρα αποθηκευμένων αναζητήσεων",
      "Εξυπηρέτηση κατά προτεραιότητα",
    ],
  },
} as const;

export type MarketingPlanKey = keyof typeof MARKETING_PLANS;

export const formatEur = (amount: number): string =>
  amount.toLocaleString("el-GR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export const priceWithTaxHint = (amount: number): string => {
  if (amount === 0) return "0 €";
  const base = `${formatEur(amount)} € / μήνα`;
  const tax = PRICING_TAX_LABEL.trim();
  return tax ? `${base} ${tax}` : base;
};

export const COMPARISON_ROWS: Array<{
  label: string;
  free: string;
  basic: string;
  pro: string;
}> = [
  { label: "Χρήστες", free: "1", basic: "1", pro: "3 περιλαμβάνονται" },
  { label: "Αποθηκευμένες αναζητήσεις", free: "1", basic: "3", pro: "15" },
  { label: "Ενεργές παρακολουθήσεις", free: "5", basic: "20", pro: "100" },
  { label: "Ταχύτητα εισαγωγής", free: "≤5 λεπτά", basic: "≤5 λεπτά", pro: "≤5 λεπτά" },
  { label: "Φίλτρο περιφέρειας", free: "✓", basic: "✓", pro: "✓" },
  { label: "Πορεία διαγωνισμού", free: "✓", basic: "✓", pro: "✓" },
  { label: "Χώρος για εταιρικά έγγραφα", free: "—", basic: "250 MB", pro: "2 GB" },
  { label: "Έλεγχος δικαιολογητικών συμμετοχής", free: "—", basic: "✓", pro: "✓" },
  { label: "Συμβάσεις που λήγουν", free: "Πλήθος", basic: "Λίστα + follow", pro: "Λίστα + follow" },
  { label: "Ιστορικό τιμών", free: "—", basic: "✓", pro: "✓" },
  {
    label: "Ειδοποιήσεις μέσω email",
    free: "1 συγκεντρωτικό email την ημέρα",
    basic: "Συγκεντρωτικά email στις ώρες που επιλέγετε",
    pro: "Άμεσα email για νέες εξελίξεις",
  },
  { label: "Προβολή επερχόμενων προθεσμιών", free: "—", basic: "—", pro: "✓" },
  { label: "Προηγμένα φίλτρα αναζήτησης", free: "—", basic: "—", pro: "✓" },
];
