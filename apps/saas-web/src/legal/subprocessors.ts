/**
 * Production subprocessors actually used by ARC Tenders SaaS.
 * Update this list when infrastructure changes — do not invent providers.
 */
export type Subprocessor = {
  id: string;
  name: string;
  purpose: string;
  /** Where processing typically occurs (descriptive, not a legal guarantee). */
  locationNote: string;
};

export const LEGAL_SUBPROCESSORS: Subprocessor[] = [
  {
    id: "hosting",
    name: "Πάροχος φιλοξενίας υποδομής (VPS / Coolify)",
    purpose:
      "Φιλοξενία της εφαρμογής web/API, TLS τερματισμός και λειτουργία containers.",
    locationNote: "Επιλέγεται εγκατάσταση εντός ΕΟΧ όπου είναι εφικτό.",
  },
  {
    id: "postgres",
    name: "PostgreSQL (managed / co-located με την υποδομή)",
    purpose:
      "Αποθήκευση λογαριασμών, οργανισμών, ροών εργασίας, ρυθμίσεων και μεταδεδομένων.",
    locationNote: "Ίδια ή συζευγμένη υποδομή με την εφαρμογή.",
  },
  {
    id: "file-storage",
    name: "Αποθήκευση αρχείων στον διακομιστή της υπηρεσίας",
    purpose:
      "Company Vault / εκδόσεις εγγράφων (τοπικός όγκος δίσκου στο περιβάλλον φιλοξενίας).",
    locationNote: "Ίδια υποδομή με την εφαρμογή (χωρίς ξεχωριστό object-storage τρίτου προς το παρόν).",
  },
  {
    id: "brevo",
    name: "Brevo (SMTP)",
    purpose:
      "Αποστολή λειτουργικών / transactional email (επαλήθευση, επαναφορά κωδικού, ειδοποιήσεις παρακολούθησης, digests).",
    locationNote: "ΕΕ / υποδομές παρόχου σύμφωνα με τη συμφωνία επεξεργασίας του Brevo.",
  },
  {
    id: "stripe",
    name: "Stripe",
    purpose:
      "Χρέωση συνδρομών, checkout, customer portal, webhooks. Τα στοιχεία κάρτας επεξεργάζονται από τη Stripe — δεν αποθηκεύονται στους διακομιστές μας.",
    locationNote:
      "Διεθνής πάροχος· εφαρμόζονται οι εγγυήσεις / συμφωνίες επεξεργασίας της Stripe όπου απαιτείται.",
  },
];
