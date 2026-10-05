/**
 * Pure outreach email template merge for SaaS (no Drive).
 * Never invents missing values — unresolved {{KEY}} stay visible.
 */

export const EARLY_OUTREACH_DOCUMENT_TITLE = "ΕΚΔΗΛΩΣΗ ΕΝΔΙΑΦΕΡΟΝΤΟΣ";

export const EARLY_OUTREACH_SUBJECT_TEMPLATE =
  "Εκδήλωση ενδιαφέροντος – {{TENDER_TITLE}} – ΑΔΑΜ {{ADAM}}";

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

export type OutreachMergeContext = {
  organization?: string | null;
  tenderTitle?: string | null;
  adam?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  legalName?: string | null;
  brandName?: string | null;
  date?: string | null;
};

export type OutreachDraftContent = {
  subject: string;
  body: string;
  documentTitle: string;
  unresolvedKeys: string[];
  replacements: Record<string, string>;
};

const nonEmpty = (value: string | null | undefined): string | null => {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export const findUnresolvedPlaceholders = (text: string): string[] => {
  const found = new Set<string>();
  const re = /\{\{([A-Z0-9_]+)\}\}/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    found.add(match[1]!);
  }
  return [...found].sort();
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

export const buildOutreachReplacements = (
  ctx: OutreachMergeContext,
): Record<string, string> => {
  const replacements: Record<string, string> = {};
  const setIfKnown = (key: string, value: string | null | undefined) => {
    const v = nonEmpty(value);
    if (v) replacements[key] = v;
  };

  setIfKnown("ORGANIZATION", ctx.organization);
  setIfKnown("TENDER_TITLE", ctx.tenderTitle);
  setIfKnown("ADAM", ctx.adam);
  setIfKnown("CONTACT_NAME", ctx.contactName);
  setIfKnown("CONTACT_EMAIL", ctx.contactEmail);
  setIfKnown("CONTACT_PHONE", ctx.contactPhone);
  setIfKnown("LEGAL_NAME", ctx.legalName);
  setIfKnown("BRAND_NAME", ctx.brandName);
  setIfKnown(
    "DATE",
    ctx.date ??
      new Intl.DateTimeFormat("el-GR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }).format(new Date()),
  );

  const subject = applyKnownPlaceholders(
    EARLY_OUTREACH_SUBJECT_TEMPLATE,
    replacements,
  );
  if (!findUnresolvedPlaceholders(subject).length) {
    replacements.EMAIL_SUBJECT = subject;
  }

  return replacements;
};

export const buildOutreachDraftContent = (
  ctx: OutreachMergeContext,
): OutreachDraftContent => {
  const replacements = buildOutreachReplacements(ctx);
  const subject = applyKnownPlaceholders(
    EARLY_OUTREACH_SUBJECT_TEMPLATE,
    replacements,
  );
  const body = applyKnownPlaceholders(EARLY_OUTREACH_BODY_TEMPLATE, replacements);
  return {
    subject,
    body,
    documentTitle: EARLY_OUTREACH_DOCUMENT_TITLE,
    unresolvedKeys: findUnresolvedPlaceholders(`${subject}\n${body}`),
    replacements,
  };
};

/** Extract first plausible email / phone from free text (PDF / notes). */
export const extractContactsFromText = (
  text: string | null | undefined,
): { email: string | null; phone: string | null } => {
  const raw = text?.trim() || "";
  if (!raw) return { email: null, phone: null };
  const emailMatch = raw.match(
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
  );
  const phoneMatch = raw.match(
    /(?:\+30\s?)?(?:\d{3}[\s.-]?\d{3}[\s.-]?\d{4}|\d{10}|\d{2,4}[\s.-]?\d{6,8})/,
  );
  return {
    email: emailMatch?.[0]?.trim() ?? null,
    phone: phoneMatch?.[0]?.replace(/\s+/g, " ").trim() ?? null,
  };
};
