import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useSessionContext } from "@/auth/SessionProvider";
import { CpvCombobox } from "@/components/CpvCombobox";
import { PdfAction } from "@/components/PdfAction";
import { RegionPicker } from "@/components/RegionPicker";
import { InvitationIssuedBadge } from "@/components/InvitationIssuedBadge";
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
import { DataList, DataRow } from "@/components/ui/data-row";
import { PageHeader } from "@/components/ui/page-header";
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
import { cn } from "@/lib/utils";

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

/** Number of active filters that live behind "Περισσότερα φίλτρα". */
const countAdvancedFilters = (state: SearchFormState): number =>
  [
    state.adam.trim(),
    state.cpv.trim(),
    state.authority.trim(),
    state.contractType,
    state.type === "REQ" && state.requestKind !== "any" ? state.requestKind : "",
    state.type === "PROC" ? state.procedureType : "",
    state.amountMin,
    state.amountMax,
    state.signer.trim(),
    state.type === "PROC" ? state.finalFrom : "",
    state.type === "PROC" ? state.finalTo : "",
  ].filter(Boolean).length;

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
  const [showAdvanced, setShowAdvanced] = useState(() => countAdvancedFilters(urlState) > 0);
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
    // A full ADAM typed in the main field is promoted to the ADAM filter.
    const titleAdam = parseKimdisAdamInput(draft.q);
    const submitDraft: SearchFormState =
      !draft.adam.trim() && titleAdam.status === "exact"
        ? { ...draft, q: "", adam: titleAdam.adam }
        : draft;
    const adamParsed = parseKimdisAdamInput(submitDraft.adam);
    if (adamParsed.status === "invalid") {
      toast.error(adamValidationMessageEl(adamParsed.reason));
      return;
    }
    if (
      adamParsed.status === "exact" &&
      (adamParsed.recordType === "REQ" || adamParsed.recordType === "PROC") &&
      adamParsed.recordType !== submitDraft.type
    ) {
      toast.error(adamValidationMessageEl(`adam_family_mismatch:expected_${adamParsed.recordType}_got_${submitDraft.type}`));
      return;
    }
    commitSearch({ ...submitDraft, page: 1, run: true });
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
  const advancedFilterCount = countAdvancedFilters(draft);
  const isExactAdamDraft = draftAdamParsed.status === "exact";
  const titleLooksLikeAdam =
    !draft.adam.trim() && parseKimdisAdamInput(draft.q).status === "exact";

  const handleTypeChange = (type: SearchFormState["type"]) => {
    setDraft((prev) => ({ ...prev, type }));
    setItems([]);
  };

  const handleToggleAllHistory = (checked: boolean) => {
    setDraft((prev) => {
      if (checked) return { ...prev, allHistory: true, dateFrom: "", dateTo: "" };
      const recent = defaultRecentDates();
      return {
        ...prev,
        allHistory: false,
        dateFrom: recent.dateFrom,
        dateTo: recent.dateTo,
      };
    });
  };

  const handleResetTed = () => {
    const recent = defaultRecentDates();
    setTedQuery("");
    setTedCpv("");
    setTedAuthority("");
    setTedDateFrom(recent.dateFrom);
    setTedDateTo(recent.dateTo);
    setTedNotices([]);
    setTedTotal(null);
    setTedError(null);
  };

  const registryTabs = (
    <div
      role="tablist"
      aria-label="Πηγή αναζήτησης"
      className="flex gap-4 border-b border-border/60"
    >
      {(
        [
          ["kimdis", "ΚΗΜΔΗΣ"],
          ["ted", "TED"],
        ] as const
      ).map(([id, label]) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={registryTab === id}
          tabIndex={0}
          onClick={() => setRegistryTab(id)}
          className={cn(
            "-mb-px border-b-2 px-1 pb-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            registryTab === id
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Αναζήτηση"
        description="Χειροκίνητη αναζήτηση σε ΚΗΜΔΗΣ ή TED. Για αυτόματη εύρεση, αποθηκεύστε τα κριτήρια ως αποθηκευμένη αναζήτηση."
        actions={
          registryTab === "kimdis" ? (
            <Button
              variant="outline"
              onClick={() => void handleOpenSave()}
              disabled={!urlState.run}
            >
              Αποθήκευση αναζήτησης
            </Button>
          ) : null
        }
      />

      {registryTabs}

      {registryTab === "ted" ? (
        <section className="space-y-4" aria-label="Αναζήτηση TED">
          <p className="text-sm text-muted-foreground">
            Ευρωπαϊκές προκηρύξεις για την Ελλάδα από το TED <SourceBadge system="ted" />. Τα
            αποτελέσματα δεν προστίθενται αυτόματα στις Ευκαιρίες — χρησιμοποιήστε
            Παρακολούθηση ή αποθηκευμένη αναζήτηση με πηγή TED.
          </p>
          {!tedEnabled ? (
            <p className="text-sm text-amber-700 dark:text-amber-400">
              Η αναζήτηση TED δεν είναι διαθέσιμη προς το παρόν. Μπορείτε να
              συνεχίσετε με το ΚΗΜΔΗΣ.
            </p>
          ) : null}
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              id="ted-title"
              value={tedQuery}
              onChange={(e) => setTedQuery(e.target.value)}
              placeholder="Αναζήτηση λέξεων στον τίτλο, π.χ. φόρτιση, απορρίμματα…"
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleTedSearch();
              }}
              aria-label="Λέξεις στον τίτλο TED"
              className="h-12 pl-11 text-base"
            />
          </div>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1fr_auto] lg:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="ted-cpv" className="text-xs text-muted-foreground">
                CPV
              </Label>
              <CpvCombobox
                id="ted-cpv"
                value={tedCpv}
                onChange={setTedCpv}
                suggestions={cpvSuggestions}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ted-authority" className="text-xs text-muted-foreground">
                Αναθέτουσα αρχή / φορέας
              </Label>
              <Input
                id="ted-authority"
                value={tedAuthority}
                onChange={(e) => setTedAuthority(e.target.value)}
                placeholder="π.χ. ΔΗΜΟΣ ΑΘΗΝΑΙΩΝ"
                aria-label="Αναθέτουσα αρχή TED"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ted-date-from" className="text-xs text-muted-foreground">
                Ημερομηνία από
              </Label>
              <DateInput
                id="ted-date-from"
                value={tedDateFrom}
                onChange={setTedDateFrom}
                aria-label="Ημερομηνία δημοσίευσης από"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ted-date-to" className="text-xs text-muted-foreground">
                Ημερομηνία έως
              </Label>
              <DateInput
                id="ted-date-to"
                value={tedDateTo}
                onChange={setTedDateTo}
                aria-label="Ημερομηνία δημοσίευσης έως"
              />
            </div>
            <div className="flex gap-2">
              <Button
                disabled={!tedEnabled || tedLoading}
                onClick={() => void handleTedSearch()}
              >
                {tedLoading ? "Αναζήτηση…" : "Αναζήτηση"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={tedLoading}
                onClick={handleResetTed}
              >
                Καθαρισμός
              </Button>
            </div>
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
          <DataList>
            {tedNotices.map((notice) => {
              const natureLabel = tedContractNatureLabel(notice.contractNature);
              const metaLine = [
                notice.buyerName || "—",
                formatMoney(
                  typeof notice.estimatedValue === "number"
                    ? notice.estimatedValue
                    : null,
                ),
                notice.publicationDate ? formatDate(notice.publicationDate) : null,
                notice.deadline ? `Προθεσμία ${formatDate(notice.deadline)}` : null,
                natureLabel,
                formatRegion(notice.nutsCode),
              ]
                .filter(Boolean)
                .join(" · ");
              return (
                <DataRow
                  key={notice.publicationNumber}
                  interactive
                  className="gap-2 py-3 sm:gap-4"
                  actions={
                    <div className="flex flex-col gap-1.5 sm:items-end">
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          size="sm"
                          disabled={tedBusy}
                          onClick={() => void handleFollowTed(notice)}
                        >
                          Παρακολούθηση
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={tedBusy}
                          onClick={() => void handleOpenTed(notice)}
                        >
                          Προβολή
                        </Button>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        asChild
                        className="h-7 px-2 text-muted-foreground hover:text-foreground"
                      >
                        <a href={notice.url} target="_blank" rel="noreferrer">
                          Στο TED
                        </a>
                      </Button>
                    </div>
                  }
                >
                  <div className="space-y-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                      <SourceBadge system="ted" />
                      <h3 className="min-w-0 text-sm font-semibold leading-snug">
                        <button
                          type="button"
                          className="text-left hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          onClick={() => void handleOpenTed(notice)}
                          disabled={tedBusy}
                          aria-label={`Άνοιγμα ${notice.title || notice.publicationNumber}`}
                        >
                          {notice.title || "—"}
                        </button>
                      </h3>
                    </div>
                    <p className="text-xs text-muted-foreground">{metaLine}</p>
                    <p className="text-xs text-muted-foreground">
                      <span className="font-mono">TED:{notice.publicationNumber}</span>
                      {notice.cpvs?.length
                        ? ` · ${notice.cpvs.slice(0, 3).map(formatCpvBadge).join(" · ")}`
                        : ""}
                    </p>
                  </div>
                </DataRow>
              );
            })}
          </DataList>
        </section>
      ) : null}

      {registryTab === "kimdis" ? (
        <>
          <section className="space-y-4" aria-label="Κριτήρια αναζήτησης ΚΗΜΔΗΣ">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                id="title"
                value={draft.q}
                onChange={(e) => setDraft((prev) => ({ ...prev, q: e.target.value }))}
                placeholder="Αναζήτηση τίτλου, ΑΔΑΜ, φορέα…"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSearchSubmit();
                }}
                aria-label="Αναζήτηση τίτλου, ΑΔΑΜ, φορέα"
                className="h-12 pl-11 text-base"
              />
            </div>
            {titleLooksLikeAdam ? (
              <p className="text-xs text-muted-foreground">{EXACT_ADAM_SEARCH_HINT_EL}</p>
            ) : null}

            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-[11rem_minmax(0,1fr)_14rem_auto] lg:items-end">
              <div className="space-y-1.5">
                <Label htmlFor="search-type" className="text-xs text-muted-foreground">
                  Τύπος
                </Label>
                <Select
                  id="search-type"
                  value={draft.type}
                  onChange={(e) =>
                    handleTypeChange(e.target.value === "PROC" ? "PROC" : "REQ")
                  }
                >
                  <option value="REQ">Αιτήματα</option>
                  <option value="PROC">Προσκλήσεις / Προκηρύξεις</option>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">
                  Ημερομηνία καταχώρισης
                </Label>
                <div className="grid grid-cols-2 gap-2">
                  <DateInput
                    disabled={draft.allHistory}
                    value={draft.dateFrom}
                    onChange={(dateFrom) =>
                      setDraft((prev) => ({ ...prev, allHistory: false, dateFrom }))
                    }
                    aria-label="Ημερομηνία καταχώρισης από"
                  />
                  <DateInput
                    disabled={draft.allHistory}
                    value={draft.dateTo}
                    onChange={(dateTo) =>
                      setDraft((prev) => ({ ...prev, allHistory: false, dateTo }))
                    }
                    aria-label="Ημερομηνία καταχώρισης έως"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="search-region" className="text-xs text-muted-foreground">
                  Περιοχή
                </Label>
                <RegionPicker
                  id="search-region"
                  regions={draft.regions}
                  includeUnclassified={draft.includeUnclassifiedRegion}
                  onChange={({ regions, includeUnclassified }) =>
                    setDraft((prev) => ({
                      ...prev,
                      regions,
                      includeUnclassifiedRegion: includeUnclassified,
                    }))
                  }
                />
              </div>
              <Button onClick={handleSearchSubmit} disabled={loading} className="md:col-span-2 lg:col-span-1">
                {loading ? "Αναζήτηση…" : "Αναζήτηση"}
              </Button>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  className="accent-[var(--arc-primary)]"
                  checked={draft.allHistory}
                  onChange={(e) => handleToggleAllHistory(e.target.checked)}
                />
                Αναζήτηση σε όλες τις ημερομηνίες
              </label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-expanded={showAdvanced}
                aria-controls="search-advanced-filters"
                onClick={() => setShowAdvanced((v) => !v)}
              >
                {showAdvanced ? "Λιγότερα φίλτρα" : "Περισσότερα φίλτρα"}
                {advancedFilterCount > 0 ? ` (${advancedFilterCount})` : ""}
                <ChevronDown
                  className={cn("transition-transform", showAdvanced && "rotate-180")}
                  aria-hidden
                />
              </Button>
            </div>
            {draft.allHistory ? (
              <p className="text-xs text-muted-foreground">
                Η αναζήτηση μπορεί να εμφανίσει μεγάλο αριθμό αποτελεσμάτων.
              </p>
            ) : null}

            {showAdvanced ? (
              <div
                id="search-advanced-filters"
                className="grid gap-3 border-t border-border/60 pt-4 md:grid-cols-2 lg:grid-cols-3"
              >
                <div className="space-y-1.5">
                  <Label htmlFor="search-adam" className="text-xs text-muted-foreground">
                    ΑΔΑΜ
                  </Label>
                  <Input
                    id="search-adam"
                    value={draft.adam}
                    onChange={(e) => setDraft((prev) => ({ ...prev, adam: e.target.value }))}
                    placeholder={draft.type === "REQ" ? "26REQ…" : "26PROC…"}
                    aria-label="ΑΔΑΜ"
                  />
                  {draftAdamParsed.status === "exact" ? (
                    <p className="text-xs text-muted-foreground">
                      {EXACT_ADAM_SEARCH_HINT_EL}
                    </p>
                  ) : draftAdamParsed.status === "invalid" ? (
                    <p className="text-xs text-amber-700 dark:text-amber-400">
                      {adamValidationMessageEl(draftAdamParsed.reason)}
                    </p>
                  ) : null}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="search-cpv" className="text-xs text-muted-foreground">
                    CPV
                  </Label>
                  <CpvCombobox
                    id="search-cpv"
                    value={draft.cpv}
                    onChange={(cpv) => setDraft((prev) => ({ ...prev, cpv }))}
                    suggestions={cpvSuggestions}
                    placeholder="########-#"
                    aria-label="CPV"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="search-authority" className="text-xs text-muted-foreground">
                    Κωδικός αναθέτουσας αρχής
                  </Label>
                  <Input
                    id="search-authority"
                    value={draft.authority}
                    onChange={(e) =>
                      setDraft((prev) => ({ ...prev, authority: e.target.value }))
                    }
                    placeholder="π.χ. 100024656"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="search-contract-type" className="text-xs text-muted-foreground">
                    Χαρακτήρας σύμβασης
                  </Label>
                  <Select
                    id="search-contract-type"
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
                  <div className="space-y-1.5">
                    <Label htmlFor="search-request-kind" className="text-xs text-muted-foreground">
                      Τύπος αιτήματος
                    </Label>
                    <Select
                      id="search-request-kind"
                      value={draft.requestKind}
                      disabled={isExactAdamDraft}
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
                  <div className="space-y-1.5">
                    <Label htmlFor="search-procedure-type" className="text-xs text-muted-foreground">
                      Διαδικασία ανάθεσης
                    </Label>
                    <Select
                      id="search-procedure-type"
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
                <div className="space-y-1.5">
                  <Label htmlFor="search-amount-min" className="text-xs text-muted-foreground">
                    Ελάχιστο ποσό (€)
                  </Label>
                  <Input
                    id="search-amount-min"
                    type="number"
                    value={draft.amountMin}
                    onChange={(e) =>
                      setDraft((prev) => ({ ...prev, amountMin: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="search-amount-max" className="text-xs text-muted-foreground">
                    Μέγιστο ποσό (€)
                  </Label>
                  <Input
                    id="search-amount-max"
                    type="number"
                    value={draft.amountMax}
                    onChange={(e) =>
                      setDraft((prev) => ({ ...prev, amountMax: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="search-signer" className="text-xs text-muted-foreground">
                    Κωδικός αποφαινόμενου οργάνου
                  </Label>
                  <Input
                    id="search-signer"
                    value={draft.signer}
                    onChange={(e) =>
                      setDraft((prev) => ({ ...prev, signer: e.target.value }))
                    }
                  />
                </div>
                {draft.type === "PROC" ? (
                  <>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">
                        Προθεσμία υποβολής από
                      </Label>
                      <DateInput
                        value={draft.finalFrom}
                        onChange={(finalFrom) =>
                          setDraft((prev) => ({ ...prev, finalFrom }))
                        }
                        aria-label="Προθεσμία υποβολής από"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">
                        Προθεσμία υποβολής έως
                      </Label>
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

            {!showAdvanced && draftAdamParsed.status === "invalid" ? (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                {adamValidationMessageEl(draftAdamParsed.reason)}
              </p>
            ) : null}

            {filtersDirty ? (
              <p className="text-sm text-amber-700 dark:text-amber-400" role="status">
                Έχετε αλλάξει τα φίλτρα. Πατήστε «Αναζήτηση» για ενημέρωση των αποτελεσμάτων.
              </p>
            ) : null}
          </section>

          {error ? (
            <ErrorState description={error} onRetry={() => commitSearch(urlState)} />
          ) : null}

          {loading && !items.length ? <PageSkeleton /> : null}

          {urlState.run && !error ? (
            <section className="space-y-3" aria-label="Αποτελέσματα αναζήτησης">
              <div className="space-y-1 text-xs text-muted-foreground">
                <p>
                  Ενεργά κριτήρια: {activeCriteriaSummary(urlState, meta?.requestKinds)}
                </p>
                {appliedAdamParsed.status === "exact" ||
                searchMeta?.mode === "exact_adam" ? (
                  <p>{EXACT_ADAM_SEARCH_HINT_EL}</p>
                ) : null}
                {urlState.allHistory && searchMeta?.mode !== "exact_adam" ? (
                  <p className="text-amber-700 dark:text-amber-400">
                    Προσοχή: η αναζήτηση καλύπτει όλο το ιστορικό — προτιμήστε φίλτρο
                    ημερομηνιών όταν είναι δυνατό.
                  </p>
                ) : null}
                {searchMeta?.regionFilter?.partial ? (
                  <p className="text-amber-700 dark:text-amber-400">
                    Μερική γεωγραφική κάλυψη: σαρώθηκαν{" "}
                    {searchMeta.regionFilter.scannedUpstreamPages} σελίδες ΚΗΜΔΗΣ. Το πλήθος
                    μπορεί να μην είναι πλήρες — συνεχίστε στις επόμενες σελίδες αποτελεσμάτων.
                  </p>
                ) : null}
                {urlState.sort === "date_asc" &&
                totalElements > 0 &&
                items.length > 0 &&
                items.length < totalElements ? (
                  <p className="text-amber-700 dark:text-amber-400">
                    Η ταξινόμηση «Παλαιότερα πρώτα» εφαρμόζεται αξιόπιστα μόνο όταν όλα τα
                    αποτελέσματα χωρούν σε μία σελίδα. Εδώ υπάρχουν {totalPages} σελίδες — η
                    σειρά μεταξύ σελίδων δεν είναι εγγυημένη από το ΚΗΜΔΗΣ.
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3">
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
                <DataList>
                  {items.map((item) => {
                    const detailPath = `/app/tenders/${item.recordType}/${encodeURIComponent(item.adam)}`;
                    const metaLine = [
                      item.contractingAuthority || "—",
                      formatMoney(item.budgetWithoutVat),
                      formatDate(item.submissionDate || item.signedDate),
                      item.finalSubmissionDate
                        ? `Προθεσμία ${formatDate(item.finalSubmissionDate)}`
                        : null,
                      item.contractTypeLabel,
                    ]
                      .filter(Boolean)
                      .join(" · ");
                    return (
                      <DataRow
                        key={item.adam}
                        interactive
                        className={cn(
                          "gap-2 py-3 sm:gap-4",
                          item.invitationIssued &&
                            "-ml-3 border-l-2 border-l-destructive/60 pl-[0.625rem]",
                        )}
                        actions={
                          <div className="flex flex-col gap-1.5 sm:items-end">
                            <div className="flex flex-wrap items-center gap-2">
                              <Button size="sm" onClick={() => void handleFollow(item)}>
                                Παρακολούθηση
                              </Button>
                              <Button size="sm" variant="outline" asChild>
                                <Link to={detailPath}>Προβολή</Link>
                              </Button>
                            </div>
                            <PdfAction
                              className="h-7 border-transparent bg-transparent px-2 text-xs font-medium text-muted-foreground shadow-none hover:text-foreground"
                              onClick={() => setSelected(item)}
                            />
                          </div>
                        }
                      >
                        <div className="space-y-1">
                          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                            <Badge variant="outline">{item.recordType}</Badge>
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
                            {item.invitationIssued ? (
                              <InvitationIssuedBadge relatedProcAdam={item.relatedProcAdam} />
                            ) : null}
                            <h3 className="min-w-0 text-sm font-semibold leading-snug">
                              <Link
                                to={detailPath}
                                className="hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              >
                                {item.title || "—"}
                              </Link>
                            </h3>
                          </div>
                          <p className="text-xs text-muted-foreground">{metaLine}</p>
                          <p className="text-xs text-muted-foreground">
                            <span className="font-mono">{item.adam}</span>
                            {item.cpvs.length ? (
                              <span className="font-mono" title={item.cpvs.join(", ")}>
                                {` · CPV ${item.cpvs.slice(0, 3).join(" · ")}`}
                                {item.cpvs.length > 3 ? ` +${item.cpvs.length - 3}` : ""}
                              </span>
                            ) : null}
                          </p>
                        </div>
                      </DataRow>
                    );
                  })}
                </DataList>
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
            </section>
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
