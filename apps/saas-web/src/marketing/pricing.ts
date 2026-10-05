/**
 * Public marketing pricing — keep in sync with src/saas/plans/catalog.ts.
 * Do not invent entitlements that the product does not enforce.
 */

export const TRIAL_DAYS = 7;

/** Empty until accountant confirms VAT wording. Shown only when non-empty. */
export const PRICING_TAX_LABEL = "";

export const MARKETING_PLANS = {
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
    emailLabel: "Έως 2 ομαδοποιημένα email / ημέρα — επιλογή ωρών",
    emailShort: "έως 2 email / ημέρα (επιλογή ωρών)",
    emailTable: "Έως 2 digests · επιλογή ωρών",
    advancedFilters: false,
    prioritySupport: false,
    deadlineRadar: false,
    teaserBullets: [
      "1 χρήστης",
      "3 ενεργές Αποθηκευμένες Αναζητήσεις",
      "20 ενεργές παρακολουθήσεις",
      "250 MB Company Vault",
      "έως 2 email / ημέρα — επιλογή ωρών",
    ],
    fullBullets: [
      "1 χρήστης",
      "3 ενεργές Αποθηκευμένες Αναζητήσεις",
      "20 ενεργές παρακολουθήσεις",
      "Αναζήτηση ΚΗΜΔΗΣ",
      "Ευκαιρίες",
      "Βαθμός συνάφειας και λόγοι αντιστοίχισης",
      "Παρακολούθηση REQ → PROC",
      "Καταγραφή Εκδήλωσης Ενδιαφέροντος",
      "Tender Workspace",
      "Καταγραφή Υποβολής",
      "Παρακολούθηση μεταγενέστερων πράξεων",
      "Company Vault — 250 MB",
      "In-app notifications",
      "Έως 2 ομαδοποιημένα email / ημέρα — επιλέγετε ώρες (Europe/Athens)",
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
    emailLabel: "Έως 6 ομαδοποιημένα email / ημέρα + Deadline radar",
    emailShort: "έως 6 email / ημέρα + Deadline radar",
    emailTable: "Έως 6 digests · Deadline radar",
    advancedFilters: true,
    prioritySupport: true,
    deadlineRadar: true,
    teaserBullets: [
      "3 χρήστες περιλαμβάνονται",
      "€2,49 / επιπλέον χρήστη / μήνα",
      "15 ενεργές Αποθηκευμένες Αναζητήσεις",
      "100 ενεργές παρακολουθήσεις",
      "2 GB Company Vault",
      "έως 6 email / ημέρα + Deadline radar",
    ],
    fullBullets: [
      "3 χρήστες περιλαμβάνονται",
      "€2,49 / επιπλέον χρήστη / μήνα",
      "έως 20 χρήστες self-service",
      "15 ενεργές Αποθηκευμένες Αναζητήσεις",
      "100 ενεργές παρακολουθήσεις",
      "όλα τα βασικά procurement workflows",
      "Company Vault — 2 GB",
      "Έως 6 ομαδοποιημένα email / ημέρα — επιλογή ωρών",
      "Deadline radar — επερχόμενες προθεσμίες",
      "προηγμένα φίλτρα Αποθηκευμένων Αναζητήσεων",
      "priority support",
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
  const base = `€${formatEur(amount)} / μήνα`;
  const tax = PRICING_TAX_LABEL.trim();
  return tax ? `${base} ${tax}` : base;
};

export const COMPARISON_ROWS: Array<{
  label: string;
  basic: string;
  pro: string;
}> = [
  { label: "Χρήστες", basic: "1", pro: "3 περιλαμβάνονται" },
  { label: "Αποθηκευμένες Αναζητήσεις", basic: "3", pro: "15" },
  { label: "Ενεργές Παρακολουθήσεις", basic: "20", pro: "100" },
  { label: "Αναζήτηση ΚΗΜΔΗΣ", basic: "✓", pro: "✓" },
  { label: "Ευκαιρίες", basic: "✓", pro: "✓" },
  { label: "Βαθμός Συνάφειας", basic: "✓", pro: "✓" },
  { label: "REQ → PROC Monitoring", basic: "✓", pro: "✓" },
  { label: "Company Vault", basic: "250 MB", pro: "2 GB" },
  { label: "Tender Workspace", basic: "✓", pro: "✓" },
  { label: "Document Versioning", basic: "✓", pro: "✓" },
  {
    label: "Email Notifications",
    basic: "Έως 2 digests · επιλογή ωρών",
    pro: "Έως 6 digests · επιλογή ωρών",
  },
  { label: "Deadline radar", basic: "—", pro: "✓" },
  { label: "Advanced Filters", basic: "—", pro: "✓" },
  { label: "Priority Support", basic: "—", pro: "✓" },
];
