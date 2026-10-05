import {
  LEGAL_CONTROLLER,
  LEGAL_EFFECTIVE_DATE,
  LEGAL_PROVIDER,
  LEGAL_VERSIONS,
  type LegalDocument,
} from "./meta";

export const providerInformation: LegalDocument = {
  id: "provider",
  title: "Στοιχεία Παρόχου",
  version: LEGAL_VERSIONS.provider,
  effectiveDate: LEGAL_EFFECTIVE_DATE,
  summary: `Νομική ταυτότητα του παρόχου της πλατφόρμας ${LEGAL_CONTROLLER.productName}.`,
  sections: [
    {
      id: "identity",
      title: "Ταυτότητα",
      paragraphs: [
        `Επωνυμία / νομικό πρόσωπο: ${LEGAL_PROVIDER.legalName}`,
        `Νομική μορφή: ${LEGAL_PROVIDER.legalType}`,
        `Διακριτικός τίτλος / εμπορική χρήση: ${LEGAL_PROVIDER.tradingName}`,
        `Προϊόν: ${LEGAL_PROVIDER.productName}`,
        `ΑΦΜ: ${LEGAL_PROVIDER.afm}`,
        `Αριθμός ΓΕΜΗ: ${LEGAL_PROVIDER.gemiNumber}`,
        `Υπηρεσία ΓΕΜΗ: ${LEGAL_PROVIDER.gemiService}`,
        `Διεύθυνση: ${LEGAL_PROVIDER.address}`,
        `Χώρα: ${LEGAL_PROVIDER.country}`,
        `Email: ${LEGAL_PROVIDER.email}`,
        `Ιστότοπος: ${LEGAL_PROVIDER.website}`,
      ],
      closing: LEGAL_PROVIDER.taxOffice
        ? [`ΔΟΥ: ${LEGAL_PROVIDER.taxOffice}`]
        : [
            "Στοιχεία ΔΟΥ: διαθέσιμα κατόπιν αιτήματος όπου απαιτούνται για τιμολόγηση / συμμόρφωση.",
          ],
      links: [
        { label: "Επικοινωνία", href: `mailto:${LEGAL_PROVIDER.email}` },
        { label: "Ιστότοπος", href: LEGAL_PROVIDER.website },
      ],
    },
    {
      id: "scope",
      title: "Πεδίο",
      paragraphs: [
        "Τα ανωτέρω αφορούν την εμπορική SaaS πλατφόρμα ARC Tenders. Το εσωτερικό εργαλείο desktop της TEKIA (τοπική χρήση) είναι ξεχωριστό προϊόν και δεν ταυτίζεται με την παρούσα διαδικτυακή υπηρεσία.",
      ],
    },
  ],
};
