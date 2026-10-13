import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { useSessionContext } from "@/auth/SessionProvider";
import { EmptyState, ErrorState, PageSkeleton } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { trackAnalyticsEvent } from "@/lib/analytics";
import { saasApi, type ExpiringContractRow } from "@/lib/api";
import {
  canEditOrganizationProfile,
  getOrgProfileProgress,
  type OrgProfileProgress,
} from "@/lib/org-profile";

const formatDate = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value.slice(0, 10) : date.toLocaleDateString("el-GR");
};

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
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Συμβάσεις που λήγουν</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Συμβάσεις που λήγουν σε 3–9 μήνες, όταν υπάρχουν κριτήρια αντιστοίχισης από δραστηριότητα
          (ΚΑΔ) ή αποθηκευμένη αναζήτηση.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
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
            <ul className="space-y-3">
              {items.map((row) => (
                <li
                  key={row.tenderId}
                  className="flex flex-col gap-3 rounded-md border border-border/70 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="font-medium">{row.title || "—"}</div>
                    <div className="text-sm text-muted-foreground">
                      {row.authority || "—"}
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span className="font-mono">{row.referenceNumber}</span>
                      {row.cpv ? <span>CPV {row.cpv}</span> : null}
                      <span>Λήξη {formatDate(row.endsAt)}</span>
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
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      disabled={busyId === row.tenderId}
                      onClick={() => void handleFollow(row)}
                    >
                      Παρακολούθηση
                    </Button>
                    <Button size="sm" variant="outline" asChild>
                      <Link to={`/app/tenders/PROC/${encodeURIComponent(row.referenceNumber)}`}>
                        Προβολή
                      </Link>
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
