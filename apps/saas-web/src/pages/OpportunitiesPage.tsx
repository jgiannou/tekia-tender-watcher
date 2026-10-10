import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useSessionContext } from "@/auth/SessionProvider";
import { PdfAction } from "@/components/PdfAction";
import { Pagination, usePaginatedList } from "@/components/Pagination";
import { PdfPreviewModal } from "@/components/PdfPreviewModal";
import { EmptyState, ErrorState, PageSkeleton } from "@/components/states";
import { ScoreBadge } from "@/components/ScoreBadge";
import { SourceBadge } from "@/components/SourceBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Ευκαιρίες</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Δημοσιεύσεις που εντοπίστηκαν αυτόματα από τις αποθηκευμένες αναζητήσεις σας.
            {unreadNewCount > 0
              ? ` · ${unreadNewCount} νέ${unreadNewCount === 1 ? "α" : "ες"} ευκαιρί${unreadNewCount === 1 ? "α" : "ες"}. Η ένδειξη “Νέα” αφαιρείται όταν περάσετε τον δείκτη πάνω από την κάρτα ή ανοίξετε τις λεπτομέρειες.`
              : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="opportunities-sort" className="text-xs text-muted-foreground">
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
          <div className="flex gap-2 pb-1">
            <Badge variant="secondary">REQ</Badge>
            <Badge variant="outline">PROC</Badge>
          </div>
        </div>
      </div>

      {profileFilter ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
          <span>
            Φίλτρο αποθηκευμένης αναζήτησης:{" "}
            <strong>{filterProfileName || profileFilter}</strong> · {filtered.length}{" "}
            {filtered.length === 1 ? "αποτέλεσμα" : "αποτελέσματα"}
          </span>
          <Button size="sm" variant="outline" onClick={handleClearProfileFilter}>
            Καθαρισμός φίλτρου
          </Button>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["Δεν παρακολουθούνται", String(unfollowed)],
          ["Υψηλή συνάφεια με τα κριτήριά σας", String(highScore)],
          ["Παρακολούθηση", String(following)],
          ["Ενεργές αναζητήσεις", String(enabledProfiles.length)],
        ].map(([label, value]) => (
          <Card key={label}>
            <CardHeader className="pb-2">
              <CardDescription>{label}</CardDescription>
              <CardTitle className="text-2xl">{value}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      {filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-4 px-6 py-12 text-center">
            <div className="space-y-2">
              <h3 className="text-base font-semibold">{empty.title}</h3>
              <p className="max-w-lg text-sm text-muted-foreground">{empty.description}</p>
              {empty.showMonitoringNote ? (
                <p className="text-xs text-muted-foreground">
                  Τα παρακολουθούμενα νήματα δεν επηρεάζονται.
                </p>
              ) : null}
            </div>
            {emptyVariant === "no-active" ? (
              <div className="flex flex-wrap justify-center gap-2">
                <Button asChild>
                  <Link to="/app/saved-searches">Νέα αποθηκευμένη αναζήτηση</Link>
                </Button>
                <Button variant="outline" asChild>
                  <Link to="/app/search">Αναζήτηση στο ΚΗΜΔΗΣ</Link>
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {paged.pageItems.map((opportunity) => {
            const meta = parseMatchMeta(opportunity.matchMeta);
            const profilesMatched = meta?.matchedProfiles ?? [];
            const topScore = meta?.highestScore ?? opportunity.score ?? 0;
            const isNew = Boolean(opportunity.isNew);
            return (
              <Card
                key={opportunity.id}
                className={cn(
                  isNew &&
                    "border-primary/50 bg-primary/5 shadow-md shadow-primary/10 ring-1 ring-primary/20",
                )}
                onPointerEnter={() => {
                  if (isNew) void handleMarkSeen(opportunity);
                }}
              >
                <CardContent className="flex flex-col gap-3 px-4 py-4 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {isNew ? <Badge variant="default">Νέα</Badge> : null}
                      <Badge>{opportunity.tender.recordType}</Badge>
                      <SourceBadge
                        referenceNumber={opportunity.tender.referenceNumber}
                      />
                      <span className="font-mono text-xs text-muted-foreground">
                        {opportunity.tender.referenceNumber}
                      </span>
                      <ScoreBadge score={topScore} label="συνάφεια" />
                    </div>
                    <h3 className="text-base font-semibold leading-snug">
                      {opportunity.tender.title || "—"}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {opportunity.tender.contractingAuthority || "—"}
                    </p>
                    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                      <span>
                        Αξία: {formatMoney(opportunity.tender.budgetWithoutVat)}
                      </span>
                      <span>
                        Καταχώριση: {formatDate(opportunity.tender.submissionDate)}
                      </span>
                      {opportunity.tender.finalSubmissionDate ? (
                        <span>
                          Προθεσμία υποβολής:{" "}
                          {formatDate(opportunity.tender.finalSubmissionDate)}
                        </span>
                      ) : null}
                    </div>
                    {profilesMatched.length ? (
                      <div className="space-y-1 text-xs text-muted-foreground">
                        <div>
                          Αναζήτηση: {profilesMatched.map((p) => p.name).join(" · ")}
                        </div>
                        <ul className="space-y-0.5">
                          {[
                            ...new Set(profilesMatched.flatMap((p) => p.reasons)),
                          ]
                            .slice(0, 4)
                            .map((reason) => (
                              <li key={reason}>✓ {formatMatchReason(reason)}</li>
                            ))}
                        </ul>
                      </div>
                    ) : opportunity.watchProfile ? (
                      <div className="text-xs text-muted-foreground">
                        Αναζήτηση: {opportunity.watchProfile.name}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <PdfAction
                      onClick={() => {
                        void handleMarkSeen(opportunity);
                        setSelected(opportunity);
                      }}
                    />
                    <Button size="sm" variant="outline" asChild>
                      <Link
                        to={tenderPath(opportunity)}
                        onClick={() => void handleMarkSeen(opportunity)}
                      >
                        Προβολή λεπτομερειών
                      </Link>
                    </Button>
                    {!opportunity.following ? (
                      <Button size="sm" onClick={() => void handleFollow(opportunity)}>
                        Παρακολούθηση
                      </Button>
                    ) : (
                      <Badge variant="success">Παρακολουθείται</Badge>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void handleDismiss(opportunity)}
                    >
                      {isExpiredDeadline(opportunity.tender.finalSubmissionDate)
                        ? "Σήμανση ως ληγμένο"
                        : "Απόκρυψη"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
          <Pagination
            page={paged.page}
            totalPages={paged.totalPages}
            total={paged.total}
            pageSize={paged.pageSize}
            onPageChange={paged.setPage}
          />
        </div>
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
