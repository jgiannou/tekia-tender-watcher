import {
  DATA_SOURCE_ATTRIBUTION,
  DATA_SOURCE_LINKS,
} from "./data-source-links";
import {
  LEGAL_EFFECTIVE_DATE,
  LEGAL_VERSIONS,
  type LegalDocument,
} from "./meta";

/**
 * Informational page: public data sources, licenses, independent-service disclaimers.
 * GEMI section describes use when company lookup is enabled in the deployment.
 */
export const dataSourcesDocument: LegalDocument = {
  id: "data-sources",
  title: "Πηγές Δεδομένων & Άδειες",
  version: LEGAL_VERSIONS.dataSources,
  effectiveDate: LEGAL_EFFECTIVE_DATE,
  summary:
    "Πού αντλεί το ARC Tenders δημόσια δεδομένα, με ποιες άδειες και με ποιους περιορισμούς.",
  sections: [
    {
      id: "independent",
      title: "Ανεξάρτητη υπηρεσία",
      paragraphs: [
        "Το ARC Tenders είναι ανεξάρτητη ιδιωτική υπηρεσία λογισμικού και δεν αποτελεί επίσημη υπηρεσία, εκπρόσωπο ή συνεργάτη του ΚΗΜΔΗΣ, του ΕΣΗΔΗΣ ή οποιουδήποτε φορέα του Ελληνικού Δημοσίου.",
        "Τίποτα στην εμφάνιση ή στο περιεχόμενο της πλατφόρμας δεν πρέπει να ερμηνεύεται ως επίσημη έγκριση ή σύμπραξη με δημόσιο φορέα.",
      ],
    },
    {
      id: "kimdis",
      title: "ΚΗΜΔΗΣ / ΟΠΣ ΕΣΗΔΗΣ",
      paragraphs: [
        "Το ARC Tenders χρησιμοποιεί δημόσια διαθέσιμα δεδομένα δημοσίων συμβάσεων που παρέχονται μέσω του Open Data API του ΚΗΜΔΗΣ / ΟΠΣ ΕΣΗΔΗΣ.",
        "Τα δεδομένα επαναχρησιμοποιούνται σύμφωνα με την άδεια Creative Commons Attribution 4.0 International (CC BY 4.0).",
        DATA_SOURCE_ATTRIBUTION.kimdisFull,
      ],
      links: [
        {
          label: "Επίσημη πηγή ΚΗΜΔΗΣ / Open Data",
          href: DATA_SOURCE_LINKS.kimdis.openDataPortal,
        },
        {
          label: "Άδεια CC BY 4.0",
          href: DATA_SOURCE_LINKS.kimdis.licenseCcBy40,
        },
      ],
    },
    {
      id: "verify",
      title: "Επαλήθευση επίσημων πληροφοριών",
      paragraphs: [
        "Το ARC Tenders συγκεντρώνει, οργανώνει και επεξεργάζεται δημόσια διαθέσιμα δεδομένα με σκοπό τη διευκόλυνση της αναζήτησης και παρακολούθησης δημοσίων συμβάσεων.",
        "Ο χρήστης πρέπει να επιβεβαιώνει τις τελικές προθεσμίες, απαιτήσεις, έγγραφα και στοιχεία κάθε διαδικασίας από την επίσημη πηγή πριν από οποιαδήποτε ενέργεια ή υποβολή.",
        "Το ARC Tenders δεν αποτελεί την επίσημη / δεσμευτική καταχώριση της διαδικασίας δημόσιας σύμβασης.",
      ],
    },
    {
      id: "freshness",
      title: "Ενημέρωση δεδομένων",
      paragraphs: [
        "Τα δεδομένα εμφανίζονται στο ARC Tenders μετά τη διαθεσιμότητά τους στις δημόσιες πηγές που χρησιμοποιεί η υπηρεσία.",
        "Ενδέχεται να υπάρχει χρονική καθυστέρηση μεταξύ της επίσημης δημοσίευσης μιας πράξης και της εμφάνισής της στο ARC Tenders. Η ροή Open Data δεν εγγυάται συμπεριφορά πραγματικού χρόνου (real-time).",
        "Για κρίσιμες προθεσμίες ή δεσμευτικές πληροφορίες, συμβουλευτείτε πάντοτε την επίσημη πηγή.",
      ],
    },
    {
      id: "gemi",
      title: "ΓΕΜΗ Open Data",
      paragraphs: [
        "Όταν η ενσωμάτωση ΓΕΜΗ Open Data είναι ενεργοποιημένη στην εγκατάσταση, το ARC Tenders μπορεί να χρησιμοποιεί δημόσια διαθέσιμα στοιχεία επιχειρήσεων για τη διευκόλυνση της ρύθμισης εταιρικού προφίλ (π.χ. αναζήτηση με ΑΦΜ).",
        "Τα δεδομένα χρησιμοποιούνται σύμφωνα με την αντίστοιχη άδεια Open Data Commons Attribution License (ODC-BY 1.0).",
        DATA_SOURCE_ATTRIBUTION.gemiFull,
        "Αν η εγκατάσταση δεν έχει ρυθμισμένο κλειδί ΓΕΜΗ, η λειτουργία αναζήτησης επιχείρησης δεν είναι διαθέσιμη — δεν ισχυριζόμαστε ότι χρησιμοποιείται σε κάθε περιβάλλον.",
      ],
      links: [
        {
          label: "Πύλη ΓΕΜΗ Open Data",
          href: DATA_SOURCE_LINKS.gemi.openDataPortal,
        },
        {
          label: "Τεχνική τεκμηρίωση",
          href: DATA_SOURCE_LINKS.gemi.techDocs,
        },
        {
          label: "Άδεια ODC-BY 1.0",
          href: DATA_SOURCE_LINKS.gemi.licenseOdcBy10,
        },
      ],
    },
    {
      id: "minimization",
      title: "Ελαχιστοποίηση σε δημόσια αρχεία",
      paragraphs: [
        "Τα δημόσια αρχεία διαγωνισμών ενδέχεται να περιέχουν ονόματα, τηλέφωνα, email ή άλλα στοιχεία φυσικών προσώπων.",
        "Το ARC Tenders δεν δημιουργεί αυτοτελή προφίλ δημοσίων υπαλλήλων ή επαφών. Εμφανίζουμε / επεξεργαζόμαστε μόνο ό,τι είναι εύλογα απαραίτητο για τη ροή εργασίας δημοσίων συμβάσεων (π.χ. πρόχειρο επικοινωνίας που συμπληρώνετε εσείς).",
      ],
    },
  ],
};
