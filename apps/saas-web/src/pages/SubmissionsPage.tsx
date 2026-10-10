import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { useSessionContext } from "@/auth/SessionProvider";
import { EmptyState, ErrorState, PageSkeleton } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { saasApi, type FormalSubmissionRow } from "@/lib/api";
import { submissionMethodLabel } from "@/lib/labels";

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

export const SubmissionsPage = () => {
  const { activeOrganization } = useSessionContext();
  const [rows, setRows] = useState<FormalSubmissionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

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
    const confirmed = window.confirm(
      result === "WON"
        ? "Να επιβεβαιωθεί επιτυχία (WON); Η παρακολούθηση θα σταματήσει."
        : "Να επιβεβαιωθεί ανεπιτυχές αποτέλεσμα (LOST); Η παρακολούθηση θα σταματήσει.",
    );
    if (!confirmed) return;
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
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Υποβολές</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Οι προσφορές που έχετε υποβάλει και καταγράψει στην εφαρμογή. Το ARC Tenders παρακολουθεί τις εξελίξεις μέχρι να καταγράψετε το αποτέλεσμα. Η υποβολή της προσφοράς γίνεται εκτός της εφαρμογής.
        </p>
      </div>
      {rows.length === 0 ? (
        <EmptyState
          title="Δεν έχετε καταγράψει υποβολές ακόμη"
          description="Ανοίξτε έναν διαγωνισμό που παρακολουθείτε και καταγράψτε την υποβολή της προσφοράς σας. Θα εμφανιστεί εδώ."
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Καταγεγραμμένες υποβολές</CardTitle>
            <CardDescription>{rows.length} υποβολές</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {rows.map((row) => (
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
                    {resultBadge(row.result)}
                    <Badge variant={row.monitoringActive ? "success" : "outline"}>
                      {row.monitoringActive
                        ? "Παρακολούθηση ενεργή"
                        : "Παρακολούθηση ανενεργή"}
                    </Badge>
                  </div>
                  <div className="text-sm font-medium">{row.tender.title || "Χωρίς τίτλο"}</div>
                  <div className="text-xs text-muted-foreground">
                    {row.tender.contractingAuthority || "—"}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {formatDateTime(row.submittedAt)} ·{" "}
                    {submissionMethodLabel(row.submissionMethod)}
                    {row.externalReference ? ` · ${row.externalReference}` : ""}
                    {row.amountWithoutVat != null
                      ? ` · ${formatMoney(row.amountWithoutVat)}`
                      : ""}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Καταχώρηση από: {row.submittedBy?.name || row.submittedBy?.email || "—"}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {row.result === "PENDING" ? (
                    <>
                      <Button
                        size="sm"
                        disabled={busyId === row.id}
                        onClick={() => void handleConfirmResult(row, "WON")}
                      >
                        Επιτυχία
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busyId === row.id}
                        onClick={() => void handleConfirmResult(row, "LOST")}
                      >
                        Ανεπιτυχές
                      </Button>
                    </>
                  ) : null}
                  <Button size="sm" variant="outline" asChild>
                    <Link to={tenderHref(row)}>Προβολή λεπτομερειών</Link>
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
};
