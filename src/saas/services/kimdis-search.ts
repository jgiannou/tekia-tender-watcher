import type { PrismaClient, Tender } from "@prisma/client";
import type { KimdisClient } from "../../kimdis/client.js";
import { formatDateOnly } from "../../kimdis/client.js";
import type {
  KimdisNoticeRecord,
  KimdisObjectDetail,
  KimdisRequestRecord,
  RecordType,
} from "../../kimdis/types.js";
import { SaasError, badRequest, kimdisUpstreamError } from "../errors.js";
import {
  evaluateRegionGate,
  normalizeRegionCodes,
} from "../geo/nuts.js";
import {
  mergeKimdisSearchItems,
  searchKimdisPublicUi,
} from "./kimdis-public-ui.js";
import {
  tedContractNatureLabel,
  type TedNoticeRef,
} from "../sources/ted-adapter.js";

export const KIMDIS_CONTRACT_TYPES: Record<string, string> = {
  "9": "Υπηρεσίες",
  "10": "Έργα",
  "12": "Μελέτες",
  "13": "Προμήθειες",
  "14": "Τεχνικές/συναφείς",
};

export const KIMDIS_PROCEDURE_TYPES: Record<string, string> = {
  "1": "Ανοιχτή",
  "2": "Κλειστή",
  "4": "Ανταγωνιστικός διάλογος",
  "6": "Απευθείας ανάθεση",
  "7": "Ανταγωνιστική με διαπραγμάτευση",
  "11": "Σύμπραξη καινοτομίας",
  "12": "Διαπραγμάτευση χωρίς προηγούμενη δημοσίευση",
  "13": "Διαπραγμάτευση με προηγούμενη προκήρυξη",
  "18": "Διαδικασία άρθρου 128",
};

export const KIMDIS_REQUEST_KINDS = [
  { id: "any", label: "Όλοι οι τύποι αιτημάτων" },
  { id: "initial", label: "Πρωτογενή" },
  { id: "approved", label: "Εγκεκριμένα" },
  { id: "approval", label: "Εγκρίσεις" },
] as const;

export type KimdisRequestKind = (typeof KIMDIS_REQUEST_KINDS)[number]["id"];

export type KimdisOpenState = "OPEN" | "CLOSED" | "CANCELLED" | "UNKNOWN";

export type KimdisSearchSort = "date_desc" | "date_asc";

/** Full ADAM as used by KIMDIS Open Data (year + family + digits). */
const FULL_ADAM_RE =
  /^(\d{2})(REQ|PROC|AWRD|CONTRACT)(\d{6,12})$/i;
const PARTIAL_ADAM_HINT_RE =
  /^\d{0,2}(REQ|PROC|AWRD|CONTRACT)?\d*$/i;

export type ParsedKimdisAdam =
  | {
      status: "exact";
      adam: string;
      recordType: RecordType | "AWRD" | "CONTRACT";
    }
  | { status: "empty" }
  | { status: "invalid"; normalized: string; reason: string };

/** Trim, collapse spaces, uppercase family segment. */
export const normalizeKimdisAdam = (raw: string): string =>
  raw.trim().replace(/\s+/g, "").toUpperCase();

/**
 * Classify an ADAM field value for exact lookup vs validation.
 * Partial / malformed values must not pretend to be exact search.
 */
export const parseKimdisAdamInput = (raw?: string | null): ParsedKimdisAdam => {
  if (raw == null || !String(raw).trim()) return { status: "empty" };
  const normalized = normalizeKimdisAdam(String(raw));
  const full = FULL_ADAM_RE.exec(normalized);
  if (full) {
    const recordType = full[2]!.toUpperCase() as
      | RecordType
      | "AWRD"
      | "CONTRACT";
    return {
      status: "exact",
      adam: `${full[1]}${recordType}${full[3]}`,
      recordType,
    };
  }
  if (PARTIAL_ADAM_HINT_RE.test(normalized) && /\d/.test(normalized)) {
    return {
      status: "invalid",
      normalized,
      reason: "adam_incomplete",
    };
  }
  return {
    status: "invalid",
    normalized,
    reason: "adam_invalid",
  };
};

export type KimdisSearchFilters = {
  recordFamily: RecordType;
  page?: number;
  pageSize?: number;
  sort?: KimdisSearchSort;
  title?: string;
  referenceNumber?: string;
  cpv?: string;
  organization?: string;
  contractType?: string;
  dateFrom?: string;
  dateTo?: string;
  /** When true and no explicit dates, search from 2010-01-01 instead of last 30 days. */
  searchAllHistory?: boolean;
  totalCostFrom?: number;
  totalCostTo?: number;
  /**
   * REQ kind flags. Omit / undefined = initial only (watch-scan / legacy default).
   * Manual search should send `"any"` explicitly for all kinds.
   */
  requestKind?: KimdisRequestKind;
  procedureType?: string;
  finalSubmissionDateFrom?: string;
  finalSubmissionDateTo?: string;
  cancelDateFrom?: string;
  cancelDateTo?: string;
  signer?: string;
  /** Official NUTS2 codes — filtered server-side (Open Data has no region param). */
  regions?: string[];
  includeUnclassifiedRegion?: boolean;
  /**
   * After Open Data, also query the public ΚΗΜΔΗΣ UI and merge missing ADAMs.
   * Used for manual search and watch-profile scans (page 0 only).
   */
  enrichFromPublicUi?: boolean;
};

export type KimdisSearchItem = {
  adam: string;
  recordType: "REQ" | "PROC" | "AWRD" | "CONTRACT";
  title: string;
  contractingAuthority: string;
  /** Object-detail short descriptions from KIMDIS (SaaS match haystack). */
  description?: string;
  cpvs: string[];
  budgetWithoutVat: number | null;
  budgetWithVat: number | null;
  submissionDate: string | null;
  signedDate: string | null;
  finalSubmissionDate: string | null;
  procedureType: string | null;
  contractTypeLabel: string | null;
  cancelled: boolean;
  publicKimdisUrl: string;
  officialPdfUrl: string;
  openState: KimdisOpenState;
  nutsCode?: string | null;
  contractEndsAt?: string | null;
  awardAmount?: number | null;
  winnerName?: string | null;
  diavgeiaAda?: string | null;
  parentAdams?: string[];
};

const collectDescription = (
  details: Array<{ shortDescription?: string | null }> | null | undefined,
): string =>
  (details ?? [])
    .map((detail) => detail.shortDescription?.trim() ?? "")
    .filter(Boolean)
    .join("\n");

export type KimdisSearchResult = {
  items: KimdisSearchItem[];
  page: number;
  totalElements: number;
  totalPages: number;
  last: boolean;
  /** Exact ADAM lookup — other form filters were not applied upstream. */
  mode?: "standard" | "exact_adam";
  exactAdam?: string;
  exactAdamFound?: boolean;
  /** Present when geographic filtering ran server-side. */
  regionFilter?: {
    applied: boolean;
    /** True when upstream pages were capped before a full filtered total was known. */
    partial: boolean;
    scannedUpstreamPages: number;
    matchedSoFar: number;
    regions: string[];
    includeUnclassified: boolean;
  };
  /** Present when the unofficial public-UI fallback ran. */
  publicUiEnrichment?: {
    attempted: boolean;
    ok: boolean;
    added: number;
    errorSafe?: string;
  };
};

const emptyResult = (page: number): KimdisSearchResult => ({
  items: [],
  page,
  totalElements: 0,
  totalPages: 0,
  last: true,
});

/** KIMDIS answers 404 "No notices found for the given criteria" instead of an empty page. */
const isNoResultsUpstream = (error: unknown): boolean =>
  error instanceof Error && /KIMDIS HTTP 404/.test(error.message);

const normalizeLabelKey = (value: string): string =>
  value.trim().toLowerCase().replace(/\s+/g, " ");

const CONTRACT_TYPE_BY_LABEL = new Map<string, string>(
  Object.entries(KIMDIS_CONTRACT_TYPES).map(([code, label]) => [
    normalizeLabelKey(label),
    code,
  ]),
);

export const resolveContractTypeCode = (input?: string): string | undefined => {
  if (!input?.trim()) return undefined;
  const trimmed = input.trim();
  if (KIMDIS_CONTRACT_TYPES[trimmed]) return trimmed;
  return CONTRACT_TYPE_BY_LABEL.get(normalizeLabelKey(trimmed));
};

export const resolveProcedureTypeCode = (input?: string): string | undefined => {
  if (!input?.trim()) return undefined;
  const trimmed = input.trim();
  if (KIMDIS_PROCEDURE_TYPES[trimmed]) return trimmed;
  const byLabel = Object.entries(KIMDIS_PROCEDURE_TYPES).find(
    ([, label]) => normalizeLabelKey(label) === normalizeLabelKey(trimmed),
  );
  return byLabel?.[0];
};

const defaultDateWindow = (): { dateFrom: string; dateTo: string } => {
  const now = new Date();
  const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { dateFrom: formatDateOnly(from), dateTo: formatDateOnly(now) };
};

const allHistoryDateWindow = (): { dateFrom: string; dateTo: string } => ({
  dateFrom: "2010-01-01",
  dateTo: formatDateOnly(new Date()),
});

const upstreamSortParam = (sort: KimdisSearchSort): string =>
  sort === "date_asc" ? "submissionDate,asc" : "submissionDate,desc";

const requestKindFlags = (
  requestKind?: KimdisRequestKind,
): { isInitial: boolean; isApproved: boolean; isApproval: boolean } => {
  switch (requestKind) {
    case "any":
      return { isInitial: true, isApproved: true, isApproval: true };
    case "approved":
      return { isInitial: false, isApproved: true, isApproval: false };
    case "approval":
      return { isInitial: false, isApproved: false, isApproval: true };
    case "initial":
      return { isInitial: true, isApproved: false, isApproval: false };
    default:
      // Legacy / watch-scan omit → primary requests only.
      return { isInitial: true, isApproved: false, isApproval: false };
  }
};

/** Soft cap: Open Data has no NUTS filter; we page upstream without downloading unbounded history. */
export const REGION_FILTER_MAX_UPSTREAM_PAGES = 8;
export const KIMDIS_UPSTREAM_PAGE_SIZE = 50;

const collectCpvs = (details: KimdisObjectDetail[] | null | undefined): string[] => {
  const cpvs = new Set<string>();
  for (const detail of details ?? []) {
    for (const cpv of detail.cpvs ?? []) {
      if (cpv.key) cpvs.add(String(cpv.key));
    }
  }
  return [...cpvs];
};

const contractTypeLabelFromRecord = (
  record: KimdisRequestRecord,
): string | null => {
  const raw = record.contractTypes?.[0]?.contractType;
  if (raw?.value?.trim()) return raw.value.trim();
  const code = raw?.key != null ? String(raw.key) : null;
  if (code && KIMDIS_CONTRACT_TYPES[code]) return KIMDIS_CONTRACT_TYPES[code];
  return code;
};

const procedureTypeFromRecord = (record: KimdisNoticeRecord): string | null => {
  const raw = record.procedureTypes?.[0]?.procedureType;
  if (raw?.value?.trim()) return raw.value.trim();
  const code = raw?.key != null ? String(raw.key) : null;
  if (code && KIMDIS_PROCEDURE_TYPES[code]) return KIMDIS_PROCEDURE_TYPES[code];
  return code;
};

const computeOpenState = (
  recordType: RecordType,
  cancelled: boolean,
  finalSubmissionDate: string | null,
): KimdisOpenState => {
  if (cancelled) return "CANCELLED";
  if (recordType !== "PROC") return "UNKNOWN";
  if (!finalSubmissionDate) return "UNKNOWN";
  const deadline = new Date(finalSubmissionDate);
  if (Number.isNaN(deadline.getTime())) return "UNKNOWN";
  return deadline.getTime() < Date.now() ? "CLOSED" : "OPEN";
};

const normalizeItem = (
  kimdis: KimdisClient,
  record: KimdisRequestRecord | KimdisNoticeRecord,
  recordType: RecordType,
): KimdisSearchItem => {
  const notice =
    recordType === "PROC" ? (record as KimdisNoticeRecord) : null;
  const cancelled = Boolean(record.cancelled);
  const finalSubmissionDate = notice?.finalSubmissionDate ?? null;

  return {
    adam: record.referenceNumber,
    recordType,
    title: record.title?.trim() || "(no title)",
    contractingAuthority:
      record.organization?.value?.trim() || "Unknown organization",
    description: collectDescription(record.objectDetails),
    cpvs: collectCpvs(record.objectDetails),
    budgetWithoutVat:
      typeof record.totalCostWithoutVAT === "number"
        ? record.totalCostWithoutVAT
        : null,
    budgetWithVat:
      typeof record.totalCostWithVAT === "number"
        ? record.totalCostWithVAT
        : null,
    submissionDate: record.submissionDate ?? null,
    signedDate: record.signedDate ?? null,
    finalSubmissionDate,
    procedureType: notice ? procedureTypeFromRecord(notice) : null,
    contractTypeLabel: contractTypeLabelFromRecord(record),
    cancelled,
    publicKimdisUrl: kimdis.publicUrl(record.referenceNumber),
    officialPdfUrl: kimdis.pdfUrl(recordType, record.referenceNumber),
    openState: computeOpenState(recordType, cancelled, finalSubmissionDate),
    nutsCode: record.nutsCode?.key?.trim() || null,
    parentAdams: [
      ...(record.noticeRefNo ?? []),
      ...(record.auctionRefNo ?? []),
      ...(record.contractRefNo ?? []),
    ].filter((value): value is string => Boolean(value)),
  };
};

export const buildKimdisSearchMeta = () => ({
  contractTypes: KIMDIS_CONTRACT_TYPES,
  procedureTypes: KIMDIS_PROCEDURE_TYPES,
  requestKinds: KIMDIS_REQUEST_KINDS,
});

const itemDateMs = (item: KimdisSearchItem): number => {
  const raw = item.submissionDate || item.signedDate;
  if (!raw) return 0;
  const ms = new Date(raw).getTime();
  return Number.isNaN(ms) ? 0 : ms;
};

/**
 * Local sort is only honest when the response contains the entire filtered set
 * (single page). Multi-page local sort would masquerade as global ordering.
 */
const sortItemsIfCompletePage = (
  items: KimdisSearchItem[],
  sort: KimdisSearchSort,
  page: number,
  last: boolean,
  totalElements: number,
): KimdisSearchItem[] => {
  const complete =
    page === 0 && (last || (totalElements > 0 && items.length >= totalElements));
  if (!complete) return items;
  const sorted = [...items].sort((a, b) => itemDateMs(b) - itemDateMs(a));
  return sort === "date_asc" ? sorted.reverse() : sorted;
};

/** Adapt a canonical Tender row to the search/detail item shape. */
const tedNoticeFromTenderRaw = (tender: Tender): TedNoticeRef | null => {
  if (!tender.referenceNumber.startsWith("TED:")) return null;
  const raw = tender.rawJson;
  if (!raw || typeof raw !== "object") return null;
  const notice = (raw as { notice?: unknown }).notice;
  if (!notice || typeof notice !== "object") return null;
  return notice as TedNoticeRef;
};

export const kimdisItemFromTender = (tender: Tender): KimdisSearchItem => {
  const ted = tedNoticeFromTenderRaw(tender);
  return {
    adam: tender.referenceNumber,
    recordType:
      tender.recordType === "PROC" ||
      tender.recordType === "AWRD" ||
      tender.recordType === "CONTRACT"
        ? tender.recordType
        : "REQ",
    title: tender.title ?? "",
    contractingAuthority: tender.contractingAuthority ?? "",
    description: ted?.noticeType ?? "",
    cpvs: Array.isArray(tender.cpvs)
      ? tender.cpvs.map((cpv) => String(cpv))
      : [],
    budgetWithoutVat: tender.budgetWithoutVat,
    budgetWithVat: tender.budgetWithVat,
    submissionDate: tender.submissionDate?.toISOString() ?? null,
    signedDate: tender.signedDate?.toISOString() ?? null,
    finalSubmissionDate: tender.finalSubmissionDate?.toISOString() ?? null,
    procedureType: ted?.noticeType ?? null,
    contractTypeLabel: tedContractNatureLabel(ted?.contractNature) ?? null,
    cancelled: false,
    publicKimdisUrl: tender.publicKimdisUrl ?? "",
    officialPdfUrl: tender.officialPdfUrl ?? "",
    nutsCode: tender.nutsCode,
    contractEndsAt: tender.contractEndsAt?.toISOString() ?? null,
    awardAmount: tender.awardAmount,
    winnerName: tender.winnerName,
    diavgeiaAda: tender.diavgeiaAda,
    openState: computeOpenState(
      tender.recordType === "PROC" ? "PROC" : "REQ",
      false,
      tender.finalSubmissionDate?.toISOString() ?? null,
    ),
  };
};

const pickExactAdam = (
  items: KimdisSearchItem[],
  adam: string,
): KimdisSearchItem | null =>
  items.find((item) => item.adam === adam) ?? null;

const resolveSearchDates = (
  filters: Pick<
    KimdisSearchFilters,
    "dateFrom" | "dateTo" | "searchAllHistory"
  >,
): { dateFrom: string; dateTo: string } => {
  if (filters.dateFrom && filters.dateTo) {
    return { dateFrom: filters.dateFrom, dateTo: filters.dateTo };
  }
  if (filters.dateFrom) {
    return { dateFrom: filters.dateFrom, dateTo: formatDateOnly(new Date()) };
  }
  if (filters.dateTo) {
    const defaults = defaultDateWindow();
    return { dateFrom: defaults.dateFrom, dateTo: filters.dateTo };
  }
  if (filters.searchAllHistory) {
    return allHistoryDateWindow();
  }
  return defaultDateWindow();
};

type UpstreamSearchBody = {
  dates: { dateFrom: string; dateTo: string };
  contractTypeCode?: string;
  procedureTypeCode?: string;
  title?: string;
  referenceNumber?: string;
  cpvItems?: string[];
  organizations?: string[];
  signer?: string;
  totalCostFrom?: number;
  totalCostTo?: number;
  cancelDateFrom?: string;
  cancelDateTo?: string;
  finalSubmissionDateFrom?: string;
  finalSubmissionDateTo?: string;
  requestKind?: KimdisRequestKind;
};

const fetchUpstreamPage = async (
  kimdis: KimdisClient,
  recordFamily: RecordType,
  body: UpstreamSearchBody,
  page: number,
  sortParam: string,
): Promise<{
  items: KimdisSearchItem[];
  totalElements: number;
  totalPages: number;
  last: boolean;
  number: number;
}> => {
  if (recordFamily === "REQ") {
    const kindFlags = requestKindFlags(body.requestKind);
    const result = await kimdis.searchRequestsPage(
      {
        ...body.dates,
        ...(body.contractTypeCode ? { contractType: body.contractTypeCode } : {}),
        ...kindFlags,
        ...(body.title ? { title: body.title } : {}),
        ...(body.referenceNumber ? { referenceNumber: body.referenceNumber } : {}),
        ...(body.cpvItems ? { cpvItems: body.cpvItems } : {}),
        ...(body.organizations ? { organizations: body.organizations } : {}),
        ...(body.signer ? { signer: body.signer } : {}),
        ...(body.totalCostFrom != null ? { totalCostFrom: body.totalCostFrom } : {}),
        ...(body.totalCostTo != null ? { totalCostTo: body.totalCostTo } : {}),
        ...(body.cancelDateFrom ? { cancelDateFrom: body.cancelDateFrom } : {}),
        ...(body.cancelDateTo ? { cancelDateTo: body.cancelDateTo } : {}),
      },
      page,
      sortParam,
    );
    return {
      items: (result.content ?? []).map((record) =>
        normalizeItem(kimdis, record, "REQ"),
      ),
      totalElements: result.totalElements ?? 0,
      totalPages: result.totalPages ?? 0,
      last: Boolean(result.last),
      number: result.number ?? page,
    };
  }

  const result = await kimdis.searchNoticesPage(
    {
      ...body.dates,
      ...(body.contractTypeCode ? { contractType: body.contractTypeCode } : {}),
      ...(body.title ? { title: body.title } : {}),
      ...(body.referenceNumber ? { referenceNumber: body.referenceNumber } : {}),
      ...(body.cpvItems ? { cpvItems: body.cpvItems } : {}),
      ...(body.organizations ? { organizations: body.organizations } : {}),
      ...(body.signer ? { signer: body.signer } : {}),
      ...(body.procedureTypeCode ? { procedureType: body.procedureTypeCode } : {}),
      ...(body.totalCostFrom != null ? { totalCostFrom: body.totalCostFrom } : {}),
      ...(body.totalCostTo != null ? { totalCostTo: body.totalCostTo } : {}),
      ...(body.cancelDateFrom ? { cancelDateFrom: body.cancelDateFrom } : {}),
      ...(body.cancelDateTo ? { cancelDateTo: body.cancelDateTo } : {}),
      ...(body.finalSubmissionDateFrom
        ? { finalSubmissionDateFrom: body.finalSubmissionDateFrom }
        : {}),
      ...(body.finalSubmissionDateTo
        ? { finalSubmissionDateTo: body.finalSubmissionDateTo }
        : {}),
    },
    page,
    sortParam,
  );
  return {
    items: (result.content ?? []).map((record) =>
      normalizeItem(kimdis, record, "PROC"),
    ),
    totalElements: result.totalElements ?? 0,
    totalPages: result.totalPages ?? 0,
    last: Boolean(result.last),
    number: result.number ?? page,
  };
};

const itemMatchesRegions = (
  item: KimdisSearchItem,
  regions: string[],
  includeUnclassified: boolean,
): boolean =>
  evaluateRegionGate(item.nutsCode, regions, includeUnclassified) === "ok";

/**
 * Open Data has no NUTS parameter. Walk a bounded number of upstream pages,
 * collect matches, and slice the requested result page. Never claim a full
 * filtered total when the walk was capped.
 */
const searchWithRegionFilter = async (
  kimdis: KimdisClient,
  input: {
    recordFamily: RecordType;
    body: UpstreamSearchBody;
    sort: KimdisSearchSort;
    page: number;
    pageSize: number;
    regions: string[];
    includeUnclassified: boolean;
  },
): Promise<KimdisSearchResult> => {
  const sortParam = upstreamSortParam(input.sort);
  const matched: KimdisSearchItem[] = [];
  let upstreamPage = 0;
  let upstreamLast = false;
  let scanned = 0;
  const needThrough = (input.page + 1) * input.pageSize;
  // Grow the upstream budget with the requested page so "next" can continue
  // beyond the first window without downloading unbounded history.
  const maxUpstreamPages = Math.min(
    40,
    REGION_FILTER_MAX_UPSTREAM_PAGES * (input.page + 1),
  );

  while (scanned < maxUpstreamPages && matched.length < needThrough) {
    let batch: Awaited<ReturnType<typeof fetchUpstreamPage>>;
    try {
      batch = await fetchUpstreamPage(
        kimdis,
        input.recordFamily,
        input.body,
        upstreamPage,
        sortParam,
      );
    } catch (error) {
      if (isNoResultsUpstream(error)) {
        upstreamLast = true;
        break;
      }
      throw error;
    }
    scanned += 1;
    for (const item of batch.items) {
      if (itemMatchesRegions(item, input.regions, input.includeUnclassified)) {
        matched.push(item);
      }
    }
    upstreamLast = batch.last || batch.items.length === 0;
    if (upstreamLast) break;
    if (batch.totalPages > 0 && upstreamPage + 1 >= batch.totalPages) {
      upstreamLast = true;
      break;
    }
    upstreamPage += 1;
  }

  const partial = !upstreamLast;
  const start = input.page * input.pageSize;
  const pageItems = matched.slice(start, start + input.pageSize);
  const matchedSoFar = matched.length;
  // Honest totals: full count only when the walk finished; otherwise lower bound.
  const totalElements = partial ? matchedSoFar : matchedSoFar;
  const totalPages = partial
    ? Math.max(input.page + 1, Math.ceil(matchedSoFar / input.pageSize) || 1)
    : Math.max(1, Math.ceil(matchedSoFar / input.pageSize) || 0);
  const last = !partial && start + pageItems.length >= matchedSoFar;

  return {
    items: pageItems,
    page: input.page,
    totalElements,
    totalPages: matchedSoFar === 0 && !partial ? 0 : totalPages,
    last,
    mode: "standard",
    regionFilter: {
      applied: true,
      partial,
      scannedUpstreamPages: scanned,
      matchedSoFar,
      regions: input.regions,
      includeUnclassified: input.includeUnclassified,
    },
  };
};

const itemDateMsSafe = (item: KimdisSearchItem): number => {
  const raw = item.submissionDate || item.signedDate;
  if (!raw) return 0;
  const ms = new Date(raw).getTime();
  return Number.isNaN(ms) ? 0 : ms;
};

const sortMergedItems = (
  items: KimdisSearchItem[],
  sort: KimdisSearchSort,
): KimdisSearchItem[] => {
  const sorted = [...items].sort(
    (a, b) => itemDateMsSafe(b) - itemDateMsSafe(a),
  );
  return sort === "date_asc" ? sorted.reverse() : sorted;
};

/**
 * Exact ADAM lookup against Open Data — no silent date / kind / title filters.
 * Optional public-UI fallback when Open Data misses the act.
 */
const searchExactAdam = async (
  kimdis: KimdisClient,
  input: {
    adam: string;
    adamRecordType: RecordType | "AWRD" | "CONTRACT";
    selectedFamily: RecordType;
    enrichFromPublicUi?: boolean;
  },
): Promise<KimdisSearchResult> => {
  if (
    input.adamRecordType !== "REQ" &&
    input.adamRecordType !== "PROC"
  ) {
    throw badRequest(
      `adam_family_unsupported:${input.adamRecordType}`,
    );
  }
  if (input.adamRecordType !== input.selectedFamily) {
    throw badRequest(
      `adam_family_mismatch:expected_${input.adamRecordType}_got_${input.selectedFamily}`,
    );
  }

  const body: UpstreamSearchBody = {
    dates: allHistoryDateWindow(),
    referenceNumber: input.adam,
    requestKind: input.selectedFamily === "REQ" ? "any" : undefined,
  };

  const notFound = (
    enrichment?: KimdisSearchResult["publicUiEnrichment"],
  ): KimdisSearchResult => ({
    items: [],
    page: 0,
    totalElements: 0,
    totalPages: 0,
    last: true,
    mode: "exact_adam",
    exactAdam: input.adam,
    exactAdamFound: false,
    publicUiEnrichment: enrichment,
  });

  try {
    const recentDates = defaultDateWindow();
    const recent = await fetchUpstreamPage(
      kimdis,
      input.selectedFamily,
      { ...body, dates: recentDates },
      0,
      upstreamSortParam("date_desc"),
    );
    let hit = pickExactAdam(recent.items, input.adam);
    if (!hit) {
      const historical = await fetchUpstreamPage(
        kimdis,
        input.selectedFamily,
        body,
        0,
        upstreamSortParam("date_desc"),
      );
      hit = pickExactAdam(historical.items, input.adam);
    }

    if (hit) {
      return {
        items: [hit],
        page: 0,
        totalElements: 1,
        totalPages: 1,
        last: true,
        mode: "exact_adam",
        exactAdam: input.adam,
        exactAdamFound: true,
        publicUiEnrichment: input.enrichFromPublicUi
          ? { attempted: false, ok: true, added: 0 }
          : undefined,
      };
    }

    if (!input.enrichFromPublicUi || input.selectedFamily !== "REQ") {
      return notFound(
        input.enrichFromPublicUi
          ? { attempted: false, ok: true, added: 0 }
          : undefined,
      );
    }

    const ui = await searchKimdisPublicUi({
      recordFamily: "REQ",
      referenceNumber: input.adam,
      requestKind: "any",
    });
    if (!ui.ok) {
      return notFound({
        attempted: true,
        ok: false,
        added: 0,
        errorSafe: ui.errorSafe,
      });
    }
    const uiHit = pickExactAdam(ui.items, input.adam);
    if (!uiHit) {
      return notFound({ attempted: true, ok: true, added: 0 });
    }
    return {
      items: [uiHit],
      page: 0,
      totalElements: 1,
      totalPages: 1,
      last: true,
      mode: "exact_adam",
      exactAdam: input.adam,
      exactAdamFound: true,
      publicUiEnrichment: { attempted: true, ok: true, added: 1 },
    };
  } catch (error) {
    if (error instanceof SaasError) throw error;
    if (isNoResultsUpstream(error)) {
      if (!input.enrichFromPublicUi || input.selectedFamily !== "REQ") {
        return notFound();
      }
      const ui = await searchKimdisPublicUi({
        recordFamily: "REQ",
        referenceNumber: input.adam,
        requestKind: "any",
      });
      const uiHit = ui.ok ? pickExactAdam(ui.items, input.adam) : null;
      if (uiHit) {
        return {
          items: [uiHit],
          page: 0,
          totalElements: 1,
          totalPages: 1,
          last: true,
          mode: "exact_adam",
          exactAdam: input.adam,
          exactAdamFound: true,
          publicUiEnrichment: { attempted: true, ok: true, added: 1 },
        };
      }
      return notFound({
        attempted: true,
        ok: ui.ok,
        added: 0,
        errorSafe: ui.errorSafe,
      });
    }
    const message =
      error instanceof Error ? error.message : "KIMDIS search failed";
    throw kimdisUpstreamError(message);
  }
};

const enrichStandardResult = async (
  openData: KimdisSearchResult,
  filters: KimdisSearchFilters,
  dates: { dateFrom: string; dateTo: string },
  sort: KimdisSearchSort,
): Promise<KimdisSearchResult> => {
  if (!filters.enrichFromPublicUi || filters.recordFamily !== "REQ") {
    return openData;
  }

  // One UI round-trip per query, on page 0 only — later Open Data pages stay as-is.
  const page = filters.page ?? 0;
  if (page > 0) {
    return openData;
  }

  const ui = await searchKimdisPublicUi({
    recordFamily: "REQ",
    title: filters.title,
    referenceNumber: filters.referenceNumber,
    dateFrom: dates.dateFrom,
    dateTo: dates.dateTo,
    requestKind: filters.requestKind ?? "any",
    organization: filters.organization,
  });

  if (!ui.ok) {
    return {
      ...openData,
      publicUiEnrichment: {
        attempted: true,
        ok: false,
        added: 0,
        errorSafe: ui.errorSafe,
      },
    };
  }

  let uiItems = ui.items;
  const regions = normalizeRegionCodes(filters.regions);
  if (regions.length > 0) {
    uiItems = uiItems.filter(
      (item) =>
        evaluateRegionGate(
          item.nutsCode,
          regions,
          Boolean(filters.includeUnclassifiedRegion),
        ) === "ok",
    );
  }

  // Append UI-only ADAMs; do not re-slice away Open Data rows from this page.
  const { items: merged, addedFromPublicUi } = mergeKimdisSearchItems(
    openData.items,
    uiItems,
  );
  const sorted = sortMergedItems(merged, sort);
  const pageSize = Math.min(
    Math.max(filters.pageSize ?? KIMDIS_UPSTREAM_PAGE_SIZE, 1),
    KIMDIS_UPSTREAM_PAGE_SIZE,
  );
  const totalElements = Math.max(openData.totalElements, sorted.length);
  const totalPages = Math.max(1, Math.ceil(totalElements / pageSize));

  return {
    ...openData,
    items: sorted,
    totalElements,
    totalPages,
    last: openData.last,
    publicUiEnrichment: {
      attempted: true,
      ok: true,
      added: addedFromPublicUi,
    },
  };
};

/**
 * Load a single KIMDIS record by ADAM for tender detail pages.
 * Prefers the local DB (instant) so followed/known acts open without waiting
 * on upstream. Live lookup uses referenceNumber and only widens the date
 * window when the recent window misses.
 */
export const getKimdisRecordByAdam = async (
  kimdis: KimdisClient,
  input: { recordType: RecordType; adam: string },
  options?: { prisma?: PrismaClient },
): Promise<KimdisSearchItem | null> => {
  const parsed = parseKimdisAdamInput(input.adam);
  if (parsed.status === "empty") throw badRequest("adam_required");
  if (parsed.status === "invalid") {
    throw badRequest(parsed.reason);
  }
  const adam = parsed.adam;

  if (options?.prisma) {
    const local = await options.prisma.tender.findUnique({
      where: { referenceNumber: adam },
    });
    if (local) {
      // TED / Διαύγεια and other local-only rows: serve from DB without upstream.
      if (
        local.referenceNumber.startsWith("TED:") ||
        local.referenceNumber.startsWith("DIAVGEIA:")
      ) {
        return kimdisItemFromTender(local);
      }
      const localType =
        local.recordType === "PROC" ? "PROC" : local.recordType === "REQ" ? "REQ" : null;
      if (!localType || localType === input.recordType) {
        return kimdisItemFromTender(local);
      }
    }
  }

  const result = await searchExactAdam(kimdis, {
    adam,
    adamRecordType: parsed.recordType,
    selectedFamily: input.recordType,
    enrichFromPublicUi: true,
  });
  return result.items[0] ?? null;
};

export const searchKimdis = async (
  kimdis: KimdisClient,
  filters: KimdisSearchFilters,
): Promise<KimdisSearchResult> => {
  const page = filters.page ?? 0;
  const sort: KimdisSearchSort = filters.sort ?? "date_desc";
  const pageSize = Math.min(
    Math.max(filters.pageSize ?? KIMDIS_UPSTREAM_PAGE_SIZE, 1),
    KIMDIS_UPSTREAM_PAGE_SIZE,
  );

  const adamParsed = parseKimdisAdamInput(filters.referenceNumber);
  if (adamParsed.status === "invalid") {
    throw badRequest(adamParsed.reason);
  }
  if (adamParsed.status === "exact") {
    // Exact ADAM: ignore title/dates/kind/regions — identity lookup only.
    return searchExactAdam(kimdis, {
      adam: adamParsed.adam,
      adamRecordType: adamParsed.recordType,
      selectedFamily: filters.recordFamily,
      enrichFromPublicUi: filters.enrichFromPublicUi,
    });
  }

  const contractTypeCode = resolveContractTypeCode(filters.contractType);
  if (filters.contractType?.trim() && !contractTypeCode) {
    throw badRequest(`Unknown contract type: ${filters.contractType}`);
  }

  const procedureTypeCode = resolveProcedureTypeCode(filters.procedureType);
  if (filters.procedureType?.trim() && !procedureTypeCode) {
    throw badRequest(`Unknown procedure type: ${filters.procedureType}`);
  }

  const regions = normalizeRegionCodes(filters.regions);
  const includeUnclassified = Boolean(filters.includeUnclassifiedRegion);
  const dates = resolveSearchDates(filters);
  const body: UpstreamSearchBody = {
    dates,
    contractTypeCode,
    procedureTypeCode,
    title: filters.title?.trim() || undefined,
    cpvItems: filters.cpv?.trim() ? [filters.cpv.trim()] : undefined,
    organizations: filters.organization?.trim()
      ? [filters.organization.trim()]
      : undefined,
    signer: filters.signer?.trim() || undefined,
    totalCostFrom: filters.totalCostFrom,
    totalCostTo: filters.totalCostTo,
    cancelDateFrom: filters.cancelDateFrom,
    cancelDateTo: filters.cancelDateTo,
    finalSubmissionDateFrom: filters.finalSubmissionDateFrom,
    finalSubmissionDateTo: filters.finalSubmissionDateTo,
    requestKind: filters.requestKind,
  };
  const sortParam = upstreamSortParam(sort);

  try {
    let openData: KimdisSearchResult;
    if (regions.length > 0) {
      openData = await searchWithRegionFilter(kimdis, {
        recordFamily: filters.recordFamily,
        body,
        sort,
        page,
        pageSize,
        regions,
        includeUnclassified,
      });
    } else {
      const result = await fetchUpstreamPage(
        kimdis,
        filters.recordFamily,
        body,
        page,
        sortParam,
      );
      const items = sortItemsIfCompletePage(
        result.items,
        sort,
        page,
        result.last,
        result.totalElements,
      );
      openData = {
        items,
        page: result.number,
        totalElements: result.totalElements,
        totalPages: result.totalPages,
        last: result.last,
        mode: "standard",
      };
    }
    return enrichStandardResult(openData, filters, dates, sort);
  } catch (error) {
    if (error instanceof SaasError) throw error;
    if (isNoResultsUpstream(error)) {
      return enrichStandardResult(
        { ...emptyResult(page), mode: "standard" },
        filters,
        dates,
        sort,
      );
    }
    const message =
      error instanceof Error ? error.message : "KIMDIS search failed";
    throw kimdisUpstreamError(message);
  }
};
