import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useSessionContext } from "@/auth/SessionProvider";
import { EmptyState, ErrorState, PageSkeleton } from "@/components/states";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  saasApi,
  type SlackConnectionResponse,
  type SlackNotificationPreferences,
} from "@/lib/api";
import { humanSaasError } from "@/lib/labels";

const defaultPrefs = (): SlackNotificationPreferences => ({
  newOpportunity: false,
  relatedActOnFollowed: false,
  deadlineRadar: false,
});

/** Official Slack “Add to Slack” asset — click starts our OAuth (state + redirect). */
const AddToSlackButton = ({
  disabled,
  onClick,
  ariaLabel = "Σύνδεση με Slack",
}: {
  disabled?: boolean;
  onClick: () => void;
  ariaLabel?: string;
}) => (
  <button
    type="button"
    disabled={disabled}
    onClick={onClick}
    aria-label={ariaLabel}
    className="inline-flex h-10 items-center justify-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
  >
    <img
      alt="Add to Slack"
      height={40}
      width={139}
      src="https://platform.slack-edge.com/img/add_to_slack.png"
      srcSet="https://platform.slack-edge.com/img/add_to_slack.png 1x, https://platform.slack-edge.com/img/add_to_slack@2x.png 2x"
      className="h-10 w-[139px]"
      draggable={false}
    />
  </button>
);

export const ConnectionsSettingsPage = () => {
  const { activeOrganization, user } = useSessionContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<SlackConnectionResponse | null>(null);
  const [prefs, setPrefs] = useState<SlackNotificationPreferences>(defaultPrefs());
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  const load = async () => {
    if (!activeOrganization) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await saasApi.getSlackConnection(activeOrganization.id);
      setView(data);
      setPrefs(data.connection?.preferences ?? defaultPrefs());
    } catch (err) {
      setError(
        err instanceof Error ? humanSaasError(err.message) : "Αποτυχία φόρτωσης",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [activeOrganization?.id]);

  useEffect(() => {
    const slack = searchParams.get("slack");
    if (!slack) return;
    if (slack === "connected") {
      toast.success("Η σύνδεση με το Slack ολοκληρώθηκε.");
    } else if (slack === "cancelled") {
      toast.message(
        "Η σύνδεση με το Slack δεν ολοκληρώθηκε. Μπορείτε να δοκιμάσετε ξανά.",
      );
    } else if (slack === "error") {
      toast.error(
        "Η σύνδεση με το Slack δεν ολοκληρώθηκε. Μπορείτε να δοκιμάσετε ξανά.",
      );
    }
    const next = new URLSearchParams(searchParams);
    next.delete("slack");
    next.delete("reason");
    setSearchParams(next, { replace: true });
    void load();
  }, [searchParams.get("slack")]);

  const handleConnect = async (purpose: "CONNECT" | "REPLACE") => {
    if (!activeOrganization) return;
    setSaving(true);
    try {
      const { authorizeUrl } = await saasApi.startSlackOAuth(
        activeOrganization.id,
        purpose,
      );
      window.location.assign(authorizeUrl);
    } catch (err) {
      toast.error(
        err instanceof Error ? humanSaasError(err.message) : "Αποτυχία σύνδεσης",
      );
      setSaving(false);
    }
  };

  const handleSavePrefs = async () => {
    if (!activeOrganization || !view?.connection) return;
    setSaving(true);
    try {
      const activate = !view.connection.notificationsArmed;
      const next = await saasApi.updateSlackPreferences(activeOrganization.id, {
        preferences: prefs,
        activate: true,
      });
      setView(next);
      setPrefs(next.connection?.preferences ?? prefs);
      toast.success(
        activate ? "Οι ειδοποιήσεις Slack ενεργοποιήθηκαν." : "Οι αλλαγές αποθηκεύτηκαν.",
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? humanSaasError(err.message) : "Αποτυχία αποθήκευσης",
      );
    } finally {
      setSaving(false);
    }
  };

  const handlePause = async (paused: boolean) => {
    if (!activeOrganization) return;
    setSaving(true);
    try {
      const next = await saasApi.pauseSlackNotifications(
        activeOrganization.id,
        paused,
      );
      setView(next);
      toast.success(
        paused
          ? "Οι ειδοποιήσεις Slack τέθηκαν σε παύση."
          : "Οι ειδοποιήσεις Slack ενεργοποιήθηκαν.",
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? humanSaasError(err.message) : "Αποτυχία",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!activeOrganization) return;
    setSaving(true);
    try {
      const result = await saasApi.sendSlackTest(activeOrganization.id);
      toast.success(result.messageEl);
      await load();
    } catch (err) {
      toast.error(
        err instanceof Error ? humanSaasError(err.message) : "Αποτυχία δοκιμής",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDisconnect = async () => {
    if (!activeOrganization) return;
    setSaving(true);
    try {
      const next = await saasApi.disconnectSlack(activeOrganization.id);
      setView(next);
      setPrefs(defaultPrefs());
      setConfirmDisconnect(false);
      toast.success("Η σύνδεση Slack αποσυνδέθηκε.");
    } catch (err) {
      toast.error(
        err instanceof Error ? humanSaasError(err.message) : "Αποτυχία αποσύνδεσης",
      );
    } finally {
      setSaving(false);
    }
  };

  if (!activeOrganization) {
    return (
      <EmptyState
        title="Χωρίς οργανισμό"
        description="Επιλέξτε ή δημιουργήστε οργανισμό για τις συνδέσεις."
      />
    );
  }
  if (loading) return <PageSkeleton />;
  if (error) {
    return <ErrorState description={error} onRetry={() => void load()} />;
  }
  if (!view) return null;

  const connection = view.connection;
  const canManage = view.canManage && Boolean(user?.emailVerified);
  const isFirstArm = connection && !connection.notificationsArmed;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Συνδέσεις</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Εξωτερικές εφαρμογές για ειδοποιήσεις της ομάδας σας.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Slack</CardTitle>
          <CardDescription>
            Λάβετε ενημερώσεις για νέες ευκαιρίες, εξελίξεις και προθεσμίες στο
            κανάλι Slack της ομάδας σας.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {!view.featureAvailable ? (
            <p className="text-sm text-muted-foreground">
              Η σύνδεση Slack δεν είναι ακόμη διαθέσιμη σε αυτό το περιβάλλον.
            </p>
          ) : null}

          {view.featureAvailable && !view.entitled ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {view.messages.freeLockedEl}
              </p>
              <Button asChild>
                <Link to="/app/subscription">Δείτε τα πακέτα</Link>
              </Button>
            </div>
          ) : null}

          {view.featureAvailable && view.entitled && !connection ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Θα επιλέξετε χώρο εργασίας και κανάλι στο Slack. Αν η εταιρεία
                σας περιορίζει τις εγκαταστάσεις εφαρμογών, μπορεί να χρειαστεί
                έγκριση διαχειριστή.
              </p>
              {canManage ? (
                <AddToSlackButton
                  disabled={saving}
                  onClick={() => void handleConnect("CONNECT")}
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  Μόνο ιδιοκτήτες και διαχειριστές με επιβεβαιωμένο email μπορούν
                  να συνδέσουν το Slack.
                </p>
              )}
            </div>
          ) : null}

          {connection ? (
            <div className="space-y-5">
              <p className="text-sm font-medium">
                Συνδεδεμένο με {connection.teamName} ·{" "}
                {connection.channelLabel}
              </p>

              {connection.status === "NEEDS_RECONNECT" ? (
                <div className="space-y-3">
                  <p className="text-sm text-amber-700 dark:text-amber-400">
                    {view.messages.needsReconnectEl}
                  </p>
                  {canManage && view.entitled ? (
                    <AddToSlackButton
                      disabled={saving}
                      onClick={() => void handleConnect("REPLACE")}
                      ariaLabel="Επανασύνδεση με Slack"
                    />
                  ) : null}
                </div>
              ) : null}

              {connection.status === "PLAN_PAUSED" ? (
                <p className="text-sm text-muted-foreground">
                  {view.messages.planPausedEl}
                </p>
              ) : null}

              {view.entitled && connection.status !== "NEEDS_RECONNECT" ? (
                <div className="space-y-4 rounded-md border border-border/60 p-4">
                  <div>
                    <h2 className="text-sm font-semibold">
                      Τι θέλετε να λαμβάνετε στο Slack;
                    </h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Οι ρυθμίσεις Slack είναι ανεξάρτητες από τις ειδοποιήσεις
                      email.
                    </p>
                  </div>
                  {(
                    [
                      ["newOpportunity", "Νέες ευκαιρίες"],
                      [
                        "relatedActOnFollowed",
                        "Εξελίξεις σε διαγωνισμούς που παρακολουθείτε",
                      ],
                      ["deadlineRadar", "Υπενθυμίσεις προθεσμιών"],
                    ] as const
                  ).map(([key, label]) => (
                    <div
                      key={key}
                      className="flex items-center justify-between gap-4"
                    >
                      <Label htmlFor={`slack-${key}`} className="text-sm">
                        {label}
                      </Label>
                      <Switch
                        id={`slack-${key}`}
                        checked={prefs[key]}
                        disabled={!canManage || saving}
                        onCheckedChange={(checked) =>
                          setPrefs((prev) => ({ ...prev, [key]: checked }))
                        }
                      />
                    </div>
                  ))}
                  {canManage ? (
                    <Button
                      disabled={saving}
                      onClick={() => void handleSavePrefs()}
                    >
                      {isFirstArm
                        ? "Αποθήκευση και ενεργοποίηση"
                        : "Αποθήκευση αλλαγών"}
                    </Button>
                  ) : null}
                </div>
              ) : null}

              {canManage ? (
                <div className="flex flex-wrap gap-2">
                  {connection.status !== "NEEDS_RECONNECT" &&
                  connection.status !== "PLAN_PAUSED" ? (
                    <Button
                      variant="secondary"
                      disabled={saving}
                      onClick={() => void handleTest()}
                    >
                      Αποστολή δοκιμαστικής ειδοποίησης
                    </Button>
                  ) : null}
                  {view.entitled &&
                  connection.status !== "NEEDS_RECONNECT" ? (
                    <AddToSlackButton
                      disabled={saving}
                      onClick={() => void handleConnect("REPLACE")}
                      ariaLabel="Αλλαγή σύνδεσης Slack"
                    />
                  ) : null}
                  {connection.status === "ACTIVE" ? (
                    <Button
                      variant="secondary"
                      disabled={saving}
                      onClick={() => void handlePause(true)}
                    >
                      Παύση ειδοποιήσεων
                    </Button>
                  ) : null}
                  {(connection.status === "PAUSED" ||
                    connection.status === "PLAN_PAUSED") &&
                  view.entitled ? (
                    <Button
                      variant="secondary"
                      disabled={saving || !connection.notificationsArmed}
                      onClick={() => void handlePause(false)}
                    >
                      Ενεργοποίηση ειδοποιήσεων
                    </Button>
                  ) : null}
                  {!confirmDisconnect ? (
                    <Button
                      variant="destructive"
                      disabled={saving}
                      onClick={() => setConfirmDisconnect(true)}
                    >
                      Αποσύνδεση
                    </Button>
                  ) : (
                    <div className="w-full space-y-2 rounded-md border border-destructive/40 p-3">
                      <p className="text-sm">
                        Να αποσυνδεθεί το Slack; Οι ειδοποιήσεις προς αυτό το
                        κανάλι θα σταματήσουν.
                      </p>
                      <div className="flex gap-2">
                        <Button
                          variant="secondary"
                          disabled={saving}
                          onClick={() => setConfirmDisconnect(false)}
                        >
                          Ακύρωση
                        </Button>
                        <Button
                          variant="destructive"
                          disabled={saving}
                          onClick={() => void handleDisconnect()}
                        >
                          Αποσύνδεση
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Μόνο ιδιοκτήτες και διαχειριστές με επιβεβαιωμένο email μπορούν
                  να αλλάξουν τη σύνδεση Slack.
                </p>
              )}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
};
