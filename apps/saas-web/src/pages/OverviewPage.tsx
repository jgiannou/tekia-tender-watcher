import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useSessionContext } from "@/auth/SessionProvider";
import { CreateOrganizationDialog } from "@/components/CreateOrganizationDialog";
import { PdfAction } from "@/components/PdfAction";
import { Pagination, usePaginatedList } from "@/components/Pagination";
import { PdfPreviewModal } from "@/components/PdfPreviewModal";
import { EmptyState, ErrorState, PageSkeleton } from "@/components/states";
import { ScoreBadge } from "@/components/ScoreBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  saasApi,
  type Opportunity,
  type SaasOverview,
} from "@/lib/api";
import { attentionEventHref } from "@/lib/attention-routing";

const OVERVIEW_OPPORTUNITY_PAGE_SIZE = 3;

const formatRelative = (value?: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const deltaMs = Date.now() - date.getTime();
  const minutes = Math.round(deltaMs / 60000);
  if (minutes < 1) return "μόλις τώρα";
  if (minutes === 1) return "1 λεπτό πριν";
  if (minutes < 60) return `${minutes} λεπτά πριν`;
  const hours = Math.round(minutes / 60);
  if (hours === 1) return "1 ώρα πριν";
  if (hours < 48) return `${hours} ώρες πριν`;
  return date.toLocaleString("el-GR");
};

const formatDay = (value?: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("el-GR");
};

const formatMoney = (value: number | null) =>
  value == null
    ? "—"
    : new Intl.NumberFormat("el-GR", {
        style: "currency",
        currency: "EUR",
        maximumFractionDigits: 0,
      }).format(value);

const formatDate = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value.slice(0, 10) : date.toLocaleDateString("el-GR");
};

const isExpiredDeadline = (value?: string | null) => {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return date.getTime() < Date.now();
};

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
  } = useSessionContext();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overview, setOverview] = useState<SaasOverview | null>(null);
  const [pdfPreview, setPdfPreview] = useState<Opportunity | null>(null);
  const [createOrgOpen, setCreateOrgOpen] = useState(false);

  const load = async (opts?: { silent?: boolean }) => {
    if (!activeOrganization) {
      setLoading(false);
      return;
    }
    // Keep previous overview painted during soft reloads / scan polling.
    if (!opts?.silent) setLoading(true);
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

  // Keep the «Εκτελούμε…» banner honest while a scan is in flight.
  useEffect(() => {
    if (!activeOrganization || !overview || overview.scanningProfiles <= 0) {
      return;
    }
    const timer = window.setInterval(() => {
      void load({ silent: true });
    }, 5000);
    return () => window.clearInterval(timer);
  }, [activeOrganization?.id, overview?.scanningProfiles]);

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

  const opportunityItems = overview?.opportunities ?? [];
  const opportunityPages = usePaginatedList(opportunityItems, {
    pageSize: OVERVIEW_OPPORTUNITY_PAGE_SIZE,
    resetKey: `${activeOrganization?.id ?? ""}:${opportunityItems.map((row) => row.id).join("|")}`,
  });

  if (sessionLoading || (loading && !overview)) return <PageSkeleton />;

  if (!activeOrganization) {
    return (
      <>
        <EmptyState
          title="Δημιουργήστε οργανισμό"
          description="Μετά την εγγραφή δημιουργήστε οργανισμό για να ξεκινήσετε — ξεχωριστή εταιρεία με δωρεάν δοκιμή."
          actionLabel="Δημιουργία οργανισμού"
          onAction={() => setCreateOrgOpen(true)}
        />
        <CreateOrganizationDialog
          open={createOrgOpen}
          onOpenChange={setCreateOrgOpen}
        />
      </>
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
  const nextActions = overview.nextActions ?? [];
  const isBrandNew =
    overview.watchUsage.total === 0 &&
    overview.opportunities.length === 0 &&
    overview.metrics.monitoringActive === 0;
  const digestAttention = overview.attention.filter(
    (event) => !event.readAt && event.type === "OPPORTUNITY_DIGEST",
  );
  const failedScanCount = overview.failedScanCount ?? 0;

  const metrics: Array<{ label: string; value: number; href: string; hint: string }> = [
    {
      label: "Νέες ευκαιρίες",
      value: overview.metrics.newOpportunities,
      href: "/app/opportunities",
      hint: "Ευκαιρίες που δεν παρακολουθούνται ακόμη",
    },
    {
      label: "Παρακολουθούμενα",
      value: overview.metrics.monitoringActive,
      href: "/app/monitoring",
      hint: "Ενεργά νήματα παρακολούθησης",
    },
    {
      label: "Προθεσμίες",
      value: overview.metrics.deadlinesSoon,
      href: "/app/monitoring",
      hint: "Καταληκτικές εντός 7 ημερών",
    },
    {
      label: "Υποβολές",
      value: overview.metrics.submissionsActive,
      href: "/app/submissions",
      hint: "Τυπικές υποβολές σε παρακολούθηση",
    },
  ];

  return (
    <div className="min-w-0 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-2xl font-semibold tracking-tight">
            Καλημέρα, {displayName}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {isBrandNew
              ? "Δημιουργήστε την πρώτη αποθηκευμένη αναζήτηση ή εξερευνήστε το ΚΗΜΔΗΣ."
              : nextActions.length > 0
                ? `${nextActions.length} ενέργειες χρειάζονται την προσοχή σας.`
                : "Δεν υπάρχουν ενέργειες που απαιτούν την προσοχή σας."}
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

      {isBrandNew ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Ξεκινήστε με ARC Tenders</CardTitle>
            <CardDescription>
              Δημιουργήστε την πρώτη αποθηκευμένη αναζήτηση ή εξερευνήστε το ΚΗΜΔΗΣ.
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
          <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {metrics.map((metric) => (
              <Link
                key={metric.label}
                to={metric.href}
                title={metric.hint}
                className="min-w-0 rounded-lg border border-border px-4 py-3 transition-colors hover:bg-muted/40"
              >
                <div className="text-xs text-muted-foreground">{metric.label}</div>
                <div className="mt-1 text-2xl font-semibold">{metric.value}</div>
                <div className="mt-1 text-[11px] text-muted-foreground">{metric.hint}</div>
              </Link>
            ))}
          </div>

          <div
            className={`grid min-w-0 gap-4 ${
              nextActions.length === 0 ? "lg:grid-cols-1" : "lg:grid-cols-2"
            }`}
          >
            <Card className="min-w-0 overflow-hidden">
              <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0 p-4 pb-3 sm:p-5 sm:pb-3">
                <div className="min-w-0">
                  <CardTitle className="text-base">Νέες ευκαιρίες</CardTitle>
                  <CardDescription>
                    Από τις αποθηκευμένες αναζητήσεις σας.
                  </CardDescription>
                </div>
                <Button variant="ghost" size="sm" asChild>
                  <Link to="/app/opportunities">Όλες</Link>
                </Button>
              </CardHeader>
              <CardContent className="min-w-0 space-y-3 p-4 pt-0 sm:p-5 sm:pt-0">
                {digestAttention.length > 0
                  ? digestAttention.slice(0, 2).map((event) => (
                      <div
                        key={event.id}
                        className="flex min-w-0 flex-col gap-2 rounded-md border border-border px-3 py-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0 break-words text-sm font-medium">
                          {event.title}
                        </div>
                        <div className="flex min-w-0 flex-wrap gap-2">
                          <Button size="sm" variant="outline" asChild>
                            <Link to={attentionEventHref(event)}>Προβολή</Link>
                          </Button>
                          {!event.readAt ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                void saasApi
                                  .markAttentionRead(activeOrganization.id, event.id)
                                  .then(() => load({ silent: true }))
                              }
                            >
                              Αναγνώστηκε
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    ))
                  : null}
                {opportunityPages.total === 0 && digestAttention.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Καμία πρόσφατη ευκαιρία.
                  </p>
                ) : (
                  <>
                    {opportunityPages.pageItems.map((opportunity) => {
                      const meta = parseMatchMeta(opportunity.matchMeta);
                      const topScore = meta?.highestScore ?? opportunity.score ?? 0;
                      const profileName =
                        meta?.matchedProfiles?.[0]?.name ??
                        opportunity.watchProfile?.name ??
                        "—";
                      const reasonsFromMeta = meta?.matchedProfiles?.[0]?.reasons;
                      const reasonsFromScore = Array.isArray(opportunity.scoreReasons)
                        ? opportunity.scoreReasons.map(String)
                        : [];
                      const whyReasons =
                        (reasonsFromMeta && reasonsFromMeta.length > 0
                          ? reasonsFromMeta
                          : reasonsFromScore
                        ).slice(0, 3);
                      return (
                        <div
                          key={opportunity.id}
                          className="min-w-0 space-y-2 rounded-md border border-border p-3"
                        >
                          <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <Badge>{opportunity.tender.recordType}</Badge>
                            <ScoreBadge score={topScore} />
                            <span className="min-w-0 break-words text-xs text-muted-foreground">
                              {profileName}
                            </span>
                          </div>
                          <div className="break-words font-medium leading-snug">
                            {opportunity.tender.title || "—"}
                          </div>
                          <div className="break-words text-sm text-muted-foreground">
                            {opportunity.tender.contractingAuthority || "—"} ·{" "}
                            {formatMoney(opportunity.tender.budgetWithoutVat)}
                          </div>
                          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                            {formatDate(opportunity.tender.submissionDate) ? (
                              <span>
                                Καταχώριση: {formatDate(opportunity.tender.submissionDate)}
                              </span>
                            ) : null}
                            {opportunity.tender.finalSubmissionDate ? (
                              <span
                                className={
                                  isExpiredDeadline(opportunity.tender.finalSubmissionDate)
                                    ? "font-medium text-destructive"
                                    : undefined
                                }
                              >
                                {isExpiredDeadline(opportunity.tender.finalSubmissionDate)
                                  ? "Έληξε: "
                                  : "Καταληκτική: "}
                                {formatDate(opportunity.tender.finalSubmissionDate)}
                              </span>
                            ) : null}
                          </div>
                          {whyReasons.length > 0 ? (
                            <div className="space-y-0.5 break-words text-xs text-muted-foreground">
                              <div className="font-medium text-foreground/80">
                                Γιατί το βλέπετε
                              </div>
                              {whyReasons.map((reason) => (
                                <div key={reason}>· {reason}</div>
                              ))}
                            </div>
                          ) : null}
                          <div className="flex flex-wrap items-center gap-2">
                            <PdfAction
                              onClick={() => setPdfPreview(opportunity)}
                            />
                            <Button size="sm" variant="outline" asChild>
                              <Link to={tenderPath(opportunity)}>Άνοιγμα</Link>
                            </Button>
                            {!opportunity.following ? (
                              <Button
                                size="sm"
                                onClick={() => void handleFollow(opportunity)}
                              >
                                Παρακολούθηση
                              </Button>
                            ) : (
                              <Badge variant="success">Παρακολουθείται</Badge>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    <Pagination
                      page={opportunityPages.page}
                      totalPages={opportunityPages.totalPages}
                      total={opportunityPages.total}
                      pageSize={opportunityPages.pageSize}
                      onPageChange={opportunityPages.setPage}
                    />
                  </>
                )}
              </CardContent>
            </Card>

            {nextActions.length > 0 ? (
              <Card className="min-w-0 overflow-hidden">
                <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0 pb-3">
                  <div>
                    <CardTitle className="text-base">Επόμενες ενέργειες</CardTitle>
                    <CardDescription>
                      Αποφάσεις και ενέργειες που περιμένουν εσάς.
                    </CardDescription>
                  </div>
                  <Button variant="ghost" size="sm" asChild>
                    <Link to="/app/monitoring">Παρακολουθούμενα</Link>
                  </Button>
                </CardHeader>
                <CardContent className="space-y-2">
                  {nextActions.map((action) => (
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
                  ))}
                </CardContent>
              </Card>
            ) : (
              <p className="text-sm text-muted-foreground lg:col-span-1">
                Δεν υπάρχουν ενέργειες που απαιτούν την προσοχή σας.
              </p>
            )}
          </div>

          {overview.monitoring.length > 0 ? (
            <Card>
              <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0 pb-3">
                <div>
                  <CardTitle className="text-base">Παρακολουθούμενα</CardTitle>
                  <CardDescription>
                    Πού βρισκόμαστε και τι περιμένουμε.
                  </CardDescription>
                </div>
                <Button variant="ghost" size="sm" asChild>
                  <Link to="/app/monitoring">Όλα</Link>
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                {overview.monitoring.map((row) => (
                  <Link
                    key={row.id}
                    to={tenderHref(row.tender.recordType, row.tender.referenceNumber)}
                    className="block space-y-1 rounded-md border border-border px-3 py-2.5 hover:bg-muted/50"
                  >
                    <div className="truncate text-sm font-medium">
                      {row.tender.title || row.tender.referenceNumber}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {row.tender.recordType} · {row.tender.referenceNumber}
                    </div>
                    <div className="text-xs">
                      Στάδιο: {row.stageLabel || row.pipelineStage}
                    </div>
                    {row.waitingFor ? (
                      <div className="text-xs text-muted-foreground">
                        Αναμένουμε: {row.waitingFor}
                      </div>
                    ) : row.nextActionLabel ? (
                      <div className="text-xs text-muted-foreground">
                        Επόμενο: {row.nextActionLabel}
                      </div>
                    ) : null}
                    <div className="text-xs text-muted-foreground">
                      Τελευταία δραστηριότητα: {formatDay(row.latestActivityAt)}
                    </div>
                  </Link>
                ))}
              </CardContent>
            </Card>
          ) : null}

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
                    {failedScanCount > 0
                      ? failedScanCount === 1
                        ? " · 1 αποτυχημένη σάρωση"
                        : ` · ${failedScanCount} αποτυχημένες σαρώσεις`
                      : ""}
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
                <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0 pb-3">
                  <div>
                    <CardTitle className="text-base">Έγγραφα που λήγουν</CardTitle>
                    <CardDescription>
                      Χρειάζονται ανανέωση πριν την επόμενη υποβολή.
                    </CardDescription>
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
