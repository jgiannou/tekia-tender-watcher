import {
  LEGAL_CONTROLLER,
  LEGAL_EFFECTIVE_DATE,
  LEGAL_VERSIONS,
  type LegalDocument,
} from "./meta";

/**
 * Cookie policy. Essential cookies always on; optional analytics gated by banner.
 */
export const cookieNotice: LegalDocument = {
  id: "cookies",
  title: "Πολιτική Cookies",
  version: LEGAL_VERSIONS.cookies,
  effectiveDate: LEGAL_EFFECTIVE_DATE,
  summary:
    "Χρησιμοποιούμε απαραίτητα cookies συνεδρίας. Προαιρετικά analytics ενεργοποιούνται μόνο μετά από συναίνεση μέσω του banner cookies.",
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
        "Χρησιμοποιούμε Google Tag Manager (GTM) και Google Analytics 4 (GA4) για μετρήσεις χρήσης της δημόσιας ιστοσελίδας / εφαρμογής.",
        "Το GTM/GA4 φορτώνεται μόνο μετά από συναίνεση (Αποδοχή ή ενεργοποίηση Analytics στις Ρυθμίσεις). Χωρίς συναίνεση δεν φορτώνεται το σχετικό script.",
        "Μπορείτε να απορρίψετε ή να αλλάξετε την επιλογή σας ανά πάσα στιγμή από το banner / τις ρυθμίσεις cookies.",
      ],
    },
    {
      id: "marketing",
      title: "3. Marketing / διαφημιστικά cookies",
      paragraphs: [
        "Η κατηγορία marketing καλύπτει Google Ads / remarketing tags που μπορεί να ρυθμιστούν μέσα στο Google Tag Manager.",
        "Ενεργοποιούνται μόνο με ρητή συναίνεση marketing· χωρίς αυτήν τα σχετικά ad signals παραμένουν denied (Google Consent Mode).",
      ],
    },
    {
      id: "manage",
      title: "4. Διαχείριση",
      paragraphs: [
        "Μπορείτε να διαγράψετε cookies από τις ρυθμίσεις του φυλλομετρητή σας· χωρίς το cookie συνεδρίας δεν θα μπορείτε να παραμείνετε συνδεδεμένοι.",
        "Οι προτιμήσεις συναίνεσης αποθηκεύονται τοπικά στον φυλλομετρητή σας (κλειδί arc.cookieConsent.v1) και ελέγχουν αν φορτώνονται προαιρετικά scripts.",
        `Έκδοση: ${LEGAL_VERSIONS.cookies}. Ισχύς από ${LEGAL_EFFECTIVE_DATE}. Επικοινωνία: ${LEGAL_CONTROLLER.email}.`,
      ],
    },
  ],
};
