import type { KimdisClient } from "../../kimdis/client.js";
import { formatDateOnly } from "../../kimdis/client.js";
import type { KimdisSearchItem } from "./kimdis-search.js";

type Loose = Record<string, unknown>;

const asRecord = (value: unknown): Loose | null =>
  value && typeof value === "object" ? (value as Loose) : null;

const asString = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const asNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const keyOf = (value: unknown): string | null => {
  const record = asRecord(value);
  return asString(record?.key);
};

const labelOf = (value: unknown): string | null => {
  const record = asRecord(value);
  return asString(record?.value);
};

const cpvsFrom = (record: Loose): string[] => {
  const bags = [record.objectDetails, record.objectDetailsList];
  const codes = new Set<string>();
  for (const bag of bags) {
    if (!Array.isArray(bag)) continue;
    for (const detail of bag) {
      const row = asRecord(detail);
      const cpvs = row?.cpvs;
      if (!Array.isArray(cpvs)) continue;
      for (const cpv of cpvs) {
        const code = keyOf(asRecord(cpv)?.cpvs ? null : cpv) ?? keyOf(cpv);
        const direct = asRecord(cpv);
        const key = asString(direct?.key);
        if (key) codes.add(key);
        else if (code) codes.add(code);
      }
    }
  }
  return [...codes];
};

const refs = (value: unknown): string[] => {
  if (typeof value === "string" && value.trim()) return [value.trim()];
  if (!Array.isArray(value)) return [];
  return value.map((item) => asString(item) ?? "").filter(Boolean);
};

/** PROC/AWRD Open Data links parent REQs via `approvedRequests[].code`. */
const approvedRequestRefs = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item === "string" && item.trim()) {
      out.push(item.trim());
      continue;
    }
    const row = asRecord(item);
    const code =
      asString(row?.code) ??
      asString(row?.referenceNumber) ??
      asString(row?.value);
    if (code) out.push(code);
  }
  return out;
};

const adaFrom = (record: Loose): string | null => {
  const direct = asString(record.diavgeiaADA);
  if (direct) return direct;
  const related = asRecord(record.contractRelatedADA);
  const decision = asRecord(record.decisionRelatedAda);
  return (
    asString(related?.number3) ||
    asString(related?.ada) ||
    asString(decision?.number3) ||
    asString(decision?.ada) ||
    null
  );
};

const winnerFrom = (record: Loose): string | null => {
  const details = asRecord(record.contractingDataDetails);
  const members = details?.contractingMembersDataList;
  if (!Array.isArray(members)) return null;
  const names = members
    .map((member) => asString(asRecord(member)?.name))
    .filter((name): name is string => Boolean(name));
  return names[0] ?? null;
};

export const mapLooseKimdisAct = (
  record: Loose,
  recordType: KimdisSearchItem["recordType"],
  publicUrl: (adam: string) => string,
): KimdisSearchItem | null => {
  const adam = asString(record.referenceNumber);
  if (!adam) return null;
  const organization = asRecord(record.organization);
  return {
    adam,
    recordType,
    title: asString(record.title) || "(χωρίς τίτλο)",
    contractingAuthority: labelOf(organization) || "Άγνωστος φορέας",
    description: "",
    cpvs: cpvsFrom(record),
    budgetWithoutVat: asNumber(record.totalCostWithoutVAT),
    budgetWithVat: asNumber(record.totalCostWithVAT),
    submissionDate: asString(record.submissionDate),
    signedDate: asString(record.signedDate) || asString(record.contractSignedDate),
    finalSubmissionDate: asString(record.finalSubmissionDate),
    procedureType: labelOf(record.procedureType) || labelOf(record.typeOfProcedure),
    contractTypeLabel: labelOf(record.contractType),
    cancelled: Boolean(record.cancelled),
    publicKimdisUrl: publicUrl(adam),
    officialPdfUrl: "",
    openState: "UNKNOWN",
    nutsCode: keyOf(record.nutsCode),
    contractEndsAt:
      recordType === "CONTRACT" ? asString(record.endDate) : null,
    awardAmount:
      recordType === "AWRD" ? asNumber(record.totalCostWithoutVAT) : null,
    winnerName:
      recordType === "AWRD" || recordType === "CONTRACT"
        ? winnerFrom(record)
        : null,
    diavgeiaAda: adaFrom(record),
    parentAdams: [
      ...refs(record.noticeRefNo),
      ...refs(record.noticeReferenceNumber),
      ...refs(record.auctionRefNo),
      ...refs(record.requestRefNo),
      ...refs(record.approvalRefNo),
      ...approvedRequestRefs(record.approvedRequests),
    ],
  };
};

const dateWindow = (days: number): { dateFrom: string; dateTo: string } => {
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  return { dateFrom: formatDateOnly(from), dateTo: formatDateOnly(to) };
};

export type KimdisFetchCheckpoint = {
  recordType: KimdisSearchItem["recordType"];
  dateFrom: string;
  dateTo: string;
  lastPageFetched: number;
  reachedLast: boolean;
  fetchedCount: number;
};

export type FetchRecentActsResult = {
  items: KimdisSearchItem[];
  checkpoints: KimdisFetchCheckpoint[];
  /** True when any source stopped early because the page budget was exhausted. */
  pageBudgetExhausted: boolean;
};

/**
 * Fetch recent KIMDIS acts with per-source page checkpoints.
 * `pages` is a bounded budget — never present pages:N as full history coverage.
 */
export const fetchRecentActs = async (
  kimdis: KimdisClient,
  input: {
    days: number;
    pages: number;
    recordTypes?: Array<KimdisSearchItem["recordType"]>;
    /** Resume from page index (inclusive) per record type. */
    startPageByType?: Partial<Record<KimdisSearchItem["recordType"], number>>;
  },
): Promise<FetchRecentActsResult> => {
  const body = dateWindow(input.days);
  const allSources: Array<{
    path: string;
    recordType: KimdisSearchItem["recordType"];
  }> = [
    { path: "/khmdhs-opendata/request", recordType: "REQ" },
    { path: "/khmdhs-opendata/notice", recordType: "PROC" },
    { path: "/khmdhs-opendata/auction", recordType: "AWRD" },
    { path: "/khmdhs-opendata/contract", recordType: "CONTRACT" },
  ];
  const sources = allSources.filter(
    (source) =>
      !input.recordTypes?.length || input.recordTypes.includes(source.recordType),
  );
  const items: KimdisSearchItem[] = [];
  const checkpoints: KimdisFetchCheckpoint[] = [];
  let pageBudgetExhausted = false;

  for (const source of sources) {
    const requestBody =
      source.recordType === "REQ"
        ? { ...body, isInitial: true, isApproved: false, isApproval: false }
        : body;
    const startPage = Math.max(0, input.startPageByType?.[source.recordType] ?? 0);
    let lastPageFetched = startPage - 1;
    let reachedLast = false;
    let fetchedCount = 0;

    for (let offset = 0; offset < input.pages; offset += 1) {
      const page = startPage + offset;
      try {
        const result = await kimdis.searchOpenDataPage<Loose>(
          source.path,
          requestBody,
          page,
        );
        lastPageFetched = page;
        for (const row of result.content ?? []) {
          const mapped = mapLooseKimdisAct(row, source.recordType, kimdis.publicUrl);
          if (mapped) {
            items.push(mapped);
            fetchedCount += 1;
          }
        }
        if (result.last || !(result.content?.length)) {
          reachedLast = true;
          break;
        }
        if (offset === input.pages - 1) {
          pageBudgetExhausted = true;
        }
      } catch {
        break;
      }
    }

    checkpoints.push({
      recordType: source.recordType,
      dateFrom: body.dateFrom,
      dateTo: body.dateTo,
      lastPageFetched: Math.max(0, lastPageFetched),
      reachedLast,
      fetchedCount,
    });
  }

  return { items, checkpoints, pageBudgetExhausted };
};

/** Deduplicate by ADAM + recordType (overlap windows / catch-up). */
export const dedupeKimdisItems = (
  items: KimdisSearchItem[],
): KimdisSearchItem[] => {
  const seen = new Set<string>();
  const out: KimdisSearchItem[] = [];
  for (const item of items) {
    const key = `${item.recordType}:${item.adam}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
};
