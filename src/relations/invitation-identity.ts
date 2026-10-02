/**
 * Targeted invitation classification + conservative legal-identity compare.
 */

import {
  normalizeLegalIdentity,
  normalizeVat,
  stripAccents,
} from "./text-normalize.js";
import type { PdfClassification } from "../pdf/classify.js";

export type InvitationType = "OPEN" | "TARGETED" | "UNKNOWN";
export type OurInvitationStatus = "INVITED" | "NOT_INVITED" | "UNKNOWN";

export type CompanyIdentity = {
  legalName: string | null | undefined;
  vatNumber: string | null | undefined;
  brandName?: string | null | undefined;
  tradingName?: string | null | undefined;
  distinctiveTitleConfirmed?: boolean;
};

export type InvitationAssessment = {
  invitationType: InvitationType;
  invitedVendorName: string | null;
  ourInvitationStatus: OurInvitationStatus;
  reasons: string[];
};

export const assessInvitation = (
  pdf: Pick<
    PdfClassification,
    "targetedSupplier" | "targetedSupplierName" | "nonInvitedOffersRejected"
  >,
  company: CompanyIdentity,
): InvitationAssessment => {
  const reasons: string[] = [];
  const invitedVendorName = pdf.targetedSupplierName?.trim() || null;

  let invitationType: InvitationType = "UNKNOWN";
  if (invitedVendorName) {
    invitationType = "TARGETED";
    reasons.push(`ΠΡΟΣ / named vendor: ${invitedVendorName}`);
  } else if (pdf.nonInvitedOffersRejected) {
    invitationType = "TARGETED";
    reasons.push("Non-invited offers explicitly rejected");
  } else if (pdf.targetedSupplier) {
    invitationType = "TARGETED";
    reasons.push("Targeted supplier indicators in PDF");
  } else if (
    pdf.targetedSupplier === false &&
    !pdf.nonInvitedOffersRejected &&
    !invitedVendorName
  ) {
    // Only mark OPEN when we had readable PDF context that did not trigger targeted rules.
    // Caller may leave UNKNOWN when PDF was not extracted.
    invitationType = "OPEN";
    reasons.push("No targeted vendor / exclusion language detected");
  }

  const ourInvitationStatus = compareInvitedVendor(invitedVendorName, company);
  if (invitationType === "OPEN") {
    return {
      invitationType,
      invitedVendorName: null,
      ourInvitationStatus: "UNKNOWN",
      reasons,
    };
  }

  if (ourInvitationStatus === "INVITED") {
    reasons.push("Invited vendor matches our legal identity");
  } else if (ourInvitationStatus === "NOT_INVITED") {
    reasons.push("Invited vendor does not match our legal identity");
  } else if (invitationType === "TARGETED") {
    reasons.push("Cannot confirm whether we are the invited vendor");
  }

  return {
    invitationType,
    invitedVendorName,
    ourInvitationStatus:
      invitationType === "TARGETED" ? ourInvitationStatus : "UNKNOWN",
    reasons,
  };
};

/**
 * Conservative legal match: legal name (normalized) or VAT only.
 * Brand / trading name alone never counts as invited.
 */
export const compareInvitedVendor = (
  invitedVendorName: string | null,
  company: CompanyIdentity,
): OurInvitationStatus => {
  if (!invitedVendorName?.trim()) return "UNKNOWN";

  const invited = normalizeLegalIdentity(invitedVendorName);
  const legal = normalizeLegalIdentity(company.legalName ?? "");
  const vat = normalizeVat(company.vatNumber);

  if (vat && invitedVendorName.replace(/\D/g, "").includes(vat) && vat.length >= 9) {
    return "INVITED";
  }

  if (legal && invited && (legal === invited || invited.includes(legal) || legal.includes(invited))) {
    // Guard: require substantial overlap length to avoid short false positives
    const minLen = Math.min(legal.length, invited.length);
    if (minLen >= 10 || legal === invited) {
      return "INVITED";
    }
  }

  // Explicitly different named vendor → NOT_INVITED
  if (invited.length >= 5) {
    // If we have a legal name and it's clearly different, NOT_INVITED
    if (legal.length >= 5 && legal !== invited && !invited.includes(legal) && !legal.includes(invited)) {
      return "NOT_INVITED";
    }
    // Vendor named but we have no legal identity configured
    if (!legal) return "UNKNOWN";
    return "NOT_INVITED";
  }

  return "UNKNOWN";
};

export const invitationRecommendedAction = (
  assessment: InvitationAssessment,
): string => {
  if (
    assessment.invitationType === "TARGETED" &&
    assessment.ourInvitationStatus === "NOT_INVITED"
  ) {
    return "Καμία υποβολή προσφοράς — η πρόσκληση απευθύνεται σε άλλο οικονομικό φορέα.";
  }
  if (
    assessment.invitationType === "TARGETED" &&
    assessment.ourInvitationStatus === "INVITED"
  ) {
    return "Προετοιμασία Φακέλου Προσφοράς — στοχευμένη πρόσκληση προς εμάς.";
  }
  if (assessment.invitationType === "TARGETED") {
    return "Έλεγχος πρόσκλησης — δεν επιβεβαιώθηκε αν προσκληθήκαμε.";
  }
  if (assessment.invitationType === "OPEN") {
    return "Έλεγχος απαιτήσεων και προετοιμασία προσφοράς";
  }
  return "Προετοιμασία Φακέλου Προσφοράς";
};

/** Helper for tests / UI: detect ΠΡΟΣ even without full PDF classify. */
export const extractProsVendor = (rawText: string): string | null => {
  const match = rawText.match(
    /(?:ΠΡΟΣ|Προς|Αποδέκτης|Παραλήπτης)\s*[:：]\s*([^\n\r]{3,120})/u,
  );
  if (!match?.[1]) return null;
  const candidate = match[1].replace(/\s{2,}/g, " ").trim();
  if (candidate.length < 3) return null;
  if (/γενικ[ήη]|κοιν[όο]|ενδιαφερομεν|οικονομικ[οό]υς φορε/iu.test(candidate)) {
    return null;
  }
  return candidate.slice(0, 120);
};

export const stripForCompare = stripAccents;
