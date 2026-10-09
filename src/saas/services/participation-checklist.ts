import type { PrismaClient } from "@prisma/client";
import type { KimdisClient } from "../../kimdis/client.js";
import { extractPdfText } from "../../pdf/extract-text.js";

/**
 * Structured notice checklist. Reads the proclamation text.
 * Does not chat, and does not recommend bid / no-bid.
 * Missing text stays "Δεν εντοπίστηκε" — never invented.
 */

export type ChecklistFieldStatus = "found" | "not_found";

export type ChecklistField = {
  key: string;
  label: string;
  status: ChecklistFieldStatus;
  value: string | null;
};

export type DocumentLineStatus = "in_vault" | "missing" | "not_required";

export type DocumentLine = {
  key: string;
  label: string;
  status: DocumentLineStatus;
};

export type ParticipationChecklist = {
  readable: boolean;
  unreadMessage: string | null;
  officialPdfUrl: string | null;
  fields: ChecklistField[];
  documents: DocumentLine[];
};

export type VaultDocHint = {
  name: string;
  documentType?: string | null;
};

const NOT_FOUND = "Δεν εντοπίστηκε";

const field = (
  key: string,
  label: string,
  value: string | null,
): ChecklistField => ({
  key,
  label,
  status: value ? "found" : "not_found",
  value,
});

const firstMatch = (text: string, patterns: RegExp[]): string | null => {
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    const value = match?.[1]?.replace(/\s+/g, " ").trim();
    if (value) return value;
  }
  return null;
};

const extractDeadline = (text: string): string | null =>
  firstMatch(text, [
    /προθεσμ[ιί]α\s+(?:υποβολ[ηή]ς|παραλαβ[ηή]ς)[^.\n]{0,80}?(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4})/i,
    /καταληκτικ[ηή]\s+ημερομην[ιί]α[^.\n]{0,80}?(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4})/i,
    /υποβολ[ηή]\s+προσφορ[ωώ]ν[^.\n]{0,80}?(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4})/i,
  ]);

const extractGuarantee = (text: string): string | null =>
  firstMatch(text, [
    /εγγυητικ[ηή]\s+(?:επιστολ[ηή]\s+)?συμμετοχ[ηή]ς[^.\n]{0,120}?(\d[\d\s.,]*\s*(?:€|ευρ[ωώ]))/i,
    /εγγ[υύ]ηση\s+συμμετοχ[ηή]ς[^.\n]{0,120}?(\d[\d\s.,]*\s*(?:%|€|ευρ[ωώ]))/i,
  ]);

const extractCriterion = (text: string): string | null =>
  firstMatch(text, [
    /κριτ[ηή]ριο\s+κατακ[υύ]ρωσης[^.\n]{0,160}?((?:πλέον|χαμηλ[ηό]τερη|συμφερ[οό]τερη)[^.\n]{0,80})/i,
    /((?:πλέον\s+συμφ[εέ]ρουσα|χαμηλ[οό]τερη\s+τιμ[ηή])[^.\n]{0,40})/i,
  ]);

const extractLots = (text: string): string | null =>
  firstMatch(text, [
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

const vaultHas = (docs: VaultDocHint[], patterns: RegExp[]): boolean =>
  docs.some((doc) => {
    const haystack = `${doc.name} ${doc.documentType ?? ""}`;
    return patterns.some((pattern) => pattern.test(haystack));
  });

const extractOtherDocuments = (text: string): string[] => {
  const lines = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 8 && line.length < 180);
  const hits = lines.filter((line) =>
    /δικαιολογητικ|υπε[υύ]θυν[ηή]\s+δ[ηή]λωση|πιστοποιητικ[οό]|εγγυητικ/i.test(
      line,
    ),
  );
  return [...new Set(hits)].slice(0, 12);
};

export const extractParticipationChecklist = (
  text: string | null | undefined,
  options?: { officialPdfUrl?: string | null; vaultDocs?: VaultDocHint[] },
): ParticipationChecklist => {
  const officialPdfUrl = options?.officialPdfUrl ?? null;
  const body = text?.trim() ?? "";
  if (body.length < 40) {
    return {
      readable: false,
      unreadMessage: "Δεν διαβάστηκε το PDF",
      officialPdfUrl,
      fields: [],
      documents: [],
    };
  }

  const deadline = extractDeadline(body);
  const guarantee = extractGuarantee(body);
  const criterion = extractCriterion(body);
  const lots = extractLots(body);
  const vaultDocs = options?.vaultDocs ?? [];

  const documents: DocumentLine[] = REQUIRED_DOCS.map((doc) => {
    const required = doc.patterns.some((pattern) => pattern.test(body));
    if (!required) {
      return { key: doc.key, label: doc.label, status: "not_required" };
    }
    return {
      key: doc.key,
      label: doc.label,
      status: vaultHas(vaultDocs, doc.patterns) ? "in_vault" : "missing",
    };
  });

  for (const line of extractOtherDocuments(body)) {
    const key = `other:${line.slice(0, 40)}`;
    if (documents.some((row) => row.label === line)) continue;
    documents.push({
      key,
      label: line,
      status: vaultHas(vaultDocs, [new RegExp(line.slice(0, 24), "i")])
        ? "in_vault"
        : "missing",
    });
  }

  return {
    readable: true,
    unreadMessage: null,
    officialPdfUrl,
    fields: [
      field("deadline", "Προθεσμία", deadline),
      field("guarantee", "Εγγυητική", guarantee),
      field("criterion", "Κριτήριο κατακύρωσης", criterion),
      field("lots", "Τμήματα", lots ? `${lots}` : null),
    ],
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
  if (text.trim().length < 40 && kimdis && source.recordType === "PROC") {
    const buffer = await kimdis.downloadAttachment("PROC", source.referenceNumber);
    const extracted = await extractPdfText(buffer);
    text = extracted.text;
    if (extracted.status === "extracted") {
      await prisma.tender.update({
        where: { id: source.id },
        data: { pdfText: text, pdfTextStatus: extracted.status },
      });
    }
  }

  const vaultDocs = await prisma.vaultDocument.findMany({
    where: { organizationId: input.organizationId },
    select: { name: true, documentType: true },
  });

  return extractParticipationChecklist(text, {
    officialPdfUrl: source.officialPdfUrl,
    vaultDocs,
  });
};
