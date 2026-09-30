/**
 * Pure Google Docs placeholder merge rules.
 * Never invent missing values. Never touch master document IDs here.
 */

export type TemplateDocType =
  | "OUTREACH"
  | "TECHNICAL_OFFER"
  | "ECONOMIC_OFFER"
  | "DECLARATION";

/** Placeholders that may be filled only from known tender/company data. */
export const AUTO_FILL_KEYS = [
  "ORGANIZATION",
  "TENDER_TITLE",
  "ADAM",
  "PROTOCOL_NUMBER",
  "CONTACT_NAME",
  "CONTACT_EMAIL",
  "CONTACT_PHONE",
  "DATE",
  "LEGAL_REPRESENTATIVE",
] as const;

/** Technical Offer — leave intact unless operator explicitly supplies. */
export const TECHNICAL_OPERATOR_KEYS = [
  "SCOPE_SUMMARY",
  "TECHNICAL_APPROACH",
  "DELIVERABLES",
  "TIMELINE",
  "SUPPORT_TERMS",
  "COMPLIANCE_NOTES",
  "NOTES",
] as const;

/** Economic Offer — never invent pricing; require explicit operator input. */
export const ECONOMIC_OPERATOR_KEYS = [
  "NET_AMOUNT",
  "VAT_PERCENT",
  "VAT_AMOUNT",
  "GROSS_AMOUNT",
  "PRICE_BREAKDOWN",
  "VALIDITY_PERIOD",
  "DELIVERY_TIME",
  "PAYMENT_TERMS",
  "NOTES",
] as const;

/** Declaration — DECLARATION_TEXT must be explicit operator/tender input. */
export const DECLARATION_OPERATOR_KEYS = [
  "CAPACITY",
  "DECLARATION_TEXT",
] as const;

export type MergeContext = {
  organization?: string | null;
  tenderTitle?: string | null;
  adam?: string | null;
  protocolNumber?: string | null;
  /** TEKIA company sender / operator contact (Company Settings) */
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  legalRepresentative?: string | null;
  legalName?: string | null;
  brandName?: string | null;
  tradingName?: string | null;
  tradingNameStatus?: string | null;
  /** ISO date or display date */
  date?: string | null;
  /** Optional scope from tender detail (only used if non-empty) */
  scopeSummary?: string | null;
  /** Explicit operator-provided values (economic / declaration / technical extras) */
  operatorValues?: Record<string, string>;
};

export type MergePlan = {
  replacements: Record<string, string>;
  skippedUnknown: string[];
};

const nonEmpty = (value: string | null | undefined): string | null => {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

/**
 * Build replacements for a template type.
 * Missing values are omitted (never replaced with "").
 */
export const buildMergeReplacements = (
  docType: TemplateDocType,
  ctx: MergeContext,
): MergePlan => {
  const replacements: Record<string, string> = {};
  const skippedUnknown: string[] = [];
  const op = ctx.operatorValues ?? {};

  const setIfKnown = (key: string, value: string | null | undefined) => {
    const v = nonEmpty(value);
    if (v) replacements[key] = v;
    else skippedUnknown.push(key);
  };

  // Common auto fields (only when known)
  setIfKnown("ORGANIZATION", ctx.organization);
  setIfKnown("TENDER_TITLE", ctx.tenderTitle);
  setIfKnown("ADAM", ctx.adam);
  setIfKnown("PROTOCOL_NUMBER", ctx.protocolNumber);
  setIfKnown("CONTACT_NAME", ctx.contactName);
  setIfKnown("CONTACT_EMAIL", ctx.contactEmail);
  setIfKnown("CONTACT_PHONE", ctx.contactPhone);
  setIfKnown("DATE", ctx.date);
  setIfKnown(
    "LEGAL_REPRESENTATIVE",
    ctx.legalRepresentative ?? ctx.contactName,
  );
  // Legal identity vs brand — never replace LEGAL_NAME with brand
  setIfKnown("LEGAL_NAME", ctx.legalName);
  setIfKnown("BRAND_NAME", ctx.brandName);
  setIfKnown("TRADING_NAME", ctx.tradingName);
  setIfKnown("TRADING_NAME_STATUS", ctx.tradingNameStatus);

  if (docType === "TECHNICAL_OFFER") {
    // Technical narrative fields stay intact until operator provides/reviews them
    for (const key of TECHNICAL_OPERATOR_KEYS) {
      const v = nonEmpty(op[key]);
      if (v) replacements[key] = v;
      else skippedUnknown.push(key);
    }
  }

  if (docType === "ECONOMIC_OFFER") {
    for (const key of ECONOMIC_OPERATOR_KEYS) {
      const v = nonEmpty(op[key]);
      if (v) replacements[key] = v;
      else skippedUnknown.push(key);
    }
  }

  if (docType === "DECLARATION") {
    for (const key of DECLARATION_OPERATOR_KEYS) {
      const v = nonEmpty(op[key]);
      if (v) replacements[key] = v;
      else skippedUnknown.push(key);
    }
  }

  if (docType === "OUTREACH") {
    // outreach uses common auto fields only
  }

  return { replacements, skippedUnknown: [...new Set(skippedUnknown)] };
};

export const placeholderToken = (key: string): string => `{{${key}}}`;

export const findUnresolvedPlaceholders = (documentText: string): string[] => {
  const matches = documentText.match(/\{\{[A-Z][A-Z0-9_]*\}\}/g) ?? [];
  return [...new Set(matches.map((m) => m.slice(2, -2)))].sort();
};

/**
 * READY is blocked while any {{PLACEHOLDER}} remains in the document.
 */
export const canMarkDocumentReady = (
  unresolvedPlaceholders: string[],
): boolean => unresolvedPlaceholders.length === 0;

/**
 * Safety: Docs batchUpdate must target the copy, never the master.
 */
export const assertMergeTargetIsCopy = (
  masterFileId: string,
  copyFileId: string,
): void => {
  if (!copyFileId || copyFileId === masterFileId) {
    throw new Error(
      "Refusing Docs merge: target must be the tender copy, not the master template",
    );
  }
};

export const buildReplaceAllTextRequests = (
  replacements: Record<string, string>,
): Array<{
  replaceAllText: {
    containsText: { text: string; matchCase: boolean };
    replaceText: string;
  };
}> =>
  Object.entries(replacements).map(([key, value]) => ({
    replaceAllText: {
      containsText: {
        text: placeholderToken(key),
        matchCase: true,
      },
      replaceText: value,
    },
  }));
