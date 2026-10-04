import type {
  ActivityCatalogEntry,
  CompanyActivitySuggestion,
  CompanyLookupQuery,
  CompanyRegistryLookupResult,
  CompanyRegistryProvider,
  CompanyRegistryRecord,
} from "./types.js";

type GemiIdDescr = { id?: number | string; descr?: string } | null | undefined;

type GemiCompanyPayload = {
  arGemi?: number | string;
  afm?: string;
  coNameEl?: string;
  coTitlesEl?: string[];
  status?: GemiIdDescr;
  gemiOffice?: GemiIdDescr;
  legalType?: GemiIdDescr;
  url?: string;
  email?: string;
  incorporationDate?: string;
  street?: string;
  streetNumber?: string;
  zipCode?: string;
  city?: string;
  municipality?: GemiIdDescr;
  prefecture?: GemiIdDescr;
  activities?: Array<{
    type?: string;
    activity?: { id?: string; descr?: string; kadVersion?: string };
  }>;
};

const normalizeAfm = (afm: string): string => {
  const digits = afm.replace(/\D/g, "");
  if (!digits) return "";
  // GEMI requires exactly 9 digits; keep as-is when already 9, pad only when shorter.
  return digits.length >= 9 ? digits.slice(-9) : digits.padStart(9, "0");
};

/** Live API wraps list results; Swagger historically suggested a bare array. */
export const extractGemiCompanyList = (payload: unknown): GemiCompanyPayload[] => {
  if (Array.isArray(payload)) return payload as GemiCompanyPayload[];
  if (payload && typeof payload === "object") {
    const obj = payload as { searchResults?: unknown; results?: unknown; companies?: unknown };
    if (Array.isArray(obj.searchResults)) return obj.searchResults as GemiCompanyPayload[];
    if (Array.isArray(obj.results)) return obj.results as GemiCompanyPayload[];
    if (Array.isArray(obj.companies)) return obj.companies as GemiCompanyPayload[];
    // Detail endpoint returns the company object directly.
    if ("arGemi" in obj || "afm" in obj || "coNameEl" in obj) {
      return [obj as GemiCompanyPayload];
    }
  }
  return [];
};

const mapActivity = (
  row: NonNullable<GemiCompanyPayload["activities"]>[number],
): CompanyActivitySuggestion | null => {
  const code = row.activity?.id?.trim();
  if (!code) return null;
  const type = (row.type ?? "").toLowerCase();
  const isPrimary =
    type.includes("κυρ") ||
    type.includes("main") ||
    type.includes("primary") ||
    type === "1";
  return {
    code,
    description: row.activity?.descr?.trim() || code,
    isPrimary,
    kadVersion: row.activity?.kadVersion ?? null,
  };
};

export const mapGemiCompany = (raw: GemiCompanyPayload): CompanyRegistryRecord | null => {
  const gemiNumber = raw.arGemi != null ? String(raw.arGemi) : "";
  const afm = raw.afm?.trim() ?? "";
  const legalName = raw.coNameEl?.trim() ?? "";
  if (!gemiNumber || !afm || !legalName) return null;

  const activities = (raw.activities ?? [])
    .map(mapActivity)
    .filter((row): row is CompanyActivitySuggestion => Boolean(row));

  if (activities.length > 0 && !activities.some((a) => a.isPrimary)) {
    activities[0]!.isPrimary = true;
  }

  return {
    gemiNumber,
    afm,
    legalName,
    distinctiveTitle: raw.coTitlesEl?.[0]?.trim() || null,
    status: raw.status?.descr?.trim() || null,
    gemiService: raw.gemiOffice?.descr?.trim() || null,
    legalType: raw.legalType?.descr?.trim() || null,
    website: raw.url?.trim() || null,
    email: raw.email?.trim() || null,
    incorporationDate: raw.incorporationDate ?? null,
    address: {
      street: raw.street?.trim() || null,
      streetNumber: raw.streetNumber?.trim() || null,
      zipCode: raw.zipCode?.trim() || null,
      city: raw.city?.trim() || null,
      municipality: raw.municipality?.descr?.trim() || null,
      prefecture: raw.prefecture?.descr?.trim() || null,
    },
    activities,
    source: "GEMI",
  };
};

export class GemiOpenDataProvider implements CompanyRegistryProvider {
  constructor(
    private readonly opts: {
      apiKey: string;
      baseUrl: string;
      fetchImpl?: typeof fetch;
    },
  ) {}

  isConfigured(): boolean {
    return Boolean(this.opts.apiKey.trim());
  }

  private async requestJson<T>(path: string, query?: Record<string, string>): Promise<T> {
    const url = new URL(
      path.replace(/^\//, ""),
      this.opts.baseUrl.endsWith("/") ? this.opts.baseUrl : `${this.opts.baseUrl}/`,
    );
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value) url.searchParams.set(key, value);
      }
    }
    const fetchImpl = this.opts.fetchImpl ?? fetch;
    const response = await fetchImpl(url, {
      headers: {
        Accept: "application/json",
        api_key: this.opts.apiKey,
      },
    });
    if (response.status === 503) {
      throw new Error("gemi_unavailable");
    }
    if (!response.ok) {
      throw new Error(`gemi_http_${response.status}`);
    }
    return (await response.json()) as T;
  }

  async lookupExact(query: CompanyLookupQuery): Promise<CompanyRegistryLookupResult> {
    if (!this.isConfigured()) return { status: "not_configured" };

    const afm = query.afm ? normalizeAfm(query.afm) : undefined;
    const gemiNumber = query.gemiNumber?.trim();
    if (!afm && !gemiNumber) {
      return { status: "unavailable", message: "afm_or_gemi_required" };
    }

    try {
      const params: Record<string, string> = { resultsSize: "20" };
      if (afm) params.afm = afm;
      if (gemiNumber) params.arGemi = gemiNumber;

      const list = extractGemiCompanyList(
        await this.requestJson<unknown>("/companies", params),
      );
      if (list.length === 0) {
        return { status: "not_found" };
      }

      const companies: CompanyRegistryRecord[] = [];
      for (const item of list) {
        const arGemi = item.arGemi != null ? String(item.arGemi) : "";
        if (!arGemi) continue;
        // Prefer detail payload so activities/KADs are present when API provides them.
        const detail = await this.getByGemiNumber(arGemi);
        if (detail.status === "found" && detail.companies[0]) {
          const company = detail.companies[0];
          if (afm && normalizeAfm(company.afm) !== afm) continue;
          if (gemiNumber && company.gemiNumber !== gemiNumber) continue;
          companies.push(company);
        } else {
          const mapped = mapGemiCompany(item);
          if (!mapped) continue;
          if (afm && normalizeAfm(mapped.afm) !== afm) continue;
          if (gemiNumber && mapped.gemiNumber !== gemiNumber) continue;
          companies.push(mapped);
        }
      }

      if (companies.length === 0) return { status: "not_found" };
      return { status: "found", companies };
    } catch (error) {
      return {
        status: "unavailable",
        message: error instanceof Error ? error.message : "gemi_unavailable",
      };
    }
  }

  async getByGemiNumber(gemiNumber: string): Promise<CompanyRegistryLookupResult> {
    if (!this.isConfigured()) return { status: "not_configured" };
    const id = gemiNumber.trim();
    if (!id) return { status: "not_found" };

    try {
      const raw = await this.requestJson<unknown>(
        `/companies/${encodeURIComponent(id)}`,
      );
      const mapped = mapGemiCompany(extractGemiCompanyList(raw)[0] ?? {});
      if (!mapped) return { status: "not_found" };
      return { status: "found", companies: [mapped] };
    } catch (error) {
      const message = error instanceof Error ? error.message : "gemi_unavailable";
      if (message.includes("404")) return { status: "not_found" };
      return { status: "unavailable", message };
    }
  }

  async searchActivities(query: string): Promise<ActivityCatalogEntry[]> {
    if (!this.isConfigured()) return [];
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    try {
      const rows = await this.requestJson<
        Array<{ id?: string; descr?: string; kadVersion?: string }>
      >("/metadata/activities");
      return (rows ?? [])
        .map((row) => ({
          code: String(row.id ?? "").trim(),
          description: String(row.descr ?? "").trim(),
          kadVersion: row.kadVersion ?? null,
        }))
        .filter(
          (row) =>
            row.code &&
            (row.code.toLowerCase().includes(q) ||
              row.description.toLowerCase().includes(q)),
        )
        .slice(0, 40);
    } catch {
      return [];
    }
  }
}
