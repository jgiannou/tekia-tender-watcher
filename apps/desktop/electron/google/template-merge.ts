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
  "LEGAL_NAME",
  "BRAND_NAME",
  "RECORD_TYPE_LABEL",
  "EMAIL_SUBJECT",
  "DOCUMENT_TITLE",
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
  /** REQ | PROC from cloud tender — never invent */
  recordType?: string | null;
  /**
   * CONTACT_NAME — natural person / signer from Company Settings → Contact name.
   * Never fall back to LEGAL_NAME or BRAND_NAME.
   */
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  legalRepresentative?: string | null;
  /** LEGAL_NAME — official legal entity name from Company Settings → Legal name */
  legalName?: string | null;
  /** BRAND_NAME — e.g. TEKIA from Company Settings → Brand name */
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
  /** Exact string → replacement applied on the COPY only (legacy wording fixes). */
  literalReplacements: Record<string, string>;
  skippedUnknown: string[];
};

export const EARLY_OUTREACH_DOCUMENT_TITLE = "ΕΚΔΗΛΩΣΗ ΕΝΔΙΑΦΕΡΟΝΤΟΣ";

/** App draft body (Περιεχόμενο) — same placeholders as Drive merge. */
export const EARLY_OUTREACH_BODY_TEMPLATE = `Καλημέρα σας,

Επικοινωνούμε εκ μέρους της επιχείρησης {{LEGAL_NAME}} σχετικά με το πρόσφατο Πρωτογενές Αίτημα με τίτλο «{{TENDER_TITLE}}» και ΑΔΑΜ {{ADAM}}.

Δραστηριοποιούμαστε στην ανάπτυξη, αναβάθμιση και τεχνική υποστήριξη ιστοσελίδων και web εφαρμογών και θα μας ενδιέφερε να συμμετάσχουμε σε τυχόν έρευνα αγοράς ή πρόσκληση υποβολής προσφοράς που θα ακολουθήσει για το συγκεκριμένο αντικείμενο.

Θα μπορούσατε να μας ενημερώσετε εάν η διαδικασία βρίσκεται ακόμη σε στάδιο έρευνας αγοράς και εάν υπάρχει δυνατότητα να σας αποστείλουμε σύντομη παρουσίαση ή στοιχεία της επιχείρησής μας, ώστε να ληφθούν υπόψη;

Είμαστε διαθέσιμοι για οποιαδήποτε συμπληρωματική πληροφορία χρειαστεί.

Με εκτίμηση,
{{CONTACT_NAME}}
{{LEGAL_NAME}}
{{BRAND_NAME}}
{{CONTACT_EMAIL}}
{{CONTACT_PHONE}}
`;

/**
 * Canonical Early Outreach body for Drive master / copy wording.
 * Placeholders only — never invent concrete identity values here.
 */
export const EARLY_OUTREACH_CANONICAL_TEMPLATE = `TEKIA
${EARLY_OUTREACH_DOCUMENT_TITLE}

Θέμα: Εκδήλωση ενδιαφέροντος – {{TENDER_TITLE}} – ΑΔΑΜ {{ADAM}}

${EARLY_OUTREACH_BODY_TEMPLATE}`;

export const EARLY_OUTREACH_SUBJECT_TEMPLATE =
  "Εκδήλωση ενδιαφέροντος – {{TENDER_TITLE}} – ΑΔΑΜ {{ADAM}}";

export type OutreachDraftContent = {
  subject: string;
  body: string;
  documentTitle: string;
  unresolvedKeys: string[];
  replacements: Record<string, string>;
};

/** Plain-text body written into the Drive COPY — matches app subject/body. */
export const formatOutreachDriveDocumentText = (
  subject: string,
  body: string,
): string =>
  `${EARLY_OUTREACH_DOCUMENT_TITLE}\n\nΘέμα: ${subject.trim()}\n\n${body.trim()}\n`;

/** Bump when Drive write styling changes — invalidates lastSyncedHash → auto re-sync. */
export const OUTREACH_DRIVE_STYLE_VERSION = "v2-normal-arial-11";

/** Stable hash so app ↔ Drive sync state can be compared without inventing content. */
export const hashOutreachContent = (subject: string, body: string): string => {
  const s = `${OUTREACH_DRIVE_STYLE_VERSION}\n${subject.trim()}\n\n${body.trim()}`;
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
};

export const applyKnownPlaceholders = (
  text: string,
  replacements: Record<string, string>,
): string => {
  let out = text;
  for (const [key, value] of Object.entries(replacements)) {
    out = out.split(`{{${key}}}`).join(value);
  }
  return out;
};

/**
 * Build in-app outreach draft from the same merge mappings as Drive.
 * Unresolved placeholders remain as {{KEY}} — never invent values.
 */
export const buildOutreachDraftContent = (
  ctx: MergeContext,
): OutreachDraftContent => {
  const plan = buildMergeReplacements("OUTREACH", ctx);
  const subject =
    plan.replacements.EMAIL_SUBJECT ??
    applyKnownPlaceholders(EARLY_OUTREACH_SUBJECT_TEMPLATE, plan.replacements);
  const body = applyKnownPlaceholders(
    EARLY_OUTREACH_BODY_TEMPLATE,
    plan.replacements,
  );
  const unresolvedKeys = findUnresolvedPlaceholders(`${subject}\n${body}`);

  return {
    subject,
    body,
    documentTitle: EARLY_OUTREACH_DOCUMENT_TITLE,
    unresolvedKeys,
    replacements: plan.replacements,
  };
};

const nonEmpty = (value: string | null | undefined): string | null => {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export const recordTypeLabel = (
  recordType: string | null | undefined,
): string | null => {
  if (recordType === "REQ") return "Πρωτογενές Αίτημα";
  if (recordType === "PROC") return "Πρόσκληση / Διακήρυξη";
  return null;
};

export const buildOutreachEmailSubject = (
  tenderTitle: string | null | undefined,
  adam: string | null | undefined,
): string | null => {
  const title = nonEmpty(tenderTitle);
  const adamValue = nonEmpty(adam);
  if (!title || !adamValue) return null;
  return `Εκδήλωση ενδιαφέροντος – ${title} – ΑΔΑΜ ${adamValue}`;
};

/**
 * Legacy wording fixes applied on the tender COPY only (never master).
 * Removes English "EARLY OUTREACH" and generic "αίτημα/προμήθεια" for REQ.
 */
export const buildOutreachPhraseFixes = (
  recordType: string | null | undefined,
  legalName?: string | null,
): Record<string, string> => {
  const fixes: Record<string, string> = {
    "EARLY OUTREACH": EARLY_OUTREACH_DOCUMENT_TITLE,
    "Early Outreach": EARLY_OUTREACH_DOCUMENT_TITLE,
    "EARLY_OUTREACH": EARLY_OUTREACH_DOCUMENT_TITLE,
  };

  if (recordType === "REQ") {
    fixes["αίτημα/προμήθεια"] = "Πρωτογενές Αίτημα";
    fixes["αίτημα / προμήθεια"] = "Πρωτογενές Αίτημα";
    fixes["αίτημα ή προμήθεια"] = "Πρωτογενές Αίτημα";
    fixes["πρόσφατο αίτημα/προμήθεια"] = "πρόσφατο Πρωτογενές Αίτημα";
    fixes["πρόσφατο αίτημα / προμήθεια"] = "πρόσφατο Πρωτογενές Αίτημα";
  }

  const legal = nonEmpty(legalName);
  if (legal) {
    fixes["εκ μέρους της TEKIA"] = `εκ μέρους της επιχείρησης ${legal}`;
    fixes["εκ μέρους της {{BRAND_NAME}}"] =
      `εκ μέρους της επιχείρησης ${legal}`;
  }

  return fixes;
};

/**
 * Build replacements for a template type.
 * Missing values are omitted (never replaced with "").
 * CONTACT_NAME never falls back to LEGAL_NAME / BRAND_NAME.
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

  // Identity mapping — strict separation
  setIfKnown("CONTACT_NAME", ctx.contactName); // never legalName / brandName
  setIfKnown("CONTACT_EMAIL", ctx.contactEmail);
  setIfKnown("CONTACT_PHONE", ctx.contactPhone);
  setIfKnown("LEGAL_NAME", ctx.legalName); // never brandName
  setIfKnown("BRAND_NAME", ctx.brandName);
  setIfKnown("TRADING_NAME", ctx.tradingName);
  setIfKnown("TRADING_NAME_STATUS", ctx.tradingNameStatus);

  setIfKnown("DATE", ctx.date);
  // Legal representative = contact person only (not legal entity name)
  setIfKnown(
    "LEGAL_REPRESENTATIVE",
    ctx.legalRepresentative ?? ctx.contactName,
  );

  if (docType === "OUTREACH") {
    setIfKnown("DOCUMENT_TITLE", EARLY_OUTREACH_DOCUMENT_TITLE);
    setIfKnown("RECORD_TYPE_LABEL", recordTypeLabel(ctx.recordType));
    setIfKnown(
      "EMAIL_SUBJECT",
      buildOutreachEmailSubject(ctx.tenderTitle, ctx.adam),
    );
  }

  if (docType === "TECHNICAL_OFFER") {
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

  const literalReplacements =
    docType === "OUTREACH"
      ? buildOutreachPhraseFixes(ctx.recordType, ctx.legalName)
      : {};

  return {
    replacements,
    literalReplacements,
    skippedUnknown: [...new Set(skippedUnknown)],
  };
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

export type ReplaceAllTextRequest = {
  replaceAllText: {
    containsText: { text: string; matchCase: boolean };
    replaceText: string;
  };
};

export const buildReplaceAllTextRequests = (
  replacements: Record<string, string>,
): ReplaceAllTextRequest[] =>
  Object.entries(replacements).map(([key, value]) => ({
    replaceAllText: {
      containsText: {
        text: placeholderToken(key),
        matchCase: true,
      },
      replaceText: value,
    },
  }));

/** Exact-string ReplaceAllText (for legacy wording on the COPY). */
export const buildLiteralReplaceAllTextRequests = (
  literals: Record<string, string>,
): ReplaceAllTextRequest[] =>
  Object.entries(literals).map(([from, to]) => ({
    replaceAllText: {
      containsText: {
        text: from,
        matchCase: true,
      },
      replaceText: to,
    },
  }));

export const buildAllReplaceRequests = (
  plan: MergePlan,
): ReplaceAllTextRequest[] => [
  ...buildReplaceAllTextRequests(plan.replacements),
  ...buildLiteralReplaceAllTextRequests(plan.literalReplacements),
];
