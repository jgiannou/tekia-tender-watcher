/**
 * TED Search API adapter (official, unauthenticated).
 * POST https://api.ted.europa.eu/v3/notices/search — no API key required.
 * @see https://docs.ted.europa.eu/api/latest/search.html
 * @see https://docs.ted.europa.eu/ODS/latest/reuse/field-list.html
 */

export type TedNoticeRef = {
  publicationNumber: string;
  title: string | null;
  buyerName: string | null;
  publicationDate: string | null;
  noticeType: string | null;
  cpvs: string[];
  deadline: string | null;
  /** Estimated procedure value (BT-27), EUR when available. Maps to budgetWithoutVat. */
  estimatedValue: number | null;
  currency: string | null;
  /** NUTS place of performance (prefer subdiv, else first EL* from place-of-performance). */
  nutsCode: string | null;
  placeCity: string | null;
  /** eForms contract nature: supplies | services | works */
  contractNature: string | null;
  buyerCity: string | null;
  buyerCountry: string | null;
  noticeSubtype: string | null;
  url: string;
  pdfUrl: string | null;
  provenance: "ted";
};

export type TedAdapterStatus = {
  enabled: boolean;
  blocker: string | null;
  apiBaseUrl: string;
  authRequired: false;
};

export type TedSearchResult = {
  notices: TedNoticeRef[];
  totalNoticeCount: number | null;
  page: number;
  blocker: string | null;
};

const DEFAULT_BASE = "https://api.ted.europa.eu";
const SEARCH_PATH = "/v3/notices/search";

/** Fields needed for in-app tender pages (parity with KIMDIS key fields). */
const DEFAULT_FIELDS = [
  "publication-number",
  "notice-title",
  "buyer-name",
  "publication-date",
  "notice-type",
  "notice-subtype",
  "classification-cpv",
  "deadline-receipt-tender-date-lot",
  "estimated-value-proc",
  "estimated-value-cur-proc",
  "estimated-value-lot",
  "estimated-value-cur-lot",
  "total-value",
  "total-value-cur",
  "place-of-performance",
  "place-of-performance-subdiv-proc",
  "place-of-performance-city-proc",
  "place-of-performance-country-proc",
  "contract-nature-main-proc",
  "organisation-city-buyer",
  "organisation-country-buyer",
] as const;

export const getTedAdapterStatus = (): TedAdapterStatus => {
  // Public Search API needs no credentials — on by default; set TED_ENABLED=false to disable.
  const enabled = process.env.TED_ENABLED !== "false";
  const apiBaseUrl = String(process.env.TED_API_BASE_URL || DEFAULT_BASE).trim();
  if (!enabled) {
    return {
      enabled: false,
      blocker: "ted_disabled",
      apiBaseUrl,
      authRequired: false,
    };
  }
  return { enabled: true, blocker: null, apiBaseUrl, authRequired: false };
};

const pickLocalized = (value: unknown): string | null => {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (!value || typeof value !== "object") return null;
  const map = value as Record<string, unknown>;
  for (const key of ["ell", "ELL", "eng", "ENG", "mul", "MUL"]) {
    const hit = map[key];
    if (typeof hit === "string" && hit.trim()) return hit.trim();
    if (Array.isArray(hit) && typeof hit[0] === "string" && hit[0].trim()) {
      return hit[0].trim();
    }
  }
  for (const hit of Object.values(map)) {
    if (typeof hit === "string" && hit.trim()) return hit.trim();
    if (Array.isArray(hit) && typeof hit[0] === "string" && hit[0].trim()) {
      return hit[0].trim();
    }
  }
  return null;
};

const pickLink = (
  links: unknown,
  kind: "html" | "pdf",
): string | null => {
  if (!links || typeof links !== "object") return null;
  const bucket = (links as Record<string, unknown>)[kind];
  if (!bucket || typeof bucket !== "object") return null;
  const map = bucket as Record<string, unknown>;
  for (const key of ["ELL", "ell", "ENG", "eng", "MUL", "mul"]) {
    const hit = map[key];
    if (typeof hit === "string" && hit.startsWith("http")) return hit;
  }
  for (const hit of Object.values(map)) {
    if (typeof hit === "string" && hit.startsWith("http")) return hit;
  }
  return null;
};

const asStringList = (value: unknown): string[] => {
  if (typeof value === "string" && value.trim()) return [value.trim()];
  if (!Array.isArray(value)) return [];
  return value
    .map((row) => String(row ?? "").trim())
    .filter(Boolean);
};

const asCpvList = (value: unknown): string[] =>
  [...new Set(asStringList(value))].slice(0, 24);

const asDeadline = (value: unknown): string | null => {
  const list = asStringList(value);
  return list[0] ?? null;
};

const asNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value.replace(/\s/g, "").replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  if (Array.isArray(value)) {
    for (const row of value) {
      const n = asNumber(row);
      if (n != null) return n;
    }
  }
  return null;
};

const asCurrency = (value: unknown): string | null => {
  const list = asStringList(value);
  const cur = list[0]?.toUpperCase() ?? null;
  return cur && /^[A-Z]{3}$/.test(cur) ? cur : null;
};

/** Prefer procedure estimate, then lot sum/first, then total-value. */
export const pickTedEstimatedValue = (
  notice: Record<string, unknown>,
): { value: number | null; currency: string | null } => {
  const proc = asNumber(notice["estimated-value-proc"]);
  if (proc != null) {
    return {
      value: proc,
      currency: asCurrency(notice["estimated-value-cur-proc"]) ?? "EUR",
    };
  }
  const lots = asStringList(notice["estimated-value-lot"])
    .map((row) => asNumber(row))
    .filter((n): n is number => n != null);
  if (lots.length > 0) {
    const sum = lots.reduce((a, b) => a + b, 0);
    return {
      value: sum,
      currency: asCurrency(notice["estimated-value-cur-lot"]) ?? "EUR",
    };
  }
  const total = asNumber(notice["total-value"]);
  if (total != null) {
    return {
      value: total,
      currency: asCurrency(notice["total-value-cur"]) ?? "EUR",
    };
  }
  return { value: null, currency: null };
};

/** First Greek NUTS code (EL…) from subdiv or place-of-performance. */
export const pickTedNutsCode = (notice: Record<string, unknown>): string | null => {
  const subdiv = asStringList(notice["place-of-performance-subdiv-proc"]);
  const place = asStringList(notice["place-of-performance"]);
  for (const code of [...subdiv, ...place]) {
    const clean = code.trim().toUpperCase();
    if (/^EL[A-Z0-9]{1,3}$/.test(clean)) return clean;
  }
  return null;
};

export const tedContractNatureLabel = (
  nature: string | null | undefined,
): string | null => {
  if (!nature) return null;
  const key = nature.trim().toLowerCase();
  if (key === "supplies") return "Προμήθειες";
  if (key === "services") return "Υπηρεσίες";
  if (key === "works") return "Έργα";
  return nature.trim();
};

const escapeExpertToken = (raw: string): string =>
  raw.replace(/["\\]/g, " ").trim();

/** TED expert dates use YYYYMMDD. */
export const toTedDateToken = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const trimmed = value.trim();
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}${iso[2]}${iso[3]}`;
  const digits = trimmed.replace(/\D/g, "");
  return digits.length === 8 ? digits : null;
};

export const buildTedExpertQuery = (input: {
  keywords?: string[];
  cpv?: string[];
  buyerCountry?: string;
  buyerName?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
}): string => {
  const parts: string[] = [];
  const country = (input.buyerCountry || "GRC").trim().toUpperCase();
  if (country) parts.push(`buyer-country=${country}`);

  const keywords = (input.keywords ?? [])
    .map(escapeExpertToken)
    .filter((token) => token.length >= 2)
    .slice(0, 8);
  if (keywords.length === 1) {
    parts.push(`notice-title~${keywords[0]}`);
  } else if (keywords.length > 1) {
    parts.push(`(${keywords.map((k) => `notice-title~${k}`).join(" OR ")})`);
  }

  const cpvs = (input.cpv ?? [])
    .map((code) => code.replace(/\D/g, "").slice(0, 8))
    .filter((code) => code.length >= 2)
    .slice(0, 8);
  if (cpvs.length === 1) {
    parts.push(`classification-cpv=${cpvs[0]}*`);
  } else if (cpvs.length > 1) {
    parts.push(
      `(${cpvs.map((code) => `classification-cpv=${code}*`).join(" OR ")})`,
    );
  }

  const buyer = escapeExpertToken(input.buyerName ?? "");
  if (buyer.length >= 2) {
    // Multi-word buyer names must be quoted or TED returns HTTP 400.
    const buyerClause = /\s/.test(buyer) ? `buyer-name~"${buyer}"` : `buyer-name~${buyer}`;
    parts.push(buyerClause);
  }

  const from = toTedDateToken(input.dateFrom);
  const to = toTedDateToken(input.dateTo);
  if (from) parts.push(`publication-date>=${from}`);
  if (to) parts.push(`publication-date<=${to}`);

  return parts.join(" AND ") || "buyer-country=GRC";
};

export const parseTedSearchResponse = (
  payload: unknown,
): { notices: TedNoticeRef[]; totalNoticeCount: number | null } => {
  if (!payload || typeof payload !== "object") {
    return { notices: [], totalNoticeCount: null };
  }
  const body = payload as {
    notices?: unknown[];
    totalNoticeCount?: unknown;
  };
  const total =
    typeof body.totalNoticeCount === "number" &&
    Number.isFinite(body.totalNoticeCount)
      ? body.totalNoticeCount
      : null;
  const notices: TedNoticeRef[] = [];
  for (const row of body.notices ?? []) {
    if (!row || typeof row !== "object") continue;
    const notice = row as Record<string, unknown>;
    const publicationNumber = String(notice["publication-number"] ?? "").trim();
    if (!publicationNumber) continue;
    const html =
      pickLink(notice.links, "html") ||
      `https://ted.europa.eu/en/notice/-/detail/${encodeURIComponent(publicationNumber)}`;
    const { value, currency } = pickTedEstimatedValue(notice);
    const natureRaw =
      typeof notice["contract-nature-main-proc"] === "string"
        ? notice["contract-nature-main-proc"].trim()
        : null;
    notices.push({
      publicationNumber,
      title: pickLocalized(notice["notice-title"]),
      buyerName: pickLocalized(notice["buyer-name"]),
      publicationDate:
        typeof notice["publication-date"] === "string"
          ? notice["publication-date"]
          : null,
      noticeType:
        typeof notice["notice-type"] === "string"
          ? notice["notice-type"]
          : null,
      noticeSubtype:
        typeof notice["notice-subtype"] === "string"
          ? notice["notice-subtype"]
          : null,
      cpvs: asCpvList(notice["classification-cpv"]),
      deadline: asDeadline(notice["deadline-receipt-tender-date-lot"]),
      estimatedValue: value,
      currency,
      nutsCode: pickTedNutsCode(notice),
      placeCity: asStringList(notice["place-of-performance-city-proc"])[0] ?? null,
      contractNature: natureRaw,
      buyerCity: asStringList(notice["organisation-city-buyer"])[0] ?? null,
      buyerCountry: asStringList(notice["organisation-country-buyer"])[0] ?? null,
      url: html,
      pdfUrl: pickLink(notice.links, "pdf"),
      provenance: "ted",
    });
  }
  return { notices, totalNoticeCount: total };
};

export const searchTedNotices = async (
  input: {
    keywords?: string[];
    cpv?: string[];
    buyerCountry?: string;
    buyerName?: string | null;
    dateFrom?: string | null;
    dateTo?: string | null;
    limit?: number;
    page?: number;
    query?: string;
  },
  fetchImpl: typeof fetch = fetch,
): Promise<TedSearchResult> => {
  const status = getTedAdapterStatus();
  const page = Math.max(1, Math.floor(input.page ?? 1));
  const limit = Math.min(50, Math.max(1, Math.floor(input.limit ?? 10)));
  if (!status.enabled) {
    return {
      notices: [],
      totalNoticeCount: null,
      page,
      blocker: status.blocker,
    };
  }

  const query =
    input.query?.trim() ||
    buildTedExpertQuery({
      keywords: input.keywords,
      cpv: input.cpv,
      buyerCountry: input.buyerCountry,
      buyerName: input.buyerName,
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
    });

  const url = `${status.apiBaseUrl.replace(/\/+$/, "")}${SEARCH_PATH}`;
  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        fields: [...DEFAULT_FIELDS],
        limit,
        scope: "ACTIVE",
        paginationMode: "PAGE_NUMBER",
        page,
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      return {
        notices: [],
        totalNoticeCount: null,
        page,
        blocker: `ted_http_${response.status}`,
      };
    }
    const payload = (await response.json()) as unknown;
    const parsed = parseTedSearchResponse(payload);
    return {
      notices: parsed.notices,
      totalNoticeCount: parsed.totalNoticeCount,
      page,
      blocker: null,
    };
  } catch {
    return {
      notices: [],
      totalNoticeCount: null,
      page,
      blocker: "ted_request_failed",
    };
  }
};
