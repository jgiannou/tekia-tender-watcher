import { cookieNotice } from "./cookies";
import { LEGAL_VERSIONS, type LegalDocId, type LegalDocument } from "./meta";
import { privacyPolicy } from "./privacy";
import { termsOfService } from "./terms";

export {
  LEGAL_CONTROLLER,
  LEGAL_EFFECTIVE_DATE,
  LEGAL_VERSIONS,
  type LegalDocId,
  type LegalDocument,
  type LegalSection,
} from "./meta";

export const legalDocuments: Record<LegalDocId, LegalDocument> = {
  terms: termsOfService,
  privacy: privacyPolicy,
  cookies: cookieNotice,
};

export const getLegalDocument = (id: LegalDocId): LegalDocument =>
  legalDocuments[id];

/** Versions sent to API when the user accepts on signup */
export const currentLegalAcceptancePayload = () => ({
  termsVersion: LEGAL_VERSIONS.terms,
  privacyVersion: LEGAL_VERSIONS.privacy,
});
