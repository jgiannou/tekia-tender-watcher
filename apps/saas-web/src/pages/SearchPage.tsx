import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useSessionContext } from "@/auth/SessionProvider";
import { CpvCombobox } from "@/components/CpvCombobox";
import { PdfAction } from "@/components/PdfAction";
import { SourceBadge } from "@/components/SourceBadge";
import { DateInput } from "@/components/ui/date-input";
import { Pagination } from "@/components/Pagination";
import { trackAnalyticsEvent, trackFirstSavedSearchIfNeeded } from "@/lib/analytics";
import { humanSaasError } from "@/lib/labels";

/** Matches KIMDIS upstream page size used by the API client. */
const KIMDIS_PAGE_SIZE = 50;
import { PdfPreviewModal } from "@/components/PdfPreviewModal";
import { EmptyState, ErrorState, PageSkeleton } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  saasApi,
  type KimdisRequestKind,
  type KimdisSearchFilters,
  type KimdisSearchItem,
  type KimdisSearchResult,
  type WatchProfileInput,
} from "@/lib/api";
import { formatCpvBadge } from "@/lib/cpv-options";
import {
  adamValidationMessageEl,
  EXACT_ADAM_SEARCH_HINT_EL,
  parseKimdisAdamInput,
} from "@/lib/kimdis-adam";
import { formatRegion, GREEK_NUTS2_REGIONS } from "@/lib/regions";

type TedNoticeRow = {
  publicationNumber: string;
  title: string | null;
  buyerName: string | null;
  publicationDate: string | null;
  noticeType?: string | null;
  cpvs?: string[];
  deadline?: string | null;
  estimatedValue?: number | null;
  currency?: string | null;
  nutsCode?: string | null;
  placeCity?: string | null;
  contractNature?: string | null;
  url: string;
  pdfUrl?: string | null;
  provenance: "ted";
};

const tedContractNatureLabel = (nature?: string | null): string | null => {
  if (!nature) return null;
  const key = nature.trim().toLowerCase();
  if (key === "supplies") return "Προμήθειες";
  if (key === "services") return "Υπηρεσίες";
  if (key === "works") return "Έργα";
  return nature.trim();
};

const formatMoney = (value: number | null) =>
  value == null
    ? "—"
    : new Intl.NumberFormat("el-GR", {
        style: "currency",
        currency: "EUR",
        maximumFractionDigits: 0,
      }).format(value);

const formatDate = (value: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value.slice(0, 10) : date.toLocaleDateString("el-GR");
};

const formatDateOnly = (date: Date) => date.toISOString().slice(0, 10);

const defaultRecentDates = () => {
  const to = new Date();
  const from = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { dateFrom: formatDateOnly(from), dateTo: formatDateOnly(to) };
};

type SearchFormState = {
  type: "REQ" | "PROC";
  q: string;
  adam: string;
  cpv: string;
  authority: string;
  contractType: string;
  requestKind: KimdisRequestKind;
  procedureType: string;
  dateFrom: string;
  dateTo: string;
  allHistory: boolean;
  amountMin: string;
  amountMax: string;
  finalFrom: string;
  finalTo: string;
  signer: string;
  regions: string[];
  includeUnclassifiedRegion: boolean;
  sort: "date_desc" | "date_asc";
  page: number;
  run: boolean;
};

const parseRequestKind = (raw: string | null): KimdisRequestKind => {
  if (raw === "initial" || raw === "approved" || raw === "approval" || raw === "any") {
    return raw;
  }
  // New manual searches default to all request kinds (explicit URL still wins).
  return "any";
};

const parseState = (params: URLSearchParams): SearchFormState => {
  const allHistory = params.get("allHistory") === "1";
  const recent = defaultRecentDates();
  const hasExplicitDates = Boolean(params.get("dateFrom") || params.get("dateTo"));
  const hasRun = params.get("run") === "1";
  // Preserve legacy bookmarked searches that omitted requestKind (= initial).
  const requestKind: KimdisRequestKind = params.has("requestKind")
    ? parseRequestKind(params.get("requestKind"))
    : hasRun
      ? "initial"
      : "any";
  return {
    type: params.get("type") === "PROC" ? "PROC" : "REQ",
    q: params.get("q") ?? "",
    adam: params.get("adam") ?? "",
    cpv: params.get("cpv") ?? "",
    authority: params.get("authority") ?? "",
    contractType: params.get("contractType") ?? "",
    requestKind,
    procedureType: params.get("procedureType") ?? "",
    dateFrom: allHistory
      ? ""
      : params.get("dateFrom") ?? (hasExplicitDates ? "" : recent.dateFrom),
    dateTo: allHistory
      ? ""
      : params.get("dateTo") ?? (hasExplicitDates ? "" : recent.dateTo),
    allHistory,
    amountMin: params.get("amountMin") ?? "",
    amountMax: params.get("amountMax") ?? "",
    finalFrom: params.get("finalFrom") ?? "",
    finalTo: params.get("finalTo") ?? "",
    signer: params.get("signer") ?? "",
    regions: params.getAll("region").filter(Boolean),
    includeUnclassifiedRegion: params.get("includeUnclassified") === "1",
    sort: params.get("sort") === "date_asc" ? "date_asc" : "date_desc",
    page: Math.max(1, Number(params.get("page") ?? "1") || 1),
    run: hasRun,
  };
};

const requestKindLabel = (
  kind: KimdisRequestKind,
  metaKinds?: Array<{ id: string; label: string }>,
): string => metaKinds?.find((row) => row.id === kind)?.label
  ?? (kind === "any"
    ? "Όλοι οι τύποι αιτημάτων"
    : kind === "approved"
      ? "Εγκεκριμένα"
      : kind === "approval"
        ? "Εγκρίσεις"
        : "Πρωτογενή");

const toSearchParams = (state: SearchFormState): URLSearchParams => {
  const params = new URLSearchParams();
  params.set("type", state.type);
  if (state.q.trim()) params.set("q", state.q.trim());
  if (state.adam.trim()) params.set("adam", state.adam.trim());
  if (state.cpv.trim()) params.set("cpv", state.cpv.trim());
  if (state.authority.trim()) params.set("authority", state.authority.trim());
  if (state.contractType) params.set("contractType", state.contractType);
  if (state.type === "REQ") {
    params.set("requestKind", state.requestKind);
  }
  if (state.type === "PROC" && state.procedureType) {
    params.set("procedureType", state.procedureType);
  }
  if (state.allHistory) {
    params.set("allHistory", "1");
  } else {
    if (state.dateFrom) params.set("dateFrom", state.dateFrom);
    if (state.dateTo) params.set("dateTo", state.dateTo);
  }
  if (state.amountMin) params.set("amountMin", state.amountMin);
  if (state.amountMax) params.set("amountMax", state.amountMax);
  if (state.type === "PROC" && state.finalFrom) params.set("finalFrom", state.finalFrom);
  if (state.type === "PROC" && state.finalTo) params.set("finalTo", state.finalTo);
  if (state.signer.trim()) params.set("signer", state.signer.trim());
  for (const region of state.regions) {
    if (region) params.append("region", region);
  }
  if (state.regions.length > 0 && state.includeUnclassifiedRegion) {
    params.set("includeUnclassified", "1");
  }
  if (state.sort !== "date_desc") params.set("sort", state.sort);
  if (state.page > 1) params.set("page", String(state.page));
  if (state.run) params.set("run", "1");
  return params;
};

const toApiFilters = (state: SearchFormState): KimdisSearchFilters => {
  const adamParsed = parseKimdisAdamInput(state.adam);
  const exactAdam = adamParsed.status === "exact" ? adamParsed.adam : undefined;
  return {
    recordFamily: state.type,
    page: Math.max(0, state.page - 1),
    pageSize: KIMDIS_PAGE_SIZE,
    sort: state.sort,
    // Exact ADAM: send identity only — server ignores other filters.
    title: exactAdam ? undefined : state.q.trim() || undefined,
    referenceNumber: exactAdam ?? (state.adam.trim() || undefined),
    cpv: exactAdam ? undefined : state.cpv.trim() || undefined,
    organization: exactAdam ? undefined : state.authority.trim() || undefined,
    contractType: exactAdam ? undefined : state.contractType || undefined,
    dateFrom: exactAdam || state.allHistory ? undefined : state.dateFrom || undefined,
    dateTo: exactAdam || state.allHistory ? undefined : state.dateTo || undefined,
    searchAllHistory: exactAdam ? true : state.allHistory || undefined,
    totalCostFrom:
      exactAdam || !state.amountMin ? undefined : Number(state.amountMin),
    totalCostTo:
      exactAdam || !state.amountMax ? undefined : Number(state.amountMax),
    requestKind: exactAdam
      ? state.type === "REQ"
        ? "any"
        : undefined
      : state.type === "REQ"
        ? state.requestKind
        : undefined,
    procedureType:
      exactAdam || state.type !== "PROC" || !state.procedureType
        ? undefined
        : state.procedureType,
    finalSubmissionDateFrom:
      exactAdam || state.type !== "PROC" || !state.finalFrom
        ? undefined
        : state.finalFrom,
    finalSubmissionDateTo:
      exactAdam || state.type !== "PROC" || !state.finalTo
        ? undefined
        : state.finalTo,
    signer: exactAdam ? undefined : state.signer.trim() || undefined,
    regions: exactAdam || state.regions.length === 0 ? undefined : state.regions,
    includeUnclassifiedRegion:
      exactAdam || state.regions.length === 0
        ? undefined
        : state.includeUnclassifiedRegion,
  };
};

const criteriaFingerprint = (state: SearchFormState): string =>
  [
    state.type,
    state.q.trim(),
    state.adam.trim(),
    state.cpv.trim(),
    state.authority.trim(),
    state.contractType,
    state.requestKind,
    state.procedureType,
    state.allHistory ? "all" : `${state.dateFrom}|${state.dateTo}`,
    state.amountMin,
    state.amountMax,
    state.finalFrom,
    state.finalTo,
    state.signer.trim(),
    [...state.regions].sort().join(","),
    state.includeUnclassifiedRegion ? "1" : "0",
  ].join("::");

const activeCriteriaSummary = (
  state: SearchFormState,
  metaKinds?: Array<{ id: string; label: string }>,
): string => {
  const adamParsed = parseKimdisAdamInput(state.adam);
  if (adamParsed.status === "exact") {
    return [
      state.type,
      `ΑΔΑΜ ${adamParsed.adam}`,
      EXACT_ADAM_SEARCH_HINT_EL,
    ].join(" · ");
  }

  const regionNames = state.regions
    .map((code) => GREEK_NUTS2_REGIONS.find((r) => r.code === code)?.label ?? code)
    .filter(Boolean);

  const parts = [
    state.type,
    state.q.trim() ? `«${state.q.trim()}»` : null,
    state.adam.trim() ? `ΑΔΑΜ ${state.adam.trim()}` : null,
    state.type === "REQ" ? requestKindLabel(state.requestKind, metaKinds) : null,
    state.allHistory
      ? "όλο το ιστορικό"
      : state.dateFrom && state.dateTo
        ? `${state.dateFrom} – ${state.dateTo}`
        : state.dateFrom
          ? `από ${state.dateFrom}`
          : state.dateTo
            ? `έως ${state.dateTo}`
            : "τελευταίες 30 ημέρες",
    state.sort === "date_asc" ? "παλαιότερα πρώτα" : "πιο πρόσφατες πρώτα",
    regionNames.length ? `περιφέρειες: ${regionNames.join(", ")}` : null,
    state.regions.length > 0 && state.includeUnclassifiedRegion
      ? "συμπεριλαμβάνονται χωρίς περιοχή"
      : null,
    state.cpv.trim() ? `CPV ${state.cpv.trim()}` : null,
    state.authority.trim() ? `αρχή ${state.authority.trim()}` : null,
    state.contractType
      ? `χαρακτήρας ${state.contractType}`
      : null,
  ].filter(Boolean);
  return parts.join(" · ");
};

export const SearchPage = () => {
  const { activeOrganization } = useSessionContext();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const urlState = useMemo(() => parseState(searchParams), [searchParams]);

  const [draft, setDraft] = useState<SearchFormState>(urlState);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [meta, setMeta] = useState<{
    contractTypes: Record<string, string>;
    procedureTypes: Record<string, string>;
    requestKinds: Array<{ id: string; label: string }>;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<KimdisSearchItem[]>([]);
  const [totalElements, setTotalElements] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [last, setLast] = useState(true);
  const [searchMeta, setSearchMeta] = useState<Pick<
    KimdisSearchResult,
    "mode" | "exactAdam" | "exactAdamFound" | "regionFilter"
  > | null>(null);
  const [selected, setSelected] = useState<KimdisSearchItem | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saving, setSaving] = useState(false);
  const [similarProfiles, setSimilarProfiles] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [cpvSuggestions, setCpvSuggestions] = useState<
    Array<{ code: string; label: string }>
  >([]);
  const [registryTab, setRegistryTab] = useState<"kimdis" | "ted">("kimdis");
  const [tedEnabled, setTedEnabled] = useState(false);
  const [tedQuery, setTedQuery] = useState("");
  const [tedCpv, setTedCpv] = useState("");
  const [tedAuthority, setTedAuthority] = useState("");
  const [tedDateFrom, setTedDateFrom] = useState(() => defaultRecentDates().dateFrom);
  const [tedDateTo, setTedDateTo] = useState(() => defaultRecentDates().dateTo);
  const [tedLoading, setTedLoading] = useState(false);
  const [tedError, setTedError] = useState<string | null>(null);
  const [tedNotices, setTedNotices] = useState<TedNoticeRow[]>([]);
  const [tedBusy, setTedBusy] = useState(false);
  const [tedTotal, setTedTotal] = useState<number | null>(null);

  useEffect(() => {
    setDraft(urlState);
  }, [urlState]);

  useEffect(() => {
    if (!activeOrganization) return;
    void saasApi.kimdisMeta(activeOrganization.id).then(setMeta).catch(() => null);
    void saasApi
      .watchSuggestions(activeOrganization.id)
      .then((result) => setCpvSuggestions(result.suggestions.cpvs ?? []))
      .catch(() => setCpvSuggestions([]));
    void saasApi
      .getSourcesStatus(activeOrganization.id)
      .then((status) => {
        setTedEnabled(status.ted.enabled);
      })
      .catch(() => {
        setTedEnabled(false);
      });
  }, [activeOrganization?.id]);

  const handleTedSearch = async () => {
    if (!activeOrganization) return;
    setTedLoading(true);
    setTedError(null);
    try {
      const result = await saasApi.searchTedNotices(activeOrganization.id, {
        q: tedQuery.trim() || undefined,
        cpv: tedCpv.trim() || undefined,
        authority: tedAuthority.trim() || undefined,
        dateFrom: tedDateFrom || undefined,
        dateTo: tedDateTo || undefined,
        limit: 20,
      });
      if (result.blocker) {
        setTedError(
          result.blocker.includes("ted_disabled") ||
            result.blocker.includes("TED_ENABLED")
            ? "Η αναζήτηση TED δεν είναι διαθέσιμη προς το παρόν. Δοκιμάστε αργότερα ή χρησιμοποιήστε το ΚΗΜΔΗΣ."
            : "Η αναζήτηση TED απέτυχε προσωρινά. Δοκιμάστε ξανά σε λίγο.",
        );
        setTedNotices([]);
        setTedTotal(null);
        return;
      }
      setTedNotices(result.notices);
      setTedTotal(result.totalNoticeCount);
    } catch (err) {
      setTedError(err instanceof Error ? err.message : "Αποτυχία αναζήτησης TED");
      setTedNotices([]);
      setTedTotal(null);
    } finally {
      setTedLoading(false);
    }
  };

  const tedDetailPath = (notice: TedNoticeRow) =>
    `/app/tenders/PROC/${encodeURIComponent(`TED:${notice.publicationNumber}`)}`;

  const handleOpenTed = async (notice: TedNoticeRow) => {
    if (!activeOrganization) return;
    setTedBusy(true);
    try {
      await saasApi.openTedNotice(activeOrganization.id, notice);
      trackAnalyticsEvent("button_click", {
        button_name: "ted_open",
        content_type: "TED",
        item_id: notice.publicationNumber,
        source: "ted_search",
      });
      void navigate(tedDetailPath(notice));
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Αποτυχία ανοίγματος πράξης TED",
      );
    } finally {
      setTedBusy(false);
    }
  };

  const handleFollowTed = async (notice: TedNoticeRow) => {
    if (!activeOrganization) return;
    setTedBusy(true);
    try {
      await saasApi.followTedNotice(activeOrganization.id, notice);
      toast.success("Προστέθηκε στην Παρακολούθηση από TED");
      trackAnalyticsEvent("tender_followed", {
        content_type: "TED",
        item_id: notice.publicationNumber,
        source: "ted_search",
      });
      void navigate(tedDetailPath(notice));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Αποτυχία παρακολούθησης TED");
    } finally {
      setTedBusy(false);
    }
  };

  useEffect(() => {
    if (!activeOrganization || !urlState.run) return;
    let cancelled = false;
    const requestId = searchParams.toString();
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await saasApi.kimdisSearch(
          activeOrganization.id,
          toApiFilters(urlState),
        );
        if (cancelled) return;
        // Drop stale responses that finished after a newer search started.
        if (searchParams.toString() !== requestId) return;
        setItems(result.items);
        setTotalElements(result.totalElements);
        setTotalPages(result.totalPages);
        setLast(result.last);
        setSearchMeta({
          mode: result.mode,
          exactAdam: result.exactAdam,
          exactAdamFound: result.exactAdamFound,
          regionFilter: result.regionFilter,
        });
      } catch (err) {
        if (cancelled) return;
        if (searchParams.toString() !== requestId) return;
        const raw = err instanceof Error ? err.message : "";
        if (raw.includes("adam_")) {
          setError(adamValidationMessageEl(raw));
        } else {
          setError(
            "Δεν ήταν δυνατή η ολοκλήρωση της αναζήτησης στο ΚΗΜΔΗΣ. Δοκιμάστε ξανά.",
          );
        }
        setItems([]);
        setTotalElements(0);
        setTotalPages(0);
        setLast(true);
        setSearchMeta(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [activeOrganization?.id, searchParams.toString()]);

  const draftAdamParsed = useMemo(
    () => parseKimdisAdamInput(draft.adam),
    [draft.adam],
  );
  const appliedAdamParsed = useMemo(
    () => parseKimdisAdamInput(urlState.adam),
    [urlState.adam],
  );
  const filtersDirty =
    urlState.run && criteriaFingerprint(draft) !== criteriaFingerprint(urlState);

  const commitSearch = (next: SearchFormState) => {
    setSearchParams(toSearchParams({ ...next, run: true }), { replace: false });
  };

  const handleSearchSubmit = () => {
    const adamParsed = parseKimdisAdamInput(draft.adam);
    if (adamParsed.status === "invalid") {
      toast.error(adamValidationMessageEl(adamParsed.reason));
      return;
    }
    if (
      adamParsed.status === "exact" &&
      (adamParsed.recordType === "REQ" || adamParsed.recordType === "PROC") &&
      adamParsed.recordType !== draft.type
    ) {
      toast.error(adamValidationMessageEl(`adam_family_mismatch:expected_${adamParsed.recordType}_got_${draft.type}`));
      return;
    }
    commitSearch({ ...draft, page: 1, run: true });
  };

  const handlePageChange = (page: number) => {
    commitSearch({ ...urlState, page, run: true });
  };

  const handleSortChange = (sort: "date_desc" | "date_asc") => {
    commitSearch({ ...urlState, sort, page: 1, run: true });
  };

  const buildWatchInput = (name: string, skipSimilarCheck = false): WatchProfileInput => ({
    name,
    keywords: urlState.q.trim() ? [urlState.q.trim()] : [],
    cpvs: urlState.cpv.trim() ? [urlState.cpv.trim()] : [],
    recordTypes: [urlState.type],
    matchingMode: "BALANCED",
    notificationOverride: "INHERIT",
    authority: urlState.authority.trim() || null,
    contractType: urlState.contractType || null,
    procedureType: urlState.procedureType || null,
    minBudget: urlState.amountMin ? Number(urlState.amountMin) : null,
    maxBudget: urlState.amountMax ? Number(urlState.amountMax) : null,
    dateFrom: urlState.dateFrom || null,
    dateTo: urlState.dateTo || null,
    regions: urlState.regions,
    includeUnclassifiedRegion: urlState.includeUnclassifiedRegion,
    source: "SAVED_FROM_SEARCH",
    skipSimilarCheck,
  });

  const handleOpenSave = async () => {
    if (!activeOrganization) return;
    const defaultName = urlState.q.trim() || "Αναζήτηση στο ΚΗΜΔΗΣ";
    setSaveName(defaultName);
    setSimilarProfiles([]);
    setSaveOpen(true);
    try {
      const result = await saasApi.checkSimilarWatchProfiles(
        activeOrganization.id,
        buildWatchInput(defaultName),
      );
      setSimilarProfiles(result.similar.map((p) => ({ id: p.id, name: p.name })));
    } catch {
      // non-blocking
    }
  };

  const handleSaveSearch = async (skipSimilarCheck = false) => {
    if (!activeOrganization || !saveName.trim()) return;
    setSaving(true);
    try {
      let existingCount = 0;
      try {
        const listed = await saasApi.listWatchProfiles(activeOrganization.id);
        existingCount = listed.profiles.length;
      } catch {
        existingCount = 0;
      }
      await saasApi.createWatchProfile(
        activeOrganization.id,
        buildWatchInput(saveName.trim(), skipSimilarCheck),
      );
      trackAnalyticsEvent("watch_profile_created", { source: "SAVED_FROM_SEARCH" });
      trackFirstSavedSearchIfNeeded(existingCount);
      toast.success("Η αποθηκευμένη αναζήτηση δημιουργήθηκε. Ξεκίνησε αρχικός έλεγχος.");
      setSaveOpen(false);
    } catch (err) {
      toast.error(
        humanSaasError(err instanceof Error ? err.message : "Αποτυχία αποθήκευσης"),
      );
    } finally {
      setSaving(false);
    }
  };

  const handleFollow = async (item: KimdisSearchItem) => {
    if (!activeOrganization) return;
    try {
      await saasApi.followKimdisItem(activeOrganization.id, item);
      trackAnalyticsEvent("tender_followed", {
        content_type: item.recordType,
        item_id: item.adam,
        source: "search",
      });
      toast.success("Ο διαγωνισμός προστέθηκε στην Παρακολούθηση.", {
        action: {
          label: "Προβολή παρακολουθούμενων",
          onClick: () => navigate("/app/monitoring"),
        },
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Αποτυχία παρακολούθησης");
    }
  };

  if (!activeOrganization) {
    return (
      <EmptyState
        title="Χωρίς οργανισμό"
        description="Δημιουργήστε οργανισμό για αναζήτηση στο ΚΗΜΔΗΣ."
      />
    );
  }

  const currentPage = urlState.page;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Αναζήτηση</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Χειροκίνητη αναζήτηση σε ΚΗΜΔΗΣ ή TED. Για αυτόματη εύρεση, αποθηκεύστε κριτήρια με τις επιλεγμένες πηγές.
          </p>
        </div>
        {registryTab === "kimdis" ? (
          <Button
            variant="outline"
            onClick={() => void handleOpenSave()}
            disabled={!urlState.run}
          >
            Αποθήκευση αναζήτησης
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          variant={registryTab === "kimdis" ? "default" : "outline"}
          onClick={() => setRegistryTab("kimdis")}
        >
          ΚΗΜΔΗΣ
        </Button>
        <Button
          variant={registryTab === "ted" ? "default" : "outline"}
          onClick={() => setRegistryTab("ted")}
        >
          TED
        </Button>
      </div>

      {registryTab === "ted" ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Αναζήτηση TED <SourceBadge system="ted" />
            </CardTitle>
            <CardDescription>
              Ευρωπαϊκές προκηρύξεις για την Ελλάδα από το TED. Τα αποτελέσματα δεν
              προστίθενται αυτόματα στις Ευκαιρίες — χρησιμοποιήστε Παρακολούθηση ή
              αποθηκευμένη αναζήτηση με πηγή TED.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!tedEnabled ? (
              <p className="text-sm text-amber-700 dark:text-amber-400">
                Η αναζήτηση TED δεν είναι διαθέσιμη προς το παρόν. Μπορείτε να
                συνεχίσετε με το ΚΗΜΔΗΣ.
              </p>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="ted-title">Λέξεις στον τίτλο</Label>
              <Input
                id="ted-title"
                value={tedQuery}
                onChange={(e) => setTedQuery(e.target.value)}
                placeholder="π.χ. φόρτιση, απορρίμματα"
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleTedSearch();
                }}
                aria-label="Λέξεις στον τίτλο TED"
              />
            </div>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="ted-cpv">CPV</Label>
                <CpvCombobox
                  id="ted-cpv"
                  value={tedCpv}
                  onChange={setTedCpv}
                  suggestions={cpvSuggestions}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ted-authority">Αναθέτουσα αρχή / φορέας</Label>
                <Input
                  id="ted-authority"
                  value={tedAuthority}
                  onChange={(e) => setTedAuthority(e.target.value)}
                  placeholder="π.χ. ΔΗΜΟΣ ΑΘΗΝΑΙΩΝ"
                  aria-label="Αναθέτουσα αρχή TED"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ted-date-from">Ημερομηνία από</Label>
                <DateInput
                  id="ted-date-from"
                  value={tedDateFrom}
                  onChange={setTedDateFrom}
                  aria-label="Ημερομηνία δημοσίευσης από"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ted-date-to">Ημερομηνία έως</Label>
                <DateInput
                  id="ted-date-to"
                  value={tedDateTo}
                  onChange={setTedDateTo}
                  aria-label="Ημερομηνία δημοσίευσης έως"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={!tedEnabled || tedLoading}
                onClick={() => void handleTedSearch()}
              >
                {tedLoading ? "Αναζήτηση…" : "Αναζήτηση"}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={tedLoading}
                onClick={() => {
                  const recent = defaultRecentDates();
                  setTedQuery("");
                  setTedCpv("");
                  setTedAuthority("");
                  setTedDateFrom(recent.dateFrom);
                  setTedDateTo(recent.dateTo);
                  setTedNotices([]);
                  setTedTotal(null);
                  setTedError(null);
                }}
              >
                Καθαρισμός
              </Button>
            </div>
            {tedError ? <ErrorState description={tedError} /> : null}
            {tedEnabled && !tedLoading && !tedError && tedNotices.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Συμπληρώστε κριτήρια και πατήστε Αναζήτηση.
              </p>
            ) : null}
            {tedTotal != null && tedNotices.length > 0 ? (
              <p className="text-sm text-muted-foreground">
                {tedTotal === 1
                  ? "1 αποτέλεσμα"
                  : `${tedTotal.toLocaleString("el-GR")} αποτελέσματα`}
                {tedNotices.length < tedTotal
                  ? ` · εμφανίζονται ${tedNotices.length}`
                  : ""}
              </p>
            ) : null}
            <div className="space-y-3">
              {tedNotices.map((notice) => (
                <div
                  key={notice.publicationNumber}
                  className="rounded-md border border-border px-3 py-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <SourceBadge system="ted" />
                    <span className="font-mono text-xs text-muted-foreground">
                      TED:{notice.publicationNumber}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="mt-1 w-full text-left text-sm font-semibold leading-snug hover:underline"
                    onClick={() => void handleOpenTed(notice)}
                    disabled={tedBusy}
                    aria-label={`Άνοιγμα ${notice.title || notice.publicationNumber}`}
                  >
                    {notice.title || "—"}
                  </button>
                  <p className="text-xs text-muted-foreground">
                    {notice.buyerName || "—"}
                    {notice.publicationDate
                      ? ` · ${formatDate(notice.publicationDate)}`
                      : ""}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
                    <span>
                      Αξία:{" "}
                      {formatMoney(
                        typeof notice.estimatedValue === "number"
                          ? notice.estimatedValue
                          : null,
                      )}
                    </span>
                    {notice.deadline ? (
                      <span>Προθεσμία: {formatDate(notice.deadline)}</span>
                    ) : null}
                    {tedContractNatureLabel(notice.contractNature) ? (
                      <span>{tedContractNatureLabel(notice.contractNature)}</span>
                    ) : null}
                    {formatRegion(notice.nutsCode) ? (
                      <span>{formatRegion(notice.nutsCode)}</span>
                    ) : null}
                  </div>
                  {notice.cpvs?.length ? (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {notice.cpvs.slice(0, 4).map((code) => (
                        <Badge
                          key={code}
                          variant="outline"
                          className="max-w-full truncate font-normal"
                          title={formatCpvBadge(code)}
                        >
                          {formatCpvBadge(code)}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      disabled={tedBusy}
                      onClick={() => void handleOpenTed(notice)}
                    >
                      Άνοιγμα
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={tedBusy}
                      onClick={() => void handleFollowTed(notice)}
                    >
                      Παρακολούθηση
                    </Button>
                    <Button size="sm" variant="ghost" asChild>
                      <a href={notice.url} target="_blank" rel="noreferrer">
                        Στο TED
                      </a>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {registryTab === "kimdis" ? (
      <>
      <div className="flex gap-2">
        {(
          [
            ["REQ", "Αιτήματα"],
            ["PROC", "Προσκλήσεις / Προκηρύξεις"],
          ] as const
        ).map(([id, label]) => (
          <Button
            key={id}
            variant={draft.type === id ? "default" : "outline"}
            onClick={() => {
              setDraft((prev) => ({ ...prev, type: id }));
              setItems([]);
            }}
          >
            {label}
          </Button>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Κριτήρια αναζήτησης</CardTitle>
          <CardDescription>
            {draft.type === "REQ"
              ? "Επιλέξτε τύπο αιτήματος και συμπληρώστε τα κριτήρια αναζήτησης."
              : "Προσκλήσεις, προκηρύξεις και διακηρύξεις"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Λέξεις στον τίτλο</Label>
            <Input
              id="title"
              value={draft.q}
              onChange={(e) => setDraft((prev) => ({ ...prev, q: e.target.value }))}
              placeholder="π.χ. ιστοσελίδα"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSearchSubmit();
              }}
            />
          </div>

          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="search-cpv">CPV</Label>
              <CpvCombobox
                id="search-cpv"
                value={draft.cpv}
                onChange={(cpv) => setDraft((prev) => ({ ...prev, cpv }))}
                suggestions={cpvSuggestions}
                placeholder="########-#"
                aria-label="CPV"
              />
            </div>
            <div className="space-y-2">
              <Label>ΑΔΑΜ</Label>
              <Input
                value={draft.adam}
                onChange={(e) => setDraft((prev) => ({ ...prev, adam: e.target.value }))}
                placeholder={draft.type === "REQ" ? "26REQ…" : "26PROC…"}
                aria-label="ΑΔΑΜ"
              />
              {draftAdamParsed.status === "exact" ? (
                <p className="text-xs text-muted-foreground">{EXACT_ADAM_SEARCH_HINT_EL}</p>
              ) : draftAdamParsed.status === "invalid" ? (
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  {adamValidationMessageEl(draftAdamParsed.reason)}
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label>Κωδικός αναθέτουσας αρχής</Label>
              <Input
                value={draft.authority}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, authority: e.target.value }))
                }
                placeholder="π.χ. 100024656"
              />
            </div>
            <div className="space-y-2">
              <Label>Χαρακτήρας σύμβασης</Label>
              <Select
                value={draft.contractType}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, contractType: e.target.value }))
                }
              >
                <option value="">Όλοι</option>
                {meta
                  ? Object.entries(meta.contractTypes).map(([code, label]) => (
                      <option key={code} value={code}>
                        {label}
                      </option>
                    ))
                  : null}
              </Select>
            </div>
            {draft.type === "REQ" ? (
              <div className="space-y-2">
                <Label>Τύπος αιτήματος</Label>
                <Select
                  value={draft.requestKind}
                  disabled={draftAdamParsed.status === "exact"}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      requestKind: e.target.value as SearchFormState["requestKind"],
                    }))
                  }
                >
                  {(meta?.requestKinds?.length
                    ? meta.requestKinds
                    : [
                        { id: "any", label: "Όλοι οι τύποι αιτημάτων" },
                        { id: "initial", label: "Πρωτογενή" },
                        { id: "approved", label: "Εγκεκριμένα" },
                        { id: "approval", label: "Εγκρίσεις" },
                      ]
                  ).map((kind) => (
                    <option key={kind.id} value={kind.id}>
                      {kind.label}
                    </option>
                  ))}
                </Select>
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Διαδικασία ανάθεσης</Label>
                <Select
                  value={draft.procedureType}
                  onChange={(e) =>
                    setDraft((prev) => ({ ...prev, procedureType: e.target.value }))
                  }
                >
                  <option value="">Όλες</option>
                  {meta
                    ? Object.entries(meta.procedureTypes).map(([code, label]) => (
                        <option key={code} value={code}>
                          {label}
                        </option>
                      ))
                    : null}
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label>Ημερομηνία καταχώρισης από</Label>
              <DateInput
                disabled={draft.allHistory}
                value={draft.dateFrom}
                onChange={(dateFrom) =>
                  setDraft((prev) => ({
                    ...prev,
                    allHistory: false,
                    dateFrom,
                  }))
                }
                aria-label="Ημερομηνία καταχώρισης από"
              />
            </div>
            <div className="space-y-2">
              <Label>Ημερομηνία καταχώρισης έως</Label>
              <DateInput
                disabled={draft.allHistory}
                value={draft.dateTo}
                onChange={(dateTo) =>
                  setDraft((prev) => ({
                    ...prev,
                    allHistory: false,
                    dateTo,
                  }))
                }
                aria-label="Ημερομηνία καταχώρισης έως"
              />
            </div>
            <div className="flex items-end pb-2 md:col-span-2 lg:col-span-3">
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={draft.allHistory}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setDraft((prev) => {
                      if (checked) {
                        return { ...prev, allHistory: true, dateFrom: "", dateTo: "" };
                      }
                      const recent = defaultRecentDates();
                      return {
                        ...prev,
                        allHistory: false,
                        dateFrom: recent.dateFrom,
                        dateTo: recent.dateTo,
                      };
                    });
                  }}
                />
                Αναζήτηση σε όλες τις ημερομηνίες
              </label>
              {draft.allHistory ? (
                <p className="text-xs text-muted-foreground md:col-span-2 lg:col-span-3">
                  Η αναζήτηση μπορεί να εμφανίσει μεγάλο αριθμό αποτελεσμάτων.
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label>Ελάχιστο ποσό (€)</Label>
              <Input
                type="number"
                value={draft.amountMin}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, amountMin: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Μέγιστο ποσό (€)</Label>
              <Input
                type="number"
                value={draft.amountMax}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, amountMax: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2 md:col-span-2 lg:col-span-3">
              <Label>Περιφέρειες</Label>
              <p className="text-xs text-muted-foreground">
                Καμία επιλογή = όλη η Ελλάδα. Ταίριασμα μόνο από επίσημο πεδίο NUTS του ΚΗΜΔΗΣ.
              </p>
              <div className="grid max-h-40 grid-cols-1 gap-1.5 overflow-y-auto rounded-md border border-border px-3 py-2 sm:grid-cols-2 lg:grid-cols-3">
                {GREEK_NUTS2_REGIONS.map((region) => {
                  const selected = draft.regions.includes(region.code);
                  return (
                    <label
                      key={region.code}
                      className="flex cursor-pointer items-center gap-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5"
                        checked={selected}
                        onChange={() => {
                          setDraft((prev) => {
                            const next = selected
                              ? prev.regions.filter((code) => code !== region.code)
                              : [...prev.regions, region.code];
                            return {
                              ...prev,
                              regions: next,
                              includeUnclassifiedRegion:
                                next.length === 0 ? false : prev.includeUnclassifiedRegion,
                            };
                          });
                        }}
                        aria-label={region.label}
                      />
                      <span>{region.label}</span>
                    </label>
                  );
                })}
              </div>
              {draft.regions.length > 0 ? (
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={draft.includeUnclassifiedRegion}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        includeUnclassifiedRegion: e.target.checked,
                      }))
                    }
                    aria-label="Συμπερίληψη χωρίς δηλωμένη περιοχή"
                  />
                  Συμπερίληψη δημοσιεύσεων χωρίς δηλωμένη περιοχή
                </label>
              ) : null}
            </div>
          </div>

          <Button variant="ghost" size="sm" onClick={() => setShowAdvanced((v) => !v)}>
            {showAdvanced ? "Λιγότερα φίλτρα" : "Περισσότερα φίλτρα"}
          </Button>

          {showAdvanced ? (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-2">
                <Label>Κωδικός αποφαινόμενου οργάνου</Label>
                <Input
                  value={draft.signer}
                  onChange={(e) =>
                    setDraft((prev) => ({ ...prev, signer: e.target.value }))
                  }
                />
              </div>
              {draft.type === "PROC" ? (
                <>
                  <div className="space-y-2">
                    <Label>Προθεσμία υποβολής από</Label>
                    <DateInput
                      value={draft.finalFrom}
                      onChange={(finalFrom) =>
                        setDraft((prev) => ({ ...prev, finalFrom }))
                      }
                      aria-label="Προθεσμία υποβολής από"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Προθεσμία υποβολής έως</Label>
                    <DateInput
                      value={draft.finalTo}
                      onChange={(finalTo) =>
                        setDraft((prev) => ({ ...prev, finalTo }))
                      }
                      aria-label="Προθεσμία υποβολής έως"
                    />
                  </div>
                </>
              ) : null}
            </div>
          ) : null}

          {filtersDirty ? (
            <p className="text-sm text-amber-700 dark:text-amber-400" role="status">
              Έχετε αλλάξει τα φίλτρα. Πατήστε «Αναζήτηση» για ενημέρωση των αποτελεσμάτων.
            </p>
          ) : null}

          <Button onClick={handleSearchSubmit} disabled={loading}>
            {loading ? "Αναζήτηση…" : "Αναζήτηση"}
          </Button>
        </CardContent>
      </Card>

      {error ? (
        <ErrorState description={error} onRetry={() => commitSearch(urlState)} />
      ) : null}

      {loading && !items.length ? <PageSkeleton /> : null}

      {urlState.run && !error ? (
        <div className="space-y-3">
          <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
            Ενεργά κριτήρια: {activeCriteriaSummary(urlState, meta?.requestKinds)}
            {appliedAdamParsed.status === "exact" || searchMeta?.mode === "exact_adam" ? (
              <span className="mt-1 block">{EXACT_ADAM_SEARCH_HINT_EL}</span>
            ) : null}
            {urlState.allHistory && searchMeta?.mode !== "exact_adam" ? (
              <span className="mt-1 block text-amber-700 dark:text-amber-400">
                Προσοχή: η αναζήτηση καλύπτει όλο το ιστορικό — προτιμήστε φίλτρο ημερομηνιών
                όταν είναι δυνατό.
              </span>
            ) : null}
            {searchMeta?.regionFilter?.partial ? (
              <span className="mt-1 block text-amber-700 dark:text-amber-400">
                Μερική γεωγραφική κάλυψη: σαρώθηκαν{" "}
                {searchMeta.regionFilter.scannedUpstreamPages} σελίδες ΚΗΜΔΗΣ. Το πλήθος μπορεί να
                μην είναι πλήρες — συνεχίστε στις επόμενες σελίδες αποτελεσμάτων.
              </span>
            ) : null}
            {urlState.sort === "date_asc" &&
            totalElements > 0 &&
            items.length > 0 &&
            items.length < totalElements ? (
              <span className="mt-1 block text-amber-700 dark:text-amber-400">
                Η ταξινόμηση «Παλαιότερα πρώτα» εφαρμόζεται αξιόπιστα μόνο όταν όλα τα αποτελέσματα
                χωρούν σε μία σελίδα. Εδώ υπάρχουν {totalPages} σελίδες — η σειρά μεταξύ σελίδων δεν
                είναι εγγυημένη από το ΚΗΜΔΗΣ.
              </span>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-muted-foreground">
              {searchMeta?.regionFilter?.partial
                ? `Τουλάχιστον ${totalElements} αποτελέσματα στην επιλεγμένη περιοχή`
                : totalElements === 1
                  ? "1 αποτέλεσμα"
                  : `${totalElements} αποτελέσματα`}
              {totalPages ? ` · σελίδα ${currentPage} από ${totalPages}` : ""}
              {items.length > 0
                ? ` · ${items.length} ανά σελίδα`
                : ` · έως ${KIMDIS_PAGE_SIZE} ανά σελίδα`}
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="sort" className="text-xs text-muted-foreground">
                Ταξινόμηση
              </Label>
              <Select
                id="sort"
                value={urlState.sort}
                onChange={(e) =>
                  handleSortChange(e.target.value as "date_desc" | "date_asc")
                }
                className="w-48"
              >
                <option value="date_desc">Πιο πρόσφατες πρώτα</option>
                <option value="date_asc">Παλαιότερα πρώτα</option>
              </Select>
            </div>
          </div>

          {!loading && items.length === 0 ? (
            <EmptyState
              title={
                searchMeta?.mode === "exact_adam" && searchMeta.exactAdamFound === false
                  ? "Ο ΑΔΑΜ δεν βρέθηκε στην πηγή"
                  : searchMeta?.regionFilter?.applied &&
                      searchMeta.regionFilter.matchedSoFar === 0 &&
                      searchMeta.regionFilter.partial
                    ? "Δεν βρέθηκαν αντιστοιχίες στην σάρωση"
                    : "Δεν βρέθηκαν αποτελέσματα"
              }
              description={
                searchMeta?.mode === "exact_adam" &&
                searchMeta.exactAdamFound === false &&
                searchMeta.exactAdam
                  ? `Δεν βρέθηκε η πράξη με ΑΔΑΜ ${searchMeta.exactAdam} στην πηγή αναζήτησης.`
                  : searchMeta?.regionFilter?.applied &&
                      searchMeta.regionFilter.matchedSoFar === 0 &&
                      searchMeta.regionFilter.partial
                    ? "Στις πρώτες σελίδες του ΚΗΜΔΗΣ δεν υπήρχαν πράξεις στις επιλεγμένες περιφέρειες. Συνεχίστε στην επόμενη σελίδα αποτελεσμάτων ή διευρύνετε τα κριτήρια."
                    : "Δοκιμάστε διαφορετικά κριτήρια ή ευρύτερο διάστημα ημερομηνιών."
              }
            />
          ) : (
            items.map((item) => (
              <Card key={item.adam}>
                <CardContent className="flex flex-col gap-3 px-4 py-4 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={item.recordType === "REQ" ? "secondary" : "default"}>
                        {item.recordType}
                      </Badge>
                      {item.recordType === "PROC" ? (
                        <Badge
                          variant={
                            item.openState === "OPEN"
                              ? "success"
                              : item.openState === "CLOSED" ||
                                  item.openState === "CANCELLED"
                                ? "outline"
                                : "secondary"
                          }
                        >
                          {item.openState === "OPEN"
                            ? "Ανοιχτή υποβολή"
                            : item.openState === "CLOSED"
                              ? "Κλειστή υποβολή"
                              : item.openState === "CANCELLED"
                                ? "Ματαίωση"
                                : "Άγνωστη κατάσταση"}
                        </Badge>
                      ) : null}
                      <span className="font-mono text-xs text-muted-foreground">
                        {item.adam}
                      </span>
                    </div>
                    <h3 className="text-base font-semibold leading-snug">
                      {item.title || "—"}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {item.contractingAuthority || "—"}
                    </p>
                    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                      <span>Αξία: {formatMoney(item.budgetWithoutVat)}</span>
                      <span>
                        Καταχώριση: {formatDate(item.submissionDate || item.signedDate)}
                      </span>
                      {item.finalSubmissionDate ? (
                        <span>Προθεσμία υποβολής: {formatDate(item.finalSubmissionDate)}</span>
                      ) : null}
                      {item.contractTypeLabel ? <span>{item.contractTypeLabel}</span> : null}
                    </div>
                    {item.cpvs.length ? (
                      <div className="flex flex-wrap gap-1">
                        {item.cpvs.slice(0, 4).map((code) => (
                          <Badge key={code} variant="outline" className="font-mono">
                            {code}
                          </Badge>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <PdfAction onClick={() => setSelected(item)} />
                    <Button size="sm" variant="outline" asChild>
                      <Link
                        to={`/app/tenders/${item.recordType}/${encodeURIComponent(item.adam)}`}
                      >
                        Προβολή λεπτομερειών
                      </Link>
                    </Button>
                    <Button size="sm" onClick={() => void handleFollow(item)}>
                      Παρακολούθηση
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}

          <Pagination
            page={currentPage}
            totalPages={totalPages}
            total={totalElements > 0 ? totalElements : undefined}
            pageSize={items.length > 0 ? items.length : KIMDIS_PAGE_SIZE}
            onPageChange={handlePageChange}
            disabled={loading}
            hasNext={!last}
          />
        </div>
      ) : null}

      <PdfPreviewModal
        open={Boolean(selected)}
        onOpenChange={(open) => !open && setSelected(null)}
        organizationId={activeOrganization.id}
        recordType={selected?.recordType ?? "REQ"}
        adam={selected?.adam ?? ""}
        title={selected?.title}
        officialUrl={selected?.publicKimdisUrl}
        actions={
          selected ? (
            <Button size="sm" variant="outline" asChild>
              <Link
                to={`/app/tenders/${selected.recordType}/${encodeURIComponent(selected.adam)}`}
                onClick={() => setSelected(null)}
              >
                Άνοιγμα σελίδας πράξης
              </Link>
            </Button>
          ) : null
        }
      />
      </>
      ) : null}

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Αποθήκευση αναζήτησης</DialogTitle>
            <DialogDescription>
              Δημιουργεί αποθηκευμένη αναζήτηση και ξεκινά αρχικό έλεγχο (~30 ημερών) για Ευκαιρίες.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="save-name">Όνομα</Label>
              <Input
                id="save-name"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
              />
            </div>
            {similarProfiles.length ? (
              <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
                <p className="font-medium">Υπάρχει ήδη παρόμοια αποθηκευμένη αναζήτηση.</p>
                <ul className="mt-1 list-inside list-disc text-muted-foreground">
                  {similarProfiles.map((p) => (
                    <li key={p.id}>
                      <Link className="underline" to="/app/saved-searches">
                        {p.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" onClick={() => setSaveOpen(false)}>
                Ακύρωση
              </Button>
              {similarProfiles.length ? (
                <Button
                  variant="secondary"
                  disabled={saving}
                  onClick={() => void handleSaveSearch(true)}
                >
                  Δημιουργία οπωσδήποτε
                </Button>
              ) : null}
              <Button
                disabled={saving || !saveName.trim()}
                onClick={() => void handleSaveSearch(false)}
              >
                {saving ? "Αποθήκευση…" : "Αποθήκευση"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
