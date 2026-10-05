import { cookieNotice } from "./cookies";
import { dataProcessingAgreement } from "./dpa";
import { dataSourcesDocument } from "./data-sources";
import { LEGAL_VERSIONS, type LegalDocId, type LegalDocument } from "./meta";
import { privacyPolicy } from "./privacy";
import { providerInformation } from "./provider";
import { termsOfService } from "./terms";

export {
  LEGAL_CONTROLLER,
  LEGAL_PROVIDER,
  LEGAL_EFFECTIVE_DATE,
  LEGAL_VERSIONS,
  LEGAL_DOC_IDS,
  isLegalDocId,
  type LegalDocId,
  type LegalDocument,
  type LegalSection,
  type LegalLink,
} from "./meta";

export {
  DATA_SOURCE_LINKS,
  DATA_SOURCE_ATTRIBUTION,
} from "./data-source-links";

export { LEGAL_SUBPROCESSORS, type Subprocessor } from "./subprocessors";

export {
  CONSENT_FEATURES,
  TRACKING_IDS,
  optionalConsentRequired,
  hasConsent,
  readConsentState,
  writeConsentState,
  acceptAllOptionalConsent,
  rejectOptionalConsent,
  saveCustomConsent,
  loadOptionalTrackersIfAllowed,
  type ConsentCategory,
  type ConsentState,
} from "./consent";

export const legalDocuments: Record<LegalDocId, LegalDocument> = {
  terms: termsOfService,
  privacy: privacyPolicy,
  cookies: cookieNotice,
  dpa: dataProcessingAgreement,
  "data-sources": dataSourcesDocument,
  provider: providerInformation,
};

export const getLegalDocument = (id: LegalDocId): LegalDocument =>
  legalDocuments[id];

/** Hub entries for Settings → Νομικά & Πηγές */
export const LEGAL_HUB_ITEMS: Array<{
  id: LegalDocId;
  label: string;
  blurb: string;
}> = [
  {
    id: "terms",
    label: "Όροι Χρήσης",
    blurb: "Σύμβαση χρήσης, τι δεν κάνει αυτόματα το ARC, συνδρομές, ευθύνη.",
  },
  {
    id: "privacy",
    label: "Πολιτική Απορρήτου",
    blurb: "Κατηγορίες δεδομένων, σκοποί, GDPR δικαιώματα, διαγραφή λογαριασμού.",
  },
  {
    id: "cookies",
    label: "Πολιτική Cookies",
    blurb: "Απαραίτητα cookies· analytics/διαφήμιση μόνο με μελλοντική συναίνεση.",
  },
  {
    id: "data-sources",
    label: "Πηγές Δεδομένων & Άδειες",
    blurb: "ΚΗΜΔΗΣ CC BY 4.0, ΓΕΜΗ ODC-BY, ανεξάρτητη υπηρεσία, καθυστερήσεις.",
  },
  {
    id: "dpa",
    label: "Επεξεργασία Δεδομένων / DPA",
    blurb: "Συμφωνία άρ. 28 ΓΚΠΔ για οργανισμούς-πελάτες (controller / processor).",
  },
  {
    id: "provider",
    label: "Στοιχεία Παρόχου",
    blurb: "Νομική ταυτότητα, ΑΦΜ, ΓΕΜΗ, διεύθυνση, επικοινωνία.",
  },
];

export const currentLegalAcceptancePayload = () => ({
  termsVersion: LEGAL_VERSIONS.terms,
  privacyVersion: LEGAL_VERSIONS.privacy,
});
