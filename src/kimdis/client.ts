import type {
  KimdisNoticeRecord,
  KimdisPage,
  KimdisRequestRecord,
  NoticeSearchBody,
  RequestSearchBody,
} from "./types.js";

type FetchJsonOptions = {
  method?: "GET" | "POST";
  body?: unknown;
  timeoutMs: number;
  maxRetries?: number;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const fetchJson = async <T>(
  url: string,
  options: FetchJsonOptions,
): Promise<T> => {
  const maxRetries = options.maxRetries ?? 4;
  let attempt = 0;

  while (true) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs);

    try {
      const response = await fetch(url, {
        method: options.method ?? "GET",
        headers: {
          Accept: "application/json",
          ...(options.body
            ? { "Content-Type": "application/json" }
            : undefined),
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });

      if (response.status === 429 || (response.status >= 500 && response.status < 600)) {
        if (attempt >= maxRetries) {
          throw new Error(`KIMDIS HTTP ${response.status} after ${maxRetries} retries: ${url}`);
        }
        const retryAfter = Number(response.headers.get("retry-after"));
        const backoffMs = Number.isFinite(retryAfter)
          ? retryAfter * 1000
          : Math.min(30_000, 1000 * 2 ** attempt);
        attempt += 1;
        await sleep(backoffMs);
        continue;
      }

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(
          `KIMDIS HTTP ${response.status} for ${url}: ${text.slice(0, 300)}`,
        );
      }

      return (await response.json()) as T;
    } catch (error) {
      if (attempt >= maxRetries) throw error;
      attempt += 1;
      await sleep(Math.min(30_000, 1000 * 2 ** attempt));
    } finally {
      clearTimeout(timer);
    }
  }
};

const fetchSearchPage = async <T>(
  baseUrl: string,
  path: string,
  body: unknown,
  page: number,
  timeoutMs: number,
): Promise<KimdisPage<T>> =>
  fetchJson<KimdisPage<T>>(`${baseUrl}${path}?page=${page}`, {
    method: "POST",
    body,
    timeoutMs,
  });

const fetchAllPages = async <T>(
  baseUrl: string,
  path: string,
  body: unknown,
  timeoutMs: number,
): Promise<T[]> => {
  const items: T[] = [];
  let page = 0;
  let last = false;

  while (!last) {
    const result = await fetchSearchPage<T>(
      baseUrl,
      path,
      body,
      page,
      timeoutMs,
    );

    items.push(...(result.content ?? []));
    last = Boolean(result.last) || !(result.content?.length);
    page += 1;

    // Soft rate-limit between pages.
    if (!last) await sleep(250);

    // Safety valve against runaway pagination.
    if (page > 200) {
      throw new Error(`KIMDIS pagination exceeded 200 pages for ${path}`);
    }
  }

  return items;
};

export type KimdisClient = {
  searchRequestsPage: (
    body: RequestSearchBody,
    page: number,
  ) => Promise<KimdisPage<KimdisRequestRecord>>;
  searchNoticesPage: (
    body: NoticeSearchBody,
    page: number,
  ) => Promise<KimdisPage<KimdisNoticeRecord>>;
  searchRequests: (body: RequestSearchBody) => Promise<KimdisRequestRecord[]>;
  searchNotices: (body: NoticeSearchBody) => Promise<KimdisNoticeRecord[]>;
  downloadAttachment: (recordType: "REQ" | "PROC", adam: string) => Promise<Buffer | null>;
  publicUrl: (adam: string) => string;
  pdfUrl: (recordType: "REQ" | "PROC", adam: string) => string;
};

export const createKimdisClient = (
  baseUrl: string,
  timeoutMs: number,
): KimdisClient => {
  const normalizedBase = baseUrl.replace(/\/$/, "");

  return {
    searchRequestsPage: (body, page) =>
      fetchSearchPage<KimdisRequestRecord>(
        normalizedBase,
        "/khmdhs-opendata/request",
        body,
        page,
        timeoutMs,
      ),

    searchNoticesPage: (body, page) =>
      fetchSearchPage<KimdisNoticeRecord>(
        normalizedBase,
        "/khmdhs-opendata/notice",
        body,
        page,
        timeoutMs,
      ),

    searchRequests: (body) =>
      fetchAllPages<KimdisRequestRecord>(
        normalizedBase,
        "/khmdhs-opendata/request",
        body,
        timeoutMs,
      ),

    searchNotices: (body) =>
      fetchAllPages<KimdisNoticeRecord>(
        normalizedBase,
        "/khmdhs-opendata/notice",
        body,
        timeoutMs,
      ),

    downloadAttachment: async (recordType, adam) => {
      const path =
        recordType === "REQ"
          ? `/khmdhs-opendata/request/attachment/${encodeURIComponent(adam)}`
          : `/khmdhs-opendata/notice/attachment/${encodeURIComponent(adam)}`;
      const url = `${normalizedBase}${path}`;

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(url, {
          method: "GET",
          signal: controller.signal,
          headers: { Accept: "application/pdf,*/*" },
        });

        if (response.status === 404) return null;
        if (!response.ok) {
          throw new Error(`PDF download failed (${response.status}) for ${adam}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
      } finally {
        clearTimeout(timer);
      }
    },

    publicUrl: (adam) =>
      `${normalizedBase}/upgkimdis/unprotected/home.xhtml?referenceNumber=${encodeURIComponent(adam)}`,

    pdfUrl: (recordType, adam) => {
      const path =
        recordType === "REQ"
          ? `/khmdhs-opendata/request/attachment/${encodeURIComponent(adam)}`
          : `/khmdhs-opendata/notice/attachment/${encodeURIComponent(adam)}`;
      return `${normalizedBase}${path}`;
    },
  };
};

export const formatDateOnly = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const lookbackWindow = (lookbackHours: number): { dateFrom: string; dateTo: string } => {
  const now = new Date();
  const from = new Date(now.getTime() - lookbackHours * 60 * 60 * 1000);
  return {
    dateFrom: formatDateOnly(from),
    dateTo: formatDateOnly(now),
  };
};
