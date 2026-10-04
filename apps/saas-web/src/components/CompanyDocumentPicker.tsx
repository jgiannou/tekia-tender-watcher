import { useEffect, useMemo, useState } from "react";
import { useSessionContext } from "@/auth/SessionProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { saasApi, type VaultDocument, type VaultFolder } from "@/lib/api";

type CompanyDocumentPickerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Single-select callback (legacy). Prefer onSelectMany when multi is enabled. */
  onSelect?: (document: VaultDocument) => void;
  onSelectMany?: (documents: VaultDocument[]) => void;
  multiple?: boolean;
};

const statusLabel = (status: VaultDocument["status"]) => {
  switch (status) {
    case "VALID":
      return "Έγκυρο";
    case "EXPIRING_SOON":
      return "Λήγει σύντομα";
    case "EXPIRED":
      return "Ληγμένο";
    default:
      return "Δεν λήγει";
  }
};

export const CompanyDocumentPicker = ({
  open,
  onOpenChange,
  onSelect,
  onSelectMany,
  multiple = false,
}: CompanyDocumentPickerProps) => {
  const { activeOrganization } = useSessionContext();
  const [folders, setFolders] = useState<VaultFolder[]>([]);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [documents, setDocuments] = useState<VaultDocument[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !activeOrganization) return;
    setLoading(true);
    setSelectedIds(new Set());
    setSearch("");
    void saasApi
      .vaultFolders(activeOrganization.id)
      .then((data) => {
        setFolders(data.folders.filter((folder) => !folder.parentId));
        setFolderId(data.folders[0]?.id ?? null);
      })
      .finally(() => setLoading(false));
  }, [open, activeOrganization?.id]);

  useEffect(() => {
    if (!open || !activeOrganization) return;
    void saasApi
      .vaultDocuments(activeOrganization.id, {
        folderId: search.trim() ? undefined : folderId ?? undefined,
        q: search.trim() || undefined,
      })
      .then((data) => setDocuments(data.documents));
  }, [open, activeOrganization?.id, folderId, search]);

  const selectedDocs = useMemo(
    () => documents.filter((doc) => selectedIds.has(doc.id)),
    [documents, selectedIds],
  );

  const toggle = (doc: VaultDocument) => {
    if (!multiple) {
      onSelect?.(doc);
      onOpenChange(false);
      return;
    }
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(doc.id)) next.delete(doc.id);
      else next.add(doc.id);
      return next;
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Προσθήκη από Έγγραφα Εταιρείας</DialogTitle>
          <DialogDescription>
            Επιλέξτε υπάρχον έγγραφο από το Company Vault — χωρίς επαναφόρτωση.
          </DialogDescription>
        </DialogHeader>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Αναζήτηση…"
          aria-label="Αναζήτηση εγγράφων εταιρείας"
        />
        <div className="grid gap-4 md:grid-cols-[220px_1fr]">
          <div className="max-h-72 space-y-1 overflow-y-auto">
            {folders.map((folder) => (
              <button
                key={folder.id}
                type="button"
                className={`block w-full rounded-md px-3 py-2 text-left text-sm leading-snug ${
                  folderId === folder.id ? "bg-muted font-medium" : "hover:bg-muted/60"
                }`}
                onClick={() => {
                  setSearch("");
                  setFolderId(folder.id);
                }}
              >
                {folder.name}
              </button>
            ))}
          </div>
          <div className="max-h-72 space-y-2 overflow-y-auto">
            {loading ? (
              <p className="text-sm text-muted-foreground">Φόρτωση…</p>
            ) : documents.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Δεν υπάρχουν έγγραφα σε αυτόν τον φάκελο.
              </p>
            ) : (
              documents.map((doc) => {
                const checked = selectedIds.has(doc.id);
                return (
                  <button
                    key={doc.id}
                    type="button"
                    className={`flex w-full items-start justify-between gap-2 rounded-md border px-3 py-2 text-left ${
                      checked ? "border-primary bg-primary/5" : "border-border"
                    }`}
                    onClick={() => toggle(doc)}
                  >
                    <div>
                      <div className="text-sm font-medium">{doc.name}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="outline">{statusLabel(doc.status)}</Badge>
                        <span>
                          {doc.expiryDate
                            ? `Λήγει ${new Date(doc.expiryDate).toLocaleDateString("el-GR")}`
                            : "Δεν λήγει"}
                        </span>
                      </div>
                    </div>
                    {!multiple ? (
                      <span className="text-xs text-primary">Επιλογή</span>
                    ) : (
                      <span className="text-xs">{checked ? "✓" : ""}</span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Ακύρωση
          </Button>
          {multiple ? (
            <Button
              disabled={selectedDocs.length === 0}
              onClick={() => {
                onSelectMany?.(selectedDocs);
                onOpenChange(false);
              }}
            >
              Προσθήκη {selectedDocs.length || ""}{" "}
              {selectedDocs.length === 1 ? "εγγράφου" : "εγγράφων"}
            </Button>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
};
