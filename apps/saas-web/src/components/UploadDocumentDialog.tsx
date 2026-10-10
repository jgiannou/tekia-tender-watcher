import { useEffect, useRef, useState } from "react";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DateInput } from "@/components/ui/date-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  DOCUMENT_TYPE_OPTIONS,
  saasApi,
  type VaultFolder,
} from "@/lib/api";

type UploadDocumentDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  folders: VaultFolder[];
  defaultFolderId: string | null;
  onUploaded: () => void;
};

const isAllowedFile = (file: File) => {
  const lower = file.name.toLowerCase();
  return lower.endsWith(".pdf") || lower.endsWith(".docx");
};

export const UploadDocumentDialog = ({
  open,
  onOpenChange,
  organizationId,
  folders,
  defaultFolderId,
  onUploaded,
}: UploadDocumentDialogProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [folderId, setFolderId] = useState(defaultFolderId ?? "");
  const [documentType, setDocumentType] = useState("");
  const [issueDate, setIssueDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [noExpiry, setNoExpiry] = useState(true);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFolderId(defaultFolderId ?? folders[0]?.id ?? "");
    setFile(null);
    setName("");
    setDocumentType("");
    setIssueDate("");
    setExpiryDate("");
    setNoExpiry(true);
    setNotes("");
  }, [open, defaultFolderId, folders]);

  const applyFile = (next: File | null) => {
    if (!next) return;
    if (!isAllowedFile(next)) {
      toast.error("Υποστηρίζονται μόνο PDF και DOCX");
      return;
    }
    setFile(next);
    setName((current) => current || next.name.replace(/\.[^.]+$/, ""));
  };

  const handleSubmit = async () => {
    if (!file || !folderId || !name.trim()) {
      toast.error("Επιλέξτε αρχείο, όνομα και φάκελο");
      return;
    }
    setSubmitting(true);
    try {
      await saasApi.uploadVaultDocument(organizationId, {
        file,
        folderId,
        name: name.trim(),
        documentType: documentType || undefined,
        notes: notes.trim() || undefined,
        issueDate: issueDate ? new Date(issueDate).toISOString() : undefined,
        expiryDate:
          !noExpiry && expiryDate
            ? new Date(expiryDate).toISOString()
            : undefined,
        noExpiry,
      });
      toast.success("Το έγγραφο μεταφορτώθηκε");
      onOpenChange(false);
      onUploaded();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Αποτυχία μεταφόρτωσης");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Ανέβασμα εγγράφου</DialogTitle>
          <DialogDescription>
            Ανεβάστε ένα αρχείο PDF ή DOCX για να το χρησιμοποιείτε στους φακέλους συμμετοχής σας.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div
            className={`rounded-md border border-dashed px-4 py-8 text-center ${
              dragOver ? "border-primary bg-primary/5" : "border-border"
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              applyFile(e.dataTransfer.files?.[0] ?? null);
            }}
          >
            <Upload className="mx-auto mb-2 h-5 w-5 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Σύρετε εδώ ένα αρχείο PDF ή DOCX ή επιλέξτε το από τη συσκευή σας.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => inputRef.current?.click()}
            >
              Επιλογή αρχείου
            </Button>
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="hidden"
              onChange={(e) => applyFile(e.target.files?.[0] ?? null)}
            />
            {file ? (
              <p className="mt-3 text-sm font-medium">{file.name}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="doc-name">Όνομα εγγράφου</Label>
            <Input
              id="doc-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="π.χ. Πιστοποιητικό Εκπροσώπησης"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="doc-folder">Φάκελος</Label>
            <Select
              id="doc-folder"
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

          <div className="space-y-2">
            <Label htmlFor="doc-type">Τύπος εγγράφου</Label>
            <Select
              id="doc-type"
              value={documentType}
              onChange={(e) => setDocumentType(e.target.value)}
            >
              <option value="">—</option>
              {DOCUMENT_TYPE_OPTIONS.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </Select>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="issue-date">Ημερομηνία έκδοσης</Label>
              <DateInput
                id="issue-date"
                value={issueDate}
                onChange={setIssueDate}
                aria-label="Ημερομηνία έκδοσης"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="expiry-date">Ημερομηνία λήξης</Label>
              <DateInput
                id="expiry-date"
                value={expiryDate}
                disabled={noExpiry}
                onChange={setExpiryDate}
                aria-label="Ημερομηνία λήξης"
              />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
            <Label htmlFor="no-expiry">Χωρίς ημερομηνία λήξης</Label>
            <Switch
              id="no-expiry"
              checked={noExpiry}
              onCheckedChange={(checked) => {
                setNoExpiry(checked);
                if (checked) setExpiryDate("");
              }}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="doc-notes">Σημειώσεις</Label>
            <Textarea
              id="doc-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Ακύρωση
            </Button>
            <Button disabled={submitting} onClick={() => void handleSubmit()}>
              {submitting ? "Ανέβασμα…" : "Ανέβασμα"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
