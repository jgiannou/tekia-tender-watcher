import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  saasApi,
  type GoogleCapabilityStatus,
  type GoogleDriveFilePreview,
  type GoogleDriveImportRecord,
  type VaultFolder,
} from "@/lib/api";
import { openGoogleFilePicker } from "@/lib/google-picker";
import { humanSaasError } from "@/lib/labels";
import { cn } from "@/lib/utils";

const MAX_FILES_PER_BATCH = 10;
const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 3 * 60 * 1000;

const COPY_HINT_EL =
  "Θα αποθηκευτεί αντίγραφο του αρχείου στα Έγγραφα του ARC. Το αρχείο στο Google Drive δεν συγχρονίζεται και δεν τροποποιείται.";

type Step =
  | "intro"
  | "picking"
  | "previewing"
  | "preview"
  | "importing"
  | "result";

type ImportFromGoogleDriveDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  folders: VaultFolder[];
  defaultFolderId: string | null;
  driveStatus: GoogleCapabilityStatus;
  /** Called after at least one file was copied into the vault. */
  onImported: () => void;
};

const formatSize = (bytes: number | null): string => {
  if (bytes === null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const importedSummaryEl = (succeeded: number, failed: number): string => {
  const imported =
    succeeded === 1 ? "Εισήχθη 1 αρχείο" : `Εισήχθησαν ${succeeded} αρχεία`;
  if (failed === 0) return `${imported}.`;
  return `${imported}. ${failed} δεν εισήχθησαν.`;
};

/** Failures the user cannot fix by retrying (type / size problems). */
const isRetryable = (record: GoogleDriveImportRecord): boolean =>
  record.status === "FAILED" &&
  !(record.errorCode ?? "").startsWith("unsupported_") &&
  record.errorCode !== "file_too_large" &&
  record.errorCode !== "file_empty";

const needsReconnectError = (err: unknown): boolean =>
  err instanceof Error &&
  /google_needs_reconnect|google_drive_scope_missing|google_drive_not_connected/.test(
    err.message,
  );

export const ImportFromGoogleDriveDialog = ({
  open,
  onOpenChange,
  organizationId,
  folders,
  defaultFolderId,
  driveStatus,
  onImported,
}: ImportFromGoogleDriveDialogProps) => {
  const [step, setStep] = useState<Step>("intro");
  const [busy, setBusy] = useState(false);
  const [reconnectRequired, setReconnectRequired] = useState(false);
  const [previews, setPreviews] = useState<GoogleDriveFilePreview[]>([]);
  const [folderId, setFolderId] = useState(defaultFolderId ?? "");
  const [resultsByFileId, setResultsByFileId] = useState<
    Record<string, GoogleDriveImportRecord>
  >({});
  const [pendingRecordIds, setPendingRecordIds] = useState<string[]>([]);
  const [timedOut, setTimedOut] = useState(false);
  const importedNotified = useRef(false);

  const isDisconnected =
    driveStatus === "DISCONNECTED" || driveStatus === "DISABLED";
  const needsConnection = isDisconnected || driveStatus === "NEEDS_RECONNECT" || reconnectRequired;

  useEffect(() => {
    if (!open) return;
    setStep("intro");
    setBusy(false);
    setReconnectRequired(false);
    setPreviews([]);
    setFolderId(defaultFolderId ?? folders[0]?.id ?? "");
    setResultsByFileId({});
    setPendingRecordIds([]);
    setTimedOut(false);
    importedNotified.current = false;
  }, [open]);

  const results = Object.values(resultsByFileId);
  const succeededCount = results.filter((r) => r.status === "SUCCEEDED").length;
  const failedRecords = results.filter((r) => r.status === "FAILED");
  const retryableRecords = failedRecords.filter(isRetryable);
  const supportedPreviews = previews.filter((p) => p.supported);

  // Poll queued imports until every record is final.
  useEffect(() => {
    if (step !== "importing" || pendingRecordIds.length === 0) return;
    let cancelled = false;
    const startedAt = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
      try {
        const batch = await saasApi.getGoogleDriveImportStatus(
          organizationId,
          pendingRecordIds,
        );
        if (cancelled) return;
        setResultsByFileId((current) => {
          const next = { ...current };
          for (const record of batch.records) {
            next[record.googleFileId] = record;
          }
          return next;
        });
        if (!batch.active) {
          setPendingRecordIds([]);
          setStep("result");
          return;
        }
      } catch {
        // transient — keep polling until timeout
      }
      if (cancelled) return;
      if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
        setTimedOut(true);
        setStep("result");
        return;
      }
      timer = setTimeout(() => void poll(), POLL_INTERVAL_MS);
    };

    timer = setTimeout(() => void poll(), POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [step, pendingRecordIds, organizationId]);

  useEffect(() => {
    if (step !== "result" || succeededCount === 0) return;
    if (importedNotified.current) return;
    importedNotified.current = true;
    onImported();
  }, [step, succeededCount]);

  const handleOpenChange = (next: boolean) => {
    // The Picker lives outside this dialog; ignore close events while it is open.
    if (!next && step === "picking") return;
    onOpenChange(next);
  };

  const handleConnect = async () => {
    setBusy(true);
    try {
      const { authorizeUrl } = await saasApi.startGoogleOAuth(organizationId, {
        capabilities: ["drive"],
        purpose: isDisconnected ? undefined : "REPLACE",
      });
      window.location.assign(authorizeUrl);
    } catch (err) {
      toast.error(
        err instanceof Error ? humanSaasError(err.message) : "Αποτυχία σύνδεσης",
      );
      setBusy(false);
    }
  };

  const loadPreview = async (
    files: Array<{ id: string; name?: string; mimeType?: string; sizeBytes?: number }>,
  ) => {
    setStep("previewing");
    try {
      const preview = await saasApi.previewGoogleDriveFiles(organizationId, files);
      setPreviews(preview.files);
      setStep("preview");
    } catch (err) {
      if (needsReconnectError(err)) setReconnectRequired(true);
      toast.error(
        err instanceof Error ? humanSaasError(err.message) : "Αποτυχία προεπισκόπησης",
      );
      setStep("intro");
    }
  };

  const handlePickFiles = async () => {
    setBusy(true);
    try {
      // Short-lived Picker token: kept in this closure (memory only), never
      // persisted to storage, and dropped as soon as the Picker closes.
      const token = await saasApi.mintGoogleDrivePickerToken(organizationId);
      // Hide the modal: Radix traps focus and would block the Picker iframe.
      setStep("picking");
      const picked = await openGoogleFilePicker({
        accessToken: token.accessToken,
        developerKey: token.pickerApiKey,
        appId: token.appId,
        maxItems: MAX_FILES_PER_BATCH,
      });
      if (!picked || picked.length === 0) {
        setStep(previews.length > 0 ? "preview" : "intro");
        return;
      }
      await loadPreview(picked.slice(0, MAX_FILES_PER_BATCH));
    } catch (err) {
      setStep("intro");
      if (needsReconnectError(err)) setReconnectRequired(true);
      toast.error(
        err instanceof Error && err.message === "google_picker_script_failed"
          ? "Δεν ήταν δυνατή η φόρτωση του Google Drive. Δοκιμάστε ξανά."
          : err instanceof Error
            ? humanSaasError(err.message)
            : "Αποτυχία",
      );
    } finally {
      setBusy(false);
    }
  };

  const startImport = async (files: Array<{ googleFileId: string; name?: string }>) => {
    if (!folderId || files.length === 0) return;
    setBusy(true);
    try {
      const batch = await saasApi.startGoogleDriveImport(organizationId, {
        folderId,
        files,
      });
      setResultsByFileId((current) => {
        const next = { ...current };
        for (const record of batch.records) {
          next[record.googleFileId] = record;
        }
        return next;
      });
      setTimedOut(false);
      const pendingIds = batch.records
        .filter((r) => r.status === "PENDING")
        .map((r) => r.id);
      setPendingRecordIds(pendingIds);
      setStep(pendingIds.length > 0 ? "importing" : "result");
    } catch (err) {
      if (needsReconnectError(err)) setReconnectRequired(true);
      toast.error(
        err instanceof Error ? humanSaasError(err.message) : "Αποτυχία εισαγωγής",
      );
    } finally {
      setBusy(false);
    }
  };

  const handleImport = () => {
    setResultsByFileId({});
    void startImport(
      supportedPreviews.map((p) => ({ googleFileId: p.id, name: p.name })),
    );
  };

  const handleRetryFailed = () => {
    void startImport(
      retryableRecords.map((r) => ({
        googleFileId: r.googleFileId,
        name: r.googleFileName,
      })),
    );
  };

  return (
    <Dialog open={open && step !== "picking"} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Εισαγωγή από Google Drive</DialogTitle>
          <DialogDescription>{COPY_HINT_EL}</DialogDescription>
        </DialogHeader>

        {step === "intro" || step === "picking" ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Υποστηρίζονται αρχεία PDF και DOCX, καθώς και Google Docs (θα
              εξαχθούν ως PDF). Μπορείτε να επιλέξετε έως {MAX_FILES_PER_BATCH}{" "}
              αρχεία τη φορά.
            </p>
            {needsConnection ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  {isDisconnected
                    ? "Συνδέστε πρώτα το Google Drive για να επιλέξετε αρχεία."
                    : "Χρειάζεται επανασύνδεση με το Google Drive."}
                </p>
                <Button disabled={busy} onClick={() => void handleConnect()}>
                  {isDisconnected
                    ? "Σύνδεση με Google Drive"
                    : "Επανασύνδεση με Google"}
                </Button>
              </div>
            ) : (
              <Button
                disabled={busy}
                onClick={() => void handlePickFiles()}
                aria-label="Επιλογή αρχείων από Google Drive"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                Επιλογή αρχείων από Google Drive
              </Button>
            )}
          </div>
        ) : null}

        {step === "previewing" ? (
          <p
            className="flex items-center gap-2 text-sm text-muted-foreground"
            role="status"
          >
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Έλεγχος αρχείων…
          </p>
        ) : null}

        {step === "preview" ? (
          <div className="space-y-4">
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm" data-testid="drive-import-preview">
                <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Αρχείο</th>
                    <th className="px-3 py-2 font-medium">Τύπος</th>
                    <th className="px-3 py-2 font-medium">Μέγεθος</th>
                    <th className="px-3 py-2 font-medium">Μορφή στο ARC</th>
                  </tr>
                </thead>
                <tbody>
                  {previews.map((file) => (
                    <tr key={file.id} className="border-t align-top">
                      <td className="px-3 py-2 break-words">{file.name}</td>
                      <td className="px-3 py-2">{file.mimeLabelEl}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {formatSize(file.sizeBytes)}
                      </td>
                      <td
                        className={cn(
                          "px-3 py-2",
                          !file.supported && "text-destructive",
                        )}
                      >
                        {file.supported ? file.formatLabelEl : file.reasonEl}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="space-y-2">
              <Label htmlFor="drive-import-folder">Φάκελος προορισμού στο ARC</Label>
              <Select
                id="drive-import-folder"
                value={folderId}
                onChange={(e) => setFolderId(e.target.value)}
              >
                {folders.map((folder) => (
                  <option key={folder.id} value={folder.id}>
                    {folder.name}
                  </option>
                ))}
              </Select>
            </div>

            <p className="text-xs text-muted-foreground">{COPY_HINT_EL}</p>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => void handlePickFiles()}
              >
                Επιλογή άλλων αρχείων
              </Button>
              <Button
                disabled={busy || supportedPreviews.length === 0 || !folderId}
                onClick={handleImport}
              >
                {supportedPreviews.length === 1
                  ? "Εισαγωγή 1 αρχείου"
                  : `Εισαγωγή ${supportedPreviews.length} αρχείων`}
              </Button>
            </div>
          </div>
        ) : null}

        {step === "importing" ? (
          <p
            className="flex items-center gap-2 text-sm text-muted-foreground"
            role="status"
            data-testid="drive-import-progress"
          >
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Η εισαγωγή βρίσκεται σε εξέλιξη…
          </p>
        ) : null}

        {step === "result" ? (
          <div className="space-y-4" data-testid="drive-import-result">
            <p className="text-sm font-medium" role="status">
              {importedSummaryEl(succeededCount, failedRecords.length)}
            </p>
            {timedOut ? (
              <p className="text-sm text-muted-foreground">
                Η εισαγωγή συνεχίζεται στο παρασκήνιο. Ανανεώστε τη σελίδα σε
                λίγο για να δείτε τα νέα έγγραφα.
              </p>
            ) : null}
            <ul className="space-y-2">
              {results.map((record) => (
                <li
                  key={record.googleFileId}
                  className="flex items-start gap-2 text-sm"
                >
                  {record.status === "SUCCEEDED" ? (
                    <CheckCircle2
                      className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600"
                      aria-hidden
                    />
                  ) : (
                    <XCircle
                      className="mt-0.5 h-4 w-4 shrink-0 text-destructive"
                      aria-hidden
                    />
                  )}
                  <span className="min-w-0">
                    <span className="break-words font-medium">
                      {record.googleFileName}
                    </span>
                    {record.status === "FAILED" && record.errorEl ? (
                      <span className="block text-muted-foreground">
                        {record.errorEl}
                      </span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
            {failedRecords.some((r) => r.errorCode === "needs_reconnect") ? (
              <Button asChild variant="secondary" size="sm">
                <Link to="/app/settings/connections">
                  Επανασύνδεση με Google
                </Link>
              </Button>
            ) : null}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="secondary" onClick={() => handleOpenChange(false)}>
                Κλείσιμο
              </Button>
              {retryableRecords.length > 0 ? (
                <Button disabled={busy} onClick={handleRetryFailed}>
                  Επανάληψη για τα αρχεία που απέτυχαν
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
};
