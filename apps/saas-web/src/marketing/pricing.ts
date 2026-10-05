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
    emailLabel: "Καθημερινό email digest",
    emailShort: "καθημερινή ενημέρωση email",
    emailTable: "Daily Digest",
    advancedFilters: false,
    prioritySupport: false,
    teaserBullets: [
      "1 χρήστης",
      "3 ενεργές Αποθηκευμένες Αναζητήσεις",
      "20 ενεργές παρακολουθήσεις",
      "250 MB Company Vault",
      "καθημερινή ενημέρωση email",
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
      "Daily email digest",
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
    emailLabel: "Ομαδοποιημένες email ειδοποιήσεις μετά από κάθε σάρωση + digest",
    emailShort: "ομαδοποιημένες email ειδοποιήσεις",
    emailTable: "Grouped after scan + Digest",
    advancedFilters: true,
    prioritySupport: true,
    teaserBullets: [
      "3 χρήστες περιλαμβάνονται",
      "€2,49 / επιπλέον χρήστη / μήνα",
      "15 ενεργές Αποθηκευμένες Αναζητήσεις",
      "100 ενεργές παρακολουθήσεις",
      "2 GB Company Vault",
      "ομαδοποιημένες email ειδοποιήσεις",
    ],
    fullBullets: [
      "3 χρήστες περιλαμβάνονται",
      "€2,49 / επιπλέον χρήστη / μήνα",
      "έως 20 χρήστες self-service",
      "15 ενεργές Αποθηκευμένες Αναζητήσεις",
      "100 ενεργές παρακολουθήσεις",
      "όλα τα βασικά procurement workflows",
      "Company Vault — 2 GB",
      "ομαδοποιημένες email ειδοποιήσεις μετά από κάθε σάρωση",
      "digest option",
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
  { label: "Email Notifications", basic: "Daily Digest", pro: "Grouped after scan" },
  { label: "Advanced Filters", basic: "—", pro: "✓" },
  { label: "Priority Support", basic: "—", pro: "✓" },
];
