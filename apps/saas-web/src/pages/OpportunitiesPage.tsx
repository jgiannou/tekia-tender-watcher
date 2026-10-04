import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Eye } from "lucide-react";
import { toast } from "sonner";
import { useSessionContext } from "@/auth/SessionProvider";
import { IconAction } from "@/components/IconAction";
import { Pagination, usePaginatedList } from "@/components/Pagination";
import { PdfPreviewModal } from "@/components/PdfPreviewModal";
import { EmptyState, ErrorState, PageSkeleton } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { saasApi, type Opportunity, type WatchProfile } from "@/lib/api";

const tenderPath = (opportunity: Opportunity) => {
  const type =
    opportunity.tender.recordType === "PROC" || opportunity.tender.recordType === "REQ"
      ? opportunity.tender.recordType
      : "REQ";
  return `/app/tenders/${type}/${encodeURIComponent(opportunity.tender.referenceNumber)}`;
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

const parseMatchMeta = (value: unknown): Opportunity["matchMeta"] => {
  if (!value || typeof value !== "object") return null;
  const meta = value as Opportunity["matchMeta"];
  if (!meta?.matchedProfiles) return null;
  return meta;
};

const matchesProfile = (opportunity: Opportunity, profileId: string): boolean => {
  if (opportunity.watchProfileId === profileId) return true;
  if (opportunity.watchProfile?.id === profileId) return true;
  const meta = parseMatchMeta(opportunity.matchMeta);
  return Boolean(meta?.matchedProfiles.some((profile) => profile.id === profileId));
};

export const OpportunitiesPage = () => {
  const { activeOrganization } = useSessionContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const profileFilter = searchParams.get("profile")?.trim() || null;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [profiles, setProfiles] = useState<WatchProfile[]>([]);
  const [selected, setSelected] = useState<Opportunity | null>(null);

  const filtered = useMemo(() => {
    if (!profileFilter) return opportunities;
    return opportunities.filter((row) => matchesProfile(row, profileFilter));
  }, [opportunities, profileFilter]);

  const filterProfileName =
    profiles.find((profile) => profile.id === profileFilter)?.name ?? null;

  const paged = usePaginatedList(filtered, {
    resetKey: `${profileFilter ?? "all"}:${filtered.length}`,
  });

  const load = async () => {
    if (!activeOrganization) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [oppData, profileData] = await Promise.all([
        saasApi.listOpportunities(activeOrganization.id),
        saasApi.listWatchProfiles(activeOrganization.id),
      ]);
      setOpportunities(
        oppData.opportunities.map((row) => ({
          ...row,
          matchMeta: parseMatchMeta(row.matchMeta),
        })),
      );
      setProfiles(profileData.profiles);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Αποτυχία φόρτωσης");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [activeOrganization?.id]);

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

  if (loading) return <PageSkeleton />;
  if (!activeOrganization) {
    return (
      <EmptyState
        title="Χωρίς οργανισμό"
        description="Δημιουργήστε οργανισμό για αυτόματες ευκαιρίες."
      />
    );
  }
  if (error) return <ErrorState description={error} onRetry={() => void load()} />;

  const enabledProfiles = profiles.filter((p) => p.enabled);
  const scanning = profiles.some(
    (p) => p.enabled && (p.scanState ?? "").toUpperCase() === "RUNNING",
  );
  const highScore = filtered.filter((o) => (o.score ?? 0) >= 70).length;
  const following = filtered.filter((o) => o.following).length;

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
            Ό,τι βρήκαν αυτόματα οι αποθηκευμένες αναζητήσεις σας.
          </p>
        </div>
        <div className="flex gap-2">
          <Badge variant="secondary">REQ</Badge>
          <Badge variant="outline">PROC</Badge>
        </div>
      </div>

      {profileFilter ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
          <span>
            Φίλτρο αποθηκευμένης αναζήτησης:{" "}
            <strong>{filterProfileName || profileFilter}</strong> · {filtered.length}{" "}
            αποτελέσματα
          </span>
          <Button size="sm" variant="outline" onClick={handleClearProfileFilter}>
            Καθαρισμός φίλτρου
          </Button>
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-4">
        {[
          ["Νέα", String(filtered.length)],
          ["Υψηλή συνάφεια", String(highScore)],
          ["Παρακολουθούμενα", String(following)],
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
                  <Link to="/app/saved-searches">Νέα Αποθηκευμένη Αναζήτηση</Link>
                </Button>
                <Button variant="outline" asChild>
                  <Link to="/app/search">Αναζήτηση ΚΗΜΔΗΣ</Link>
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
            return (
              <Card key={opportunity.id}>
                <CardContent className="flex flex-col gap-3 px-4 py-4 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge>{opportunity.tender.recordType}</Badge>
                      <span className="font-mono text-xs text-muted-foreground">
                        {opportunity.tender.referenceNumber}
                      </span>
                      <Badge variant="secondary">{topScore}% συνάφεια</Badge>
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
                          Καταληκτική:{" "}
                          {formatDate(opportunity.tender.finalSubmissionDate)}
                        </span>
                      ) : null}
                    </div>
                    {profilesMatched.length ? (
                      <div className="space-y-1 text-xs text-muted-foreground">
                        <div>
                          Βρέθηκε από: {profilesMatched.map((p) => p.name).join(" · ")}
                        </div>
                        <ul className="space-y-0.5">
                          {[
                            ...new Set(profilesMatched.flatMap((p) => p.reasons)),
                          ]
                            .slice(0, 4)
                            .map((reason) => (
                              <li key={reason}>✓ {reason}</li>
                            ))}
                        </ul>
                      </div>
                    ) : opportunity.watchProfile ? (
                      <div className="text-xs text-muted-foreground">
                        Βρέθηκε από: {opportunity.watchProfile.name}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <IconAction
                      label="Προεπισκόπηση PDF"
                      onClick={() => setSelected(opportunity)}
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
