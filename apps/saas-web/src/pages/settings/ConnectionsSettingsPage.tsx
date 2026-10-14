import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Hash, MoreHorizontal } from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { Switch } from "@/components/ui/switch";
import {
  saasApi,
  type SlackConnectionResponse,
  type SlackDeliveryState,
  type SlackNotificationPreferences,
} from "@/lib/api";
import { humanSaasError } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { GoogleCalendarConnectionCard } from "@/pages/settings/GoogleCalendarConnectionCard";
import { GoogleDriveConnectionCard } from "@/pages/settings/GoogleDriveConnectionCard";

const defaultPrefs = (): SlackNotificationPreferences => ({
  newOpportunity: false,
  relatedActOnFollowed: false,
  deadlineRadar: false,
});

const PREF_OPTIONS = [
  ["newOpportunity", "Νέες ευκαιρίες"],
  ["relatedActOnFollowed", "Εξελίξεις σε διαγωνισμούς που παρακολουθείτε"],
  ["deadlineRadar", "Υπενθυμίσεις προθεσμιών"],
] as const;

const prefsEqual = (
  a: SlackNotificationPreferences,
  b: SlackNotificationPreferences,
) =>
  a.newOpportunity === b.newOpportunity &&
  a.relatedActOnFollowed === b.relatedActOnFollowed &&
  a.deadlineRadar === b.deadlineRadar;

const prefsHaveAny = (p: SlackNotificationPreferences) =>
  p.newOpportunity || p.relatedActOnFollowed || p.deadlineRadar;

const formatTestAt = (iso: string | null | undefined) => {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString("el-GR");
};

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

const DeliveryStatus = ({
  state,
  label,
}: {
  state: SlackDeliveryState;
  label: string;
}) => {
  const tone =
    state === "ACTIVE"
      ? "text-primary"
      : state === "NEEDS_RECONNECT" || state === "PLAN_PAUSED"
        ? "text-amber-700 dark:text-amber-400"
        : "text-muted-foreground";
  const dot =
    state === "ACTIVE"
      ? "bg-primary"
      : state === "NEEDS_RECONNECT" || state === "PLAN_PAUSED"
        ? "bg-amber-500"
        : "bg-muted-foreground/50";

  return (
    <p
      className={cn("flex items-start gap-2 text-sm", tone)}
      role="status"
      aria-live="polite"
      data-delivery-state={state}
    >
      <span
        className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", dot)}
        aria-hidden
      />
      <span>{label}</span>
    </p>
  );
};

export const ConnectionsSettingsPage = () => {
  const { activeOrganization, user } = useSessionContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<SlackConnectionResponse | null>(null);
  const [prefs, setPrefs] = useState<SlackNotificationPreferences>(defaultPrefs());
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [dirtyGuard, setDirtyGuard] = useState<null | "replace" | "disconnect" | "resume">(
    null,
  );

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
      setView(null);
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

  const savedPrefs = view?.connection?.preferences ?? defaultPrefs();
  const dirty = useMemo(
    () => Boolean(view?.connection) && !prefsEqual(prefs, savedPrefs),
    [prefs, savedPrefs, view?.connection],
  );
  const isFirstSetup = Boolean(
    view?.connection && !view.connection.notificationsArmed,
  );

  const canManage =
    Boolean(view?.canManage) && Boolean(user?.emailVerified);
  const connection = view?.connection ?? null;

  const warnIfDirty = (action: "replace" | "disconnect" | "resume") => {
    if (dirty) {
      setDirtyGuard(action);
      return true;
    }
    return false;
  };

  const handleConnect = async (purpose: "CONNECT" | "REPLACE") => {
    if (!activeOrganization) return;
    setBusy(true);
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
      setBusy(false);
    }
  };

  const handleSavePrefs = async () => {
    if (!activeOrganization || !view?.connection) return;
    if (isFirstSetup && !prefsHaveAny(prefs)) {
      toast.error("Επιλέξτε τουλάχιστον έναν τύπο ειδοποίησης.");
      return;
    }
    setBusy(true);
    try {
      const next = await saasApi.updateSlackPreferences(activeOrganization.id, {
        preferences: prefs,
        activate: isFirstSetup ? true : false,
      });
      setView(next);
      setPrefs(next.connection?.preferences ?? prefs);
      toast.success(
        isFirstSetup
          ? "Οι προτιμήσεις αποθηκεύτηκαν"
          : "Οι προτιμήσεις αποθηκεύτηκαν",
      );
    } catch (err) {
      // Keep local prefs on failure.
      toast.error(
        err instanceof Error ? humanSaasError(err.message) : "Αποτυχία αποθήκευσης",
      );
    } finally {
      setBusy(false);
    }
  };

  const handleDiscardDirty = () => {
    if (view?.connection) {
      setPrefs(view.connection.preferences);
    }
    const pending = dirtyGuard;
    setDirtyGuard(null);
    if (pending === "replace") setReplaceOpen(true);
    if (pending === "disconnect") setDisconnectOpen(true);
    if (pending === "resume") void handlePause(false, { skipDirtyCheck: true });
  };

  const handlePause = async (
    paused: boolean,
    opts?: { skipDirtyCheck?: boolean },
  ) => {
    if (!activeOrganization) return;
    if (!paused && !opts?.skipDirtyCheck && warnIfDirty("resume")) return;
    if (!paused && dirty) return;
    if (!paused && !prefsHaveAny(savedPrefs)) {
      toast.error("Επιλέξτε και αποθηκεύστε τουλάχιστον έναν τύπο ειδοποίησης.");
      return;
    }
    setBusy(true);
    try {
      const next = await saasApi.pauseSlackNotifications(
        activeOrganization.id,
        paused,
      );
      setView(next);
      setPrefs(next.connection?.preferences ?? prefs);
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
      setBusy(false);
    }
  };

  const handleTest = async () => {
    if (!activeOrganization || !connection) return;
    setTesting(true);
    try {
      const result = await saasApi.sendSlackTest(activeOrganization.id);
      if (result.delivery === "queued") {
        toast.message(result.messageEl);
      } else {
        toast.success(result.messageEl);
      }
      // Refresh so lastTestSentAt comes from the server after real delivery.
      const next = await saasApi.getSlackConnection(activeOrganization.id);
      setView(next);
      if (!dirty) {
        setPrefs(next.connection?.preferences ?? prefs);
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? humanSaasError(err.message) : "Αποτυχία δοκιμής",
      );
    } finally {
      setTesting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!activeOrganization) return;
    setBusy(true);
    try {
      const next = await saasApi.disconnectSlack(activeOrganization.id);
      setView(next);
      setPrefs(defaultPrefs());
      setDisconnectOpen(false);
      toast.success("Το Slack αποσυνδέθηκε");
    } catch (err) {
      toast.error(
        err instanceof Error ? humanSaasError(err.message) : "Αποτυχία αποσύνδεσης",
      );
    } finally {
      setBusy(false);
    }
  };

  const openReplace = () => {
    if (warnIfDirty("replace")) return;
    setReplaceOpen(true);
  };

  const openDisconnect = () => {
    if (warnIfDirty("disconnect")) return;
    setDisconnectOpen(true);
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

  const deliveryState = connection?.deliveryState;
  const showPrefs =
    Boolean(connection) &&
    connection?.status !== "NEEDS_RECONNECT" &&
    (view.entitled || connection?.status === "PLAN_PAUSED");
  const canTest =
    canManage &&
    view.entitled &&
    connection &&
    connection.status !== "NEEDS_RECONNECT" &&
    connection.status !== "PLAN_PAUSED";
  const canPause =
    canManage &&
    view.entitled &&
    connection &&
    connection.status === "ACTIVE" &&
    connection.notificationsArmed;
  const canResume =
    canManage &&
    view.entitled &&
    connection &&
    (connection.status === "PAUSED" || connection.status === "PLAN_PAUSED") &&
    connection.notificationsArmed &&
    prefsHaveAny(connection.preferences);
  const lastTestLabel = formatTestAt(connection?.lastTestSentAt ?? null);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Συνδέσεις"
        description="Εξωτερικές εφαρμογές για ειδοποιήσεις της ομάδας σας."
      />

      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4 pb-4">
          <div className="flex min-w-0 items-start gap-3">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted/50 text-muted-foreground"
              aria-hidden
            >
              <Hash className="h-4 w-4" />
            </span>
            <div className="min-w-0 space-y-1">
              <CardTitle>Slack</CardTitle>
              <CardDescription>
                Ενημερώσεις για νέες ευκαιρίες, εξελίξεις και προθεσμίες στο
                κανάλι της ομάδας σας.
              </CardDescription>
            </div>
          </div>
          {connection && deliveryState ? (
            <DeliveryStatus
              state={deliveryState}
              label={connection.deliveryStateLabelEl}
            />
          ) : null}
        </CardHeader>
        <CardContent className="space-y-5">
          {!view.featureAvailable ? (
            <p className="text-sm text-muted-foreground">
              Η σύνδεση Slack δεν είναι ακόμη διαθέσιμη σε αυτό το περιβάλλον.
            </p>
          ) : null}

          {view.featureAvailable && !view.entitled && !connection ? (
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
                {view.messages.connectHintEl}
              </p>
              {canManage ? (
                <AddToSlackButton
                  disabled={busy}
                  onClick={() => void handleConnect("CONNECT")}
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  {view.messages.adminsOnlyEl}
                </p>
              )}
            </div>
          ) : null}

          {connection ? (
            <div className="space-y-5" data-testid="slack-connected-card">
              <div className="space-y-2">
                <p className="text-sm font-medium">
                  Συνδεδεμένο με {connection.teamName} ·{" "}
                  <span className="text-muted-foreground">
                    {connection.channelLabel}
                  </span>
                </p>
                {!view.entitled && connection.status === "PLAN_PAUSED" ? (
                  <Button asChild variant="secondary" size="sm">
                    <Link to="/app/subscription">Δείτε τα πακέτα</Link>
                  </Button>
                ) : null}
              </div>

              {/* Never show Add to Slack while a connection exists */}
              {connection.status === "NEEDS_RECONNECT" ? (
                <div className="space-y-3">
                  {canManage && view.entitled ? (
                    <Button
                      disabled={busy}
                      onClick={() => void handleConnect("REPLACE")}
                      aria-label="Επανασύνδεση με Slack"
                    >
                      Επανασύνδεση με Slack
                    </Button>
                  ) : !view.entitled ? (
                    <Button asChild variant="secondary">
                      <Link to="/app/subscription">Δείτε τα πακέτα</Link>
                    </Button>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {view.messages.adminsOnlyEl}
                    </p>
                  )}
                </div>
              ) : null}

              {showPrefs ? (
                <div className="space-y-4 border-t border-border/50 pt-5">
                  <div>
                    <h2 className="text-sm font-semibold tracking-tight">
                      Τι θέλετε να λαμβάνετε στο Slack;
                    </h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Οι ρυθμίσεις Slack είναι ανεξάρτητες από τις ειδοποιήσεις
                      email.
                    </p>
                  </div>
                  {PREF_OPTIONS.map(([key, label]) => (
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
                        disabled={!canManage || busy || !view.entitled}
                        onCheckedChange={(checked) =>
                          setPrefs((prev) => ({ ...prev, [key]: checked }))
                        }
                      />
                    </div>
                  ))}
                  {canManage && view.entitled ? (
                    <div className="space-y-2">
                      {dirty ? (
                        <p
                          className="text-xs text-amber-700 dark:text-amber-400"
                          role="status"
                        >
                          Έχετε μη αποθηκευμένες αλλαγές
                        </p>
                      ) : null}
                      <Button
                        disabled={
                          busy ||
                          (!isFirstSetup && !dirty) ||
                          (isFirstSetup && !prefsHaveAny(prefs))
                        }
                        onClick={() => void handleSavePrefs()}
                      >
                        {isFirstSetup
                          ? "Αποθήκευση και ενεργοποίηση"
                          : "Αποθήκευση αλλαγών"}
                      </Button>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {canManage ? (
                <div className="flex flex-col gap-3 border-t border-border/50 pt-5 sm:flex-row sm:flex-wrap sm:items-start">
                  {canTest ? (
                    <div className="flex min-w-0 flex-col gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy || testing}
                        onClick={() => void handleTest()}
                        aria-label="Δοκιμή σύνδεσης"
                      >
                        {testing ? "Αποστολή…" : "Δοκιμή σύνδεσης"}
                      </Button>
                      <p className="text-xs text-muted-foreground">
                        Στέλνει ένα δοκιμαστικό μήνυμα στο{" "}
                        {connection.channelLabel}.
                      </p>
                      {lastTestLabel ? (
                        <p className="text-xs text-muted-foreground">
                          Τελευταία επιτυχής δοκιμή: {lastTestLabel}
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  {canPause ? (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() => void handlePause(true)}
                    >
                      Παύση ειδοποιήσεων
                    </Button>
                  ) : null}

                  {canResume ? (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy || dirty}
                      onClick={() => void handlePause(false)}
                      title={
                        dirty
                          ? "Αποθηκεύστε ή αναιρέστε τις αλλαγές πριν τη συνέχιση"
                          : undefined
                      }
                    >
                      Συνέχιση ειδοποιήσεων
                    </Button>
                  ) : null}

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        aria-label="Διαχείριση σύνδεσης"
                        className="gap-2"
                      >
                        <MoreHorizontal className="h-4 w-4" aria-hidden />
                        Διαχείριση σύνδεσης
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-56">
                      {view.entitled &&
                      connection.status !== "NEEDS_RECONNECT" ? (
                        <>
                          <DropdownMenuItem
                            disabled={busy}
                            onSelect={() => openReplace()}
                          >
                            Αλλαγή workspace ή καναλιού
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                        </>
                      ) : null}
                      <DropdownMenuItem
                        disabled={busy}
                        className="text-destructive focus:text-destructive"
                        onSelect={() => openDisconnect()}
                      >
                        Αποσύνδεση
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {view.messages.adminsOnlyEl}
                </p>
              )}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <GoogleCalendarConnectionCard />

      <GoogleDriveConnectionCard />

      <Dialog open={replaceOpen} onOpenChange={setReplaceOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Αλλαγή workspace ή καναλιού</DialogTitle>
            <DialogDescription>
              Θα μεταφερθείτε στο Slack για να επιλέξετε χώρο εργασίας και
              κανάλι. Η υπάρχουσα σύνδεση θα αντικατασταθεί μόνο αν ολοκληρωθεί η
              διαδικασία.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => setReplaceOpen(false)}
            >
              Ακύρωση
            </Button>
            <Button
              disabled={busy}
              onClick={() => void handleConnect("REPLACE")}
            >
              Συνέχεια στο Slack
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={disconnectOpen} onOpenChange={setDisconnectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Αποσύνδεση Slack</DialogTitle>
            <DialogDescription>
              Να αποσυνδεθεί το Slack; Οι ειδοποιήσεις προς το{" "}
              {connection?.channelLabel ?? "κανάλι"} θα σταματήσουν.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => setDisconnectOpen(false)}
            >
              Ακύρωση
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => void handleDisconnect()}
            >
              Αποσύνδεση
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={dirtyGuard !== null}
        onOpenChange={(open) => {
          if (!open) setDirtyGuard(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Μη αποθηκευμένες αλλαγές</DialogTitle>
            <DialogDescription>
              Έχετε μη αποθηκευμένες αλλαγές στις προτιμήσεις Slack. Αν
              συνεχίσετε χωρίς αποθήκευση, θα χαθούν.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              variant="secondary"
              onClick={() => setDirtyGuard(null)}
            >
              Ακύρωση
            </Button>
            <Button variant="outline" onClick={handleDiscardDirty}>
              Απόρριψη αλλαγών
            </Button>
            <Button
              disabled={busy}
              onClick={() => {
                setDirtyGuard(null);
                void handleSavePrefs();
              }}
            >
              Αποθήκευση
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
