import {
  LEGAL_CONTROLLER,
  LEGAL_EFFECTIVE_DATE,
  LEGAL_VERSIONS,
  type LegalDocument,
} from "./meta";

/**
 * Cookie policy. Today: essential/auth only → no consent banner required.
 * Optional analytics/marketing categories are documented as "not active"
 * and gated behind FEATURE flags in consent.ts for a future enablement.
 */
export const cookieNotice: LegalDocument = {
  id: "cookies",
  title: "Πολιτική Cookies",
  version: LEGAL_VERSIONS.cookies,
  effectiveDate: LEGAL_EFFECTIVE_DATE,
  summary:
    "Αυτή τη στιγμή χρησιμοποιούμε μόνο απολύτως απαραίτητα cookies συνεδρίας. Δεν ενεργοποιούμε analytics ή διαφημιστικά cookies χωρίς συναίνεση.",
  sections: [
    {
      id: "necessary",
      title: "1. Απολύτως απαραίτητα",
      paragraphs: [
        `Η ${LEGAL_CONTROLLER.productName} χρησιμοποιεί αυστηρά απαραίτητα μηχανισμούς για τη λειτουργία του λογαριασμού και την ασφάλεια.`,
      ],
      bullets: [
        "Cookie συνεδρίας ταυτοποίησης (Better Auth) — για να παραμένετε συνδεδεμένοι με ασφάλεια.",
        "Τοπική προτίμηση εμφάνισης (theme) όπου αποθηκεύεται στον φυλλομετρητή / λογαριασμό — λειτουργική προτίμηση, όχι διαφήμιση.",
        "Απαραίτητα τεχνικά στοιχεία ασφαλείας / CSRF / προστασίας συνεδρίας όπου εφαρμόζονται από τη στοίβα αυθεντικοποίησης.",
      ],
      closing: [
        "Τα απολύτως απαραίτητα cookies δεν απαιτούν συναίνεση για τη λειτουργία της Υπηρεσίας.",
      ],
    },
    {
      id: "analytics",
      title: "2. Analytics / μετρήσεις χρήσης (προαιρετικά)",
      paragraphs: [
        "Προς το παρόν δεν χρησιμοποιούμε εργαλεία analytics τρίτων (π.χ. Google Analytics, Meta Pixel) στην εφαρμογή.",
        "Αν στο μέλλον ενεργοποιηθούν προαιρετικά analytics, θα εμφανιστεί ξεχωριστό αίτημα συναίνεσης πριν από οποιαδήποτε φόρτωση του σχετικού script, με δυνατότητα απόρριψης και αλλαγής προτιμήσεων.",
      ],
    },
    {
      id: "marketing",
      title: "3. Marketing / διαφημιστικά cookies",
      paragraphs: [
        "Προς το παρόν δεν χρησιμοποιούμε διαφημιστικά cookies ούτε εργαλεία behavioral advertising τρίτων.",
        "Αν στο μέλλον προστεθούν για σκοπούς προβολής / remarketing, δεν θα ενεργοποιηθούν πριν από ρητή συναίνεση, και θα μπορείτε να τα απορρίψετε ή να τα ανακαλέσετε από τις προτιμήσεις cookies.",
      ],
    },
    {
      id: "manage",
      title: "4. Διαχείριση",
      paragraphs: [
        "Μπορείτε να διαγράψετε cookies από τις ρυθμίσεις του φυλλομετρητή σας· χωρίς το cookie συνεδρίας δεν θα μπορείτε να παραμείνετε συνδεδεμένοι.",
        "Όταν ενεργοποιηθούν προαιρετικές κατηγορίες, οι προτιμήσεις συναίνεσης θα αποθηκεύονται τοπικά και θα ελέγχουν αν φορτώνονται τα αντίστοιχα scripts.",
        `Έκδοση: ${LEGAL_VERSIONS.cookies}. Ισχύς από ${LEGAL_EFFECTIVE_DATE}. Επικοινωνία: ${LEGAL_CONTROLLER.email}.`,
      ],
    },
  ],
};
