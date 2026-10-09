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
  { id: "initial", label: "Πρωτογενή" },
  { id: "approved", label: "Εγκεκριμένα" },
  { id: "approval", label: "Εγκρίσεις" },
] as const;

export type KimdisRequestKind = (typeof KIMDIS_REQUEST_KINDS)[number]["id"];

export type KimdisOpenState = "OPEN" | "CLOSED" | "CANCELLED" | "UNKNOWN";

export type KimdisSearchSort = "date_desc" | "date_asc";

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
  /** Omit / undefined = initial only (manual search default). `"any"` = all REQ kinds. */
  requestKind?: KimdisRequestKind | "any";
  procedureType?: string;
  finalSubmissionDateFrom?: string;
  finalSubmissionDateTo?: string;
  cancelDateFrom?: string;
  cancelDateTo?: string;
  signer?: string;
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
  requestKind?: KimdisRequestKind | "any",
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
      return { isInitial: true, isApproved: false, isApproval: false };
  }
};

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
export const kimdisItemFromTender = (tender: Tender): KimdisSearchItem => ({
  adam: tender.referenceNumber,
  recordType:
    tender.recordType === "PROC" ||
    tender.recordType === "AWRD" ||
    tender.recordType === "CONTRACT"
      ? tender.recordType
      : "REQ",
  title: tender.title ?? "",
  contractingAuthority: tender.contractingAuthority ?? "",
  description: "",
  cpvs: Array.isArray(tender.cpvs)
    ? tender.cpvs.map((cpv) => String(cpv))
    : [],
  budgetWithoutVat: tender.budgetWithoutVat,
  budgetWithVat: tender.budgetWithVat,
  submissionDate: tender.submissionDate?.toISOString() ?? null,
  signedDate: tender.signedDate?.toISOString() ?? null,
  finalSubmissionDate: tender.finalSubmissionDate?.toISOString() ?? null,
  procedureType: null,
  contractTypeLabel: null,
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
});

const pickExactAdam = (
  items: KimdisSearchItem[],
  adam: string,
): KimdisSearchItem | null =>
  items.find((item) => item.adam === adam) ?? null;

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
  const adam = input.adam.trim();
  if (!adam) throw badRequest("adam_required");

  if (options?.prisma) {
    const local = await options.prisma.tender.findUnique({
      where: { referenceNumber: adam },
    });
    if (local) {
      const localType =
        local.recordType === "PROC" ? "PROC" : local.recordType === "REQ" ? "REQ" : null;
      if (!localType || localType === input.recordType) {
        return kimdisItemFromTender(local);
      }
    }
  }

  const requestKind =
    input.recordType === "REQ" ? ("any" as const) : undefined;

  // Recent window first — exact ADAM lookups are normally fast here.
  const recent = await searchKimdis(kimdis, {
    recordFamily: input.recordType,
    referenceNumber: adam,
    page: 0,
    sort: "date_desc",
    requestKind,
  });
  const recentHit = pickExactAdam(recent.items, adam);
  if (recentHit) return recentHit;

  // Older acts: widen once. referenceNumber keeps the payload small.
  const historical = await searchKimdis(kimdis, {
    recordFamily: input.recordType,
    referenceNumber: adam,
    page: 0,
    sort: "date_desc",
    searchAllHistory: true,
    requestKind,
  });
  return pickExactAdam(historical.items, adam);
};

export const searchKimdis = async (
  kimdis: KimdisClient,
  filters: KimdisSearchFilters,
): Promise<KimdisSearchResult> => {
  const page = filters.page ?? 0;
  const sort: KimdisSearchSort = filters.sort ?? "date_desc";
  const contractTypeCode = resolveContractTypeCode(filters.contractType);
  if (filters.contractType?.trim() && !contractTypeCode) {
    throw badRequest(`Unknown contract type: ${filters.contractType}`);
  }

  const procedureTypeCode = resolveProcedureTypeCode(filters.procedureType);
  if (filters.procedureType?.trim() && !procedureTypeCode) {
    throw badRequest(`Unknown procedure type: ${filters.procedureType}`);
  }

  let dates: { dateFrom: string; dateTo: string };
  if (filters.dateFrom && filters.dateTo) {
    dates = { dateFrom: filters.dateFrom, dateTo: filters.dateTo };
  } else if (filters.dateFrom) {
    dates = { dateFrom: filters.dateFrom, dateTo: formatDateOnly(new Date()) };
  } else if (filters.dateTo) {
    const defaults = defaultDateWindow();
    dates = { dateFrom: defaults.dateFrom, dateTo: filters.dateTo };
  } else if (filters.searchAllHistory) {
    dates = allHistoryDateWindow();
  } else {
    dates = defaultDateWindow();
  }

  const cpvItems = filters.cpv?.trim() ? [filters.cpv.trim()] : undefined;
  const organizations = filters.organization?.trim()
    ? [filters.organization.trim()]
    : undefined;
  const sortParam = upstreamSortParam(sort);

  try {
    if (filters.recordFamily === "REQ") {
      const kindFlags = requestKindFlags(filters.requestKind);
      const body = {
        ...dates,
        ...(contractTypeCode ? { contractType: contractTypeCode } : {}),
        ...kindFlags,
        ...(filters.title?.trim() ? { title: filters.title.trim() } : {}),
        ...(filters.referenceNumber?.trim()
          ? { referenceNumber: filters.referenceNumber.trim() }
          : {}),
        ...(cpvItems ? { cpvItems } : {}),
        ...(organizations ? { organizations } : {}),
        ...(filters.signer?.trim() ? { signer: filters.signer.trim() } : {}),
        ...(filters.totalCostFrom != null
          ? { totalCostFrom: filters.totalCostFrom }
          : {}),
        ...(filters.totalCostTo != null
          ? { totalCostTo: filters.totalCostTo }
          : {}),
        ...(filters.cancelDateFrom
          ? { cancelDateFrom: filters.cancelDateFrom }
          : {}),
        ...(filters.cancelDateTo ? { cancelDateTo: filters.cancelDateTo } : {}),
      };

      const result = await kimdis.searchRequestsPage(body, page, sortParam);
      const totalElements = result.totalElements ?? 0;
      const last = Boolean(result.last);
      const items = sortItemsIfCompletePage(
        (result.content ?? []).map((record) => normalizeItem(kimdis, record, "REQ")),
        sort,
        page,
        last,
        totalElements,
      );
      return {
        items,
        page: result.number ?? page,
        totalElements,
        totalPages: result.totalPages ?? 0,
        last,
      };
    }

    const body = {
      ...dates,
      ...(contractTypeCode ? { contractType: contractTypeCode } : {}),
      ...(filters.title?.trim() ? { title: filters.title.trim() } : {}),
      ...(filters.referenceNumber?.trim()
        ? { referenceNumber: filters.referenceNumber.trim() }
        : {}),
      ...(cpvItems ? { cpvItems } : {}),
      ...(organizations ? { organizations } : {}),
      ...(filters.signer?.trim() ? { signer: filters.signer.trim() } : {}),
      ...(procedureTypeCode ? { procedureType: procedureTypeCode } : {}),
      ...(filters.totalCostFrom != null
        ? { totalCostFrom: filters.totalCostFrom }
        : {}),
      ...(filters.totalCostTo != null
        ? { totalCostTo: filters.totalCostTo }
        : {}),
      ...(filters.cancelDateFrom
        ? { cancelDateFrom: filters.cancelDateFrom }
        : {}),
      ...(filters.cancelDateTo ? { cancelDateTo: filters.cancelDateTo } : {}),
      ...(filters.finalSubmissionDateFrom
        ? { finalSubmissionDateFrom: filters.finalSubmissionDateFrom }
        : {}),
      ...(filters.finalSubmissionDateTo
        ? { finalSubmissionDateTo: filters.finalSubmissionDateTo }
        : {}),
    };

    const result = await kimdis.searchNoticesPage(body, page, sortParam);
    const totalElements = result.totalElements ?? 0;
    const last = Boolean(result.last);
    const items = sortItemsIfCompletePage(
      (result.content ?? []).map((record) => normalizeItem(kimdis, record, "PROC")),
      sort,
      page,
      last,
      totalElements,
    );
    return {
      items,
      page: result.number ?? page,
      totalElements,
      totalPages: result.totalPages ?? 0,
      last,
    };
  } catch (error) {
    if (error instanceof SaasError) throw error;
    if (isNoResultsUpstream(error)) return emptyResult(page);
    const message =
      error instanceof Error ? error.message : "KIMDIS search failed";
    throw kimdisUpstreamError(message);
  }
};
