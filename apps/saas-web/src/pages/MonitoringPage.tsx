import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useSessionContext } from "@/auth/SessionProvider";
import { Pagination, usePaginatedList } from "@/components/Pagination";
import { EmptyState, ErrorState, PageSkeleton } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Παρακολουθούμενα</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Παρακολουθήστε τις εξελίξεις και οργανώστε τις ενέργειές σας για τους διαγωνισμούς που σας ενδιαφέρουν.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((item) => (
          <Button
            key={item.id}
            size="sm"
            variant={filter === item.id ? "default" : "outline"}
            onClick={() => setFilter(item.id)}
          >
            {item.label}
          </Button>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Διαγωνισμοί σε παρακολούθηση</CardTitle>
          <CardDescription>
            {filtered.length === rows.length
              ? `Εμφανίζονται ${rows.length} από ${rows.length} διαγωνισμοί.`
              : `Εμφανίζονται ${filtered.length} από ${rows.length} διαγωνισμοί.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
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
            <div className="space-y-3">
              {paged.pageItems.map((row) => (
                <div
                  key={row.id}
                  className="flex flex-col gap-3 rounded-md border border-border px-4 py-4 md:flex-row md:items-start md:justify-between"
                >
                  <div className="min-w-0 space-y-2">
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
                    <div className="text-sm font-medium">
                      {row.tender.title || "Χωρίς τίτλο"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {row.tender.contractingAuthority || "—"}
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs">
                      <Badge variant="outline">Στάδιο: {row.stageLabel}</Badge>
                      <Badge variant={row.monitoringActive ? "success" : "outline"}>
                        {row.monitoringActive ? "Ενεργή παρακολούθηση" : "Ανενεργή παρακολούθηση"}
                      </Badge>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {formatNextActionLine(row.nextAction.code, row.nextAction.label)}
                    </div>
                    {row.latestDevelopment ? (
                      <div className="text-sm text-primary">{row.latestDevelopment}</div>
                    ) : null}
                    <div className="text-xs text-muted-foreground">
                      Τελευταία δραστηριότητα:{" "}
                      {formatDay(row.latestRelatedActAt ?? row.updatedAt)}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Button size="sm" variant="outline" asChild>
                      <Link to={tenderHref(row)}>Προβολή λεπτομερειών</Link>
                    </Button>
                  </div>
                </div>
              ))}
              <Pagination
                page={paged.page}
                totalPages={paged.totalPages}
                total={paged.total}
                pageSize={paged.pageSize}
                onPageChange={paged.setPage}
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
