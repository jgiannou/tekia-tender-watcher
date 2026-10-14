import type { KimdisClient } from "../../kimdis/client.js";
import { formatDateOnly } from "../../kimdis/client.js";
import { kimdisDateOrNull } from "../kimdis/parse-kimdis-datetime.js";
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

/** KIMDIS «Περιληπτική περιγραφή» from object detail rows. */
export const descriptionsFromKimdisRecord = (record: Loose): string => {
  const bags = [record.objectDetails, record.objectDetailsList];
  const parts: string[] = [];
  for (const bag of bags) {
    if (!Array.isArray(bag)) continue;
    for (const detail of bag) {
      const text = asString(asRecord(detail)?.shortDescription);
      if (text) parts.push(text);
    }
  }
  return [...new Set(parts)].join("\n");
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
    description: descriptionsFromKimdisRecord(record),
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

/** Newest-first Open Data sort used for watermark walks. */
export const KIMDIS_OPEN_DATA_SORT_DESC = "submissionDate,desc";

export type KimdisIngestCursor = {
  recordType: KimdisSearchItem["recordType"];
  /** ISO UTC of the newest submissionDate safely ingested. */
  safeWatermarkIso: string | null;
  lastSeenAdam: string | null;
  lastSuccessfulSourceTimestamp: string | null;
  lastPageFetched: number;
  pageBudgetExhausted: boolean;
  lastCompletedAt: string | null;
  lastError: string | null;
};

export type KimdisFetchCheckpoint = {
  recordType: KimdisSearchItem["recordType"];
  dateFrom: string;
  dateTo: string;
  lastPageFetched: number;
  reachedLast: boolean;
  fetchedCount: number;
  /** True when walk stopped because items were older than the safe watermark. */
  reachedWatermark: boolean;
  sort: string;
  newestSubmissionIso: string | null;
  oldestSubmissionIso: string | null;
};

export type FetchRecentActsResult = {
  items: KimdisSearchItem[];
  checkpoints: KimdisFetchCheckpoint[];
  cursors: KimdisIngestCursor[];
  /** True when any source stopped early because the page budget was exhausted. */
  pageBudgetExhausted: boolean;
  /** True when sort=submissionDate,desc was requested (may still be ignored upstream). */
  sortRequested: boolean;
};

const itemSubmissionMs = (item: KimdisSearchItem): number | null => {
  const date = kimdisDateOrNull(item.submissionDate);
  return date ? date.getTime() : null;
};

/**
 * Stop walking when we hit items older than the prior safe watermark minus overlap.
 * Overlap protects against late inserts / page reshuffling.
 */
export const shouldStopAtWatermark = (
  itemMs: number | null,
  safeWatermarkMs: number | null,
  overlapMs: number,
): boolean => {
  if (itemMs == null || safeWatermarkMs == null) return false;
  return itemMs < safeWatermarkMs - overlapMs;
};

/**
 * Fetch recent KIMDIS acts newest-first with per-type watermark stop.
 * `pages` is a bounded budget — never present pages:N as full history coverage.
 */
export const fetchRecentActs = async (
  kimdis: KimdisClient,
  input: {
    days: number;
    pages: number;
    recordTypes?: Array<KimdisSearchItem["recordType"]>;
    /** Prior cursors / watermarks per record type. */
    cursorsByType?: Partial<Record<KimdisSearchItem["recordType"], KimdisIngestCursor>>;
    /** Overlap behind watermark (default 6h). */
    watermarkOverlapMs?: number;
    /** Disable sort request (tests / fallback). */
    sort?: string | null;
  },
): Promise<FetchRecentActsResult> => {
  const body = dateWindow(input.days);
  const overlapMs = input.watermarkOverlapMs ?? 6 * 60 * 60 * 1000;
  const sort =
    input.sort === null ? undefined : (input.sort ?? KIMDIS_OPEN_DATA_SORT_DESC);
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
  const cursors: KimdisIngestCursor[] = [];
  let pageBudgetExhausted = false;

  for (const source of sources) {
    const requestBody =
      source.recordType === "REQ"
        ? { ...body, isInitial: true, isApproved: false, isApproval: false }
        : body;
    const prior = input.cursorsByType?.[source.recordType];
    const watermarkMs = prior?.safeWatermarkIso
      ? Date.parse(prior.safeWatermarkIso)
      : NaN;
    const safeWatermarkMs = Number.isFinite(watermarkMs) ? watermarkMs : null;

    let lastPageFetched = -1;
    let reachedLast = false;
    let reachedWatermark = false;
    let fetchedCount = 0;
    let newestMs: number | null = null;
    let oldestMs: number | null = null;
    let newestAdam: string | null = null;
    let lastError: string | null = null;
    let typeBudgetExhausted = false;

    for (let page = 0; page < input.pages; page += 1) {
      try {
        const result = await kimdis.searchOpenDataPage<Loose>(
          source.path,
          requestBody,
          page,
          sort,
        );
        lastPageFetched = page;
        const content = result.content ?? [];
        let stopPage = false;
        for (const row of content) {
          const mapped = mapLooseKimdisAct(row, source.recordType, kimdis.publicUrl);
          if (!mapped) continue;
          const ms = itemSubmissionMs(mapped);
          if (shouldStopAtWatermark(ms, safeWatermarkMs, overlapMs)) {
            reachedWatermark = true;
            stopPage = true;
            break;
          }
          items.push(mapped);
          fetchedCount += 1;
          if (ms != null) {
            if (newestMs == null || ms > newestMs) {
              newestMs = ms;
              newestAdam = mapped.adam;
            }
            if (oldestMs == null || ms < oldestMs) oldestMs = ms;
          }
        }
        if (stopPage) break;
        if (result.last || content.length === 0) {
          reachedLast = true;
          break;
        }
        if (page === input.pages - 1) {
          typeBudgetExhausted = true;
          pageBudgetExhausted = true;
        }
      } catch (error) {
        lastError = error instanceof Error ? error.message : "fetch_failed";
        break;
      }
    }

    const newestIso =
      newestMs != null ? new Date(newestMs).toISOString() : null;
    const oldestIso =
      oldestMs != null ? new Date(oldestMs).toISOString() : null;

    // Advance watermark only when we completed the walk or hit watermark/end.
    // If page budget exhausted without reaching watermark, keep prior watermark
    // so the next cycle continues covering the gap (with overlap).
    const canAdvanceWatermark =
      Boolean(newestIso) &&
      (reachedLast || reachedWatermark || !typeBudgetExhausted);
    const nextWatermarkIso = canAdvanceWatermark
      ? newestIso
      : (prior?.safeWatermarkIso ?? newestIso);

    checkpoints.push({
      recordType: source.recordType,
      dateFrom: body.dateFrom,
      dateTo: body.dateTo,
      lastPageFetched: Math.max(0, lastPageFetched),
      reachedLast,
      fetchedCount,
      reachedWatermark,
      sort: sort ?? "none",
      newestSubmissionIso: newestIso,
      oldestSubmissionIso: oldestIso,
    });

    cursors.push({
      recordType: source.recordType,
      safeWatermarkIso: nextWatermarkIso,
      lastSeenAdam: newestAdam ?? prior?.lastSeenAdam ?? null,
      lastSuccessfulSourceTimestamp: newestIso ?? prior?.lastSuccessfulSourceTimestamp ?? null,
      lastPageFetched: Math.max(0, lastPageFetched),
      pageBudgetExhausted: typeBudgetExhausted,
      lastCompletedAt: new Date().toISOString(),
      lastError,
    });
  }

  return {
    items,
    checkpoints,
    cursors,
    pageBudgetExhausted,
    sortRequested: Boolean(sort),
  };
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

export const parseIngestCursors = (
  raw: string | null | undefined,
): Partial<Record<KimdisSearchItem["recordType"], KimdisIngestCursor>> => {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as KimdisIngestCursor[];
    if (!Array.isArray(parsed)) return {};
    const out: Partial<
      Record<KimdisSearchItem["recordType"], KimdisIngestCursor>
    > = {};
    for (const row of parsed) {
      if (
        row?.recordType === "REQ" ||
        row?.recordType === "PROC" ||
        row?.recordType === "AWRD" ||
        row?.recordType === "CONTRACT"
      ) {
        out[row.recordType] = row;
      }
    }
    return out;
  } catch {
    return {};
  }
};
