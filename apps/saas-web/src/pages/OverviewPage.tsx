import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useSessionContext } from "@/auth/SessionProvider";
import { IconAction } from "@/components/IconAction";
import { PdfPreviewModal } from "@/components/PdfPreviewModal";
import { EmptyState, ErrorState, PageSkeleton } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  saasApi,
  type Opportunity,
  type SaasOverview,
} from "@/lib/api";

const formatRelative = (value?: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const deltaMs = Date.now() - date.getTime();
  const minutes = Math.round(deltaMs / 60000);
  if (minutes < 1) return "μόλις τώρα";
  if (minutes < 60) return `${minutes} λεπτά πριν`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} ώρες πριν`;
  return date.toLocaleString("el-GR");
};

const formatMoney = (value: number | null) =>
  value == null
    ? "—"
    : new Intl.NumberFormat("el-GR", {
        style: "currency",
        currency: "EUR",
        maximumFractionDigits: 0,
      }).format(value);

const tenderHref = (recordType: string | undefined, referenceNumber: string) => {
  const type = recordType === "PROC" || recordType === "REQ" ? recordType : "REQ";
  return `/app/tenders/${type}/${encodeURIComponent(referenceNumber)}`;
};

const tenderPath = (opportunity: Opportunity) =>
  tenderHref(opportunity.tender.recordType, opportunity.tender.referenceNumber);

const parseMatchMeta = (value: unknown): Opportunity["matchMeta"] => {
  if (!value || typeof value !== "object") return null;
  const meta = value as Opportunity["matchMeta"];
  if (!meta?.matchedProfiles) return null;
  return meta;
};

export const OverviewPage = () => {
  const navigate = useNavigate();
  const {
    activeOrganization,
    user,
    loading: sessionLoading,
    createOrganization,
  } = useSessionContext();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overview, setOverview] = useState<SaasOverview | null>(null);
  const [pdfPreview, setPdfPreview] = useState<Opportunity | null>(null);

  const load = async () => {
    if (!activeOrganization) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const firstName = (user?.name || "").split(" ")[0] || null;
      const data = await saasApi.loadOverview(activeOrganization.id, firstName);
      setOverview(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Αποτυχία φόρτωσης");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [activeOrganization?.id, user?.name]);

  const handleFollow = async (opportunity: Opportunity) => {
    if (!activeOrganization) return;
    try {
      await saasApi.followTender(activeOrganization.id, opportunity.tender.id);
      toast.success("Ο διαγωνισμός προστέθηκε στα Παρακολουθούμενα.");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Αποτυχία παρακολούθησης");
    }
  };

  if (sessionLoading || loading) return <PageSkeleton />;

  if (!activeOrganization) {
    return (
      <EmptyState
        title="Δημιουργήστε οργανισμό"
        description="Μετά την εγγραφή δημιουργήστε οργανισμό για να ξεκινήσετε."
        actionLabel="Δημιουργία οργανισμού"
        onAction={() => {
          const name = window.prompt("Όνομα οργανισμού");
          if (name?.trim()) void createOrganization(name.trim());
        }}
      />
    );
  }

  if (error || !overview) {
    return (
      <ErrorState
        description={error ?? "Αποτυχία φόρτωσης"}
        onRetry={() => void load()}
      />
    );
  }

  const displayName =
    overview.greetingName || (user?.name || "").split(" ")[0] || "εκεί";
  const unreadAttention = overview.attention.filter((event) => !event.readAt);
  const insights = overview.workflowInsights;
  const nextActions = overview.nextActions ?? [];
  const isBrandNew =
    overview.watchUsage.total === 0 &&
    overview.opportunities.length === 0 &&
    overview.metrics.monitoringActive === 0;

  const metrics: Array<{ label: string; value: number; href: string }> = [
    {
      label: "Νέες ευκαιρίες",
      value: overview.metrics.newOpportunities,
      href: "/app/opportunities",
    },
    {
      label: "Παρακολουθούμενα",
      value: overview.metrics.monitoringActive,
      href: "/app/monitoring",
    },
    {
      label: "Προθεσμίες",
      value: overview.metrics.deadlinesSoon,
      href: "/app/monitoring",
    },
    {
      label: "Υποβολές",
      value: overview.metrics.submissionsActive,
      href: "/app/monitoring",
    },
  ];

  const insightLines = [
    insights?.waitingForProc
      ? `${insights.waitingForProc} ${insights.waitingForProc === 1 ? "αίτημα περιμένει" : "αιτήματα περιμένουν"} επίσημη πρόσκληση`
      : null,
    insights?.newRelatedProc
      ? `${insights.newRelatedProc} ${insights.newRelatedProc === 1 ? "νέα πρόσκληση βρέθηκε" : "νέες προσκλήσεις βρέθηκαν"} για αίτημα που παρακολουθείτε`
      : null,
    insights?.submissionWithAward
      ? `${insights.submissionWithAward} ${insights.submissionWithAward === 1 ? "υποβολή έχει" : "υποβολές έχουν"} νέα απόφαση`
      : null,
  ].filter((line): line is string => Boolean(line));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">
            Καλημέρα, {displayName}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {unreadAttention.length > 0
              ? `${unreadAttention.length} στοιχεία χρειάζονται την προσοχή σας σήμερα.`
              : "Όλα ήρεμα — οι αυτόματες αναζητήσεις και η παρακολούθηση συνεχίζονται."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => navigate("/app/search")}>Αναζήτηση ΚΗΜΔΗΣ</Button>
          <Button variant="outline" onClick={() => navigate("/app/saved-searches")}>
            Νέα Αποθηκευμένη Αναζήτηση
          </Button>
        </div>
      </div>

      {overview.scanningProfiles > 0 ? (
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="flex items-center gap-3 py-3 text-sm">
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
            <span>
              Εκτελούμε {overview.scanningProfiles}{" "}
              {overview.scanningProfiles === 1
                ? "αποθηκευμένη αναζήτηση"
                : "αποθηκευμένες αναζητήσεις"}
              .
            </span>
          </CardContent>
        </Card>
      ) : null}

      {/* Attention — only when something real is pending */}
      {unreadAttention.length > 0 || insightLines.length > 0 ? (
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-3">
            <div>
              <CardTitle className="text-base">Χρειάζονται προσοχή</CardTitle>
              <CardDescription>Τα ίδια γεγονότα με το κουδούνι ειδοποιήσεων.</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/app/notifications">Όλες</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {insightLines.map((line) => (
              <Link
                key={line}
                to="/app/monitoring"
                className="block rounded-md border border-border px-3 py-2 text-sm hover:bg-muted/50"
              >
                {line}
              </Link>
            ))}
            {unreadAttention.slice(0, 5).map((event) => (
              <Link
                key={event.id}
                to="/app/notifications"
                className="flex items-start justify-between gap-3 rounded-md border border-border px-3 py-2.5 hover:bg-muted/50"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{event.title}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {formatRelative(event.createdAt)}
                  </div>
                </div>
                <Badge variant="warning">Νέο</Badge>
              </Link>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {isBrandNew ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Ξεκινήστε με TEKIA Tender</CardTitle>
            <CardDescription>
              Δύο βήματα αρκούν για να αρχίσουν οι αυτόματες ευκαιρίες.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button onClick={() => navigate("/app/saved-searches")}>
              Νέα Αποθηκευμένη Αναζήτηση
            </Button>
            <Button variant="outline" onClick={() => navigate("/app/search")}>
              Αναζήτηση ΚΗΜΔΗΣ
            </Button>
            <Button variant="ghost" onClick={() => navigate("/app/documents")}>
              Έγγραφα εταιρείας
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Today */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {metrics.map((metric) => (
              <Link
                key={metric.label}
                to={metric.href}
                className="rounded-lg border border-border px-4 py-3 transition-colors hover:bg-muted/40"
              >
                <div className="text-xs text-muted-foreground">{metric.label}</div>
                <div className="mt-1 text-2xl font-semibold">{metric.value}</div>
              </Link>
            ))}
          </div>

          {/* Main two-column area */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-3">
                <div>
                  <CardTitle className="text-base">Νέες ευκαιρίες</CardTitle>
                  <CardDescription>
                    Από τις αποθηκευμένες αναζητήσεις σας.
                  </CardDescription>
                </div>
                <Button variant="ghost" size="sm" asChild>
                  <Link to="/app/opportunities">Όλες</Link>
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                {overview.opportunities.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Καμία πρόσφατη ευκαιρία — οι αναζητήσεις συνεχίζονται.
                  </p>
                ) : (
                  overview.opportunities.map((opportunity) => {
                    const meta = parseMatchMeta(opportunity.matchMeta);
                    const topScore = meta?.highestScore ?? opportunity.score ?? 0;
                    const profileName =
                      meta?.matchedProfiles?.[0]?.name ??
                      opportunity.watchProfile?.name ??
                      "—";
                    return (
                      <div
                        key={opportunity.id}
                        className="space-y-2 rounded-md border border-border p-3"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge>{opportunity.tender.recordType}</Badge>
                          <Badge variant="secondary">{topScore}%</Badge>
                          <span className="text-xs text-muted-foreground">
                            {profileName}
                          </span>
                        </div>
                        <div className="font-medium leading-snug">
                          {opportunity.tender.title || "—"}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {opportunity.tender.contractingAuthority || "—"} ·{" "}
                          {formatMoney(opportunity.tender.budgetWithoutVat)}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <IconAction
                            label="Προεπισκόπηση PDF"
                            onClick={() => setPdfPreview(opportunity)}
                          >
                            <Eye />
                          </IconAction>
                          <Button size="sm" variant="outline" asChild>
                            <Link to={tenderPath(opportunity)}>Άνοιγμα</Link>
                          </Button>
                          {!opportunity.following ? (
                            <Button size="sm" onClick={() => void handleFollow(opportunity)}>
                              Παρακολούθηση
                            </Button>
                          ) : (
                            <Badge variant="success">Παρακολουθείται</Badge>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-3">
                <div>
                  <CardTitle className="text-base">Επόμενες ενέργειες</CardTitle>
                  <CardDescription>
                    Τι περιμένει εσάς στα παρακολουθούμενα.
                  </CardDescription>
                </div>
                <Button variant="ghost" size="sm" asChild>
                  <Link to="/app/monitoring">Παρακολουθούμενα</Link>
                </Button>
              </CardHeader>
              <CardContent className="space-y-2">
                {nextActions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Καμία ενέργεια σε εκκρεμότητα — παρακολουθούμε το ΚΗΜΔΗΣ για εξελίξεις.
                  </p>
                ) : (
                  nextActions.map((action) => (
                    <Link
                      key={action.id}
                      to={tenderHref(action.recordType, action.referenceNumber)}
                      className="block rounded-md border border-border px-3 py-2.5 hover:bg-muted/50"
                    >
                      <div className="truncate text-sm font-medium">
                        {action.title || action.referenceNumber}
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {action.recordType} · {action.actionLabel}
                      </div>
                    </Link>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          {/* Bottom — only when relevant */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
                <div>
                  <CardTitle className="text-base">Αυτόματες Αναζητήσεις</CardTitle>
                  <CardDescription className="mt-1">
                    {overview.watchUsage.active} από{" "}
                    {overview.entitlements.maxActiveWatchProfiles} ενεργές · τελευταίος
                    έλεγχος {formatRelative(overview.lastSystemScanAt)} · νεότερη
                    αντιστοίχιση {formatRelative(overview.latestMatchAt)}
                  </CardDescription>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <Link to="/app/saved-searches">Διαχείριση</Link>
                </Button>
              </CardHeader>
            </Card>

            {overview.deadlines.length > 0 ? (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Επερχόμενες προθεσμίες</CardTitle>
                  <CardDescription>Καταληκτικές υποβολής εντός 7 ημερών.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {overview.deadlines.map((row) => (
                    <div
                      key={row.tenderId}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">
                          {row.title || row.referenceNumber}
                        </div>
                        <div className="font-mono text-xs text-muted-foreground">
                          {row.referenceNumber}
                        </div>
                      </div>
                      <Badge variant={row.daysRemaining <= 2 ? "warning" : "outline"}>
                        {row.daysRemaining === 0
                          ? "Σήμερα"
                          : row.daysRemaining === 1
                            ? "Αύριο"
                            : `${row.daysRemaining} ημέρες`}
                      </Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ) : null}

            {overview.documentsAttention.length > 0 ? (
              <Card>
                <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-3">
                  <div>
                    <CardTitle className="text-base">Έγγραφα που λήγουν</CardTitle>
                    <CardDescription>Χρειάζονται ανανέωση πριν την επόμενη υποβολή.</CardDescription>
                  </div>
                  <Button variant="ghost" size="sm" asChild>
                    <Link to="/app/documents">Έγγραφα</Link>
                  </Button>
                </CardHeader>
                <CardContent className="space-y-2">
                  {overview.documentsAttention.map((doc) => (
                    <div
                      key={doc.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
                    >
                      <div className="min-w-0 truncate text-sm font-medium">{doc.name}</div>
                      <Badge variant={doc.status === "EXPIRED" ? "destructive" : "warning"}>
                        {doc.status === "EXPIRED" ? "Έληξε" : "Λήγει σύντομα"}
                      </Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ) : null}
          </div>
        </>
      )}

      <PdfPreviewModal
        open={Boolean(
          pdfPreview &&
            (pdfPreview.tender.recordType === "REQ" ||
              pdfPreview.tender.recordType === "PROC"),
        )}
        onOpenChange={(open) => !open && setPdfPreview(null)}
        organizationId={activeOrganization.id}
        recordType={pdfPreview?.tender.recordType === "PROC" ? "PROC" : "REQ"}
        adam={pdfPreview?.tender.referenceNumber ?? ""}
        title={pdfPreview?.tender.title}
        officialUrl={pdfPreview?.tender.publicKimdisUrl}
        actions={
          pdfPreview ? (
            <Button size="sm" variant="outline" asChild>
              <Link to={tenderPath(pdfPreview)} onClick={() => setPdfPreview(null)}>
                Άνοιγμα σελίδας πράξης
              </Link>
            </Button>
          ) : null
        }
      />
    </div>
  );
};
