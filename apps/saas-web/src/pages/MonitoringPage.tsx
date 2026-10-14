import { useEffect, useMemo, useState, type ChangeEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useSessionContext } from "@/auth/SessionProvider";
import { Pagination, usePaginatedList } from "@/components/Pagination";
import { EmptyState, ErrorState, PageSkeleton } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataList, DataRow } from "@/components/ui/data-row";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { saasApi, type MonitoringPipelineRow } from "@/lib/api";

const FILTERS: Array<{ id: string; label: string }> = [
  { id: "ALL", label: "Όλα" },
  { id: "FOLLOWING", label: "Παρακολουθούνται" },
  { id: "OUTREACH_SENT", label: "Εκδήλωση ενδιαφέροντος" },
  { id: "WAITING_PROC", label: "Αναμονή πρόσκλησης" },
  { id: "PREPARING", label: "Προετοιμασία" },
  { id: "SUBMITTED", label: "Με υποβολή προσφοράς" },
  { id: "NEW_DEVELOPMENT", label: "Με νέες εξελίξεις" },
  { id: "COMPLETED", label: "Ολοκληρωμένα" },
];

const ROW_GRID_CLASS =
  "grid min-w-0 gap-x-4 gap-y-2 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1.2fr)]";
const ACTION_WIDTH_CLASS = "md:w-24";

const formatDay = (value?: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("el-GR");
};

const formatNextActionLine = (code: string, label: string) => {
  if (code === "WAIT_PROC") return label;
  if (code === "RECORD_OUTREACH" || code === "START_PREPARATION") {
    return `Επόμενη ενέργεια: ${label}`;
  }
  return `Επόμενο: ${label}`;
};

const tenderHref = (row: MonitoringPipelineRow) => {
  const type =
    row.tender.recordType === "PROC" || row.tender.recordType === "REQ"
      ? row.tender.recordType
      : "REQ";
  return `/app/tenders/${type}/${encodeURIComponent(row.tender.referenceNumber)}`;
};

const MobileLabel = ({ children }: { children: ReactNode }) => (
  <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground md:hidden">
    {children}
  </div>
);

export const MonitoringPage = () => {
  const { activeOrganization, loading: sessionLoading } = useSessionContext();
  const [rows, setRows] = useState<MonitoringPipelineRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("ALL");

  const load = async () => {
    if (!activeOrganization) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await saasApi.monitoringState(activeOrganization.id);
      setRows(result.organizationTenders);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Αποτυχία φόρτωσης παρακολουθούμενων");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [activeOrganization?.id]);

  const filtered = useMemo(() => {
    if (filter === "ALL") return rows;
    if (filter === "OUTREACH_SENT") {
      return rows.filter((row) => row.hasOutreach);
    }
    return rows.filter((row) => row.filterBucket === filter);
  }, [rows, filter]);

  const paged = usePaginatedList(filtered, { resetKey: filter });

  if (sessionLoading || loading) return <PageSkeleton />;
  if (error) return <ErrorState description={error} onRetry={() => void load()} />;

  const countLabel =
    filtered.length === rows.length
      ? `${rows.length} διαγωνισμοί`
      : `${filtered.length} από ${rows.length} διαγωνισμοί`;

  const handleFilterChange = (event: ChangeEvent<HTMLSelectElement>) =>
    setFilter(event.target.value);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Παρακολουθούμενα"
        description="Παρακολουθήστε τις εξελίξεις και οργανώστε τις ενέργειές σας για τους διαγωνισμούς που σας ενδιαφέρουν."
      />

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/50 pb-3">
        <div className="flex items-center gap-2">
          <label htmlFor="monitoring-status-filter" className="text-sm text-muted-foreground">
            Κατάσταση
          </label>
          <Select
            id="monitoring-status-filter"
            value={filter}
            onChange={handleFilterChange}
            className="w-64 max-w-full"
          >
            {FILTERS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </Select>
        </div>
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {countLabel}
        </p>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title={
            filter === "NEW_DEVELOPMENT" && rows.length > 0
              ? "Δεν υπάρχουν νέες επίσημες εξελίξεις"
              : filter !== "ALL" && rows.length > 0
                ? "Κανένα νήμα σε αυτό το φίλτρο"
                : "Δεν υπάρχουν παρακολουθούμενα"
          }
          description={
            filter === "NEW_DEVELOPMENT" && rows.length > 0
              ? `Δεν υπάρχουν νέες επίσημες εξελίξεις στα ${rows.length} παρακολουθούμενα.`
              : rows.length > 0
                ? "Δοκιμάστε άλλο φίλτρο ή ανοίξτε έναν διαγωνισμό από τη λίστα «Όλα»."
                : "Από την Αναζήτηση ή τις Ευκαιρίες πατήστε «Έναρξη παρακολούθησης» για να μπει εδώ ο διαγωνισμός."
          }
        />
      ) : (
        <div>
          <div
            className="hidden gap-4 border-b border-border/50 pb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground md:flex"
            aria-hidden
          >
            <div className={`${ROW_GRID_CLASS} flex-1`}>
              <span>Διαγωνισμός</span>
              <span>Στάδιο</span>
              <span>Τι περιμένουμε</span>
              <span>Τελευταία εξέλιξη</span>
            </div>
            <span className={`shrink-0 ${ACTION_WIDTH_CLASS}`} />
          </div>
          <DataList>
            {paged.pageItems.map((row) => (
              <DataRow
                key={row.id}
                interactive
                actions={
                  <Button
                    size="sm"
                    variant="outline"
                    className={ACTION_WIDTH_CLASS}
                    asChild
                  >
                    <Link to={tenderHref(row)}>Προβολή</Link>
                  </Button>
                }
              >
                <div className={ROW_GRID_CLASS}>
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">{row.tender.recordType}</Badge>
                      <span className="font-mono text-xs text-muted-foreground">
                        {row.tender.referenceNumber}
                      </span>
                      {row.unreadAttentionCount > 0 ? (
                        <Badge variant="warning">
                          {row.latestDevelopment?.startsWith("Η προθεσμία")
                            ? "Αλλαγή προθεσμίας"
                            : row.latestDevelopment?.includes("TED")
                              ? "Ενημέρωση TED"
                              : "Νέα εξέλιξη"}
                        </Badge>
                      ) : null}
                    </div>
                    <div className="break-words text-sm font-medium leading-snug">
                      {row.tender.title || "Χωρίς τίτλο"}
                    </div>
                    <div className="break-words text-xs text-muted-foreground">
                      {row.tender.contractingAuthority || "—"}
                    </div>
                  </div>
                  <div className="min-w-0 space-y-1 text-sm">
                    <MobileLabel>Στάδιο</MobileLabel>
                    <div>{row.stageLabel}</div>
                    {row.monitoringActive ? null : (
                      <Badge variant="outline">Ανενεργή παρακολούθηση</Badge>
                    )}
                  </div>
                  <div className="min-w-0 text-sm text-muted-foreground">
                    <MobileLabel>Τι περιμένουμε</MobileLabel>
                    {formatNextActionLine(row.nextAction.code, row.nextAction.label)}
                  </div>
                  <div className="min-w-0 space-y-0.5 text-sm">
                    <MobileLabel>Τελευταία εξέλιξη</MobileLabel>
                    {row.latestDevelopment ? (
                      <div className="break-words text-primary">{row.latestDevelopment}</div>
                    ) : null}
                    <div className="text-xs text-muted-foreground">
                      {formatDay(row.latestRelatedActAt ?? row.updatedAt)}
                    </div>
                  </div>
                </div>
              </DataRow>
            ))}
          </DataList>
          <Pagination
            page={paged.page}
            totalPages={paged.totalPages}
            total={paged.total}
            pageSize={paged.pageSize}
            onPageChange={paged.setPage}
          />
        </div>
      )}
    </div>
  );
};
