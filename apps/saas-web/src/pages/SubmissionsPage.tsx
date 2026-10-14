import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { useSessionContext } from "@/auth/SessionProvider";
import { EmptyState, ErrorState, PageSkeleton } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataColumn, DataColumnHeader } from "@/components/ui/data-column";
import { DataList, DataRow } from "@/components/ui/data-row";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PageHeader } from "@/components/ui/page-header";
import { saasApi, type FormalSubmissionRow } from "@/lib/api";
import { submissionMethodLabel } from "@/lib/labels";
import { cn } from "@/lib/utils";

const formatDateTime = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("el-GR");
};

const formatMoney = (value: number | null) =>
  value == null
    ? "—"
    : new Intl.NumberFormat("el-GR", {
        style: "currency",
        currency: "EUR",
        maximumFractionDigits: 0,
      }).format(value);

const tenderHref = (row: FormalSubmissionRow) => {
  const type = row.tender.recordType === "PROC" ? "PROC" : "REQ";
  return `/app/tenders/${type}/${encodeURIComponent(row.tender.referenceNumber)}`;
};

const resultBadge = (result: string) => {
  if (result === "WON") return <Badge variant="success">Επιτυχία</Badge>;
  if (result === "LOST") return <Badge variant="destructive">Ανεπιτυχές</Badge>;
  return <Badge variant="outline">Εκκρεμεί</Badge>;
};

const ROW_GRID =
  "grid gap-x-4 gap-y-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,2.2fr)_minmax(0,1.4fr)_minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,1fr)_15rem] lg:items-center";

const COLUMN_LABELS = [
  "Διαγωνισμός",
  "Φορέας",
  "Υποβλήθηκε",
  "Μέθοδος",
  "Κατάσταση",
  "Παρακολούθηση αποτελέσματος",
  "",
];

export const SubmissionsPage = () => {
  const { activeOrganization } = useSessionContext();
  const [rows, setRows] = useState<FormalSubmissionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [resultTarget, setResultTarget] = useState<FormalSubmissionRow | null>(null);

  const load = async () => {
    if (!activeOrganization) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await saasApi.listSubmissions(activeOrganization.id);
      setRows(result.submissions);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Αποτυχία φόρτωσης υποβολών");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [activeOrganization?.id]);

  const handleConfirmResult = async (
    row: FormalSubmissionRow,
    result: "WON" | "LOST",
  ) => {
    if (!activeOrganization) return;
    setBusyId(row.id);
    try {
      await saasApi.confirmSubmissionResult(activeOrganization.id, row.id, {
        result,
      });
      toast.success(
        result === "WON"
          ? "Καταχωρήθηκε επιτυχία."
          : "Καταχωρήθηκε ανεπιτυχές αποτέλεσμα.",
      );
      await load();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Αποτυχία καταχώρησης αποτελέσματος",
      );
    } finally {
      setBusyId(null);
      setResultTarget(null);
    }
  };

  if (loading) return <PageSkeleton />;
  if (!activeOrganization) {
    return (
      <EmptyState
        title="Χωρίς οργανισμό"
        description="Δημιουργήστε οργανισμό για να δείτε τις υποβολές."
      />
    );
  }
  if (error) return <ErrorState description={error} onRetry={() => void load()} />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Υποβολές"
        description="Οι προσφορές που έχετε υποβάλει και καταγράψει στην εφαρμογή. Το ARC Tenders παρακολουθεί τις εξελίξεις μέχρι να καταγράψετε το αποτέλεσμα. Η υποβολή της προσφοράς γίνεται εκτός της εφαρμογής."
        meta={rows.length > 0 ? `${rows.length} ${rows.length === 1 ? "υποβολή" : "υποβολές"}` : undefined}
      />
      {rows.length === 0 ? (
        <EmptyState
          title="Δεν έχετε καταγράψει υποβολές ακόμη"
          description="Ανοίξτε έναν διαγωνισμό που παρακολουθείτε και καταγράψτε την υποβολή της προσφοράς σας. Θα εμφανιστεί εδώ."
        />
      ) : (
        <section>
          <DataColumnHeader gridClassName={ROW_GRID} labels={COLUMN_LABELS} />
          <DataList>
            {rows.map((row) => (
              <DataRow key={row.id}>
                <div className={ROW_GRID}>
                  <DataColumn label="Διαγωνισμός" className="sm:col-span-2 lg:col-span-1">
                    <div className="text-sm font-medium text-foreground">
                      {row.tender.title || "Χωρίς τίτλο"}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                      <Badge variant="secondary" className="px-1.5 py-0 text-[11px] font-normal">
                        {row.tender.recordType}
                      </Badge>
                      <span className="font-mono">{row.tender.referenceNumber}</span>
                      {row.externalReference ? <span>· {row.externalReference}</span> : null}
                      {row.amountWithoutVat != null ? (
                        <span>· {formatMoney(row.amountWithoutVat)}</span>
                      ) : null}
                    </div>
                  </DataColumn>
                  <DataColumn label="Φορέας">
                    <span className="text-sm text-muted-foreground">
                      {row.tender.contractingAuthority || "—"}
                    </span>
                  </DataColumn>
                  <DataColumn label="Υποβλήθηκε">
                    <div className="text-sm tabular-nums text-foreground">
                      {formatDateTime(row.submittedAt)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {row.submittedBy?.name || row.submittedBy?.email || "—"}
                    </div>
                  </DataColumn>
                  <DataColumn label="Μέθοδος">
                    <span className="text-sm text-muted-foreground">
                      {submissionMethodLabel(row.submissionMethod)}
                    </span>
                  </DataColumn>
                  <DataColumn label="Κατάσταση">{resultBadge(row.result)}</DataColumn>
                  <DataColumn label="Παρακολούθηση αποτελέσματος">
                    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span
                        className={cn(
                          "h-1.5 w-1.5 rounded-full",
                          row.monitoringActive ? "bg-primary" : "bg-muted-foreground/40",
                        )}
                        aria-hidden
                      />
                      {row.monitoringActive ? "Ενεργή" : "Ανενεργή"}
                    </span>
                  </DataColumn>
                  <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-1 lg:justify-end">
                    {row.result === "PENDING" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busyId === row.id}
                        onClick={() => setResultTarget(row)}
                      >
                        Καταγραφή αποτελέσματος
                      </Button>
                    ) : null}
                    <Button size="sm" variant="ghost" asChild>
                      <Link to={tenderHref(row)}>Προβολή</Link>
                    </Button>
                  </div>
                </div>
              </DataRow>
            ))}
          </DataList>
        </section>
      )}

      <Dialog open={Boolean(resultTarget)} onOpenChange={(o) => !o && setResultTarget(null)}>
        <DialogContent>
          {resultTarget ? (
            <>
              <DialogHeader>
                <DialogTitle>Καταγραφή αποτελέσματος</DialogTitle>
                <DialogDescription>
                  {resultTarget.tender.title || resultTarget.tender.referenceNumber}
                  {" — "}με την καταγραφή η παρακολούθηση του αποτελέσματος θα σταματήσει.
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="ghost" onClick={() => setResultTarget(null)}>
                  Ακύρωση
                </Button>
                <Button
                  variant="outline"
                  disabled={busyId === resultTarget.id}
                  onClick={() => void handleConfirmResult(resultTarget, "LOST")}
                >
                  Ανεπιτυχές
                </Button>
                <Button
                  disabled={busyId === resultTarget.id}
                  onClick={() => void handleConfirmResult(resultTarget, "WON")}
                >
                  Επιτυχία
                </Button>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
};
