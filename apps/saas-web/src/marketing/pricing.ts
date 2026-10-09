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
      "Βρίσκεις και παρακολουθείς λίγους διαγωνισμούς, με την ίδια ταχύτητα εισαγωγής με τα επί πληρωμή πλάνα.",
    shortPositioningEl: "Ίδια ταχύτητα εισαγωγής. Χωρίς κάρτα.",
    includedSeats: 1,
    maxSeatsSelfService: 1,
    extraSeatMonthlyEur: null as number | null,
    maxActiveWatchProfiles: 1,
    maxActiveFollowedTenders: 5,
    storageLabel: "—",
    emailLabel: "1 ομαδικό email / ημέρα",
    emailShort: "1 email / ημέρα",
    emailTable: "1 digest / ημέρα",
    advancedFilters: false,
    prioritySupport: false,
    deadlineRadar: false,
    includesLabel: null as string | null,
    teaserBullets: [
      "1 χρήστης",
      "1 Αποθηκευμένη Αναζήτηση",
      "5 παρακολουθήσεις",
      "Ειδοποίηση εντός 5 λεπτών",
      "Φίλτρο περιφέρειας",
    ],
    fullBullets: [
      "1 χρήστης",
      "1 ενεργή Αποθηκευμένη Αναζήτηση",
      "5 ενεργές παρακολουθήσεις",
      "Ίδια ταχύτητα εισαγωγής ΚΗΜΔΗΣ (εντός 5 λεπτών)",
      "Push και in-app ειδοποιήσεις",
      "1 ομαδικό email / ημέρα",
      "Φίλτρο περιφέρειας",
      "Οθόνη νήματος: αίτημα → πρόσκληση → προθεσμία → κατακύρωση",
      "Αναζήτηση ΚΗΜΔΗΣ",
    ],
  },
  basic: {
    key: "basic",
    name: "Basic",
    priceMonthlyEur: 4.99,
    priceYearlyEur: 49,
    positioningEl:
      "Για επαγγελματίες και μικρές επιχειρήσεις που θέλουν να βρίσκουν και να παρακολουθούν επιλεγμένες δημόσιες ευκαιρίες.",
    shortPositioningEl: "Για επαγγελματίες και μικρές επιχειρήσεις.",
    includedSeats: 1,
    maxSeatsSelfService: 1,
    extraSeatMonthlyEur: null as number | null,
    maxActiveWatchProfiles: 3,
    maxActiveFollowedTenders: 20,
    storageLabel: "250 MB",
    emailLabel: "Digest email — επιλογή ωρών",
    emailShort: "digest · επιλογή ωρών",
    emailTable: "Digest · επιλογή ωρών",
    advancedFilters: false,
    prioritySupport: false,
    deadlineRadar: false,
    includesLabel: "Όλα από το Δωρεάν, και επιπλέον:",
    teaserBullets: [
      "3 Αποθηκευμένες Αναζητήσεις",
      "20 παρακολουθήσεις",
      "250 MB Company Vault",
      "Φάκελος συμμετοχής από PDF",
      "Λήγουσες συμβάσεις + μνήμη τιμής",
    ],
    fullBullets: [
      "3 ενεργές Αποθηκευμένες Αναζητήσεις",
      "20 ενεργές παρακολουθήσεις",
      "Company Vault — 250 MB",
      "Καταγραφή Εκδήλωσης Ενδιαφέροντος",
      "Tender Workspace",
      "Καταγραφή Υποβολής",
      "Φάκελος συμμετοχής από PDF + σύγκριση με vault",
      "Λήγουσες συμβάσεις με ένα κλικ Παρακολούθηση",
      "Μνήμη τιμής στον διαγωνισμό",
      "Digest email — επιλέγετε ώρες (Europe/Athens)",
    ],
  },
  pro: {
    key: "pro",
    name: "Pro",
    badge: "Δημοφιλές",
    priceMonthlyEur: 9.99,
    priceYearlyEur: 99,
    positioningEl:
      "Για επιχειρήσεις που παρακολουθούν συστηματικά δημόσιες συμβάσεις και χρειάζονται μεγαλύτερη κάλυψη και συνεργασία ομάδας.",
    shortPositioningEl: "Για συστηματική κάλυψη και ομάδα.",
    includedSeats: 3,
    maxSeatsSelfService: 20,
    extraSeatMonthlyEur: 2.49,
    maxActiveWatchProfiles: 15,
    maxActiveFollowedTenders: 100,
    storageLabel: "2 GB",
    emailLabel: "Άμεσα email + Deadline radar",
    emailShort: "άμεσα email + Deadline radar",
    emailTable: "Άμεσα · Deadline radar",
    advancedFilters: true,
    prioritySupport: true,
    deadlineRadar: true,
    includesLabel: "Όλα από το Basic, και επιπλέον:",
    teaserBullets: [
      "3 χρήστες περιλαμβάνονται (+€2,49 / επιπλέον)",
      "15 Αποθηκευμένες Αναζητήσεις",
      "100 παρακολουθήσεις",
      "2 GB Vault",
      "Άμεσα email + Deadline radar",
    ],
    fullBullets: [
      "3 χρήστες περιλαμβάνονται (+€2,49 / επιπλέον · έως 20)",
      "15 ενεργές Αποθηκευμένες Αναζητήσεις",
      "100 ενεργές παρακολουθήσεις",
      "Company Vault — 2 GB",
      "Άμεσα email για νέες εξελίξεις",
      "Deadline radar — επερχόμενες προθεσμίες",
      "Προηγμένα φίλτρα Αποθηκευμένων Αναζητήσεων",
      "Priority support",
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
  if (amount === 0) return "€0";
  const base = `€${formatEur(amount)} / μήνα`;
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
  { label: "Αποθηκευμένες Αναζητήσεις", free: "1", basic: "3", pro: "15" },
  { label: "Ενεργές Παρακολουθήσεις", free: "5", basic: "20", pro: "100" },
  { label: "Ταχύτητα εισαγωγής", free: "≤5 λεπτά", basic: "≤5 λεπτά", pro: "≤5 λεπτά" },
  { label: "Φίλτρο περιφέρειας", free: "✓", basic: "✓", pro: "✓" },
  { label: "Οθόνη νήματος", free: "✓", basic: "✓", pro: "✓" },
  { label: "Company Vault", free: "—", basic: "250 MB", pro: "2 GB" },
  { label: "Φάκελος συμμετοχής", free: "—", basic: "✓", pro: "✓" },
  { label: "Λήγουσες συμβάσεις", free: "Πλήθος", basic: "Λίστα + follow", pro: "Λίστα + follow" },
  { label: "Μνήμη τιμής", free: "—", basic: "✓", pro: "✓" },
  {
    label: "Email",
    free: "1 digest / ημέρα",
    basic: "Digest · επιλογή ωρών",
    pro: "Άμεσα · Deadline radar",
  },
  { label: "Deadline radar", free: "—", basic: "—", pro: "✓" },
  { label: "Advanced Filters", free: "—", basic: "—", pro: "✓" },
];
