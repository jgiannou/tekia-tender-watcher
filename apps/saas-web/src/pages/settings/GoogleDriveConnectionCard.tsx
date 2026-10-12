import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
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

type StatusLineProps = {
  status: GoogleCapabilityStatus;
  label: string;
};

const StatusLine = ({ status, label }: StatusLineProps) => {
  const isLive = status === "ACTIVE";
  const isWarning = status === "NEEDS_RECONNECT" || status === "PLAN_PAUSED";
  return (
    <p
      className={cn(
        "flex items-start gap-2 text-sm",
        isLive && "text-emerald-700 dark:text-emerald-400",
        isWarning && "text-amber-700 dark:text-amber-400",
        !isLive && !isWarning && "text-muted-foreground",
      )}
      role="status"
      data-google-drive-status={status}
    >
      <span
        className={cn(
          "mt-1.5 h-2 w-2 shrink-0 rounded-full",
          isLive && "bg-emerald-500",
          isWarning && "bg-amber-500",
          !isLive && !isWarning && "bg-muted-foreground/50",
        )}
        aria-hidden
      />
      <span>{label}</span>
    </p>
  );
};

type GoogleDriveConnectionCardProps = {
  onLoaded?: (view: GoogleIntegrationsResponse | null) => void;
};

export const GoogleDriveConnectionCard = ({
  onLoaded,
}: GoogleDriveConnectionCardProps) => {
  const { activeOrganization, user } = useSessionContext();
  const [view, setView] = useState<GoogleIntegrationsResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [disconnectOpen, setDisconnectOpen] = useState(false);

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

  if (!activeOrganization || !view) return null;
  if (!view.drive.featureAvailable) return null;

  const drive = view.drive;
  const isConnected =
    drive.status !== "DISCONNECTED" && drive.status !== "DISABLED";
  const emailVerified = Boolean(user?.emailVerified);
  const canAct = drive.canManage && emailVerified;

  const showError = (err: unknown, fallback: string) => {
    toast.error(err instanceof Error ? humanSaasError(err.message) : fallback);
  };

  const startOAuth = async (purpose?: "REPLACE") => {
    setBusy(true);
    try {
      const { authorizeUrl } = await saasApi.startGoogleOAuth(
        activeOrganization.id,
        { capabilities: ["drive"], purpose },
      );
      window.location.assign(authorizeUrl);
    } catch (err) {
      showError(err, "Αποτυχία σύνδεσης");
      setBusy(false);
    }
  };

  const handleConnect = () => void startOAuth();
  const handleReconnect = () => void startOAuth("REPLACE");

  const handleDisconnect = async () => {
    setBusy(true);
    try {
      const next = await saasApi.disconnectGoogle(
        activeOrganization.id,
        "drive",
      );
      setView(next);
      onLoaded?.(next);
      setDisconnectOpen(false);
      toast.success("Το Google Drive αποσυνδέθηκε.");
    } catch (err) {
      showError(err, "Αποτυχία");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Card data-testid="google-drive-card">
        <CardHeader>
          <CardTitle>Google Drive</CardTitle>
          <CardDescription>{view.messages.driveHintEl}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!drive.entitled && !isConnected ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {view.messages.freeLockedEl}
              </p>
              <Button asChild>
                <Link to="/app/subscription">Δείτε τα πακέτα</Link>
              </Button>
            </div>
          ) : null}

          {drive.entitled && !isConnected ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {view.messages.importCopyHintEl}
              </p>
              {canAct ? (
                <Button
                  disabled={busy}
                  onClick={handleConnect}
                  aria-label="Σύνδεση με Google Drive"
                >
                  Σύνδεση με Google Drive
                </Button>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Επιβεβαιώστε το email σας για να συνδέσετε το Google Drive.
                </p>
              )}
            </div>
          ) : null}

          {isConnected ? (
            <div className="space-y-4">
              {drive.googleEmail ? (
                <p className="text-sm font-medium">
                  Συνδεδεμένο ως {drive.googleEmail}
                </p>
              ) : null}
              <StatusLine status={drive.status} label={drive.statusLabelEl} />
              <p className="text-xs text-muted-foreground">
                {view.messages.importCopyHintEl}
              </p>
              {drive.entitled && drive.importEntitled ? (
                <p className="text-xs text-muted-foreground">
                  Για να εισαγάγετε αρχεία, ανοίξτε τα{" "}
                  <Link className="underline" to="/app/documents">
                    Έγγραφα
                  </Link>{" "}
                  και επιλέξτε «Εισαγωγή από Google Drive».
                </p>
              ) : null}

              {!drive.entitled && drive.status === "PLAN_PAUSED" ? (
                <Button asChild variant="secondary" size="sm">
                  <Link to="/app/subscription">Δείτε τα πακέτα</Link>
                </Button>
              ) : null}

              {drive.status === "NEEDS_RECONNECT" && canAct && drive.entitled ? (
                <Button
                  disabled={busy}
                  onClick={handleReconnect}
                  aria-label="Επανασύνδεση με Google"
                >
                  Επανασύνδεση με Google
                </Button>
              ) : null}

              {canAct ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      disabled={busy}
                      aria-label="Διαχείριση σύνδεσης Google Drive"
                      className="gap-2"
                    >
                      <MoreHorizontal className="h-4 w-4" aria-hidden />
                      Διαχείριση σύνδεσης
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-64">
                    {drive.entitled && drive.status !== "NEEDS_RECONNECT" ? (
                      <>
                        <DropdownMenuItem
                          disabled={busy}
                          onSelect={handleReconnect}
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
                      Αποσύνδεση Drive
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Dialog open={disconnectOpen} onOpenChange={setDisconnectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Αποσύνδεση Google Drive</DialogTitle>
            <DialogDescription>
              Να αποσυνδεθεί το Google Drive; Οι εισαγωγές αρχείων θα σταματήσουν.
              Τα αρχεία που έχετε ήδη εισαγάγει στα Έγγραφα του ARC και τα αρχεία
              στο Google Drive παραμένουν και δεν διαγράφονται.
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
              onClick={() => void handleDisconnect()}
            >
              Αποσύνδεση
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
