/**
 * Διαύγεια OpenData adapter — public endpoints, no credentials for read access.
 * Enable with DIAVGEIA_ENABLED=true. Protected write resources are out of scope.
 */

export type DiavgeiaDecisionRef = {
  ada: string;
  subject: string | null;
  issueDate: string | null;
  organization: string | null;
  decisionTypeId: string | null;
  url: string;
  documentUrl: string | null;
  provenance: "diavgeia";
};

export type DiavgeiaAdapterStatus = {
  enabled: boolean;
  blocker: string | null;
  baseUrl: string;
  searchUrl: string;
  authRequired: false;
  notes: string[];
};

export type DiavgeiaSearchResult = {
  decisions: DiavgeiaDecisionRef[];
  blocker: string | null;
  page: number;
};

const DEFAULT_BASE = "https://diavgeia.gov.gr/opendata";
const DEFAULT_SEARCH = "https://diavgeia.gov.gr/luminapi/opendata/search.json";

export const diavgeiaPublicUrl = (ada: string): string =>
  `https://diavgeia.gov.gr/decision/view/${encodeURIComponent(ada.trim())}`;

export const getDiavgeiaAdapterStatus = (): DiavgeiaAdapterStatus => {
  const enabled = process.env.DIAVGEIA_ENABLED === "true";
  const baseUrl = String(process.env.DIAVGEIA_BASE_URL || DEFAULT_BASE).trim();
  const searchUrl = String(
    process.env.DIAVGEIA_SEARCH_URL || DEFAULT_SEARCH,
  ).trim();
  const notes = [
    "Public decision read/search does not require an API key.",
    "Protected Diavgeia resources that need authentication are not used.",
    "Site maintenance may temporarily limit search UX to ADA-only; probe endpoints before relying on discovery.",
  ];
  if (!enabled) {
    return {
      enabled: false,
      blocker: "diavgeia_disabled_set_DIAVGEIA_ENABLED_true",
      baseUrl,
      searchUrl,
      authRequired: false,
      notes,
    };
  }
  return {
    enabled: true,
    blocker: null,
    baseUrl,
    searchUrl,
    authRequired: false,
    notes,
  };
};

const asIssueDate = (value: unknown): string | null => {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }
  return null;
};

export const parseDiavgeiaDecisionPayload = (
  payload: unknown,
  fallbackAda?: string,
): DiavgeiaDecisionRef | null => {
  if (!payload || typeof payload !== "object") return null;
  const body = payload as Record<string, unknown>;
  const ada = String(body.ada ?? fallbackAda ?? "").trim();
  if (!ada) return null;
  return {
    ada,
    subject: typeof body.subject === "string" ? body.subject : null,
    issueDate: asIssueDate(body.issueDate ?? body.submissionTimestamp),
    organization:
      typeof body.organizationId === "string" ? body.organizationId : null,
    decisionTypeId:
      typeof body.decisionTypeId === "string" ? body.decisionTypeId : null,
    url:
      typeof body.url === "string" && body.url.startsWith("http")
        ? body.url
        : diavgeiaPublicUrl(ada),
    documentUrl:
      typeof body.documentUrl === "string" && body.documentUrl.startsWith("http")
        ? body.documentUrl
        : null,
    provenance: "diavgeia",
  };
};

export const parseDiavgeiaSearchPayload = (
  payload: unknown,
): DiavgeiaDecisionRef[] => {
  if (!payload || typeof payload !== "object") return [];
  const decisions = (payload as { decisions?: unknown[] }).decisions;
  if (!Array.isArray(decisions)) return [];
  const out: DiavgeiaDecisionRef[] = [];
  for (const row of decisions) {
    const parsed = parseDiavgeiaDecisionPayload(row);
    if (parsed) out.push(parsed);
  }
  return out;
};

export const fetchDiavgeiaDecisionByAda = async (
  ada: string,
  fetchImpl: typeof fetch = fetch,
): Promise<DiavgeiaDecisionRef | null> => {
  const status = getDiavgeiaAdapterStatus();
  if (!status.enabled) return null;
  const clean = ada.trim();
  if (!clean) return null;

  const url = `${status.baseUrl.replace(/\/+$/, "")}/decisions/${encodeURIComponent(clean)}.json`;
  try {
    const response = await fetchImpl(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as unknown;
    return parseDiavgeiaDecisionPayload(body, clean);
  } catch {
    return null;
  }
};

/**
 * Public luminapi search. May be constrained by upstream maintenance.
 * Does not invent rows when the endpoint returns empty / errors.
 */
export const searchDiavgeiaDecisions = async (
  input: { term: string; page?: number; size?: number },
  fetchImpl: typeof fetch = fetch,
): Promise<DiavgeiaSearchResult> => {
  const status = getDiavgeiaAdapterStatus();
  const page = Math.max(0, Math.floor(input.page ?? 0));
  const size = Math.min(50, Math.max(1, Math.floor(input.size ?? 10)));
  if (!status.enabled) {
    return { decisions: [], blocker: status.blocker, page };
  }
  const term = input.term.trim();
  if (!term) {
    return { decisions: [], blocker: "diavgeia_empty_term", page };
  }

  const url = `${status.searchUrl}?term=${encodeURIComponent(term)}&page=${page}&size=${size}`;
  try {
    const response = await fetchImpl(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      return {
        decisions: [],
        blocker: `diavgeia_http_${response.status}`,
        page,
      };
    }
    const payload = (await response.json()) as unknown;
    return {
      decisions: parseDiavgeiaSearchPayload(payload),
      blocker: null,
      page,
    };
  } catch {
    return { decisions: [], blocker: "diavgeia_request_failed", page };
  }
};
