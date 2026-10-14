import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { useSessionContext } from "@/auth/SessionProvider";
import { EmptyState, ErrorState, PageSkeleton } from "@/components/states";
import { Button } from "@/components/ui/button";
import { DataColumn, DataColumnHeader } from "@/components/ui/data-column";
import { DataList, DataRow } from "@/components/ui/data-row";
import { PageHeader, SectionHeader } from "@/components/ui/page-header";
import { trackAnalyticsEvent } from "@/lib/analytics";
import { saasApi, type ExpiringContractRow } from "@/lib/api";
import {
  canEditOrganizationProfile,
  getOrgProfileProgress,
  type OrgProfileProgress,
} from "@/lib/org-profile";
import { cn } from "@/lib/utils";

const formatDate = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value.slice(0, 10) : date.toLocaleDateString("el-GR");
};

const DAY_MS = 24 * 60 * 60 * 1000;
/** Radar window: contracts matched when ending within ~9 months. */
const RADAR_WINDOW_DAYS = 270;
const SOON_THRESHOLD_DAYS = 120;

const daysUntil = (value: string): number | null => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Math.ceil((date.getTime() - Date.now()) / DAY_MS);
};

const remainingLabel = (days: number | null) => {
  if (days == null) return "—";
  if (days < 0) return "Έχει λήξει";
  if (days === 0) return "Λήγει σήμερα";
  if (days < 45) return `${days} ${days === 1 ? "ημέρα" : "ημέρες"}`;
  const months = Math.round(days / 30);
  return `~${months} ${months === 1 ? "μήνας" : "μήνες"}`;
};

type TimeToExpiryProps = { days: number | null };

/** Subtle indicator — the closer the expiry, the fuller the bar. */
const TimeToExpiry = ({ days }: TimeToExpiryProps) => {
  const fill =
    days == null
      ? 0
      : Math.min(100, Math.max(6, Math.round((1 - days / RADAR_WINDOW_DAYS) * 100)));
  const soon = days != null && days <= SOON_THRESHOLD_DAYS;
  return (
    <div className="space-y-1">
      <div className="text-sm tabular-nums text-foreground">{remainingLabel(days)}</div>
      <div
        className="h-1 w-20 overflow-hidden rounded-full bg-muted"
        role="presentation"
      >
        <div
          className={cn("h-full rounded-full", soon ? "bg-primary" : "bg-primary/40")}
          style={{ width: `${fill}%` }}
        />
      </div>
    </div>
  );
};

const ROW_GRID =
  "grid gap-x-4 gap-y-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,2.4fr)_minmax(0,1.6fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_minmax(0,1fr)_13.5rem] lg:items-center";

export const ExpiringContractsPage = () => {
  const { activeOrganization } = useSessionContext();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [count, setCount] = useState(0);
  const [items, setItems] = useState<ExpiringContractRow[]>([]);
  const [listAvailable, setListAvailable] = useState(false);
  const [matchingReady, setMatchingReady] = useState(false);
  const [profileProgress, setProfileProgress] = useState<OrgProfileProgress | null>(
    null,
  );
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    if (!activeOrganization) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [data, settingsRes] = await Promise.all([
        saasApi.listExpiringContracts(activeOrganization.id),
        saasApi.getSettings(activeOrganization.id).catch(() => null),
      ]);
      setCount(data.count);
      setItems(data.items);
      setListAvailable(data.listAvailable);
      setMatchingReady(Boolean(data.matchingReady));
      setProfileProgress(
        settingsRes ? getOrgProfileProgress(settingsRes.settings) : null,
      );
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Αποτυχία φόρτωσης");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [activeOrganization?.id]);

  const handleFollow = async (row: ExpiringContractRow) => {
    if (!activeOrganization) return;
    setBusyId(row.tenderId);
    try {
      await saasApi.followTender(activeOrganization.id, row.tenderId);
      trackAnalyticsEvent("tender_followed", {
        content_type: "contract",
        item_id: row.tenderId,
        source: "expiring_contracts",
      });
      toast.success("Προστέθηκε στην παρακολούθηση");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Αποτυχία παρακολούθησης");
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <PageSkeleton />;
  if (error) {
    return <ErrorState description={error} onRetry={() => void load()} />;
  }

  const canEdit = canEditOrganizationProfile(activeOrganization?.role);
  const setupPath = profileProgress?.setupPath ?? "/app/setup?step=activities";

  const title = !matchingReady
    ? "Ανακάλυψε συμβάσεις που σε αφορούν"
    : count === 0
      ? "Δεν εντοπίστηκαν σχετικές συμβάσεις που λήγουν τους επόμενους 3–9 μήνες."
      : count === 1
        ? "1 σχετική σύμβαση λήγει τους επόμενους 3–9 μήνες."
        : `${count} σχετικές συμβάσεις λήγουν τους επόμενους 3–9 μήνες.`;

  const description = !matchingReady
    ? "Συμπλήρωσε τη δραστηριότητα της επιχείρησής σου για να εντοπίζουμε σχετικές συμβάσεις που πλησιάζουν στη λήξη τους."
    : "Παρακολουθήστε αυτές τις συμβάσεις για ενδεχόμενη νέα προκήρυξη μετά τη λήξη τους.";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Συμβάσεις που λήγουν"
        description="Συμβάσεις που λήγουν σε 3–9 μήνες, όταν υπάρχουν κριτήρια αντιστοίχισης από δραστηριότητα (ΚΑΔ) ή αποθηκευμένη αναζήτηση."
      />

      <section>
        <SectionHeader title={title} description={description} className="mb-2" />
        {!matchingReady ? (
          <EmptyState
            title="Λείπουν κριτήρια αντιστοίχισης"
            description="Χωρίς ΚΑΔ/δραστηριότητα ή CPV από αποθηκευμένη αναζήτηση δεν εμφανίζουμε προσωποποιημένες συμβάσεις."
            actionLabel={canEdit ? "Συμπλήρωση δραστηριότητας" : undefined}
            onAction={
              canEdit
                ? () => {
                    window.location.href = setupPath;
                  }
                : undefined
            }
          />
        ) : !listAvailable ? (
          <EmptyState
            title="Η λίστα είναι σε Basic και Pro"
            description="Στο Δωρεάν βλέπετε μόνο το πλήθος. Αναβαθμίστε για λίστα και ένα κλικ Παρακολούθηση."
            actionLabel="Συνδρομή"
            onAction={() => {
              window.location.href = "/app/subscription";
            }}
          />
        ) : items.length === 0 ? (
          <EmptyState
            title="Καμία σχετική σύμβαση στο παράθυρο"
            description="Όταν η εισαγωγή ΚΗΜΔΗΣ έχει συμβάσεις με λήξη σε 3–9 μήνες που ταιριάζουν στα κριτήριά σας, θα εμφανιστούν εδώ."
          />
        ) : (
          <>
            <DataColumnHeader
              gridClassName={ROW_GRID}
              labels={["Σύμβαση", "Φορέας", "CPV", "Λήξη", "Υπολοιπόμενος χρόνος", ""]}
            />
            <DataList>
              {items.map((row) => (
                <DataRow key={row.tenderId}>
                  <div className={ROW_GRID}>
                    <DataColumn label="Σύμβαση" className="sm:col-span-2 lg:col-span-1">
                      <div className="text-sm font-medium text-foreground">
                        {row.title || "—"}
                      </div>
                      <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                        <span className="font-mono">{row.referenceNumber}</span>
                        {row.publicKimdisUrl ? (
                          <a
                            href={row.publicKimdisUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="underline hover:text-foreground"
                          >
                            ΚΗΜΔΗΣ
                          </a>
                        ) : null}
                      </div>
                    </DataColumn>
                    <DataColumn label="Φορέας">
                      <span className="text-sm text-muted-foreground">
                        {row.authority || "—"}
                      </span>
                    </DataColumn>
                    <DataColumn label="CPV">
                      <span className="font-mono text-xs text-muted-foreground">
                        {row.cpv || "—"}
                      </span>
                    </DataColumn>
                    <DataColumn label="Λήξη">
                      <span className="text-sm tabular-nums text-foreground">
                        {formatDate(row.endsAt)}
                      </span>
                    </DataColumn>
                    <DataColumn label="Υπολοιπόμενος χρόνος">
                      <TimeToExpiry days={daysUntil(row.endsAt)} />
                    </DataColumn>
                    <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-1 lg:justify-end">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busyId === row.tenderId}
                        onClick={() => void handleFollow(row)}
                      >
                        Παρακολούθηση
                      </Button>
                      <Button size="sm" variant="ghost" asChild>
                        <Link
                          to={`/app/tenders/PROC/${encodeURIComponent(row.referenceNumber)}`}
                        >
                          Προβολή
                        </Link>
                      </Button>
                    </div>
                  </div>
                </DataRow>
              ))}
            </DataList>
          </>
        )}
      </section>
    </div>
  );
};
