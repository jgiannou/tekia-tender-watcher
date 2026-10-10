import type { PrismaClient } from "@prisma/client";
import type { KimdisClient } from "../../kimdis/client.js";
import { extractPdfText } from "../../pdf/extract-text.js";

/**
 * Structured notice checklist. Local text extraction + deterministic rules only.
 * No AI / OCR pipeline. Missing or unreadable text is never invented.
 */

export type ChecklistFieldStatus = "found" | "not_found";

export type ChecklistCitation = {
  page: number | null;
  excerpt: string;
  confidence: "high" | "medium" | "low";
};

export type ChecklistField = {
  key: string;
  label: string;
  status: ChecklistFieldStatus;
  value: string | null;
  citation: ChecklistCitation | null;
};

export type DocumentLineStatus =
  | "probable_match"
  | "needs_review"
  | "missing"
  | "expired"
  | "user_confirmed"
  | "not_required";

export type DocumentLine = {
  key: string;
  label: string;
  status: DocumentLineStatus;
  statusLabelEl: string;
  citation: ChecklistCitation | null;
};

export type ParticipationChecklist = {
  readable: boolean;
  unreadMessage: string | null;
  officialPdfUrl: string | null;
  pageCount: number;
  zeroRulesMessage: string | null;
  matchDisclaimerEl: string;
  fields: ChecklistField[];
  documents: DocumentLine[];
};

export type VaultDocHint = {
  name: string;
  documentType?: string | null;
  expiresAt?: Date | string | null;
  userConfirmed?: boolean;
};

const NOT_FOUND = "Δεν εντοπίστηκε";
const MATCH_DISCLAIMER =
  "Η αντιστοίχιση δεν επιβεβαιώνει ότι το έγγραφο καλύπτει όλες τις απαιτήσεις. Ελέγξτε την προκήρυξη πριν την υποβολή.";
const UNREADABLE_EL =
  "Δεν ήταν δυνατή η εξαγωγή κειμένου από το PDF. Ανοίξτε το επίσημο έγγραφο και προσθέστε χειροκίνητα τα απαιτούμενα δικαιολογητικά.";
const ZERO_RULES_EL =
  "Δεν εντοπίστηκαν απαιτήσεις με αυτόματο έλεγχο. Ελέγξτε το επίσημο έγγραφο και συμπληρώστε τη λίστα.";

const STATUS_LABEL: Record<DocumentLineStatus, string> = {
  probable_match: "Βρέθηκε πιθανό δικαιολογητικό",
  needs_review: "Χρειάζεται έλεγχο",
  missing: "Δεν έχει προστεθεί έγγραφο",
  expired: "Το έγγραφο έχει λήξει",
  user_confirmed: "Επιβεβαιώθηκε από εσάς",
  not_required: "Δεν απαιτείται από τον αυτόματο έλεγχο",
};

const field = (
  key: string,
  label: string,
  value: string | null,
  citation: ChecklistCitation | null,
): ChecklistField => ({
  key,
  label,
  status: value ? "found" : "not_found",
  value,
  citation,
});

const clipExcerpt = (text: string, index: number, length = 160): string => {
  const start = Math.max(0, index - 40);
  const end = Math.min(text.length, index + length);
  return text.slice(start, end).replace(/\s+/g, " ").trim();
};

const locateInPages = (
  pages: Array<{ page: number; text: string }>,
  fullText: string,
  matched: string,
): ChecklistCitation => {
  const needle = matched.toLowerCase().slice(0, 48);
  for (const page of pages) {
    const idx = page.text.toLowerCase().indexOf(needle);
    if (idx >= 0) {
      return {
        page: page.page,
        excerpt: clipExcerpt(page.text, idx),
        confidence: "high",
      };
    }
  }
  const idx = fullText.toLowerCase().indexOf(needle);
  // Without real page splits, never invent "page 1".
  return {
    page: null,
    excerpt: idx >= 0 ? clipExcerpt(fullText, idx) : matched.slice(0, 160),
    confidence: "low",
  };
};

/** Parse common Greek / EU date forms used in notice text. */
export const parseChecklistDate = (raw: string): Date | null => {
  const text = raw.trim();
  const iso = Date.parse(text);
  if (Number.isFinite(iso) && /^\d{4}-\d{2}-\d{2}/.test(text)) {
    return new Date(iso);
  }
  const m = text.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  let year = Number(m[3]);
  if (year < 100) year += 2000;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  return Number.isNaN(date.getTime()) ? null : date;
};

const firstMatchWithCitation = (
  text: string,
  pages: Array<{ page: number; text: string }>,
  patterns: RegExp[],
): { value: string; citation: ChecklistCitation } | null => {
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    const value = match?.[1]?.replace(/\s+/g, " ").trim();
    if (!value) continue;
    return {
      value,
      citation: locateInPages(text ? pages : [], text, match?.[0] ?? value),
    };
  }
  return null;
};

const extractDeadline = (
  text: string,
  pages: Array<{ page: number; text: string }>,
) =>
  firstMatchWithCitation(text, pages, [
    /προθεσμ[ιί]α\s+(?:υποβολ[ηή]ς|παραλαβ[ηή]ς)[^.\n]{0,80}?(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4})/i,
    /καταληκτικ[ηή]\s+ημερομην[ιί]α[^.\n]{0,80}?(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4})/i,
    /υποβολ[ηή]\s+προσφορ[ωώ]ν[^.\n]{0,80}?(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4})/i,
  ]);

const extractGuarantee = (
  text: string,
  pages: Array<{ page: number; text: string }>,
) =>
  firstMatchWithCitation(text, pages, [
    /εγγυητικ[ηή]\s+(?:επιστολ[ηή]\s+)?συμμετοχ[ηή]ς[^.\n]{0,120}?(\d[\d\s.,]*\s*(?:€|ευρ[ωώ]))/i,
    /εγγ[υύ]ηση\s+συμμετοχ[ηή]ς[^.\n]{0,120}?(\d[\d\s.,]*\s*(?:%|€|ευρ[ωώ]))/i,
  ]);

const extractCriterion = (
  text: string,
  pages: Array<{ page: number; text: string }>,
) =>
  firstMatchWithCitation(text, pages, [
    /κριτ[ηή]ριο\s+κατακ[υύ]ρωσης[^.\n]{0,160}?((?:πλέον|χαμηλ[ηό]τερη|συμφερ[οό]τερη)[^.\n]{0,80})/i,
    /((?:πλέον\s+συμφ[εέ]ρουσα|χαμηλ[οό]τερη\s+τιμ[ηή])[^.\n]{0,40})/i,
  ]);

const extractLots = (
  text: string,
  pages: Array<{ page: number; text: string }>,
) =>
  firstMatchWithCitation(text, pages, [
    /τμ[ηή]ματα[^.\n]{0,40}?(\d{1,2})/i,
    /διαιρ(?:είται|ειται)\s+σε\s+(\d{1,2})\s+τμ[ηή]ματα/i,
  ]);

const REQUIRED_DOCS: Array<{ key: string; label: string; patterns: RegExp[] }> = [
  {
    key: "tax",
    label: "Φορολογική ενημερότητα",
    patterns: [/φορολογικ[ηή]\s+ενημερ[οό]τητα/i],
  },
  {
    key: "insurance",
    label: "Ασφαλιστική ενημερότητα",
    patterns: [/ασφαλιστικ[ηή]\s+ενημερ[οό]τητα/i],
  },
  {
    key: "gemi",
    label: "ΓΕΜΗ",
    patterns: [/ΓΕΜΗ|γενικ[οό]\s+εμπορικ[οό]\s+μητρ[ωώ]ο/i],
  },
];

const vaultMatch = (
  docs: VaultDocHint[],
  patterns: RegExp[],
): VaultDocHint | null =>
  docs.find((doc) => {
    const haystack = `${doc.name} ${doc.documentType ?? ""}`;
    return patterns.some((pattern) => pattern.test(haystack));
  }) ?? null;

const toExpiryMs = (
  expiresAt: Date | string | null | undefined,
): number | null => {
  if (!expiresAt) return null;
  const ms =
    typeof expiresAt === "string" ? Date.parse(expiresAt) : expiresAt.getTime();
  return Number.isFinite(ms) ? ms : null;
};

/**
 * Expired when past today, or when it would already be invalid by the
 * tender submission deadline (even if still valid today).
 */
export const isDocumentExpiredForChecklist = (
  expiresAt: Date | string | null | undefined,
  submissionDeadline?: Date | null,
): boolean => {
  const expiryMs = toExpiryMs(expiresAt);
  if (expiryMs == null) return false;
  if (expiryMs < Date.now()) return true;
  if (submissionDeadline && expiryMs < submissionDeadline.getTime()) return true;
  return false;
};

const docStatus = (
  required: boolean,
  hit: VaultDocHint | null,
  citation: ChecklistCitation | null,
  submissionDeadline?: Date | null,
): DocumentLineStatus => {
  if (!required) return "not_required";
  if (!hit) return "missing";
  if (hit.userConfirmed) return "user_confirmed";
  if (isDocumentExpiredForChecklist(hit.expiresAt, submissionDeadline)) {
    return "expired";
  }
  // Filename match alone never proves compliance.
  return citation ? "needs_review" : "probable_match";
};

const extractOtherDocuments = (
  text: string,
  pages: Array<{ page: number; text: string }>,
): Array<{ label: string; citation: ChecklistCitation }> => {
  const lines = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 8 && line.length < 180);
  const hits = lines.filter((line) =>
    /δικαιολογητικ|υπε[υύ]θυν[ηή]\s+δ[ηή]λωση|πιστοποιητικ[οό]|εγγυητικ/i.test(
      line,
    ),
  );
  return [...new Set(hits)].slice(0, 12).map((label) => ({
    label,
    citation: locateInPages(pages, text, label),
  }));
};

export const extractParticipationChecklist = (
  text: string | null | undefined,
  options?: {
    officialPdfUrl?: string | null;
    vaultDocs?: VaultDocHint[];
    pages?: Array<{ page: number; text: string }>;
    pageCount?: number;
    /** Structured deadline from tender row when text extraction lacks one. */
    submissionDeadline?: Date | string | null;
  },
): ParticipationChecklist => {
  const officialPdfUrl = options?.officialPdfUrl ?? null;
  const pages = options?.pages ?? [];
  const pageCount = options?.pageCount ?? pages.length;
  const body = text?.trim() ?? "";
  if (body.length < 40) {
    return {
      readable: false,
      unreadMessage: UNREADABLE_EL,
      officialPdfUrl,
      pageCount,
      zeroRulesMessage: null,
      matchDisclaimerEl: MATCH_DISCLAIMER,
      fields: [],
      documents: [],
    };
  }

  const deadline = extractDeadline(body, pages);
  const guarantee = extractGuarantee(body, pages);
  const criterion = extractCriterion(body, pages);
  const lots = extractLots(body, pages);
  const vaultDocs = options?.vaultDocs ?? [];
  const structuredDeadline = options?.submissionDeadline
    ? typeof options.submissionDeadline === "string"
      ? parseChecklistDate(options.submissionDeadline) ||
        (Number.isFinite(Date.parse(options.submissionDeadline))
          ? new Date(options.submissionDeadline)
          : null)
      : options.submissionDeadline
    : null;
  const submissionDeadline =
    (deadline?.value ? parseChecklistDate(deadline.value) : null) ??
    structuredDeadline;

  const documents: DocumentLine[] = REQUIRED_DOCS.map((doc) => {
    const match = doc.patterns
      .map((pattern) => pattern.exec(body))
      .find((row) => row?.[0]);
    const required = Boolean(match);
    const citation = match?.[0]
      ? locateInPages(pages, body, match[0])
      : null;
    const hit = required ? vaultMatch(vaultDocs, doc.patterns) : null;
    const status = docStatus(required, hit, citation, submissionDeadline);
    return {
      key: doc.key,
      label: doc.label,
      status,
      statusLabelEl: STATUS_LABEL[status],
      citation,
    };
  });

  for (const row of extractOtherDocuments(body, pages)) {
    if (documents.some((d) => d.label === row.label)) continue;
    const hit = vaultMatch(vaultDocs, [new RegExp(row.label.slice(0, 24), "i")]);
    const status = docStatus(true, hit, row.citation, submissionDeadline);
    documents.push({
      key: `other:${row.label.slice(0, 40)}`,
      label: row.label,
      status,
      statusLabelEl: STATUS_LABEL[status],
      citation: row.citation,
    });
  }

  const requiredDocs = documents.filter((d) => d.status !== "not_required");
  const fields = [
    field("deadline", "Προθεσμία", deadline?.value ?? null, deadline?.citation ?? null),
    field("guarantee", "Εγγυητική", guarantee?.value ?? null, guarantee?.citation ?? null),
    field(
      "criterion",
      "Κριτήριο κατακύρωσης",
      criterion?.value ?? null,
      criterion?.citation ?? null,
    ),
    field("lots", "Τμήματα", lots?.value ? `${lots.value}` : null, lots?.citation ?? null),
  ];
  const anyFound =
    fields.some((f) => f.status === "found") || requiredDocs.length > 0;

  return {
    readable: true,
    unreadMessage: null,
    officialPdfUrl,
    pageCount,
    zeroRulesMessage: anyFound ? null : ZERO_RULES_EL,
    matchDisclaimerEl: MATCH_DISCLAIMER,
    fields,
    documents,
  };
};

export const unreadChecklistLabel = NOT_FOUND;

export const loadParticipationChecklist = async (
  prisma: PrismaClient,
  kimdis: KimdisClient | undefined,
  input: { organizationId: string; tenderId: string },
): Promise<ParticipationChecklist> => {
  const tender = await prisma.tender.findUnique({
    where: { id: input.tenderId },
  });
  if (!tender) {
    return extractParticipationChecklist(null);
  }

  let source = tender;
  if (tender.recordType !== "PROC") {
    const child = await prisma.tender.findFirst({
      where: { parentTenderId: tender.id, recordType: "PROC" },
      orderBy: { submissionDate: "desc" },
    });
    if (child) source = child;
  }

  let text = source.pdfText ?? "";
  let pages: Array<{ page: number; text: string }> = [];
  let pageCount = 0;
  if (text.trim().length < 40 && kimdis && source.recordType === "PROC") {
    const buffer = await kimdis.downloadAttachment("PROC", source.referenceNumber);
    const extracted = await extractPdfText(buffer);
    text = extracted.text;
    pages = extracted.pages;
    pageCount = extracted.pageCount;
    if (extracted.status === "extracted") {
      await prisma.tender.update({
        where: { id: source.id },
        data: { pdfText: text, pdfTextStatus: extracted.status },
      });
    }
  }
  // Stored pdfText without page splits: keep pages empty so citations
  // do not claim "page 1" without evidence.

  const vaultDocs = await prisma.vaultDocument.findMany({
    where: { organizationId: input.organizationId },
    select: { name: true, documentType: true, expiryDate: true },
  });

  return extractParticipationChecklist(text, {
    officialPdfUrl: source.officialPdfUrl,
    vaultDocs: vaultDocs.map((doc) => ({
      name: doc.name,
      documentType: doc.documentType,
      expiresAt: doc.expiryDate,
    })),
    pages,
    pageCount,
    submissionDeadline: source.finalSubmissionDate,
  });
};
