import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Download,
  Eye,
  FileText,
  Folder,
  FolderPlus,
  MoreHorizontal,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { useSessionContext } from "@/auth/SessionProvider";
import { AuthenticatedPdfViewer } from "@/components/AuthenticatedPdfViewer";
import { Pagination, usePaginatedList } from "@/components/Pagination";
import { ImportFromGoogleDriveDialog } from "@/components/ImportFromGoogleDriveDialog";
import { UploadDocumentDialog } from "@/components/UploadDocumentDialog";
import { EmptyState, ErrorState, PageSkeleton } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DataList, DataRow } from "@/components/ui/data-row";
import { Input } from "@/components/ui/input";
import { PageHeader, SectionHeader } from "@/components/ui/page-header";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  saasApi,
  type GoogleIntegrationsResponse,
  type VaultDocument,
  type VaultFolder,
} from "@/lib/api";
import { cn } from "@/lib/utils";

const statusLabel = (status: VaultDocument["status"]) => {
  switch (status) {
    case "VALID":
      return "Έγκυρο";
    case "EXPIRING_SOON":
      return "Λήγει σύντομα";
    case "EXPIRED":
      return "Ληγμένο";
    default:
      return "Χωρίς ημερομηνία λήξης";
  }
};

const statusTone = (status: VaultDocument["status"]) => {
  if (status === "EXPIRED") return "text-destructive";
  if (status === "EXPIRING_SOON") return "text-amber-400";
  if (status === "VALID") return "text-primary";
  return "text-muted-foreground";
};

const formatDate = (value: string | null | undefined) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("el-GR");
};

const fileKind = (doc: VaultDocument) => {
  if (doc.mimeType?.includes("pdf") || doc.originalFilename?.endsWith(".pdf")) {
    return "PDF";
  }
  if (
    doc.mimeType?.includes("wordprocessingml") ||
    doc.originalFilename?.endsWith(".docx")
  ) {
    return "DOCX";
  }
  return "Αρχείο";
};

export const DocumentsPage = () => {
  const { activeOrganization } = useSessionContext();
  const versionInputRef = useRef<HTMLInputElement>(null);
  const [folders, setFolders] = useState<VaultFolder[]>([]);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [documents, setDocuments] = useState<VaultDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [driveImportOpen, setDriveImportOpen] = useState(false);
  const [googleView, setGoogleView] = useState<GoogleIntegrationsResponse | null>(
    null,
  );
  const [previewDoc, setPreviewDoc] = useState<VaultDocument | null>(null);
  const [versionTargetId, setVersionTargetId] = useState<string | null>(null);

  const loadFolders = async () => {
    if (!activeOrganization) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await saasApi.vaultFolders(activeOrganization.id);
      setFolders(data.folders);
      setFolderId((current) => current ?? data.folders[0]?.id ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Αποτυχία φόρτωσης");
    } finally {
      setLoading(false);
    }
  };

  const loadDocuments = async () => {
    if (!activeOrganization) return;
    const data = await saasApi.vaultDocuments(activeOrganization.id, {
      folderId: search.trim() ? undefined : folderId ?? undefined,
      q: search.trim() || undefined,
    });
    setDocuments(data.documents);
  };

  useEffect(() => {
    void loadFolders();
  }, [activeOrganization?.id]);

  useEffect(() => {
    if (!activeOrganization) return;
    let cancelled = false;
    saasApi
      .getGoogleIntegrations(activeOrganization.id)
      .then((view) => {
        if (!cancelled) setGoogleView(view);
      })
      .catch(() => {
        if (!cancelled) setGoogleView(null);
      });
    return () => {
      cancelled = true;
    };
  }, [activeOrganization?.id]);

  useEffect(() => {
    if (!activeOrganization) return;
    void loadDocuments().catch((err) => {
      toast.error(err instanceof Error ? err.message : "Αποτυχία φόρτωσης εγγράφων");
    });
  }, [folderId, search, activeOrganization?.id]);

  const activeFolder = folders.find((folder) => folder.id === folderId) ?? null;
  // Drive flag on + plan includes Drive and the company vault.
  const showDriveImport = Boolean(
    googleView?.drive.featureAvailable && googleView.drive.importEntitled,
  );
  const rootFolders = useMemo(
    () => folders.filter((folder) => !folder.parentId),
    [folders],
  );
  const childFolders = useMemo(
    () => folders.filter((folder) => folder.parentId === folderId),
    [folders, folderId],
  );

  const expiringSoonCount = documents.filter(
    (doc) => doc.status === "EXPIRING_SOON",
  ).length;

  const paged = usePaginatedList(documents, {
    resetKey: `${folderId ?? ""}|${search}`,
  });

  const handleCreateFolder = async () => {
    if (!activeOrganization) return;
    const name = window.prompt(
      folderId
        ? "Όνομα υποφακέλου"
        : "Όνομα νέου φακέλου",
    );
    if (!name?.trim()) return;
    try {
      await saasApi.createVaultFolder(activeOrganization.id, {
        name: name.trim(),
        parentId: folderId,
      });
      toast.success("Ο φάκελος δημιουργήθηκε");
      await loadFolders();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Αποτυχία δημιουργίας φακέλου");
    }
  };

  const handleDownload = async (doc: VaultDocument) => {
    if (!activeOrganization) return;
    try {
      const response = await fetch(saasApi.downloadVaultDocumentUrl(doc.id), {
        credentials: "include",
        headers: { "X-Organization-Id": activeOrganization.id },
      });
      if (!response.ok) {
        throw new Error("Αποτυχία λήψης αρχείου");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = doc.originalFilename || doc.name;
      anchor.rel = "noopener";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      toast.success("Η λήψη ξεκίνησε");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Αποτυχία λήψης αρχείου");
    }
  };

  const handleRename = async (doc: VaultDocument) => {
    if (!activeOrganization) return;
    const name = window.prompt("Νέο όνομα εγγράφου", doc.name);
    if (!name?.trim() || name.trim() === doc.name) return;
    try {
      await saasApi.updateVaultDocument(activeOrganization.id, doc.id, {
        name: name.trim(),
      });
      toast.success("Μετονομάστηκε");
      await loadDocuments();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Αποτυχία μετονομασίας");
    }
  };

  const handleDelete = async (doc: VaultDocument) => {
    if (!activeOrganization) return;
    if (!window.confirm(`Διαγραφή «${doc.name}»;`)) return;
    try {
      await saasApi.deleteVaultDocument(activeOrganization.id, doc.id);
      toast.success("Διαγράφηκε");
      await loadDocuments();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Αποτυχία διαγραφής");
    }
  };

  const handleNewVersion = async (file: File | null) => {
    if (!activeOrganization || !versionTargetId || !file) return;
    try {
      await saasApi.uploadVaultDocumentVersion(
        activeOrganization.id,
        versionTargetId,
        file,
      );
      toast.success("Νέα έκδοση αποθηκεύτηκε");
      await loadDocuments();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Αποτυχία νέας έκδοσης");
    } finally {
      setVersionTargetId(null);
      if (versionInputRef.current) versionInputRef.current.value = "";
    }
  };

  if (loading) return <PageSkeleton />;
  if (!activeOrganization) {
    return (
      <EmptyState
        title="Χωρίς οργανισμό"
        description="Τα εταιρικά έγγραφα ανήκουν στην εταιρεία σας."
      />
    );
  }
  if (error) {
    return <ErrorState description={error} onRetry={() => void loadFolders()} />;
  }

  const handleGenerateProfile = async () => {
    if (!activeOrganization) return;
    try {
      const result = await saasApi.generateCompanyProfile(activeOrganization.id);
      toast.success(
        result.created
          ? "Δημιουργήθηκε εταιρικό προφίλ στο φάκελο 08"
          : "Ανανεώθηκε το εταιρικό προφίλ",
      );
      await loadFolders();
      await loadDocuments();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Αποτυχία δημιουργίας προφίλ",
      );
    }
  };

  const handleSelectFolder = (id: string) => {
    setSearch("");
    setFolderId(id);
  };

  const isSearching = Boolean(search.trim());

  return (
    <div className="space-y-6">
      <PageHeader
        title="Έγγραφα"
        description="Αποθηκεύστε και οργανώστε τα έγγραφα της εταιρείας σας για χρήση στους διαγωνισμούς που συμμετέχετε."
        actions={
          <>
            <Button variant="ghost" onClick={() => void handleGenerateProfile()}>
              Δημιουργία εταιρικού προφίλ
            </Button>
            {showDriveImport ? (
              <Button
                variant="outline"
                disabled={!googleView?.drive.pickerConfigured}
                onClick={() => setDriveImportOpen(true)}
                aria-label="Εισαγωγή από Google Drive"
                aria-describedby={
                  googleView?.drive.pickerConfigured
                    ? undefined
                    : "drive-import-unavailable"
                }
              >
                Εισαγωγή από Google Drive
              </Button>
            ) : null}
            <Button onClick={() => setUploadOpen(true)}>
              <Plus className="h-4 w-4" />
              Ανέβασμα εγγράφου
            </Button>
          </>
        }
      />
      {showDriveImport && !googleView?.drive.pickerConfigured ? (
        <p id="drive-import-unavailable" className="text-xs text-muted-foreground">
          Η εισαγωγή από Google Drive δεν είναι διαθέσιμη προσωρινά.
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[232px_1fr]">
        <nav aria-label="Φάκελοι εγγράφων" className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Φάκελοι
            </span>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2"
              onClick={() => void handleCreateFolder()}
              aria-label="Νέος φάκελος"
            >
              <FolderPlus className="h-3.5 w-3.5" />
              Νέος
            </Button>
          </div>
          <ul className="space-y-0.5">
            {rootFolders.map((folder) => {
              const isActive = folderId === folder.id && !isSearching;
              return (
                <li key={folder.id}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        aria-current={isActive ? "true" : undefined}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-md border-l-2 border-transparent px-2.5 py-1.5 text-left text-sm text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          isActive &&
                            "border-border bg-muted/60 font-medium text-foreground ring-1 ring-primary/40",
                        )}
                        onClick={() => handleSelectFolder(folder.id)}
                      >
                        <Folder className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
                        <span className="min-w-0 flex-1 truncate">{folder.name}</span>
                        {folderId === folder.id && !isSearching ? (
                          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                            {documents.length}
                          </span>
                        ) : null}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right">{folder.name}</TooltipContent>
                  </Tooltip>
                </li>
              );
            })}
          </ul>
        </nav>

        <section className="min-w-0 space-y-4" aria-label="Περιεχόμενο φακέλου">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <SectionHeader
              className="mb-0"
              title={isSearching ? "Αποτελέσματα αναζήτησης" : activeFolder?.name ?? "Έγγραφα"}
              description={`${documents.length} έγγραφα${
                expiringSoonCount > 0 ? ` · ${expiringSoonCount} λήγουν σύντομα` : ""
              }`}
            />
            <div className="relative w-full sm:w-64">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                className="h-9 pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Αναζήτηση εγγράφων…"
                aria-label="Αναζήτηση εγγράφων"
              />
            </div>
          </div>

          {childFolders.length > 0 && !isSearching ? (
            <div className="flex flex-wrap gap-1.5">
              {childFolders.map((folder) => (
                <Button
                  key={folder.id}
                  size="sm"
                  variant="ghost"
                  className="h-7 text-muted-foreground"
                  onClick={() => setFolderId(folder.id)}
                >
                  <Folder className="h-3.5 w-3.5" aria-hidden />
                  {folder.name}
                </Button>
              ))}
            </div>
          ) : null}

          {documents.length === 0 ? (
            <EmptyState
              title={isSearching ? "Κανένα αποτέλεσμα" : "Κενός φάκελος"}
              description={
                isSearching
                  ? "Δοκιμάστε διαφορετικούς όρους αναζήτησης."
                  : "Δεν υπάρχουν ακόμη έγγραφα σε αυτή την κατηγορία."
              }
              actionLabel={isSearching ? undefined : "Ανέβασμα εγγράφου"}
              onAction={isSearching ? undefined : () => setUploadOpen(true)}
            />
          ) : (
            <div>
              <DataList className="border-t border-border/50">
                {paged.pageItems.map((doc) => (
                  <DataRow
                    key={doc.id}
                    interactive
                    className="items-center py-3"
                    actions={
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            aria-label={`Ενέργειες ${doc.name}`}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setPreviewDoc(doc)}>
                            <Eye className="h-4 w-4" />
                            Προβολή
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDownload(doc)}>
                            <Download className="h-4 w-4" />
                            Λήψη
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => void handleRename(doc)}>
                            Μετονομασία
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              setVersionTargetId(doc.id);
                              versionInputRef.current?.click();
                            }}
                          >
                            Νέα έκδοση
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => void handleDelete(doc)}>
                            <Trash2 className="h-4 w-4" />
                            Διαγραφή
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    }
                  >
                    <div className="flex items-start gap-3">
                      <FileText
                        className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{doc.name}</p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                          <span>{doc.documentType || fileKind(doc)}</span>
                          <span aria-hidden>·</span>
                          <span className="font-mono">v{doc.version}</span>
                          <span aria-hidden>·</span>
                          <span>Ενημ. {formatDate(doc.updatedAt ?? doc.createdAt)}</span>
                          {isSearching && doc.folder?.name ? (
                            <>
                              <span aria-hidden>·</span>
                              <span>{doc.folder.name}</span>
                            </>
                          ) : null}
                        </p>
                      </div>
                      <div className="hidden shrink-0 text-right sm:block">
                        <p
                          className={cn(
                            "inline-flex items-center gap-1.5 text-xs",
                            statusTone(doc.status),
                          )}
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
                          {statusLabel(doc.status)}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Λήξη {formatDate(doc.expiryDate)}
                        </p>
                      </div>
                    </div>
                  </DataRow>
                ))}
              </DataList>
              {paged.totalPages > 1 ? (
                <div className="border-t border-border/50 pt-3">
                  <Pagination
                    page={paged.page}
                    totalPages={paged.totalPages}
                    total={paged.total}
                    pageSize={paged.pageSize}
                    onPageChange={paged.setPage}
                  />
                </div>
              ) : null}
            </div>
          )}
        </section>
      </div>

      <input
        ref={versionInputRef}
        type="file"
        accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="hidden"
        onChange={(e) => void handleNewVersion(e.target.files?.[0] ?? null)}
      />

      {showDriveImport && googleView ? (
        <ImportFromGoogleDriveDialog
          open={driveImportOpen}
          onOpenChange={setDriveImportOpen}
          organizationId={activeOrganization.id}
          folders={folders}
          defaultFolderId={folderId}
          driveStatus={googleView.drive.status}
          onImported={() => void loadDocuments()}
        />
      ) : null}

      <UploadDocumentDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        organizationId={activeOrganization.id}
        folders={folders}
        defaultFolderId={folderId}
        onUploaded={() => void loadDocuments()}
      />

      {previewDoc ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 md:items-center"
          role="dialog"
          aria-modal="true"
          aria-label="Προβολή εγγράφου"
          onClick={() => setPreviewDoc(null)}
        >
          <Card
            className="max-h-[90vh] w-full max-w-3xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <CardHeader>
              <CardTitle>{previewDoc.name}</CardTitle>
              <CardDescription>
                {fileKind(previewDoc)} · v{previewDoc.version} ·{" "}
                {statusLabel(previewDoc.status)}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {fileKind(previewDoc) === "PDF" && activeOrganization ? (
                <AuthenticatedPdfViewer
                  organizationId={activeOrganization.id}
                  pdfPath={saasApi.downloadVaultDocumentUrl(previewDoc.id, {
                    inline: true,
                  })}
                  title={previewDoc.name}
                  downloadName={previewDoc.originalFilename || `${previewDoc.name}.pdf`}
                  className="h-[55vh]"
                  iframeClassName="h-full min-h-[50vh] w-full rounded-md border border-border bg-background"
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  Για DOCX εμφανίζονται τα στοιχεία του εγγράφου. Χρησιμοποιήστε λήψη για άνοιγμα.
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => void handleDownload(previewDoc)}>
                  Λήψη αρχείου
                </Button>
                <Button variant="ghost" onClick={() => setPreviewDoc(null)}>
                  Κλείσιμο
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
};
