/**
 * TED Search API adapter (official, unauthenticated).
 * POST https://api.ted.europa.eu/v3/notices/search — no API key required.
 * @see https://docs.ted.europa.eu/api/latest/search.html
 */

export type TedNoticeRef = {
  publicationNumber: string;
  title: string | null;
  buyerName: string | null;
  publicationDate: string | null;
  noticeType: string | null;
  cpvs: string[];
  deadline: string | null;
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
const DEFAULT_FIELDS = [
  "publication-number",
  "notice-title",
  "buyer-name",
  "publication-date",
  "notice-type",
  "classification-cpv",
  "deadline-receipt-tender-date-lot",
] as const;

export const getTedAdapterStatus = (): TedAdapterStatus => {
  const enabled = process.env.TED_ENABLED === "true";
  const apiBaseUrl = String(process.env.TED_API_BASE_URL || DEFAULT_BASE).trim();
  if (!enabled) {
    return {
      enabled: false,
      blocker: "ted_disabled_set_TED_ENABLED_true",
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

const asCpvList = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((row) => String(row ?? "").trim())
    .filter(Boolean)
    .slice(0, 24);
};

const asDeadline = (value: unknown): string | null => {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (Array.isArray(value)) {
    const first = value.find((row) => typeof row === "string" && row.trim());
    return typeof first === "string" ? first.trim() : null;
  }
  return null;
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
    parts.push(`buyer-name~${buyer}`);
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
      cpvs: asCpvList(notice["classification-cpv"]),
      deadline: asDeadline(notice["deadline-receipt-tender-date-lot"]),
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
