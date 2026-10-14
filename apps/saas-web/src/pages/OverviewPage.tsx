import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useSessionContext } from "@/auth/SessionProvider";
import { CreateOrganizationDialog } from "@/components/CreateOrganizationDialog";
import { ProfileSetupBanner } from "@/components/ProfileSetupBanner";
import { EmptyState, ErrorState, PageSkeleton } from "@/components/states";
import { InvitationIssuedBadge } from "@/components/InvitationIssuedBadge";
import { ScoreBadge } from "@/components/ScoreBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Metric, MetricStrip } from "@/components/ui/metric";
import { PageHeader } from "@/components/ui/page-header";
import {
  saasApi,
  type Opportunity,
  type SaasOverview,
} from "@/lib/api";
import { trackAnalyticsEvent } from "@/lib/analytics";
import { attentionEventHref } from "@/lib/attention-routing";
import { attentionEventViewModel } from "@/lib/attention-content";
import {
  canEditOrganizationProfile,
  getOrgProfileProgress,
  profileBannerDismissKey,
  readProfileBannerDismissed,
  writeProfileBannerDismissed,
  type OrgProfileProgress,
} from "@/lib/org-profile";
import { cn } from "@/lib/utils";

const RECENT_OPPORTUNITIES = 3;
const TODAY_CAP = 5;

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

const getGreeting = () => (new Date().getHours() < 12 ? "Καλημέρα" : "Καλησπέρα");

type TodayItem = {
  id: string;
  kind: string;
  title: string;
  meta: string;
  href: string;
  accent?: "urgent" | "default";
  onDismiss?: () => void;
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
  const [createOrgOpen, setCreateOrgOpen] = useState(false);
  const [ingestLabel, setIngestLabel] = useState<string | null>(null);
  const [ingestFresh, setIngestFresh] = useState(true);
  const [expiringCount, setExpiringCount] = useState<number | null>(null);
  const [expiringMatchingReady, setExpiringMatchingReady] = useState(false);
  const [profileProgress, setProfileProgress] = useState<OrgProfileProgress | null>(
    null,
  );
  const [profileBannerDismissed, setProfileBannerDismissed] = useState(false);

  const load = async (opts?: { silent?: boolean }) => {
    if (!activeOrganization) {
      setLoading(false);
      return;
    }
    if (!opts?.silent) setLoading(true);
    setError(null);
    try {
      const firstName = (user?.name || "").split(" ")[0] || null;
      const [data, ingest, expiring, settingsRes] = await Promise.all([
        saasApi.loadOverview(activeOrganization.id, firstName),
        saasApi.getIngestStatus(activeOrganization.id).catch(() => null),
        saasApi.listExpiringContracts(activeOrganization.id).then(
          (row) => ({ ok: true as const, row }),
          () => ({ ok: false as const, row: null }),
        ),
        saasApi.getSettings(activeOrganization.id).catch(() => null),
      ]);
      setOverview(data);
      setIngestLabel(ingest?.labelEl ?? null);
      setIngestFresh(ingest?.fresh ?? true);
      if (expiring.ok && expiring.row) {
        setExpiringCount(expiring.row.count);
        setExpiringMatchingReady(Boolean(expiring.row.matchingReady));
      } else {
        setExpiringCount(null);
        setExpiringMatchingReady(false);
      }
      setProfileProgress(
        settingsRes ? getOrgProfileProgress(settingsRes.settings) : null,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Αποτυχία φόρτωσης");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [activeOrganization?.id, user?.name]);

  useEffect(() => {
    if (!activeOrganization || !user?.id) {
      setProfileBannerDismissed(false);
      return;
    }
    setProfileBannerDismissed(
      readProfileBannerDismissed(
        profileBannerDismissKey(user.id, activeOrganization.id),
      ),
    );
  }, [activeOrganization?.id, user?.id]);

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
      trackAnalyticsEvent("tender_followed", {
        content_type: "tender",
        item_id: opportunity.tender.id,
        source: "overview",
      });
      toast.success("Ο διαγωνισμός προστέθηκε στην Παρακολούθηση.");
      await load({ silent: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Αποτυχία παρακολούθησης");
    }
  };

  if (sessionLoading || (loading && !overview)) return <PageSkeleton />;

  if (!activeOrganization) {
    return (
      <>
        <EmptyState
          title="Δημιουργήστε οργανισμό"
          description="Μετά την εγγραφή δημιουργήστε οργανισμό για να ξεκινήσετε στο δωρεάν πλάνο."
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
  const canEditProfile = canEditOrganizationProfile(activeOrganization.role);
  const showProfileBanner =
    Boolean(profileProgress && !profileProgress.profileComplete) &&
    !profileBannerDismissed;

  const handleDismissProfileBanner = () => {
    if (!activeOrganization || !user?.id) return;
    writeProfileBannerDismissed(
      profileBannerDismissKey(user.id, activeOrganization.id),
    );
    setProfileBannerDismissed(true);
  };

  const handleMarkAttentionRead = (eventId: string) =>
    void saasApi
      .markAttentionRead(activeOrganization.id, eventId)
      .then(() => load({ silent: true }))
      .catch((err) =>
        toast.error(err instanceof Error ? err.message : "Αποτυχία ενημέρωσης"),
      );

  const unreadAttention = overview.attention.filter((event) => !event.readAt);
  const recentOpportunities = overview.opportunities.slice(0, RECENT_OPPORTUNITIES);

  const todayItems: TodayItem[] = [];
  {
    const seen = new Set<string>();
    const push = (item: TodayItem) => {
      if (seen.has(item.id) || todayItems.length >= TODAY_CAP) return;
      seen.add(item.id);
      todayItems.push(item);
    };

    for (const row of overview.deadlines) {
      if (row.daysRemaining > 2) continue;
      const monitored = overview.monitoring.find((m) => m.tender.id === row.tenderId);
      push({
        id: `deadline:${row.tenderId}`,
        kind: "Προθεσμία",
        title: row.title || row.referenceNumber,
        meta:
          row.daysRemaining === 0
            ? "Σήμερα"
            : row.daysRemaining === 1
              ? "Αύριο"
              : `Σε ${row.daysRemaining} ημέρες`,
        href: tenderHref(monitored?.tender.recordType, row.referenceNumber),
        accent: "urgent",
      });
    }

    for (const doc of overview.documentsAttention) {
      push({
        id: `doc:${doc.id}`,
        kind: "Έγγραφο",
        title: doc.name,
        meta: doc.status === "EXPIRED" ? "Έληξε" : "Λήγει σύντομα",
        href: "/app/documents",
        accent: doc.status === "EXPIRED" ? "urgent" : "default",
      });
    }

    for (const event of unreadAttention) {
      const view = attentionEventViewModel(event);
      push({
        id: `attention:${event.id}`,
        kind: view.eyebrow || "Ενημέρωση",
        title: view.primary || event.title,
        meta: view.secondary,
        href: attentionEventHref(event),
        onDismiss: () => handleMarkAttentionRead(event.id),
      });
    }

    for (const action of nextActions) {
      push({
        id: `action:${action.id}`,
        kind: "Ενέργεια",
        title: action.title || action.referenceNumber,
        meta: action.actionLabel,
        href: tenderHref(action.recordType, action.referenceNumber),
      });
    }

    if (overview.metrics.newOpportunities > 0) {
      const n = overview.metrics.newOpportunities;
      push({
        id: "digest:opportunities",
        kind: "Ευκαιρίες",
        title: n === 1 ? "1 νέα ευκαιρία" : `${n} νέες ευκαιρίες`,
        meta: "Από αποθηκευμένες αναζητήσεις",
        href: "/app/opportunities",
      });
    }

    if (expiringMatchingReady && expiringCount != null && expiringCount > 0) {
      push({
        id: "digest:expiring",
        kind: "Συμβάσεις",
        title:
          expiringCount === 1
            ? "1 σύμβαση που λήγει"
            : `${expiringCount} συμβάσεις που λήγουν`,
        meta: "Σε 3–9 μήνες",
        href: "/app/expiring-contracts",
      });
    }
  }

  const todayCount = todayItems.length;
  const statusLine = isBrandNew
    ? "Ξεκινήστε με μία αποθηκευμένη αναζήτηση."
    : todayCount === 0
      ? "Τίποτα επείγον αυτή τη στιγμή."
      : todayCount === 1
        ? "1 θέμα για σήμερα."
        : `${todayCount} θέματα για σήμερα.`;

  return (
    <div className="min-w-0 space-y-8">
      <PageHeader
        title={`${getGreeting()}, ${displayName}`}
        description={statusLine}
        meta={
          !ingestFresh && ingestLabel ? (
            <span className="text-amber-700 dark:text-amber-400">{ingestLabel}</span>
          ) : null
        }
        actions={
          isBrandNew ? null : (
            <Button variant="outline" size="sm" onClick={() => navigate("/app/search")}>
              Αναζήτηση
            </Button>
          )
        }
      />

      {overview.scanningProfiles > 0 ? (
        <div
          className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1.5 text-xs text-primary"
          role="status"
        >
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Εκτελείται έλεγχος αναζητήσεων…
        </div>
      ) : null}

      {showProfileBanner && profileProgress ? (
        <ProfileSetupBanner
          progress={profileProgress}
          canEdit={canEditProfile}
          onDismiss={canEditProfile ? handleDismissProfileBanner : undefined}
          compact
        />
      ) : null}

      {isBrandNew ? (
        <div className="rounded-xl border border-border/50 bg-card/60 px-5 py-8 sm:px-8">
          <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
            Ορίστε κριτήρια μία φορά. Το ARC Tenders εντοπίζει σχετικά αιτήματα και σας
            τα δείχνει εδώ όταν χρειάζονται απόφαση.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button onClick={() => navigate("/app/saved-searches")}>
              Νέα αποθηκευμένη αναζήτηση
            </Button>
            <Button variant="ghost" onClick={() => navigate("/app/search")}>
              Χειροκίνητη αναζήτηση
            </Button>
          </div>
        </div>
      ) : (
        <>
          <MetricStrip>
            <Metric
              label="Νέες ευκαιρίες"
              value={overview.metrics.newOpportunities}
              to="/app/opportunities"
            />
            <Metric
              label="Παρακολουθούμενα"
              value={overview.metrics.monitoringActive}
              to="/app/monitoring"
            />
            <Metric
              label="Προθεσμίες"
              value={overview.metrics.deadlinesSoon}
              to="/app/monitoring"
            />
            <Metric
              label="Υποβολές"
              value={overview.metrics.submissionsActive}
              to="/app/submissions"
            />
          </MetricStrip>

          <div className="grid min-w-0 gap-6 lg:grid-cols-[1.15fr_0.85fr]">
            {/* TODAY — primary visual block */}
            <section
              aria-label="Σήμερα"
              className="min-w-0 overflow-hidden rounded-xl border border-border/50 bg-card/50"
            >
              <div className="flex items-center justify-between border-b border-border/40 px-4 py-3 sm:px-5">
                <h3 className="text-sm font-semibold tracking-tight">Σήμερα</h3>
                {todayCount > 0 ? (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] tabular-nums text-muted-foreground">
                    {todayCount}
                  </span>
                ) : null}
              </div>

              {todayItems.length === 0 ? (
                <div className="flex flex-col items-start gap-2 px-5 py-10 sm:items-center sm:text-center">
                  <CheckCircle2
                    className="h-5 w-5 text-primary/70"
                    aria-hidden
                  />
                  <p className="text-sm font-medium">Όλα εντάξει</p>
                  <p className="max-w-xs text-xs text-muted-foreground">
                    Νέες εξελίξεις θα εμφανιστούν εδώ όταν χρειάζονται ενέργεια.
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-border/40">
                  {todayItems.map((item) => (
                    <li key={item.id}>
                      <div
                        className={cn(
                          "group flex items-stretch gap-0",
                          item.accent === "urgent" && "bg-amber-500/[0.04]",
                        )}
                      >
                        <Link
                          to={item.href}
                          className="flex min-w-0 flex-1 items-start gap-3 px-4 py-3.5 transition-colors hover:bg-muted/30 sm:px-5"
                        >
                          <span
                            className={cn(
                              "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                              item.accent === "urgent"
                                ? "bg-amber-500"
                                : "bg-primary/70",
                            )}
                            aria-hidden
                          />
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge
                                variant="secondary"
                                className="h-5 px-1.5 text-[10px] font-medium"
                              >
                                {item.kind}
                              </Badge>
                              <span className="text-[11px] text-muted-foreground">
                                {item.meta}
                              </span>
                            </div>
                            <p className="line-clamp-2 text-sm font-medium leading-snug text-foreground">
                              {item.title}
                            </p>
                          </div>
                          <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground/50 transition-colors group-hover:text-foreground" />
                        </Link>
                        {item.onDismiss ? (
                          <button
                            type="button"
                            className="shrink-0 border-l border-border/40 px-3 text-[11px] text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                            onClick={item.onDismiss}
                            aria-label="Σήμανση ως αναγνωσμένο"
                          >
                            OK
                          </button>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* OPPORTUNITIES — secondary visual block */}
            <section
              aria-label="Πρόσφατες ευκαιρίες"
              className="min-w-0 overflow-hidden rounded-xl border border-border/50 bg-card/30"
            >
              <div className="flex items-center justify-between border-b border-border/40 px-4 py-3 sm:px-5">
                <h3 className="text-sm font-semibold tracking-tight">Ευκαιρίες</h3>
                <Link
                  to="/app/opportunities"
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Όλες →
                </Link>
              </div>

              {recentOpportunities.length === 0 ? (
                <div className="px-5 py-10 text-center">
                  <p className="text-sm text-muted-foreground">
                    Δεν υπάρχουν ακόμη νέα αποτελέσματα.
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-3"
                    asChild
                  >
                    <Link to="/app/saved-searches">Αποθηκευμένες αναζητήσεις</Link>
                  </Button>
                </div>
              ) : (
                <ul className="divide-y divide-border/40">
                  {recentOpportunities.map((opportunity) => {
                    const meta = parseMatchMeta(opportunity.matchMeta);
                    const topScore = meta?.highestScore ?? opportunity.score ?? 0;
                    return (
                      <li
                        key={opportunity.id}
                        className="flex items-start gap-3 px-4 py-3.5 sm:px-5"
                      >
                        <div className="min-w-0 flex-1 space-y-1.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge
                              variant="outline"
                              className="h-5 px-1.5 font-mono text-[10px]"
                            >
                              {opportunity.tender.recordType}
                            </Badge>
                            <ScoreBadge
                              score={topScore}
                              className="h-5 px-1.5 text-[10px]"
                            />
                            {opportunity.invitationIssued ? (
                              <InvitationIssuedBadge
                                compact
                                relatedProcAdam={opportunity.relatedProcAdam}
                              />
                            ) : null}
                          </div>
                          <Link
                            to={tenderPath(opportunity)}
                            className="line-clamp-2 block text-sm font-medium leading-snug hover:underline"
                          >
                            {opportunity.tender.title || "—"}
                          </Link>
                          <p className="truncate text-xs text-muted-foreground">
                            {opportunity.tender.contractingAuthority || "—"}
                            {" · "}
                            {formatMoney(opportunity.tender.budgetWithoutVat)}
                          </p>
                        </div>
                        {!opportunity.following ? (
                          <Button
                            size="sm"
                            className="shrink-0"
                            onClick={() => void handleFollow(opportunity)}
                          >
                            Παρακολούθηση
                          </Button>
                        ) : (
                          <span className="shrink-0 pt-1 text-[11px] text-muted-foreground">
                            Ενεργή
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>

          <nav
            aria-label="Συντομεύσεις"
            className="flex flex-wrap gap-2"
          >
            {[
              { to: "/app/monitoring", label: "Παρακολουθούμενα" },
              { to: "/app/saved-searches", label: "Αναζητήσεις" },
              { to: "/app/submissions", label: "Υποβολές" },
              { to: "/app/documents", label: "Έγγραφα" },
            ].map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className="rounded-full border border-border/50 bg-muted/20 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-border hover:bg-muted/40 hover:text-foreground"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </>
      )}
    </div>
  );
};
