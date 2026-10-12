/**
 * Unofficial fallback against the public ΚΗΜΔΗΣ JSF UI.
 *
 * Open Data (`/khmdhs-opendata/*`) is the documented API. The public registry
 * UI (`/upgkimdis/unprotected/home.xhtml`) sometimes shows acts that Open Data
 * does not yet return. This bridge is best-effort, session-based, and brittle
 * (PrimeFaces partial AJAX + generated component ids).
 *
 * Use only as a supplement after Open Data (manual search + watch scans).
 */

import type { KimdisRequestKind, KimdisSearchItem } from "./kimdis-search.js";

const DEFAULT_BASE = "https://cerpp.eprocurement.gov.gr";
const HOME_PATH = "/upgkimdis/unprotected/home.xhtml";
const USER_AGENT = "ARC-Tenders/1.0 (public-ui-fallback; read-only)";

export type PublicUiSearchInput = {
  recordFamily: "REQ" | "PROC";
  title?: string;
  referenceNumber?: string;
  dateFrom?: string; // yyyy-MM-dd
  dateTo?: string; // yyyy-MM-dd
  requestKind?: KimdisRequestKind;
  organization?: string;
  timeoutMs?: number;
  baseUrl?: string;
};

export type PublicUiSearchResult = {
  ok: boolean;
  items: KimdisSearchItem[];
  errorSafe?: string;
};

type Session = {
  cookies: string;
  viewState: string;
  actionUrl: string;
};

const pick = (text: string, re: RegExp): string | null => {
  const match = text.match(re);
  return match?.[1] ?? null;
};

const isoToUiDate = (iso?: string): string => {
  if (!iso?.trim()) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return "";
  return `${m[3]}/${m[2]}/${m[1]}`;
};

const uiDateTimeToIso = (raw: string): string | null => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?/.exec(
    raw.trim(),
  );
  if (!m) return null;
  const iso = `${m[3]}-${m[2]}-${m[1]}`;
  if (m[4] && m[5]) return `${iso}T${m[4]}:${m[5]}:00`;
  return iso;
};

const parseGreekAmount = (raw: string): number | null => {
  const cleaned = raw
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/[^\d.-]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
};

const decodeHtml = (value: string): string =>
  value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();

const collectCookies = (res: Response): string => {
  const getter = (
    res.headers as Headers & { getSetCookie?: () => string[] }
  ).getSetCookie;
  if (typeof getter === "function") {
    return getter
      .call(res.headers)
      .map((c) => c.split(";")[0]!.trim())
      .filter(Boolean)
      .join("; ");
  }
  const single = res.headers.get("set-cookie");
  if (!single) return "";
  return single
    .split(/,(?=[^;]+?=)/)
    .map((c) => c.split(";")[0]!.trim())
    .filter(Boolean)
    .join("; ");
};

const mergeCookies = (existing: string, incoming: string): string => {
  const map = new Map<string, string>();
  for (const part of `${existing}; ${incoming}`.split(";")) {
    const trimmed = part.trim();
    if (!trimmed || !trimmed.includes("=")) continue;
    const eq = trimmed.indexOf("=");
    map.set(trimmed.slice(0, eq), trimmed.slice(eq + 1));
  }
  return [...map.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
};

const withTimeout = async <T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`public_ui_timeout:${label}`)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

const postPartial = async (
  session: Session,
  input: {
    baseUrl: string;
    timeoutMs: number;
    source: string;
    updates?: string;
    execute?: string;
    extra?: Record<string, string>;
  },
): Promise<{ text: string }> => {
  const body = new URLSearchParams();
  body.set("javax.faces.partial.ajax", "true");
  body.set("javax.faces.source", input.source);
  body.set("javax.faces.partial.execute", input.execute ?? "@all");
  body.set(
    "javax.faces.partial.render",
    input.updates ?? "appForm:content appForm:topMenu",
  );
  body.set(input.source, input.source);
  body.set("appForm", "appForm");
  body.set("javax.faces.ViewState", session.viewState);
  for (const [key, value] of Object.entries(input.extra ?? {})) {
    body.set(key, value);
  }

  const url = /^https?:\/\//i.test(session.actionUrl)
    ? session.actionUrl
    : `${input.baseUrl}${session.actionUrl}`;

  const res = await withTimeout(
    fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        Accept: "application/xml, text/xml, */*; q=0.01",
        "Faces-Request": "partial/ajax",
        "X-Requested-With": "XMLHttpRequest",
        Cookie: session.cookies,
        "User-Agent": USER_AGENT,
        Referer: `${input.baseUrl}${HOME_PATH}`,
        Origin: input.baseUrl,
      },
      body: body.toString(),
    }),
    input.timeoutMs,
    "ajax",
  );
  const text = await res.text();
  if (!res.ok) throw new Error(`public_ui_http_${res.status}`);
  session.cookies = mergeCookies(session.cookies, collectCookies(res));
  const nextVs = pick(
    text,
    /id="j_id1:javax\.faces\.ViewState:0"><!\[CDATA\[([^\]]+)/,
  );
  if (nextVs) session.viewState = nextVs;
  return { text };
};

const extractUpdateHtml = (xml: string, idPart: string): string => {
  const re = new RegExp(
    `<update id="([^"]*${idPart}[^"]*)"><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></update>`,
  );
  return re.exec(xml)?.[2] ?? "";
};

/** Find menu source id by nearby Greek label (component ids drift between deploys). */
export const findMenuSourceByLabel = (
  htmlOrXml: string,
  label: string,
): string | null => {
  const idx = htmlOrXml.indexOf(label);
  if (idx < 0) return null;
  const window = htmlOrXml.slice(Math.max(0, idx - 500), idx + 80);
  return (
    pick(window, /PrimeFaces\.ab\(\{s:&quot;(appForm:[^&]+)&quot;/) ||
    pick(window, /PrimeFaces\.ab\(\{s:"(appForm:[^"]+)"/)
  );
};

const findCheckboxInputByLabel = (
  contentHtml: string,
  label: string,
): string | null => {
  const idx = contentHtml.indexOf(label);
  if (idx < 0) return null;
  const window = contentHtml.slice(idx, idx + 500);
  return pick(window, /name="(appForm:[^"]+_input)"/);
};

const requestKindCheckboxExtras = (
  contentHtml: string,
  requestKind?: KimdisRequestKind,
): Record<string, string> => {
  const initial =
    findCheckboxInputByLabel(contentHtml, "Πρωτογενή") ??
    "appForm:j_idt239_input";
  const approved =
    findCheckboxInputByLabel(contentHtml, "Αρχείο Αιτημάτων") ??
    findCheckboxInputByLabel(contentHtml, "Εγκεκριμ") ??
    "appForm:j_idt241_input";
  const approval =
    findCheckboxInputByLabel(contentHtml, "Εγκρίσεις") ??
    "appForm:j_idt243_input";

  const extras: Record<string, string> = {};
  const enable = (name: string, on: boolean) => {
    if (on) extras[name] = "on";
  };

  switch (requestKind) {
    case "initial":
      enable(initial, true);
      break;
    case "approved":
      enable(approved, true);
      break;
    case "approval":
      enable(approval, true);
      break;
    case "any":
    default:
      enable(initial, true);
      enable(approved, true);
      enable(approval, true);
      break;
  }
  return extras;
};

/** Parse one public-UI result page into search items (REQ). */
export const parsePublicUiRequestResults = (
  contentHtml: string,
  baseUrl: string,
): KimdisSearchItem[] => {
  const indices = [
    ...new Set(
      [...contentHtml.matchAll(/appForm:rsltTbl:(\d+):/g)].map((m) =>
        Number(m[1]),
      ),
    ),
  ].sort((a, b) => a - b);

  const items: KimdisSearchItem[] = [];
  for (const index of indices) {
    const start = contentHtml.indexOf(`appForm:rsltTbl:${index}:`);
    if (start < 0) continue;
    let end = contentHtml.length;
    for (const other of indices) {
      if (other <= index) continue;
      const at = contentHtml.indexOf(`appForm:rsltTbl:${other}:`, start + 1);
      if (at > start && at < end) end = at;
    }
    const chunk = contentHtml.slice(start, end);

    const adam =
      pick(chunk, /tableRefNo[^>]*>\s*<span id="(\d{2}REQ\d+)">/i) ||
      pick(chunk, /<span id="(\d{2}REQ\d+)">\1<\/span>/i) ||
      pick(chunk, /tableRefNo[^>]*>\s*(\d{2}REQ\d+)/i);
    if (!adam) continue;

    const titleRaw =
      pick(
        chunk,
        new RegExp(
          `id="appForm:rsltTbl:${index}:j_idt282"[^>]*>([^<]*)<`,
        ),
      ) || "";
    const orgRaw =
      pick(
        chunk,
        new RegExp(
          `id="appForm:rsltTbl:${index}:j_idt302"[^>]*>([^<]*)<`,
        ),
      ) || "";
    const postedRaw =
      pick(
        chunk,
        new RegExp(
          `id="appForm:rsltTbl:${index}:j_idt296"[^>]*>([^<]*)<`,
        ),
      ) || "";
    const budgetRaw =
      pick(
        chunk,
        new RegExp(
          `id="appForm:rsltTbl:${index}:j_idt305"[^>]*>([^<]*)<`,
        ),
      ) || "";

    const parentAdams = [
      ...chunk.matchAll(/Εγκρίθηκε από\s*(\d{2}REQ\d+)/g),
      ...chunk.matchAll(/Εγκρίνει\s*(\d{2}REQ\d+)/g),
    ]
      .map((m) => m[1]!)
      .filter((ref) => ref !== adam);

    const normalizedBase = baseUrl.replace(/\/$/, "");
    items.push({
      adam,
      recordType: "REQ",
      title: decodeHtml(titleRaw) || "(no title)",
      contractingAuthority: decodeHtml(orgRaw) || "Unknown organization",
      cpvs: [],
      budgetWithoutVat: parseGreekAmount(budgetRaw),
      budgetWithVat: null,
      submissionDate: uiDateTimeToIso(postedRaw),
      signedDate: null,
      finalSubmissionDate: null,
      procedureType: null,
      contractTypeLabel: null,
      cancelled: false,
      publicKimdisUrl: `${normalizedBase}${HOME_PATH}?referenceNumber=${encodeURIComponent(adam)}`,
      officialPdfUrl: `${normalizedBase}/khmdhs-opendata/request/attachment/${encodeURIComponent(adam)}`,
      openState: "UNKNOWN",
      nutsCode: null,
      parentAdams: [...new Set(parentAdams)],
    });
  }
  return items;
};

/**
 * Best-effort public UI search. Failures return `{ ok:false }` — callers keep Open Data.
 */
export const searchKimdisPublicUi = async (
  input: PublicUiSearchInput,
): Promise<PublicUiSearchResult> => {
  const baseUrl = (input.baseUrl || process.env.KIMDIS_BASE_URL || DEFAULT_BASE)
    .trim()
    .replace(/\/$/, "");
  const timeoutMs = input.timeoutMs ?? 20_000;

  try {
    if (input.recordFamily === "PROC") {
      return { ok: false, items: [], errorSafe: "public_ui_proc_unsupported" };
    }

    const homeRes = await withTimeout(
      fetch(`${baseUrl}${HOME_PATH}`, {
        headers: { Accept: "text/html", "User-Agent": USER_AGENT },
      }),
      timeoutMs,
      "home",
    );
    const homeHtml = await homeRes.text();
    if (!homeRes.ok) {
      return {
        ok: false,
        items: [],
        errorSafe: `public_ui_http_${homeRes.status}`,
      };
    }
    const viewState = pick(
      homeHtml,
      /name="javax\.faces\.ViewState"[^>]*value="([^"]+)"/i,
    );
    const actionRaw = pick(
      homeHtml,
      /<form[^>]*id="appForm"[^>]*action="([^"]+)"/i,
    );
    if (!viewState || !actionRaw) {
      return { ok: false, items: [], errorSafe: "public_ui_session_incomplete" };
    }
    const session: Session = {
      cookies: collectCookies(homeRes),
      viewState,
      actionUrl: actionRaw.replace(/&amp;/g, "&"),
    };

    const menuSource =
      findMenuSourceByLabel(homeHtml, "Αιτήματα") || "appForm:j_idt34";
    const menuXml = await postPartial(session, {
      baseUrl,
      timeoutMs,
      source: menuSource,
    });
    const contentAfterMenu = extractUpdateHtml(menuXml.text, "content");
    if (!contentAfterMenu.includes("global_search_button")) {
      return {
        ok: false,
        items: [],
        errorSafe: "public_ui_search_form_missing",
      };
    }

    const kindExtras = requestKindCheckboxExtras(
      contentAfterMenu,
      input.requestKind ?? "any",
    );
    const searchExtra: Record<string, string> = {
      "appForm:requestTitle": input.title?.trim() ?? "",
      "appForm:requestRefNo": input.referenceNumber?.trim() ?? "",
      "appForm:dateFrom_input": isoToUiDate(input.dateFrom),
      "appForm:dateTo_input": isoToUiDate(input.dateTo),
      ...kindExtras,
    };
    if (input.organization?.trim()) {
      searchExtra["appForm:unitsOperator_input"] = input.organization.trim();
    }

    const searchXml = await postPartial(session, {
      baseUrl,
      timeoutMs,
      source: "appForm:global_search_button",
      updates: "appForm:content",
      extra: searchExtra,
    });
    const resultHtml = extractUpdateHtml(searchXml.text, "content");
    const items = parsePublicUiRequestResults(resultHtml, baseUrl);
    return { ok: true, items };
  } catch (error) {
    const message =
      error instanceof Error ? error.message.slice(0, 160) : "public_ui_failed";
    return { ok: false, items: [], errorSafe: message };
  }
};

/** Merge Open Data + public UI rows by ADAM. Open Data wins on conflicts. */
export const mergeKimdisSearchItems = (
  openDataItems: KimdisSearchItem[],
  publicUiItems: KimdisSearchItem[],
): { items: KimdisSearchItem[]; addedFromPublicUi: number } => {
  const byAdam = new Map<string, KimdisSearchItem>();
  for (const item of openDataItems) {
    byAdam.set(item.adam, item);
  }
  let addedFromPublicUi = 0;
  for (const item of publicUiItems) {
    if (byAdam.has(item.adam)) continue;
    byAdam.set(item.adam, item);
    addedFromPublicUi += 1;
  }
  return { items: [...byAdam.values()], addedFromPublicUi };
};
