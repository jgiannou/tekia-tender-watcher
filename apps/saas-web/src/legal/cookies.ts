import {
  LEGAL_CONTROLLER,
  LEGAL_EFFECTIVE_DATE,
  LEGAL_VERSIONS,
  type LegalDocument,
} from "./meta";

export const cookieNotice: LegalDocument = {
  id: "cookies",
  title: "Πολιτική Cookies / Αποθήκευσης",
  version: LEGAL_VERSIONS.cookies,
  effectiveDate: LEGAL_EFFECTIVE_DATE,
  summary:
    "Χρησιμοποιούμε απαραίτητα cookies συνεδρίας για σύνδεση· όχι διαφημιστικά cookies τρίτων.",
  sections: [
    {
      id: "what",
      title: "1. Τι χρησιμοποιούμε",
      paragraphs: [
        `Η ${LEGAL_CONTROLLER.productName} χρησιμοποιεί αυστηρά απαραίτητα μηχανισμούς για τη λειτουργία του λογαριασμού.`,
      ],
      bullets: [
        "Cookie συνεδρίας ταυτοποίησης (Better Auth) — για να παραμένετε συνδεδεμένοι με ασφάλεια.",
        "Τοπική προτίμηση εμφάνισης (theme) όπου αποθηκεύεται στον φυλλομετρητή / λογαριασμό — λειτουργική προτίμηση, όχι διαφήμιση.",
      ],
    },
    {
      id: "no-ads",
      title: "2. Τι δεν χρησιμοποιούμε",
      paragraphs: [
        "Δεν χρησιμοποιούμε διαφημιστικά cookies, cookies κοινωνικών δικτύων για tracking, ούτε εργαλεία behavioral advertising τρίτων στην εφαρμογή.",
        "Αν στο μέλλον προστεθούν προαιρετικά analytics μη απαραίτητα, θα ζητηθεί ξεχωριστή συναίνεση όπου απαιτείται.",
      ],
    },
    {
      id: "manage",
      title: "3. Διαχείριση",
      paragraphs: [
        "Μπορείτε να διαγράψετε cookies από τις ρυθμίσεις του φυλλομετρητή σας· χωρίς το cookie συνεδρίας δεν θα μπορείτε να παραμείνετε συνδεδεμένοι.",
        `Έκδοση: ${LEGAL_VERSIONS.cookies}. Ισχύς από ${LEGAL_EFFECTIVE_DATE}. Επικοινωνία: ${LEGAL_CONTROLLER.email}.`,
      ],
    },
  ],
};
