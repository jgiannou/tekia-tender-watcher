import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useSessionContext } from "@/auth/SessionProvider";
import { PdfAction } from "@/components/PdfAction";
import { Pagination, usePaginatedList } from "@/components/Pagination";
import { PdfPreviewModal } from "@/components/PdfPreviewModal";
import { EmptyState, ErrorState, PageSkeleton } from "@/components/states";
import { InvitationIssuedBadge } from "@/components/InvitationIssuedBadge";
import { ScoreBadge } from "@/components/ScoreBadge";
import { SourceBadge } from "@/components/SourceBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataList, DataRow } from "@/components/ui/data-row";
import { Metric, MetricStrip } from "@/components/ui/metric";
import { PageHeader } from "@/components/ui/page-header";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  saasApi,
  type Opportunity,
  type SaasEntitlementsResponse,
  type WatchProfile,
} from "@/lib/api";
import { trackAnalyticsEvent } from "@/lib/analytics";
import { formatMatchReason } from "@/lib/matchReasons";
import { cn } from "@/lib/utils";

type OpportunitySort = "newest" | "oldest" | "score" | "deadline";

const SORT_OPTIONS: Array<{ value: OpportunitySort; label: string }> = [
  { value: "newest", label: "Πιο πρόσφατες πρώτα" },
  { value: "oldest", label: "Παλαιότερα πρώτα" },
  { value: "score", label: "Υψηλότερη συνάφεια" },
  { value: "deadline", label: "Κοντινότερη προθεσμία" },
];

/** Match reasons shown inline; the rest sit behind "Γιατί εμφανίστηκε;". */
const MAX_VISIBLE_REASONS = 2;

const SCAN_FORCE_RETRY_MS = 3 * 60 * 1000;

const canForceRetryStuckScan = (profile: WatchProfile): boolean => {
  const state = (profile.scanState ?? "").toUpperCase();
  if (state !== "RUNNING" && state !== "PENDING") return false;
  const started = profile.updatedAt ? new Date(profile.updatedAt).getTime() : NaN;
  if (Number.isNaN(started)) return false;
  return Date.now() - started >= SCAN_FORCE_RETRY_MS;
};

const isScanBusy = (profile: WatchProfile): boolean => {
  const state = (profile.scanState ?? "").toUpperCase();
  return (
    (state === "PENDING" || state === "RUNNING") && !canForceRetryStuckScan(profile)
  );
};

const parseSort = (raw: string | null): OpportunitySort => {
  if (raw === "oldest" || raw === "score" || raw === "deadline" || raw === "newest") {
    return raw;
  }
  return "newest";
};

const dateMs = (value: string | null | undefined): number => {
  if (!value) return Number.NaN;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : Number.NaN;
};

const sortOpportunities = (
  rows: Opportunity[],
  sort: OpportunitySort,
): Opportunity[] => {
  const copy = [...rows];
  const cmpNullableDesc = (x: number, y: number) => {
    if (Number.isNaN(x) && Number.isNaN(y)) return 0;
    if (Number.isNaN(x)) return 1;
    if (Number.isNaN(y)) return -1;
    return y - x;
  };
  const cmpNullableAsc = (x: number, y: number) => {
    if (Number.isNaN(x) && Number.isNaN(y)) return 0;
    if (Number.isNaN(x)) return 1;
    if (Number.isNaN(y)) return -1;
    return x - y;
  };

  copy.sort((a, b) => {
    const scoreA = a.score ?? -1;
    const scoreB = b.score ?? -1;
    const subA = dateMs(a.tender.submissionDate);
    const subB = dateMs(b.tender.submissionDate);
    const deadA = dateMs(a.tender.finalSubmissionDate);
    const deadB = dateMs(b.tender.finalSubmissionDate);

    if (sort === "oldest") return cmpNullableAsc(subA, subB);
    if (sort === "score") {
      if (scoreB !== scoreA) return scoreB - scoreA;
      return cmpNullableDesc(subA, subB);
    }
    if (sort === "deadline") {
      const byDeadline = cmpNullableAsc(deadA, deadB);
      if (byDeadline !== 0) return byDeadline;
      return cmpNullableDesc(subA, subB);
    }
    const byDate = cmpNullableDesc(subA, subB);
    if (byDate !== 0) return byDate;
    return scoreB - scoreA;
  });
  return copy;
};

const tenderPath = (opportunity: Opportunity) => {
  const ref = opportunity.tender.referenceNumber;
  if (ref.startsWith("TED:") || ref.startsWith("DIAVGEIA:")) {
    return `/app/tenders/PROC/${encodeURIComponent(ref)}`;
  }
  const type =
    opportunity.tender.recordType === "PROC" || opportunity.tender.recordType === "REQ"
      ? opportunity.tender.recordType
      : "REQ";
  return `/app/tenders/${type}/${encodeURIComponent(ref)}`;
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

const isExpiredDeadline = (value?: string | null) => {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return date.getTime() < Date.now();
};

const parseMatchMeta = (value: unknown): Opportunity["matchMeta"] => {
  if (!value || typeof value !== "object") return null;
  const meta = value as Opportunity["matchMeta"];
  if (!meta?.matchedProfiles) return null;
  return meta;
};

const matchesProfile = (opportunity: Opportunity, profileId: string): boolean => {
  const meta = parseMatchMeta(opportunity.matchMeta);
  // matchedProfiles is the active association after full-scan reconciliation.
  if (meta?.matchedProfiles.some((profile) => profile.id === profileId)) return true;
  // Legacy rows that never got matchMeta still use the primary watchProfileId.
  if ((meta?.matchedProfiles.length ?? 0) === 0) {
    return (
      opportunity.watchProfileId === profileId ||
      opportunity.watchProfile?.id === profileId
    );
  }
  return false;
};

export const OpportunitiesPage = () => {
  const { activeOrganization } = useSessionContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const profileFilter = searchParams.get("profile")?.trim() || null;
  const sort = parseSort(searchParams.get("sort"));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [profiles, setProfiles] = useState<WatchProfile[]>([]);
  const [entitlements, setEntitlements] = useState<SaasEntitlementsResponse | null>(
    null,
  );
  const [selected, setSelected] = useState<Opportunity | null>(null);
  const [scanBusy, setScanBusy] = useState(false);

  const filtered = useMemo(() => {
    const base = profileFilter
      ? opportunities.filter((row) => matchesProfile(row, profileFilter))
      : opportunities;
    const sorted = sortOpportunities(base, sort);
    // Unread search matches stay pinned above the chosen sort.
    return [...sorted].sort((a, b) => Number(Boolean(b.isNew)) - Number(Boolean(a.isNew)));
  }, [opportunities, profileFilter, sort]);

  const unreadNewCount = useMemo(
    () => filtered.filter((row) => row.isNew).length,
    [filtered],
  );

  const filterProfileName =
    profiles.find((profile) => profile.id === profileFilter)?.name ?? null;

  const paged = usePaginatedList(filtered, {
    resetKey: `${profileFilter ?? "all"}:${sort}:${filtered.length}`,
  });

  const handleSortChange = (next: OpportunitySort) => {
    const params = new URLSearchParams(searchParams);
    if (next === "newest") params.delete("sort");
    else params.set("sort", next);
    setSearchParams(params, { replace: true });
  };

  const load = async (opts?: { silent?: boolean }) => {
    if (!activeOrganization) {
      setLoading(false);
      return;
    }
    if (!opts?.silent) setLoading(true);
    setError(null);
    try {
      const [oppData, profileData, ent] = await Promise.all([
        saasApi.listOpportunities(activeOrganization.id, { sort }),
        saasApi.listWatchProfiles(activeOrganization.id),
        saasApi.getEntitlements(activeOrganization.id).catch(() => null),
      ]);
      setOpportunities(
        oppData.opportunities.map((row) => ({
          ...row,
          matchMeta: parseMatchMeta(row.matchMeta),
        })),
      );
      setProfiles(profileData.profiles);
      setEntitlements(ent);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Αποτυχία φόρτωσης");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [activeOrganization?.id]);

  const scanInFlight = profiles.some((profile) =>
    ["PENDING", "RUNNING"].includes((profile.scanState ?? "").toUpperCase()),
  );

  useEffect(() => {
    if (!activeOrganization || !scanInFlight) return;
    const timer = window.setInterval(() => {
      void load({ silent: true });
    }, 2000);
    return () => window.clearInterval(timer);
  }, [activeOrganization?.id, scanInFlight]);

  const enabledProfiles = useMemo(
    () => profiles.filter((p) => p.enabled),
    [profiles],
  );

  const scanTargets = useMemo(() => {
    if (!profileFilter) return enabledProfiles;
    return enabledProfiles.filter((p) => p.id === profileFilter);
  }, [enabledProfiles, profileFilter]);

  const scanAccess = entitlements?.scanAccess ?? null;
  const profileScansBlocked = scanAccess
    ? !scanAccess.canRunManualProfileScan
    : false;
  const anyTargetScanning = scanTargets.some(isScanBusy);

  const handleScan = async () => {
    if (!activeOrganization) return;
    if (scanTargets.length === 0) {
      toast.message(
        profileFilter
          ? "Η αποθηκευμένη αναζήτηση δεν είναι ενεργή."
          : "Δεν υπάρχουν ενεργές αποθηκευμένες αναζητήσεις.",
      );
      return;
    }
    if (profileScansBlocked) {
      toast.error("Ο χειροκίνητος έλεγχος δεν είναι διαθέσιμος για τον λογαριασμό σας.");
      return;
    }
    setScanBusy(true);
    try {
      await Promise.all(
        scanTargets.map((profile) =>
          saasApi.scanWatchProfile(activeOrganization.id, profile.id, {
            force: canForceRetryStuckScan(profile),
          }),
        ),
      );
      toast.success(
        scanTargets.length === 1
          ? `Ο έλεγχος ξεκίνησε για «${scanTargets[0]?.name}».`
          : `Ξεκίνησαν ${scanTargets.length} έλεγχοι.`,
      );
      await load({ silent: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Αποτυχία ελέγχου");
    } finally {
      setScanBusy(false);
    }
  };

  const handleFollow = async (opportunity: Opportunity) => {
    if (!activeOrganization) return;
    try {
      await saasApi.followTender(activeOrganization.id, opportunity.tender.id);
      trackAnalyticsEvent("tender_followed", {
        content_type: "tender",
        item_id: opportunity.tender.id,
        source: "opportunities",
      });
      toast.success("Ο διαγωνισμός προστέθηκε στην Παρακολούθηση.");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Αποτυχία παρακολούθησης");
    }
  };

  const handleDismiss = async (opportunity: Opportunity) => {
    if (!activeOrganization) return;
    const expired = isExpiredDeadline(opportunity.tender.finalSubmissionDate);
    const confirmed = window.confirm(
      expired
        ? "Να σημανθεί ως ληγμένο και να μην εμφανίζεται ξανά στις ευκαιρίες;"
        : "Να αποκρυφτεί αυτή η ευκαιρία ώστε να μην εμφανίζεται ξανά;",
    );
    if (!confirmed) return;
    try {
      await saasApi.dismissTender(
        activeOrganization.id,
        opportunity.tender.id,
        expired ? "EXPIRED" : "NOT_INTERESTED",
      );
      toast.success(
        expired
          ? "Σημάνθηκε ως ληγμένο και αποκρύφτηκε."
          : "Η ευκαιρία αποκρύφτηκε.",
      );
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Αποτυχία απόκρυψης");
    }
  };

  const handleMarkSeen = async (opportunity: Opportunity) => {
    if (!activeOrganization || !opportunity.isNew) return;
    setOpportunities((prev) =>
      prev.map((row) =>
        row.id === opportunity.id
          ? { ...row, isNew: false, attentionEventId: null }
          : row,
      ),
    );
    try {
      await saasApi.markOpportunitySeen(activeOrganization.id, opportunity.id);
    } catch {
      // Keep optimistic clear; next reload restores if the call failed.
    }
  };

  if (loading && opportunities.length === 0) return <PageSkeleton />;
  if (!activeOrganization) {
    return (
      <EmptyState
        title="Χωρίς οργανισμό"
        description="Δημιουργήστε οργανισμό για αυτόματες ευκαιρίες."
      />
    );
  }
  if (error) return <ErrorState description={error} onRetry={() => void load()} />;

  const scanning = profiles.some(
    (p) => p.enabled && (p.scanState ?? "").toUpperCase() === "RUNNING",
  );
  const unfollowed = filtered.filter((o) => !o.following).length;
  const highScore = filtered.filter((o) => (o.score ?? 0) >= 70).length;
  const following = filtered.filter((o) => o.following).length;

  const scanButtonLabel = (() => {
    if (scanBusy || anyTargetScanning) return "Έλεγχος…";
    if (profileFilter && filterProfileName) return `Έλεγχος τώρα «${filterProfileName}»`;
    if (scanTargets.length > 1) return `Έλεγχος τώρα (${scanTargets.length})`;
    return "Έλεγχος τώρα";
  })();

  type EmptyVariant = "no-active" | "scanning" | "none-found";
  let emptyVariant: EmptyVariant = "none-found";
  if (enabledProfiles.length === 0) {
    emptyVariant = "no-active";
  } else if (scanning) {
    emptyVariant = "scanning";
  }

  const emptyCopy: Record<
    EmptyVariant,
    { title: string; description: string; showMonitoringNote?: boolean }
  > = {
    "no-active": {
      title: "Δεν υπάρχουν ενεργές αποθηκευμένες αναζητήσεις",
      description:
        "Δημιουργήστε αποθηκευμένη αναζήτηση ή ξεκινήστε με χειροκίνητη αναζήτηση στο ΚΗΜΔΗΣ.",
    },
    scanning: {
      title: "Αναζητούμε τις πρώτες ευκαιρίες σας.",
      description:
        "Αξιολογούμε πρόσφατες πράξεις ΚΗΜΔΗΣ με βάση τις ενεργές αποθηκευμένες αναζητήσεις σας.",
    },
    "none-found": {
      title: profileFilter
        ? "Καμία ευκαιρία για αυτή την αποθηκευμένη αναζήτηση"
        : "Δεν βρέθηκαν πρόσφατες σχετικές ευκαιρίες.",
      description: profileFilter
        ? "Το φίλτρο προφίλ εφαρμόζεται· καθαρίστε το για όλες τις ευκαιρίες ή περιμένετε νέο match."
        : "Οι αναζητήσεις παραμένουν ενεργές — θα ενημερωθείτε όταν εμφανιστεί κάτι σχετικό.",
      showMonitoringNote: !profileFilter,
    },
  };
  const empty = emptyCopy[emptyVariant];

  const handleClearProfileFilter = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("profile");
    setSearchParams(next, { replace: true });
  };

  const pageDescription = (
    <>
      Δημοσιεύσεις που εντοπίστηκαν αυτόματα από τις αποθηκευμένες αναζητήσεις σας.
      {unreadNewCount > 0
        ? ` ${unreadNewCount} νέ${unreadNewCount === 1 ? "α" : "ες"} — η ένδειξη «Νέα» αφαιρείται όταν περάσετε τον δείκτη πάνω από τη γραμμή ή ανοίξετε τις λεπτομέρειες.`
        : ""}
    </>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ευκαιρίες"
        description={pageDescription}
        actions={
          <>
            <div className="flex items-center gap-2">
              <Label
                htmlFor="opportunities-sort"
                className="text-xs text-muted-foreground"
              >
                Ταξινόμηση
              </Label>
              <Select
                id="opportunities-sort"
                value={sort}
                onChange={(e) => handleSortChange(e.target.value as OpportunitySort)}
                aria-label="Ταξινόμηση ευκαιριών"
                className="w-[13.5rem]"
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
            <Button
              onClick={() => void handleScan()}
              disabled={
                scanBusy ||
                profileScansBlocked ||
                scanTargets.length === 0 ||
                anyTargetScanning
              }
              aria-label="Έλεγχος αποθηκευμένων αναζητήσεων"
            >
              {scanButtonLabel}
            </Button>
          </>
        }
      />

      {profileFilter ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/30 px-3 py-2 text-sm">
          <span>
            Φίλτρο αποθηκευμένης αναζήτησης:{" "}
            <strong>{filterProfileName || profileFilter}</strong> · {filtered.length}{" "}
            {filtered.length === 1 ? "αποτέλεσμα" : "αποτελέσματα"}
          </span>
          <Button size="sm" variant="ghost" onClick={handleClearProfileFilter}>
            Καθαρισμός φίλτρου
          </Button>
        </div>
      ) : null}

      <MetricStrip>
        <Metric label="Δεν παρακολουθούνται" value={unfollowed} />
        <Metric label="Υψηλή συνάφεια" value={highScore} hint="≥ 70% με τα κριτήριά σας" />
        <Metric label="Παρακολούθηση" value={following} />
        <Metric label="Ενεργές αναζητήσεις" value={enabledProfiles.length} />
      </MetricStrip>

      {filtered.length === 0 ? (
        <EmptyState
          title={empty.title}
          description={
            empty.showMonitoringNote
              ? `${empty.description} Τα παρακολουθούμενα νήματα δεν επηρεάζονται.`
              : empty.description
          }
        >
          {emptyVariant === "no-active" ? (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" asChild>
                <Link to="/app/saved-searches">Νέα αποθηκευμένη αναζήτηση</Link>
              </Button>
              <Button size="sm" variant="outline" asChild>
                <Link to="/app/search">Αναζήτηση στο ΚΗΜΔΗΣ</Link>
              </Button>
            </div>
          ) : null}
        </EmptyState>
      ) : (
        <section aria-label="Λίστα ευκαιριών">
          <DataList>
            {paged.pageItems.map((opportunity) => {
              const meta = parseMatchMeta(opportunity.matchMeta);
              const profilesMatched = meta?.matchedProfiles ?? [];
              const topScore = meta?.highestScore ?? opportunity.score ?? 0;
              const isNew = Boolean(opportunity.isNew);
              const invitationIssued = Boolean(opportunity.invitationIssued);
              const reasons = [
                ...new Set(profilesMatched.flatMap((p) => p.reasons)),
              ].map(formatMatchReason);
              const visibleReasons = reasons.slice(0, MAX_VISIBLE_REASONS);
              const hiddenReasons = reasons.slice(MAX_VISIBLE_REASONS);
              const profileNames = profilesMatched.length
                ? profilesMatched.map((p) => p.name).join(" · ")
                : (opportunity.watchProfile?.name ?? null);
              const detailPath = tenderPath(opportunity);
              const metaLine = [
                opportunity.tender.contractingAuthority || "—",
                formatMoney(opportunity.tender.budgetWithoutVat),
                formatDate(opportunity.tender.submissionDate),
                opportunity.tender.finalSubmissionDate
                  ? `Προθεσμία ${formatDate(opportunity.tender.finalSubmissionDate)}`
                  : null,
              ]
                .filter(Boolean)
                .join(" · ");

              return (
                <div
                  key={opportunity.id}
                  className="border-b border-border/50 last:border-b-0"
                  onPointerEnter={() => {
                    if (isNew) void handleMarkSeen(opportunity);
                  }}
                >
                  <DataRow
                    interactive
                    className={cn(
                      "gap-2 border-b-0 py-3 sm:gap-4",
                      isNew && "-ml-3 border-l-2 border-l-primary pl-[0.625rem]",
                      invitationIssued &&
                        !isNew &&
                        "-ml-3 border-l-2 border-l-destructive/60 pl-[0.625rem]",
                    )}
                    actions={
                      <div className="flex flex-col gap-1.5 sm:items-end">
                        <div className="flex flex-wrap items-center gap-2">
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
                          <Button size="sm" variant="outline" asChild>
                            <Link
                              to={detailPath}
                              onClick={() => void handleMarkSeen(opportunity)}
                            >
                              Προβολή
                            </Link>
                          </Button>
                        </div>
                        <div className="flex flex-wrap items-center gap-1">
                          <PdfAction
                            className="h-7 border-transparent bg-transparent px-2 text-xs font-medium text-muted-foreground shadow-none hover:text-foreground"
                            onClick={() => {
                              void handleMarkSeen(opportunity);
                              setSelected(opportunity);
                            }}
                          />
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-muted-foreground hover:text-foreground"
                            onClick={() => void handleDismiss(opportunity)}
                          >
                            {isExpiredDeadline(opportunity.tender.finalSubmissionDate)
                              ? "Σήμανση ως ληγμένο"
                              : "Απόκρυψη"}
                          </Button>
                        </div>
                      </div>
                    }
                  >
                    <div className="space-y-1">
                      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                        {isNew ? <Badge variant="default">Νέα</Badge> : null}
                        <Badge variant="outline">{opportunity.tender.recordType}</Badge>
                        <span title="Συνάφεια με τα κριτήριά σας">
                          <ScoreBadge score={topScore} />
                        </span>
                        <h3 className="min-w-0 text-sm font-semibold leading-snug">
                          <Link
                            to={detailPath}
                            onClick={() => void handleMarkSeen(opportunity)}
                            className="hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            {opportunity.tender.title || "—"}
                          </Link>
                        </h3>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                        <span className="min-w-0">{metaLine}</span>
                        <span className="font-mono">
                          {opportunity.tender.referenceNumber}
                        </span>
                        <SourceBadge
                          referenceNumber={opportunity.tender.referenceNumber}
                        />
                        {invitationIssued ? (
                          <InvitationIssuedBadge
                            relatedProcAdam={opportunity.relatedProcAdam}
                          />
                        ) : null}
                      </div>
                      {profileNames ? (
                        <p className="text-xs text-muted-foreground">
                          Από: <span className="text-foreground/80">{profileNames}</span>
                        </p>
                      ) : null}
                      {visibleReasons.length ? (
                        <ul className="space-y-0.5 text-xs text-muted-foreground">
                          {visibleReasons.map((reason) => (
                            <li key={reason}>✓ {reason}</li>
                          ))}
                        </ul>
                      ) : null}
                      {hiddenReasons.length ? (
                        <details className="group/why text-xs text-muted-foreground">
                          <summary className="cursor-pointer select-none text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                            Γιατί εμφανίστηκε; (+{hiddenReasons.length})
                          </summary>
                          <ul className="mt-1 space-y-0.5">
                            {hiddenReasons.map((reason) => (
                              <li key={reason}>✓ {reason}</li>
                            ))}
                          </ul>
                        </details>
                      ) : null}
                    </div>
                  </DataRow>
                </div>
              );
            })}
          </DataList>
          <Pagination
            page={paged.page}
            totalPages={paged.totalPages}
            total={paged.total}
            pageSize={paged.pageSize}
            onPageChange={paged.setPage}
          />
        </section>
      )}

      <PdfPreviewModal
        open={Boolean(
          selected &&
            (selected.tender.recordType === "REQ" ||
              selected.tender.recordType === "PROC"),
        )}
        onOpenChange={(open) => !open && setSelected(null)}
        organizationId={activeOrganization.id}
        recordType={
          selected?.tender.recordType === "PROC" ? "PROC" : "REQ"
        }
        adam={selected?.tender.referenceNumber ?? ""}
        title={selected?.tender.title}
        officialUrl={selected?.tender.publicKimdisUrl}
        actions={
          selected ? (
            <Button size="sm" variant="outline" asChild>
              <Link to={tenderPath(selected)} onClick={() => setSelected(null)}>
                Άνοιγμα σελίδας πράξης
              </Link>
            </Button>
          ) : null
        }
      />
    </div>
  );
};
