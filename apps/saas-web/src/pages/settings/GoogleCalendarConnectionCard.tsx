import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import { useSessionContext } from "@/auth/SessionProvider";
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
import {
  saasApi,
  type GoogleCapabilityStatus,
  type GoogleIntegrationsResponse,
} from "@/lib/api";
import { humanSaasError } from "@/lib/labels";
import { cn } from "@/lib/utils";

const formatAt = (iso: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleString("el-GR");
};

const StatusLine = ({
  status,
  label,
}: {
  status: GoogleCapabilityStatus;
  label: string;
}) => {
  const live = status === "ACTIVE";
  const warn =
    status === "NEEDS_RECONNECT" ||
    status === "PLAN_PAUSED" ||
    status === "NEEDS_RECREATE" ||
    status === "SYNCING";
  return (
    <p
      className={cn(
        "flex items-start gap-2 text-sm",
        live
          ? "text-emerald-700 dark:text-emerald-400"
          : warn
            ? "text-amber-700 dark:text-amber-400"
            : "text-muted-foreground",
      )}
      role="status"
      data-google-calendar-status={status}
    >
      <span
        className={cn(
          "mt-1.5 h-2 w-2 shrink-0 rounded-full",
          live ? "bg-emerald-500" : warn ? "bg-amber-500" : "bg-muted-foreground/50",
        )}
        aria-hidden
      />
      <span>{label}</span>
    </p>
  );
};

type Props = {
  onLoaded?: (view: GoogleIntegrationsResponse | null) => void;
};

export const GoogleCalendarConnectionCard = ({ onLoaded }: Props) => {
  const { activeOrganization, user } = useSessionContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const [view, setView] = useState<GoogleIntegrationsResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [fullDisconnectOpen, setFullDisconnectOpen] = useState(false);

  const load = async () => {
    if (!activeOrganization) return;
    try {
      const data = await saasApi.getGoogleIntegrations(activeOrganization.id);
      setView(data);
      onLoaded?.(data);
    } catch {
      setView(null);
      onLoaded?.(null);
    }
  };

  useEffect(() => {
    void load();
  }, [activeOrganization?.id]);

  useEffect(() => {
    const google = searchParams.get("google");
    if (!google) return;
    if (google === "connected") {
      toast.success("Η σύνδεση με το Google ολοκληρώθηκε.");
    } else if (google === "cancelled") {
      toast.message("Η σύνδεση δεν ολοκληρώθηκε. Μπορείτε να δοκιμάσετε ξανά.");
    } else if (google === "error") {
      toast.error("Η σύνδεση δεν ολοκληρώθηκε. Μπορείτε να δοκιμάσετε ξανά.");
    }
    const next = new URLSearchParams(searchParams);
    next.delete("google");
    next.delete("feature");
    next.delete("reason");
    setSearchParams(next, { replace: true });
    void load();
  }, [searchParams.get("google")]);

  if (!activeOrganization || !view) return null;
  if (!view.calendar.featureAvailable) return null;

  const cal = view.calendar;
  const connected =
    cal.status !== "DISCONNECTED" && cal.status !== "DISABLED";
  const emailVerified = Boolean(user?.emailVerified);
  const canAct = cal.canManage && emailVerified;

  const handleConnect = async () => {
    setBusy(true);
    try {
      const { authorizeUrl } = await saasApi.startGoogleOAuth(
        activeOrganization.id,
        { capabilities: ["calendar"], purpose: "CONNECT" },
      );
      window.location.assign(authorizeUrl);
    } catch (err) {
      toast.error(
        err instanceof Error ? humanSaasError(err.message) : "Αποτυχία σύνδεσης",
      );
      setBusy(false);
    }
  };

  const handleReconnect = async () => {
    setBusy(true);
    try {
      const { authorizeUrl } = await saasApi.startGoogleOAuth(
        activeOrganization.id,
        { capabilities: ["calendar"], purpose: "REPLACE" },
      );
      window.location.assign(authorizeUrl);
    } catch (err) {
      toast.error(
        err instanceof Error ? humanSaasError(err.message) : "Αποτυχία",
      );
      setBusy(false);
    }
  };

  const handlePause = async (paused: boolean) => {
    setBusy(true);
    try {
      const next = await saasApi.pauseGoogleCalendar(
        activeOrganization.id,
        paused,
      );
      setView(next);
      toast.success(
        paused
          ? "Ο συγχρονισμός τέθηκε σε παύση."
          : "Ο συγχρονισμός ενεργοποιήθηκε.",
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? humanSaasError(err.message) : "Αποτυχία",
      );
    } finally {
      setBusy(false);
    }
  };

  const handleSyncNow = async () => {
    setBusy(true);
    try {
      const next = await saasApi.syncGoogleCalendarNow(activeOrganization.id);
      setView(next);
      toast.success("Ο συγχρονισμός προγραμματίστηκε.");
    } catch (err) {
      toast.error(
        err instanceof Error ? humanSaasError(err.message) : "Αποτυχία",
      );
    } finally {
      setBusy(false);
    }
  };

  const handleRecreate = async () => {
    setBusy(true);
    try {
      const next = await saasApi.recreateGoogleCalendar(activeOrganization.id);
      setView(next);
      toast.success("Το ημερολόγιο δημιουργήθηκε ξανά.");
    } catch (err) {
      toast.error(
        err instanceof Error ? humanSaasError(err.message) : "Αποτυχία",
      );
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnectCalendar = async () => {
    setBusy(true);
    try {
      const next = await saasApi.disconnectGoogle(
        activeOrganization.id,
        "calendar",
      );
      setView(next);
      setDisconnectOpen(false);
      toast.success("Το Google Calendar αποσυνδέθηκε.");
    } catch (err) {
      toast.error(
        err instanceof Error ? humanSaasError(err.message) : "Αποτυχία",
      );
    } finally {
      setBusy(false);
    }
  };

  const handleFullDisconnect = async () => {
    setBusy(true);
    try {
      const next = await saasApi.disconnectGoogle(activeOrganization.id);
      setView(next);
      setFullDisconnectOpen(false);
      toast.success("Το Google αποσυνδέθηκε.");
    } catch (err) {
      toast.error(
        err instanceof Error ? humanSaasError(err.message) : "Αποτυχία",
      );
    } finally {
      setBusy(false);
    }
  };

  const lastSuccess = formatAt(cal.lastSuccessAt);

  return (
    <>
      <Card data-testid="google-calendar-card">
        <CardHeader>
          <CardTitle>Google Calendar</CardTitle>
          <CardDescription>
            Οι προθεσμίες των διαγωνισμών σας στο Google Calendar, με αυτόματη
            ενημέρωση όταν εντοπίζονται αλλαγές.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!cal.entitled && !connected ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {view.messages.freeLockedEl}
              </p>
              <Button asChild>
                <Link to="/app/subscription">Δείτε τα πακέτα</Link>
              </Button>
            </div>
          ) : null}

          {cal.entitled && !connected ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {view.messages.calendarHintEl}
              </p>
              {canAct ? (
                <Button
                  disabled={busy}
                  onClick={() => void handleConnect()}
                  aria-label="Σύνδεση με Google Calendar"
                >
                  Σύνδεση με Google Calendar
                </Button>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Επιβεβαιώστε το email σας για να συνδέσετε το Google Calendar.
                </p>
              )}
            </div>
          ) : null}

          {connected ? (
            <div className="space-y-4">
              {cal.googleEmail ? (
                <p className="text-sm font-medium">
                  Συνδεδεμένο ως {cal.googleEmail}
                </p>
              ) : null}
              {cal.calendarSummary ? (
                <p className="text-sm text-muted-foreground">
                  Ημερολόγιο: {cal.calendarSummary}
                </p>
              ) : null}
              <StatusLine status={cal.status} label={cal.statusLabelEl} />
              {cal.status === "PAUSED" ? (
                <p className="text-xs text-muted-foreground">
                  {view.messages.calendarPauseHintEl}
                </p>
              ) : null}
              <p className="text-xs text-muted-foreground">
                {view.messages.calendarOneWayEl}
              </p>
              {lastSuccess ? (
                <p className="text-xs text-muted-foreground">
                  Τελευταία επιτυχής ενημέρωση: {lastSuccess}
                </p>
              ) : null}

              {!cal.entitled && cal.status === "PLAN_PAUSED" ? (
                <Button asChild variant="secondary" size="sm">
                  <Link to="/app/subscription">Δείτε τα πακέτα</Link>
                </Button>
              ) : null}

              {cal.status === "NEEDS_RECONNECT" && canAct && cal.entitled ? (
                <Button
                  disabled={busy}
                  onClick={() => void handleReconnect()}
                  aria-label="Επανασύνδεση με Google"
                >
                  Επανασύνδεση με Google
                </Button>
              ) : null}

              {cal.status === "NEEDS_RECREATE" && canAct && cal.entitled ? (
                <Button
                  disabled={busy}
                  onClick={() => void handleRecreate()}
                >
                  Δημιουργία ημερολογίου ξανά
                </Button>
              ) : null}

              {canAct ? (
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  {cal.calendarHtmlLink ? (
                    <Button variant="secondary" asChild>
                      <a
                        href={cal.calendarHtmlLink}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Άνοιγμα ημερολογίου
                      </a>
                    </Button>
                  ) : null}
                  {cal.entitled &&
                  (cal.status === "ACTIVE" ||
                    cal.status === "PAUSED" ||
                    cal.status === "SYNCING") ? (
                    <Button
                      variant="secondary"
                      disabled={busy}
                      onClick={() => void handleSyncNow()}
                    >
                      Συγχρονισμός τώρα
                    </Button>
                  ) : null}
                  {cal.entitled && cal.status === "ACTIVE" ? (
                    <Button
                      variant="secondary"
                      disabled={busy}
                      onClick={() => void handlePause(true)}
                    >
                      Παύση συγχρονισμού
                    </Button>
                  ) : null}
                  {cal.entitled &&
                  (cal.status === "PAUSED" || cal.status === "PLAN_PAUSED") ? (
                    <Button
                      variant="secondary"
                      disabled={busy}
                      onClick={() => void handlePause(false)}
                    >
                      Συνέχιση συγχρονισμού
                    </Button>
                  ) : null}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        disabled={busy}
                        aria-label="Διαχείριση σύνδεσης"
                        className="gap-2"
                      >
                        <MoreHorizontal className="h-4 w-4" aria-hidden />
                        Διαχείριση σύνδεσης
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-64">
                      {cal.entitled && cal.status !== "NEEDS_RECONNECT" ? (
                        <>
                          <DropdownMenuItem
                            disabled={busy}
                            onSelect={() => void handleReconnect()}
                          >
                            Αλλαγή Google λογαριασμού
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                        </>
                      ) : null}
                      <DropdownMenuItem
                        disabled={busy}
                        className="text-destructive focus:text-destructive"
                        onSelect={() => setDisconnectOpen(true)}
                      >
                        Αποσύνδεση Calendar
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={busy}
                        className="text-destructive focus:text-destructive"
                        onSelect={() => setFullDisconnectOpen(true)}
                      >
                        Αποσύνδεση όλων των Google
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Dialog open={disconnectOpen} onOpenChange={setDisconnectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Αποσύνδεση Google Calendar</DialogTitle>
            <DialogDescription>
              Να αποσυνδεθεί το Google Calendar; Οι ενημερώσεις προθεσμιών θα
              σταματήσουν. Το ημερολόγιο παραμένει στον λογαριασμό Google και δεν
              διαγράφεται.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              variant="secondary"
              onClick={() => setDisconnectOpen(false)}
            >
              Ακύρωση
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => void handleDisconnectCalendar()}
            >
              Αποσύνδεση
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={fullDisconnectOpen} onOpenChange={setFullDisconnectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Αποσύνδεση Google</DialogTitle>
            <DialogDescription>
              {view.messages.disconnectExplainEl} Επηρεάζονται Calendar, Drive και
              Sheets (αν είναι συνδεδεμένα).
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              variant="secondary"
              onClick={() => setFullDisconnectOpen(false)}
            >
              Ακύρωση
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => void handleFullDisconnect()}
            >
              Αποσύνδεση
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
