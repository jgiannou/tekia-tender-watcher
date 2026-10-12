import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, ExternalLink, Loader2, MinusCircle, XCircle } from "lucide-react";
import { toast } from "sonner";
import { CompanyDocumentPicker } from "@/components/CompanyDocumentPicker";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  saasApi,
  type GoogleCapabilityStatus,
  type GoogleDriveFolder,
  type GoogleDriveFolderItem,
  type TenderDriveFolderPreview,
  type VaultDocument,
} from "@/lib/api";
import { humanSaasError } from "@/lib/labels";
import { cn } from "@/lib/utils";

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 3 * 60 * 1000;
const MAX_FOLDER_NAME_LENGTH = 120;

type Step = "loading" | "connect" | "form" | "creating" | "result";

type CreateTenderDriveFolderDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  tenderId: string;
  driveStatus: GoogleCapabilityStatus;
  /** Called when a folder reached a final state (so the page can refresh its folder list). */
  onFolderChanged?: () => void;
};

const needsReconnectError = (err: unknown): boolean =>
  err instanceof Error &&
  /google_needs_reconnect|google_drive_scope_missing|google_drive_not_connected/.test(
    err.message,
  );

const formatDateTime = (value: string): string => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("el-GR");
};

const folderStatusLabelEl = (folder: GoogleDriveFolder): string => {
  switch (folder.status) {
    case "SUCCEEDED":
      return "Ολοκληρώθηκε";
    case "PARTIAL":
      return "Ολοκληρώθηκε μερικώς";
    case "FAILED":
      return "Δεν ολοκληρώθηκε";
    default:
      return "Σε εξέλιξη";
  }
};

/** Section sub-folders are structure, not files — keep them out of the result list. */
const isFileItem = (item: GoogleDriveFolderItem): boolean => item.kind !== "SUBFOLDER";

const itemNoteEl = (item: GoogleDriveFolderItem): string | null => {
  if (item.status === "FAILED") return item.errorEl;
  if (item.status === "SKIPPED") return item.errorEl;
  return null;
};

export const CreateTenderDriveFolderDialog = ({
  open,
  onOpenChange,
  organizationId,
  tenderId,
  driveStatus,
  onFolderChanged,
}: CreateTenderDriveFolderDialogProps) => {
  const [step, setStep] = useState<Step>("loading");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<TenderDriveFolderPreview | null>(null);
  const [folderName, setFolderName] = useState("");
  const [includeOfficialDocs, setIncludeOfficialDocs] = useState(true);
  const [includeChecklistSummary, setIncludeChecklistSummary] = useState(false);
  const [vaultDocs, setVaultDocs] = useState<VaultDocument[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [folder, setFolder] = useState<GoogleDriveFolder | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const clientRequestId = useRef("");

  const isDisconnected = driveStatus === "DISCONNECTED" || driveStatus === "DISABLED";

  const loadPreview = async (vaultDocumentIds: string[]) => {
    const next = await saasApi.previewTenderDriveFolder(organizationId, {
      tenderId,
      vaultDocumentIds,
    });
    setPreview(next);
    return next;
  };

  // Reset + load the preview each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    clientRequestId.current = crypto.randomUUID();
    setBusy(false);
    setFolder(null);
    setTimedOut(false);
    setVaultDocs([]);
    setPreview(null);
    if (isDisconnected || driveStatus === "NEEDS_RECONNECT") {
      setStep("connect");
      return;
    }
    setStep("loading");
    let cancelled = false;
    loadPreview([])
      .then((next) => {
        if (cancelled) return;
        setFolderName(next.defaultFolderName);
        setIncludeOfficialDocs(next.officialDocuments.length > 0);
        setIncludeChecklistSummary(false);
        setStep("form");
      })
      .catch((err) => {
        if (cancelled) return;
        if (needsReconnectError(err)) {
          setStep("connect");
          return;
        }
        toast.error(
          err instanceof Error ? humanSaasError(err.message) : "Αποτυχία προεπισκόπησης",
        );
        onOpenChange(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Poll the running snapshot until it settles.
  useEffect(() => {
    if (step !== "creating" || !folder) return;
    let cancelled = false;
    const startedAt = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
      try {
        const { folder: next } = await saasApi.getTenderDriveFolderStatus(
          organizationId,
          folder.id,
        );
        if (cancelled) return;
        setFolder(next);
        if (!next.active) {
          setStep("result");
          onFolderChanged?.();
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
  }, [step, folder?.id, organizationId]);

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

  const handleVaultSelected = async (documents: VaultDocument[]) => {
    const merged = [
      ...vaultDocs,
      ...documents.filter((doc) => !vaultDocs.some((existing) => existing.id === doc.id)),
    ];
    const limit = preview?.vault.maxDocuments ?? 20;
    const limited = merged.slice(0, limit);
    setVaultDocs(limited);
    try {
      await loadPreview(limited.map((doc) => doc.id));
    } catch (err) {
      toast.error(
        err instanceof Error ? humanSaasError(err.message) : "Αποτυχία ελέγχου εγγράφων",
      );
    }
  };

  const handleRemoveVaultDoc = async (documentId: string) => {
    const remaining = vaultDocs.filter((doc) => doc.id !== documentId);
    setVaultDocs(remaining);
    try {
      await loadPreview(remaining.map((doc) => doc.id));
    } catch {
      // The selection itself is authoritative; the preview only adds hints.
    }
  };

  const handleCreate = async () => {
    if (!preview) return;
    setBusy(true);
    try {
      const { folder: started } = await saasApi.startTenderDriveFolder(organizationId, {
        tenderId,
        folderName: folderName.trim() || undefined,
        vaultDocumentIds: vaultDocs.map((doc) => doc.id),
        includeOfficialDocs,
        includeChecklistSummary: includeChecklistSummary && preview.checklist.available,
        clientRequestId: clientRequestId.current,
      });
      setFolder(started);
      setTimedOut(false);
      setStep(started.active ? "creating" : "result");
      if (!started.active) onFolderChanged?.();
    } catch (err) {
      if (needsReconnectError(err)) {
        setStep("connect");
      }
      toast.error(
        err instanceof Error ? humanSaasError(err.message) : "Αποτυχία δημιουργίας φακέλου",
      );
    } finally {
      setBusy(false);
    }
  };

  const handleRetry = async () => {
    if (!folder) return;
    setBusy(true);
    try {
      const { folder: retried } = await saasApi.retryTenderDriveFolder(
        organizationId,
        folder.id,
      );
      setFolder(retried);
      setTimedOut(false);
      setStep("creating");
    } catch (err) {
      toast.error(
        err instanceof Error ? humanSaasError(err.message) : "Αποτυχία επανάληψης",
      );
    } finally {
      setBusy(false);
    }
  };

  const handleNewSnapshot = async () => {
    // A new snapshot is always a new explicit submit with a fresh request id.
    clientRequestId.current = crypto.randomUUID();
    setFolder(null);
    setVaultDocs([]);
    setStep("loading");
    try {
      const next = await loadPreview([]);
      setFolderName(next.defaultFolderName);
      setIncludeOfficialDocs(next.officialDocuments.length > 0);
      setIncludeChecklistSummary(false);
      setStep("form");
    } catch (err) {
      toast.error(
        err instanceof Error ? humanSaasError(err.message) : "Αποτυχία προεπισκόπησης",
      );
      onOpenChange(false);
    }
  };

  const fileItems = folder?.items.filter(isFileItem) ?? [];
  const failedCount = fileItems.filter((item) => item.status === "FAILED").length;
  const checklistDisabled = !preview?.checklist.available;
  const unsupportedVault = preview?.vault.documents.filter((doc) => !doc.supported) ?? [];
  const canCreate =
    Boolean(preview) &&
    folderName.trim().length > 0 &&
    unsupportedVault.length === 0 &&
    !busy;

  return (
    <>
      <Dialog open={open && !pickerOpen} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Δημιουργία φακέλου στο Drive</DialogTitle>
            <DialogDescription>
              Ο φάκελος περιέχει αντίγραφα των εγγράφων που επιλέξατε. Ελέγξτε τις
              απαιτήσεις της διακήρυξης πριν από την υποβολή.
            </DialogDescription>
          </DialogHeader>

          {step === "loading" ? (
            <p
              className="flex items-center gap-2 text-sm text-muted-foreground"
              role="status"
            >
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Φόρτωση…
            </p>
          ) : null}

          {step === "connect" ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {isDisconnected
                  ? "Συνδέστε πρώτα το Google Drive για να δημιουργήσετε φάκελο."
                  : "Χρειάζεται επανασύνδεση με το Google Drive."}
              </p>
              <Button
                disabled={busy}
                onClick={() => void handleConnect()}
                aria-label={
                  isDisconnected ? "Σύνδεση με Google Drive" : "Επανασύνδεση με Google"
                }
              >
                {isDisconnected ? "Σύνδεση με Google Drive" : "Επανασύνδεση με Google"}
              </Button>
            </div>
          ) : null}

          {step === "form" && preview ? (
            <div className="space-y-5" data-testid="drive-folder-form">
              <div className="rounded-md border bg-muted/40 p-3 text-sm">
                <p className="font-medium">
                  Λογαριασμός προορισμού:{" "}
                  <span className="break-all">{preview.googleEmail}</span>
                </p>
                <p className="mt-1 text-muted-foreground">
                  {preview.messages.destinationEl}
                </p>
              </div>

              {preview.existingFolders.length > 0 ? (
                <section className="space-y-2" aria-label="Υπάρχοντες φάκελοι">
                  <h3 className="text-sm font-medium">Υπάρχοντες φάκελοι</h3>
                  <ul className="space-y-2">
                    {preview.existingFolders.map((existing) => (
                      <li
                        key={existing.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
                      >
                        <span className="min-w-0">
                          <span className="block break-words font-medium">
                            {existing.folderName}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {folderStatusLabelEl(existing)} ·{" "}
                            {formatDateTime(existing.createdAt)} · {existing.googleEmail}
                          </span>
                        </span>
                        {existing.folderUrl ? (
                          <Button asChild size="sm" variant="outline">
                            <a
                              href={existing.folderUrl}
                              target="_blank"
                              rel="noreferrer"
                              aria-label={`Άνοιγμα φακέλου ${existing.folderName}`}
                            >
                              <ExternalLink className="h-4 w-4" aria-hidden />
                              Άνοιγμα φακέλου
                            </a>
                          </Button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-muted-foreground">
                    Η δημιουργία νέου φακέλου είναι νέο στιγμιότυπο: δεν αλλάζει τους
                    υπάρχοντες φακέλους ούτε αντικαθιστά αρχεία που έχετε επεξεργαστεί.
                  </p>
                </section>
              ) : null}

              <div className="space-y-2">
                <Label htmlFor="drive-folder-name">Όνομα φακέλου</Label>
                <Input
                  id="drive-folder-name"
                  value={folderName}
                  maxLength={MAX_FOLDER_NAME_LENGTH}
                  onChange={(e) => setFolderName(e.target.value)}
                />
              </div>

              <section className="space-y-2" aria-label="Δομή φακέλου">
                <h3 className="text-sm font-medium">Δομή φακέλου</h3>
                <ul className="list-inside list-disc text-sm text-muted-foreground">
                  {preview.structure.map((section) => (
                    <li key={section.key}>{section.name}</li>
                  ))}
                </ul>
                <p className="text-xs text-muted-foreground">
                  Θα δημιουργηθεί και αρχείο «Σύνοψη διαγωνισμού» με τίτλο, αναθέτουσα
                  αρχή, προθεσμία (αν είναι γνωστή), πηγή και σύνδεσμο προς το ARC.
                </p>
              </section>

              <section className="space-y-2" aria-label="Έγγραφα διαγωνισμού">
                <h3 className="text-sm font-medium">Έγγραφα διαγωνισμού</h3>
                {preview.officialDocuments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Δεν υπάρχει διαθέσιμο επίσημο έγγραφο για αυτή την πράξη.
                  </p>
                ) : (
                  <>
                    <label className="flex items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4"
                        checked={includeOfficialDocs}
                        onChange={(e) => setIncludeOfficialDocs(e.target.checked)}
                        aria-label="Αντίγραφο επίσημων εγγράφων διαγωνισμού"
                      />
                      <span>Αντίγραφο επίσημων εγγράφων στον φάκελο 01</span>
                    </label>
                    <ul className="space-y-1 text-sm">
                      {preview.officialDocuments.map((doc) => (
                        <li key={doc.key} className="rounded-md border px-3 py-2">
                          <span className="block font-medium">{doc.label}</span>
                          <span className="block text-xs text-muted-foreground">
                            {doc.modeLabelEl}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </section>

              {preview.vault.entitled ? (
                <section className="space-y-2" aria-label="Έγγραφα εταιρείας">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-medium">Δικαιολογητικά από τα Έγγραφα εταιρείας</h3>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => setPickerOpen(true)}
                      disabled={vaultDocs.length >= preview.vault.maxDocuments}
                    >
                      Προσθήκη από Έγγραφα εταιρείας
                    </Button>
                  </div>
                  {vaultDocs.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Προαιρετικό: επιλέξτε έγγραφα που θα αντιγραφούν στον φάκελο 02.
                    </p>
                  ) : (
                    <ul className="space-y-1">
                      {vaultDocs.map((doc) => {
                        const hint = preview.vault.documents.find((d) => d.id === doc.id);
                        return (
                          <li
                            key={doc.id}
                            className="flex items-start justify-between gap-2 rounded-md border px-3 py-2 text-sm"
                          >
                            <span className="min-w-0">
                              <span className="block break-words font-medium">{doc.name}</span>
                              {hint && !hint.supported ? (
                                <span className="block text-xs text-destructive">
                                  {hint.reasonEl}
                                </span>
                              ) : null}
                            </span>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => void handleRemoveVaultDoc(doc.id)}
                              aria-label={`Αφαίρεση ${doc.name}`}
                            >
                              Αφαίρεση
                            </Button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>
              ) : null}

              {preview.checklist.entitled ? (
                <section className="space-y-2" aria-label="Σύνοψη δικαιολογητικών">
                  <label
                    className={cn(
                      "flex items-start gap-2 text-sm",
                      checklistDisabled && "opacity-70",
                    )}
                  >
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4"
                      checked={includeChecklistSummary && !checklistDisabled}
                      disabled={checklistDisabled}
                      onChange={(e) => setIncludeChecklistSummary(e.target.checked)}
                      aria-label={preview.checklist.labelEl}
                    />
                    <span>{preview.checklist.labelEl} στον φάκελο 03</span>
                  </label>
                  {checklistDisabled && preview.checklist.reasonEl ? (
                    <p className="text-xs text-muted-foreground">{preview.checklist.reasonEl}</p>
                  ) : null}
                  {preview.checklist.limitationEl ? (
                    <p className="text-xs text-muted-foreground">
                      {preview.checklist.limitationEl}
                    </p>
                  ) : null}
                </section>
              ) : null}

              <p className="text-xs text-muted-foreground">{preview.messages.snapshotHintEl}</p>

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button variant="secondary" onClick={() => onOpenChange(false)}>
                  Ακύρωση
                </Button>
                <Button disabled={!canCreate} onClick={() => void handleCreate()}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                  Δημιουργία φακέλου
                </Button>
              </div>
            </div>
          ) : null}

          {step === "creating" ? (
            <p
              className="flex items-center gap-2 text-sm text-muted-foreground"
              role="status"
              data-testid="drive-folder-progress"
            >
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Ο φάκελος δημιουργείται στο Google Drive…
            </p>
          ) : null}

          {step === "result" && folder ? (
            <div className="space-y-4" data-testid="drive-folder-result">
              {folder.status === "SUCCEEDED" ? (
                <p className="text-sm font-medium" role="status">
                  {folder.successEl}
                </p>
              ) : (
                <p className="text-sm font-medium" role="status">
                  {folder.folderUrl
                    ? "Ο φάκελος δημιουργήθηκε αλλά δεν ολοκληρώθηκε πλήρως."
                    : "Ο φάκελος δεν δημιουργήθηκε."}
                  {failedCount > 0
                    ? ` ${failedCount} ${failedCount === 1 ? "αρχείο δεν αντιγράφηκε" : "αρχεία δεν αντιγράφηκαν"}.`
                    : ""}
                </p>
              )}
              {folder.status !== "SUCCEEDED" && folder.errorEl ? (
                <p className="text-sm text-muted-foreground">{folder.errorEl}</p>
              ) : null}
              {timedOut ? (
                <p className="text-sm text-muted-foreground">
                  Η δημιουργία συνεχίζεται στο παρασκήνιο. Ανοίξτε ξανά αυτό το παράθυρο σε
                  λίγο για να δείτε την πρόοδο.
                </p>
              ) : null}

              <ul className="space-y-2">
                {fileItems.map((item) => (
                  <li key={item.id} className="flex items-start gap-2 text-sm">
                    {item.status === "SUCCEEDED" ? (
                      <CheckCircle2
                        className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600"
                        aria-hidden
                      />
                    ) : item.status === "SKIPPED" ? (
                      <MinusCircle
                        className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                        aria-hidden
                      />
                    ) : (
                      <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
                    )}
                    <span className="min-w-0">
                      <span className="break-words font-medium">{item.name}</span>
                      {itemNoteEl(item) ? (
                        <span className="block text-muted-foreground">{itemNoteEl(item)}</span>
                      ) : null}
                      {item.status === "PENDING" ? (
                        <span className="block text-muted-foreground">Δεν ολοκληρώθηκε.</span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>

              {folder.status === "SUCCEEDED" ? (
                <p className="text-xs text-muted-foreground">{folder.copyHintEl}</p>
              ) : null}

              {folder.errorCode === "needs_reconnect" ? (
                <Button asChild variant="secondary" size="sm">
                  <Link to="/app/settings/connections">Επανασύνδεση με Google</Link>
                </Button>
              ) : null}

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button variant="ghost" onClick={() => void handleNewSnapshot()}>
                  Νέο στιγμιότυπο
                </Button>
                <Button variant="secondary" onClick={() => onOpenChange(false)}>
                  Κλείσιμο
                </Button>
                {folder.retryable ? (
                  <Button variant="secondary" disabled={busy} onClick={() => void handleRetry()}>
                    Επανάληψη για τα αρχεία που απέτυχαν
                  </Button>
                ) : null}
                {folder.folderUrl ? (
                  <Button asChild>
                    <a
                      href={folder.folderUrl}
                      target="_blank"
                      rel="noreferrer"
                      aria-label="Άνοιγμα φακέλου στο Google Drive"
                    >
                      <ExternalLink className="h-4 w-4" aria-hidden />
                      Άνοιγμα φακέλου
                    </a>
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <CompanyDocumentPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        multiple
        onSelectMany={(documents) => void handleVaultSelected(documents)}
      />
    </>
  );
};
