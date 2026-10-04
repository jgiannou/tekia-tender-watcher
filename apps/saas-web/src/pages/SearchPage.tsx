import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Eye } from "lucide-react";
import { toast } from "sonner";
import { useSessionContext } from "@/auth/SessionProvider";
import { IconAction } from "@/components/IconAction";
import { Pagination } from "@/components/Pagination";
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
  type KimdisSearchFilters,
  type KimdisSearchItem,
  type WatchProfileInput,
} from "@/lib/api";

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
  requestKind: "initial" | "approved" | "approval";
  procedureType: string;
  dateFrom: string;
  dateTo: string;
  allHistory: boolean;
  amountMin: string;
  amountMax: string;
  finalFrom: string;
  finalTo: string;
  signer: string;
  sort: "date_desc" | "date_asc";
  page: number;
  run: boolean;
};

const parseState = (params: URLSearchParams): SearchFormState => {
  const requestKindRaw = params.get("requestKind");
  const requestKind: SearchFormState["requestKind"] =
    requestKindRaw === "approved" || requestKindRaw === "approval"
      ? requestKindRaw
      : "initial";
  const allHistory = params.get("allHistory") === "1";
  const recent = defaultRecentDates();
  const hasExplicitDates = Boolean(params.get("dateFrom") || params.get("dateTo"));
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
    sort: params.get("sort") === "date_asc" ? "date_asc" : "date_desc",
    page: Math.max(1, Number(params.get("page") ?? "1") || 1),
    run: params.get("run") === "1",
  };
};

const toSearchParams = (state: SearchFormState): URLSearchParams => {
  const params = new URLSearchParams();
  params.set("type", state.type);
  if (state.q.trim()) params.set("q", state.q.trim());
  if (state.adam.trim()) params.set("adam", state.adam.trim());
  if (state.cpv.trim()) params.set("cpv", state.cpv.trim());
  if (state.authority.trim()) params.set("authority", state.authority.trim());
  if (state.contractType) params.set("contractType", state.contractType);
  if (state.type === "REQ" && state.requestKind !== "initial") {
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
  if (state.sort !== "date_desc") params.set("sort", state.sort);
  if (state.page > 1) params.set("page", String(state.page));
  if (state.run) params.set("run", "1");
  return params;
};

const toApiFilters = (state: SearchFormState): KimdisSearchFilters => ({
  recordFamily: state.type,
  page: Math.max(0, state.page - 1),
  pageSize: KIMDIS_PAGE_SIZE,
  sort: state.sort,
  title: state.q.trim() || undefined,
  referenceNumber: state.adam.trim() || undefined,
  cpv: state.cpv.trim() || undefined,
  organization: state.authority.trim() || undefined,
  contractType: state.contractType || undefined,
  dateFrom: state.allHistory ? undefined : state.dateFrom || undefined,
  dateTo: state.allHistory ? undefined : state.dateTo || undefined,
  searchAllHistory: state.allHistory || undefined,
  totalCostFrom: state.amountMin ? Number(state.amountMin) : undefined,
  totalCostTo: state.amountMax ? Number(state.amountMax) : undefined,
  requestKind: state.type === "REQ" ? state.requestKind : undefined,
  procedureType: state.type === "PROC" && state.procedureType ? state.procedureType : undefined,
  finalSubmissionDateFrom: state.type === "PROC" && state.finalFrom ? state.finalFrom : undefined,
  finalSubmissionDateTo: state.type === "PROC" && state.finalTo ? state.finalTo : undefined,
  signer: state.signer.trim() || undefined,
});

const activeCriteriaSummary = (state: SearchFormState): string => {
  const parts = [
    state.type,
    state.q.trim() ? `«${state.q.trim()}»` : null,
    state.allHistory
      ? "όλο το ιστορικό"
      : state.dateFrom && state.dateTo
        ? `${state.dateFrom} – ${state.dateTo}`
        : state.dateFrom
          ? `από ${state.dateFrom}`
          : state.dateTo
            ? `έως ${state.dateTo}`
            : "τελευταίες 30 ημέρες",
    state.sort === "date_asc" ? "παλαιότερα πρώτα" : "νεότερα πρώτα",
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
  const [selected, setSelected] = useState<KimdisSearchItem | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saving, setSaving] = useState(false);
  const [similarProfiles, setSimilarProfiles] = useState<
    Array<{ id: string; name: string }>
  >([]);

  useEffect(() => {
    setDraft(urlState);
  }, [urlState]);

  useEffect(() => {
    if (!activeOrganization) return;
    void saasApi.kimdisMeta(activeOrganization.id).then(setMeta).catch(() => null);
  }, [activeOrganization?.id]);

  useEffect(() => {
    if (!activeOrganization || !urlState.run) return;
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await saasApi.kimdisSearch(
          activeOrganization.id,
          toApiFilters(urlState),
        );
        if (cancelled) return;
        setItems(result.items);
        setTotalElements(result.totalElements);
        setTotalPages(result.totalPages);
        setLast(result.last);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Αποτυχία αναζήτησης ΚΗΜΔΗΣ");
        setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [activeOrganization?.id, searchParams.toString()]);

  const commitSearch = (next: SearchFormState) => {
    setSearchParams(toSearchParams({ ...next, run: true }), { replace: false });
  };

  const handleSearchSubmit = () => {
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
    source: "SAVED_FROM_SEARCH",
    skipSimilarCheck,
  });

  const handleOpenSave = async () => {
    if (!activeOrganization) return;
    const defaultName = urlState.q.trim() || "Αναζήτηση ΚΗΜΔΗΣ";
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
      await saasApi.createWatchProfile(
        activeOrganization.id,
        buildWatchInput(saveName.trim(), skipSimilarCheck),
      );
      toast.success("Η αποθηκευμένη αναζήτηση δημιουργήθηκε. Ξεκίνησε αρχική σάρωση.");
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
      toast.success("Ο διαγωνισμός προστέθηκε στα Παρακολουθούμενα.", {
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
          <h2 className="text-2xl font-semibold tracking-tight">Αναζήτηση ΚΗΜΔΗΣ</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Χειροκίνητη εξερεύνηση. Τα αποτελέσματα δεν γίνονται αυτόματα Ευκαιρίες.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => void handleOpenSave()}
          disabled={!urlState.run}
        >
          Αποθήκευση αναζήτησης
        </Button>
      </div>

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
          <CardTitle>Κριτήρια</CardTitle>
          <CardDescription>
            {draft.type === "REQ"
              ? "Πρωτογενή / εγκεκριμένα αιτήματα / εγκρίσεις"
              : "Προσκλήσεις, προκηρύξεις και διακηρύξεις"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Τίτλος / λέξη αναζήτησης</Label>
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
              <Label>CPV</Label>
              <Input
                value={draft.cpv}
                onChange={(e) => setDraft((prev) => ({ ...prev, cpv: e.target.value }))}
                placeholder="########-#"
              />
            </div>
            <div className="space-y-2">
              <Label>ΑΔΑΜ</Label>
              <Input
                value={draft.adam}
                onChange={(e) => setDraft((prev) => ({ ...prev, adam: e.target.value }))}
                placeholder={draft.type === "REQ" ? "26REQ…" : "26PROC…"}
              />
            </div>
            <div className="space-y-2">
              <Label>Κωδ. Αναθέτουσας Αρχής</Label>
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
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      requestKind: e.target.value as SearchFormState["requestKind"],
                    }))
                  }
                >
                  {(meta?.requestKinds ?? []).map((kind) => (
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
              <Label>Καταχώριση από</Label>
              <Input
                type="date"
                disabled={draft.allHistory}
                value={draft.dateFrom}
                onChange={(e) =>
                  setDraft((prev) => ({
                    ...prev,
                    allHistory: false,
                    dateFrom: e.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Καταχώριση έως</Label>
              <Input
                type="date"
                disabled={draft.allHistory}
                value={draft.dateTo}
                onChange={(e) =>
                  setDraft((prev) => ({
                    ...prev,
                    allHistory: false,
                    dateTo: e.target.value,
                  }))
                }
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
                Αναζήτηση όλου του ιστορικού (μπορεί να επιστρέψει χιλιάδες αποτελέσματα)
              </label>
            </div>
            <div className="space-y-2">
              <Label>Ποσό από</Label>
              <Input
                type="number"
                value={draft.amountMin}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, amountMin: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Ποσό έως</Label>
              <Input
                type="number"
                value={draft.amountMax}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, amountMax: e.target.value }))
                }
              />
            </div>
          </div>

          <Button variant="ghost" size="sm" onClick={() => setShowAdvanced((v) => !v)}>
            {showAdvanced ? "Λιγότερα φίλτρα" : "Περισσότερα φίλτρα"}
          </Button>

          {showAdvanced ? (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-2">
                <Label>Αποφαινόμενο όργανο (κωδ.)</Label>
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
                    <Label>Καταληκτική από</Label>
                    <Input
                      type="date"
                      value={draft.finalFrom}
                      onChange={(e) =>
                        setDraft((prev) => ({ ...prev, finalFrom: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Καταληκτική έως</Label>
                    <Input
                      type="date"
                      value={draft.finalTo}
                      onChange={(e) =>
                        setDraft((prev) => ({ ...prev, finalTo: e.target.value }))
                      }
                    />
                  </div>
                </>
              ) : null}
            </div>
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
            Ενεργά κριτήρια: {activeCriteriaSummary(urlState)}
            {urlState.allHistory ? (
              <span className="mt-1 block text-amber-700 dark:text-amber-400">
                Προσοχή: η αναζήτηση καλύπτει όλο το ιστορικό — προτιμήστε φίλτρο ημερομηνιών
                όταν είναι δυνατό.
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
              {totalElements === 1 ? "1 αποτέλεσμα" : `${totalElements} αποτελέσματα`}
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
                className="w-44"
              >
                <option value="date_desc">Νεότερα πρώτα</option>
                <option value="date_asc">Παλαιότερα πρώτα</option>
              </Select>
            </div>
          </div>

          {!loading && items.length === 0 ? (
            <EmptyState
              title="Δεν βρέθηκαν αποτελέσματα"
              description="Δοκιμάστε διαφορετικά κριτήρια ή ευρύτερο διάστημα ημερομηνιών."
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
                        <span>Καταληκτική: {formatDate(item.finalSubmissionDate)}</span>
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
                    <IconAction
                      label="Προεπισκόπηση PDF"
                      onClick={() => setSelected(item)}
                    >
                      <Eye />
                    </IconAction>
                    <Button size="sm" variant="outline" asChild>
                      <Link
                        to={`/app/tenders/${item.recordType}/${encodeURIComponent(item.adam)}`}
                      >
                        Άνοιγμα
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

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Αποθήκευση αναζήτησης</DialogTitle>
            <DialogDescription>
              Δημιουργεί αποθηκευμένη αναζήτηση και ξεκινά αρχική σάρωση (~30 ημερών) για Ευκαιρίες.
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
