/**
 * Stable provenance helpers for multi-source tenders (KIMDIS / TED / Διαύγεια).
 * No fabricated rows — only labels derived from stored reference numbers.
 */

export type TenderSourceSystem = "kimdis" | "ted" | "diavgeia";

export type ExternalProvenance = {
  system: TenderSourceSystem;
  externalId: string;
  canonicalUrl: string | null;
  noticeType?: string | null;
  publicationDate?: string | null;
  lastFetchedAt: string;
};

export const tedReferencePrefix = "TED:";
export const diavgeiaReferencePrefix = "DIAVGEIA:";

export const sourceSystemFromReference = (
  referenceNumber: string | null | undefined,
): TenderSourceSystem => {
  const ref = String(referenceNumber ?? "");
  if (ref.startsWith(tedReferencePrefix)) return "ted";
  if (ref.startsWith(diavgeiaReferencePrefix)) return "diavgeia";
  return "kimdis";
};

export const sourceLabelEl = (system: TenderSourceSystem): string => {
  switch (system) {
    case "ted":
      return "TED";
    case "diavgeia":
      return "Διαύγεια";
    default:
      return "ΚΗΜΔΗΣ";
  }
};

export const parseDataSources = (value: unknown): TenderSourceSystem[] => {
  const allowed = new Set<TenderSourceSystem>(["kimdis", "ted", "diavgeia"]);
  if (!Array.isArray(value)) return ["kimdis"];
  const out: TenderSourceSystem[] = [];
  for (const row of value) {
    const key = String(row).trim().toLowerCase() as TenderSourceSystem;
    if (!allowed.has(key) || out.includes(key)) continue;
    out.push(key);
  }
  return out.length ? out : ["kimdis"];
};

export const normalizeDataSources = (
  value: string[] | undefined,
): TenderSourceSystem[] => parseDataSources(value);

export const buildProvenance = (input: {
  system: TenderSourceSystem;
  externalId: string;
  canonicalUrl?: string | null;
  noticeType?: string | null;
  publicationDate?: string | null;
  fetchedAt?: Date;
}): ExternalProvenance => ({
  system: input.system,
  externalId: input.externalId,
  canonicalUrl: input.canonicalUrl ?? null,
  noticeType: input.noticeType ?? null,
  publicationDate: input.publicationDate ?? null,
  lastFetchedAt: (input.fetchedAt ?? new Date()).toISOString(),
});
