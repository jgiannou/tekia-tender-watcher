import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Building2, Eye, Landmark, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useSessionContext } from "@/auth/SessionProvider";
import { CompanyDocumentPicker } from "@/components/CompanyDocumentPicker";
import { IconAction } from "@/components/IconAction";
import { PdfPreviewModal } from "@/components/PdfPreviewModal";
import { EmptyState, ErrorState, PageSkeleton } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  saasApi,
  type KimdisSearchItem,
  type Opportunity,
  type TenderWorkflow,
  type TenderWorkspaceResponse,
  type VaultDocument,
} from "@/lib/api";
import { outreachMethodLabel, submissionMethodLabel } from "@/lib/labels";

const formatMoney = (value: number | null) =>
  value == null
    ? "—"
    : new Intl.NumberFormat("el-GR", {
        style: "currency",
        currency: "EUR",
        maximumFractionDigits: 0,
      }).format(value);

const formatDate = (value: string | null | undefined) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value.slice(0, 10) : date.toLocaleDateString("el-GR");
};

const formatDateTime = (value: string | null | undefined) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("el-GR");
};

const formatDateTimeLocalValue = (date = new Date()) => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const OUTREACH_METHODS = ["EMAIL", "PHONE", "PORTAL", "PHYSICAL", "OTHER"] as const;
const SUBMISSION_METHODS = ["PORTAL", "EMAIL", "PHYSICAL", "OTHER"] as const;

export const TenderDetailPage = () => {
  const { activeOrganization } = useSessionContext();
  const navigate = useNavigate();
  const { recordType: recordTypeParam, adam: adamParam } = useParams();
  const recordType =
    recordTypeParam === "PROC" || recordTypeParam === "REQ" ? recordTypeParam : null;
  const adam = adamParam ? decodeURIComponent(adamParam) : "";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [item, setItem] = useState<KimdisSearchItem | null>(null);
  const [tenderId, setTenderId] = useState<string | null>(null);
  const [opportunity, setOpportunity] = useState<Opportunity | null>(null);
  const [workflow, setWorkflow] = useState<TenderWorkflow | null>(null);
  const [workspace, setWorkspace] = useState<TenderWorkspaceResponse | null>(null);
  const [pdfOpen, setPdfOpen] = useState(false);
  const [outreachOpen, setOutreachOpen] = useState(false);
  const [submissionOpen, setSubmissionOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const [outreachMethod, setOutreachMethod] = useState<string>("EMAIL");
  const [outreachRecipient, setOutreachRecipient] = useState("");
  const [outreachReference, setOutreachReference] = useState("");
  const [outreachNotes, setOutreachNotes] = useState("");
  const [outreachAt, setOutreachAt] = useState(formatDateTimeLocalValue());
  const [outreachDocs, setOutreachDocs] = useState<VaultDocument[]>([]);
  const [outreachPickerOpen, setOutreachPickerOpen] = useState(false);

  const [submissionMethod, setSubmissionMethod] = useState<string>("PORTAL");
  const [submissionRef, setSubmissionRef] = useState("");
  const [submissionAmount, setSubmissionAmount] = useState("");
  const [submissionNotes, setSubmissionNotes] = useState("");
  const [submissionAt, setSubmissionAt] = useState(formatDateTimeLocalValue());
  const [submissionDocs, setSubmissionDocs] = useState<VaultDocument[]>([]);
  const [submissionPickerOpen, setSubmissionPickerOpen] = useState(false);

  const [workspaceSection, setWorkspaceSection] = useState<string | null>(null);

  const load = async () => {
    if (!activeOrganization || !recordType || !adam) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // Record payload is local-first on the API — paint the page before
      // workflow / opportunity enrichment so REQ/PROC detail opens quickly.
      const data = await saasApi.getKimdisRecord(
        activeOrganization.id,
        recordType,
        adam,
      );
      setItem(data.item);
      setTenderId(data.tender.id);
      setLoading(false);

      const [oppData, workflowData] = await Promise.all([
        saasApi.listOpportunities(activeOrganization.id).catch(() => ({
          opportunities: [] as Opportunity[],
        })),
        saasApi.getTenderWorkflow(activeOrganization.id, data.tender.id),
      ]);
      setOpportunity(
        oppData.opportunities.find(
          (row) =>
            row.tender.referenceNumber === data.item.adam ||
            row.tender.id === data.tender.id,
        ) ?? null,
      );
      setWorkflow(workflowData.workflow);

      if (workflowData.workflow.organizationTender) {
        const ws = await saasApi
          .tenderWorkspace(activeOrganization.id, data.tender.id)
          .catch(() => null);
        setWorkspace(ws);
      } else {
        setWorkspace(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Αποτυχία φόρτωσης πράξης");
      setItem(null);
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [activeOrganization?.id, recordType, adam]);

  const following = Boolean(workflow?.organizationTender?.following);
  const relatedProcs =
    workflow?.relatedActs.filter((a) => a.targetTender.recordType === "PROC") ?? [];
  const relatedAwards =
    workflow?.relatedActs.filter((a) => a.targetTender.recordType === "AWRD") ?? [];
  const nextActionCode = workflow?.nextAction.code;
  const outreach = workflow?.outreach ?? null;
  const hasOutreach = Boolean(outreach?.sentAt);
  const isSubmitted = workflow?.organizationTender?.pipelineStage === "SUBMITTED";

  const handleFollow = async () => {
    if (!activeOrganization || !item) return;
    setBusy(true);
    try {
      await saasApi.followKimdisItem(activeOrganization.id, item);
      toast.success("Προστέθηκε στα Παρακολουθούμενα. Η παρακολούθηση είναι ενεργή.");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Αποτυχία παρακολούθησης");
    } finally {
      setBusy(false);
    }
  };

  const handleOutreach = async () => {
    if (!activeOrganization || !tenderId) return;
    setBusy(true);
    try {
      await saasApi.recordOutreach(activeOrganization.id, tenderId, {
        sentAt: new Date(outreachAt).toISOString(),
        method: outreachMethod,
        recipient: outreachRecipient.trim() || null,
        externalReference: outreachReference.trim() || null,
        notes: outreachNotes.trim() || null,
        documentIds: outreachDocs.map((doc) => doc.id),
      });
      toast.success("Καταγράφηκε. Παρακολουθούμε το ΚΗΜΔΗΣ για επίσημη πρόσκληση.");
      setOutreachOpen(false);
      setOutreachDocs([]);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Αποτυχία καταχώρησης");
    } finally {
      setBusy(false);
    }
  };

  const handlePrepare = async () => {
    if (!activeOrganization || !tenderId) return;
    setBusy(true);
    try {
      await saasApi.startPreparation(activeOrganization.id, tenderId);
      toast.success("Ξεκίνησε η προετοιμασία — ο φάκελος υποβολής δημιουργήθηκε.");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Αποτυχία");
    } finally {
      setBusy(false);
    }
  };

  const handleSubmission = async () => {
    if (!activeOrganization || !tenderId) return;
    setBusy(true);
    try {
      await saasApi.recordSubmission(activeOrganization.id, tenderId, {
        submittedAt: new Date(submissionAt).toISOString(),
        submissionMethod,
        externalReference: submissionRef.trim() || null,
        amountWithoutVat: submissionAmount ? Number(submissionAmount) : null,
        notes: submissionNotes.trim() || null,
        documentIds: submissionDocs.map((doc) => doc.id),
      });
      toast.success("Η υποβολή καταχωρήθηκε. Η παρακολούθηση συνεχίζεται.");
      setSubmissionOpen(false);
      setSubmissionDocs([]);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Αποτυχία καταχώρησης");
    } finally {
      setBusy(false);
    }
  };

  const handleAddWorkspaceDocuments = async (documents: VaultDocument[]) => {
    if (!activeOrganization || !tenderId || !workspaceSection) return;
    try {
      const result = await saasApi.addWorkspaceDocuments(
        activeOrganization.id,
        tenderId,
        {
          documentIds: documents.map((doc) => doc.id),
          section: workspaceSection,
        },
      );
      setWorkspace(result);
      toast.success("Τα έγγραφα συνδέθηκαν στον φάκελο υποβολής.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Αποτυχία σύνδεσης");
    } finally {
      setWorkspaceSection(null);
    }
  };

  const handleRemoveWorkspaceDocument = async (refId: string) => {
    if (!activeOrganization || !tenderId) return;
    try {
      const result = await saasApi.removeWorkspaceDocument(
        activeOrganization.id,
        tenderId,
        refId,
      );
      setWorkspace(result);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Αποτυχία αφαίρεσης");
    }
  };

  if (!activeOrganization) {
    return (
      <EmptyState
        title="Χωρίς οργανισμό"
        description="Δημιουργήστε οργανισμό για προβολή πράξεων ΚΗΜΔΗΣ."
      />
    );
  }

  if (!recordType || !adam) {
    return (
      <EmptyState
        title="Μη έγκυρη διεύθυνση"
        description="Απαιτείται τύπος πράξης (REQ/PROC) και ΑΔΑΜ."
      />
    );
  }

  if (loading) return <PageSkeleton />;
  if (error || !item) {
    return (
      <ErrorState
        description={error ?? "Η πράξη δεν βρέθηκε"}
        onRetry={() => void load()}
      />
    );
  }

  const matchMeta = opportunity?.matchMeta;

  const primaryAction = (() => {
    if (!following) {
      return {
        label: "Παρακολούθηση",
        onClick: () => void handleFollow(),
      };
    }
    if (nextActionCode === "RECORD_OUTREACH") {
      return {
        label: "Καταγραφή Εκδήλωσης Ενδιαφέροντος",
        onClick: () => setOutreachOpen(true),
      };
    }
    if (nextActionCode === "START_PREPARATION") {
      return {
        label: "Έναρξη προετοιμασίας",
        onClick: () => void handlePrepare(),
      };
    }
    if (nextActionCode === "RECORD_SUBMISSION") {
      return {
        label: "Καταγραφή Υποβολής",
        onClick: () => setSubmissionOpen(true),
      };
    }
    return null;
  })();

  return (
    <div className="space-y-6">
      {/* 1 — Tender summary */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <Button variant="ghost" size="sm" className="-ml-2" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
            Πίσω
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={item.recordType === "REQ" ? "secondary" : "default"}>
              {item.recordType}
            </Badge>
            <span className="font-mono text-xs text-muted-foreground">{item.adam}</span>
            {following ? <Badge variant="success">Παρακολουθείται</Badge> : null}
            {workflow?.stageLabel && following ? (
              <Badge variant="outline">{workflow.stageLabel}</Badge>
            ) : null}
          </div>
          <h2 className="text-2xl font-semibold leading-snug tracking-tight">
            {item.title || "—"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {item.contractingAuthority || "—"}
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>Αξία: {formatMoney(item.budgetWithoutVat)}</span>
            <span>Καταχώριση: {formatDate(item.submissionDate || item.signedDate)}</span>
            {item.finalSubmissionDate ? (
              <span>Καταληκτική: {formatDate(item.finalSubmissionDate)}</span>
            ) : null}
            <a
              href={item.publicKimdisUrl}
              target="_blank"
              rel="noreferrer"
              className="underline hover:text-foreground"
            >
              Άνοιγμα στο ΚΗΜΔΗΣ
            </a>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <IconAction label="Προεπισκόπηση PDF" onClick={() => setPdfOpen(true)}>
            <Eye />
          </IconAction>
          {primaryAction ? (
            <Button disabled={busy} onClick={primaryAction.onClick}>
              {primaryAction.label}
            </Button>
          ) : null}
        </div>
      </div>

      {/* New development — same persisted events as Monitoring / Attention */}
      {relatedProcs.length > 0 || relatedAwards.length > 0 ? (
        <Card className="border-primary/40 bg-primary/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Νέα εξέλιξη</CardTitle>
            <CardDescription>
              {relatedProcs.length > 0
                ? "Εντοπίστηκε σχετική επίσημη πρόσκληση."
                : "Δημοσιεύτηκε σχετική απόφαση ανάθεσης."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {[...relatedProcs, ...relatedAwards].map((link) => (
              <Button key={link.id} size="sm" variant="outline" asChild>
                <Link
                  to={`/app/tenders/${link.targetTender.recordType === "PROC" ? "PROC" : "REQ"}/${encodeURIComponent(link.targetTender.referenceNumber)}`}
                >
                  Προβολή {link.targetTender.recordType} {link.targetTender.referenceNumber}
                </Link>
              </Button>
            ))}
            {relatedProcs.length > 0 && !isSubmitted && nextActionCode !== "RECORD_SUBMISSION" ? (
              <Button size="sm" disabled={busy} onClick={() => void handlePrepare()}>
                Έναρξη προετοιμασίας
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {/* 2 — Current organization state */}
          {following ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Κατάσταση εταιρείας</CardTitle>
                <CardDescription>
                  Τι έχουμε κάνει εμείς και τι περιμένουμε από το ΚΗΜΔΗΣ.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <span className="text-muted-foreground">Στάδιο: </span>
                    {workflow?.stageLabel}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Παρακολούθηση: </span>
                    {workflow?.organizationTender?.monitoringActive ? "Ενεργή" : "Ανενεργή"}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Εκδήλωση ενδιαφέροντος: </span>
                    {hasOutreach ? formatDate(outreach?.sentAt) : "Δεν έχει καταγραφεί"}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Υποβολή: </span>
                    {workflow?.latestSubmission
                      ? `${formatDateTime(workflow.latestSubmission.submittedAt)} · ${submissionMethodLabel(workflow.latestSubmission.submissionMethod)}${workflow.latestSubmission.externalReference ? ` · ${workflow.latestSubmission.externalReference}` : ""}`
                      : "Δεν έχει καταγραφεί"}
                  </div>
                </div>
                {workflow?.expectedDevelopment ? (
                  <div className="rounded-md border border-border px-3 py-2">
                    <div className="font-medium">
                      Αναμενόμενη επίσημη εξέλιξη: {workflow.expectedDevelopment.label}
                    </div>
                    <p className="text-muted-foreground">
                      {workflow.expectedDevelopment.description}
                    </p>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          {/* Recorded outreach detail incl. vault documents */}
          {hasOutreach ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Εκδήλωση Ενδιαφέροντος</CardTitle>
                <CardDescription>
                  {formatDateTime(outreach?.sentAt)} ·{" "}
                  {outreachMethodLabel(outreach?.method)}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Παραλήπτης: </span>
                  {outreach?.recipient || "—"}
                </div>
                {outreach?.externalReference ? (
                  <div>
                    <span className="text-muted-foreground">Αναφορά: </span>
                    {outreach.externalReference}
                  </div>
                ) : null}
                <div className="space-y-1">
                  <span className="text-muted-foreground">Έγγραφα:</span>
                  {outreach?.documents.length ? (
                    <ul className="space-y-1">
                      {outreach.documents.map((doc) => (
                        <li key={doc.documentId} className="flex items-center gap-2">
                          <Badge variant="outline">v{doc.version ?? 1}</Badge>
                          {doc.name}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-muted-foreground">Δεν συνδέθηκαν έγγραφα.</p>
                  )}
                </div>
                {outreach?.notes ? (
                  <div>
                    <span className="text-muted-foreground">Σημειώσεις: </span>
                    {outreach.notes}
                  </div>
                ) : null}
                <Button size="sm" variant="outline" onClick={() => setOutreachOpen(true)}>
                  Ενημέρωση καταγραφής
                </Button>
              </CardContent>
            </Card>
          ) : null}

          {/* 4 — Real timeline: official KIMDIS acts vs company actions */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Ιστορικό νήματος</CardTitle>
              <CardDescription>
                Μόνο γεγονότα που έχουν συμβεί — επίσημες πράξεις ΚΗΜΔΗΣ και ενέργειες της
                εταιρείας.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {(workflow?.timeline ?? []).map((entry) => {
                const official = entry.kind === "official";
                return (
                  <div
                    key={entry.key}
                    className={`flex gap-3 rounded-md border px-3 py-3 ${
                      official ? "border-border bg-muted/40" : "border-dashed border-border"
                    }`}
                  >
                    <div className="mt-0.5 shrink-0 text-muted-foreground">
                      {official ? (
                        <Landmark className="h-4 w-4" />
                      ) : (
                        <Building2 className="h-4 w-4" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">{entry.title}</span>
                        <Badge variant={official ? "secondary" : "outline"}>
                          {official ? "ΚΗΜΔΗΣ" : "Εταιρεία"}
                        </Badge>
                        {entry.isNew ? <Badge variant="warning">Νέο</Badge> : null}
                      </div>
                      {entry.adam ? (
                        <div className="font-mono text-xs text-muted-foreground">
                          {entry.adam}
                        </div>
                      ) : null}
                      {entry.subtitle ? (
                        <div className="text-sm text-muted-foreground">{entry.subtitle}</div>
                      ) : null}
                      <div className="text-xs text-muted-foreground">
                        {formatDateTime(entry.at)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* 5 — Tender workspace reusing Company Vault */}
          {workspace?.workspace ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Φάκελος υποβολής</CardTitle>
                <CardDescription>
                  {workspace.documentCount} συνδεδεμένα έγγραφα εταιρείας — χωρίς
                  επαναφόρτωση.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {workspace.sections.map((section) => (
                  <div key={section.id} className="rounded-md border border-border px-3 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm font-medium">
                        {section.id} — {section.label}
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setWorkspaceSection(section.id)}
                      >
                        Προσθήκη από Έγγραφα Εταιρείας
                      </Button>
                    </div>
                    {section.documents.length ? (
                      <ul className="mt-2 space-y-1">
                        {section.documents.map((doc) => (
                          <li
                            key={doc.id}
                            className="flex items-center justify-between gap-2 text-sm"
                          >
                            <span className="flex min-w-0 items-center gap-2">
                              <Badge variant="outline">v{doc.version ?? 1}</Badge>
                              <span className="truncate">{doc.name}</span>
                            </span>
                            <IconAction
                              label={`Αφαίρεση ${doc.name}`}
                              onClick={() => void handleRemoveWorkspaceDocument(doc.id)}
                            >
                              <Trash2 />
                            </IconAction>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Κανένα έγγραφο σε αυτή την ενότητα.
                      </p>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </div>

        {/* 3 — Next recommended action */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Επόμενη ενέργεια</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="font-medium">{workflow?.nextAction.label}</div>
              <p className="text-muted-foreground">{workflow?.nextAction.description}</p>
              {primaryAction ? (
                <Button size="sm" disabled={busy} onClick={primaryAction.onClick}>
                  {primaryAction.label}
                </Button>
              ) : null}
              {following && !hasOutreach && item.recordType === "REQ" ? (
                <p className="text-xs text-muted-foreground">
                  Η καταγραφή δεν στέλνει email στον φορέα — καταγράφει ό,τι κάνατε εσείς.
                </p>
              ) : null}
              {following && isSubmitted ? (
                <Button size="sm" variant="outline" onClick={() => setSubmissionOpen(true)}>
                  Καταγραφή νέας υποβολής
                </Button>
              ) : null}
            </CardContent>
          </Card>

          {matchMeta?.matchedProfiles?.length ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Γιατί το βλέπετε</CardTitle>
                <CardDescription>Αποθηκευμένες αναζητήσεις που ταίριαξαν.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {matchMeta.matchedProfiles.map((profile) => (
                  <div key={profile.id}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{profile.name}</span>
                      <Badge variant="secondary">{profile.score}%</Badge>
                    </div>
                    <ul className="mt-1 space-y-1 text-muted-foreground">
                      {profile.reasons.map((reason) => (
                        <li key={reason}>✓ {reason}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}

          {/* 6 — Official source information */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Επίσημη πηγή</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div>Τύπος: {item.recordType}</div>
              <div className="font-mono text-xs">{item.adam}</div>
              <div>Αξία: {formatMoney(item.budgetWithoutVat)}</div>
              <div>Καταχώριση: {formatDate(item.submissionDate || item.signedDate)}</div>
              {item.finalSubmissionDate ? (
                <div>Καταληκτική: {formatDate(item.finalSubmissionDate)}</div>
              ) : null}
              <div className="flex flex-wrap gap-2 pt-1">
                <Button variant="outline" size="sm" onClick={() => setPdfOpen(true)}>
                  Προεπισκόπηση PDF
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <a href={item.publicKimdisUrl} target="_blank" rel="noreferrer">
                    ΚΗΜΔΗΣ
                  </a>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <PdfPreviewModal
        open={pdfOpen}
        onOpenChange={setPdfOpen}
        organizationId={activeOrganization.id}
        recordType={item.recordType}
        adam={item.adam}
        title={item.title}
        officialUrl={item.publicKimdisUrl}
      />

      <Dialog open={outreachOpen} onOpenChange={setOutreachOpen}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Καταγραφή Εκδήλωσης Ενδιαφέροντος</DialogTitle>
            <DialogDescription>
              Καταγράφει ενέργεια που κάνατε εσείς. Η εφαρμογή δεν στέλνει τίποτα στον φορέα
              και αυτό δεν αποτελεί υποβολή.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="outreach-at">Ημερομηνία / ώρα</Label>
              <Input
                id="outreach-at"
                type="datetime-local"
                value={outreachAt}
                onChange={(e) => setOutreachAt(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="outreach-method">Μέθοδος</Label>
              <Select
                id="outreach-method"
                value={outreachMethod}
                onChange={(e) => setOutreachMethod(e.target.value)}
              >
                {OUTREACH_METHODS.map((method) => (
                  <option key={method} value={method}>
                    {outreachMethodLabel(method)}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="outreach-recipient">Παραλήπτης / επαφή</Label>
              <Input
                id="outreach-recipient"
                value={outreachRecipient}
                onChange={(e) => setOutreachRecipient(e.target.value)}
                placeholder="Τμήμα προμηθειών, email ή όνομα"
              />
            </div>
            <div className="space-y-2">
              <Label>Σχετικά έγγραφα εταιρείας</Label>
              {outreachDocs.length ? (
                <ul className="space-y-1 text-sm">
                  {outreachDocs.map((doc) => (
                    <li key={doc.id} className="flex items-center justify-between gap-2">
                      <span className="truncate">{doc.name}</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setOutreachDocs((prev) => prev.filter((d) => d.id !== doc.id))
                        }
                      >
                        Αφαίρεση
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Π.χ. Εκδήλωση Ενδιαφέροντος, Company Profile, Συνοδευτική επιστολή.
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setOutreachPickerOpen(true)}
                >
                  Επιλογή από Έγγραφα Εταιρείας
                </Button>
                <Button size="sm" variant="ghost" asChild>
                  <Link to="/app/documents">Μεταφόρτωση νέου αρχείου</Link>
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="outreach-reference">Αναφορά / αριθμός μηνύματος</Label>
              <Input
                id="outreach-reference"
                value={outreachReference}
                onChange={(e) => setOutreachReference(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="outreach-notes">Σημειώσεις</Label>
              <Textarea
                id="outreach-notes"
                value={outreachNotes}
                onChange={(e) => setOutreachNotes(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOutreachOpen(false)}>
                Ακύρωση
              </Button>
              <Button disabled={busy} onClick={() => void handleOutreach()}>
                Καταγραφή
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={submissionOpen} onOpenChange={setSubmissionOpen}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Καταγραφή Υποβολής</DialogTitle>
            <DialogDescription>
              Τυπική υποβολή προσφοράς. Η παρακολούθηση αποτελέσματος παραμένει ενεργή.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="submission-at">Ημερομηνία / ώρα</Label>
              <Input
                id="submission-at"
                type="datetime-local"
                value={submissionAt}
                onChange={(e) => setSubmissionAt(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="submission-method">Μέθοδος</Label>
              <Select
                id="submission-method"
                value={submissionMethod}
                onChange={(e) => setSubmissionMethod(e.target.value)}
              >
                {SUBMISSION_METHODS.map((method) => (
                  <option key={method} value={method}>
                    {submissionMethodLabel(method)}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="submission-ref">Αναφορά / πρωτόκολλο</Label>
              <Input
                id="submission-ref"
                value={submissionRef}
                onChange={(e) => setSubmissionRef(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="submission-amount">Ποσό χωρίς ΦΠΑ</Label>
              <Input
                id="submission-amount"
                type="number"
                value={submissionAmount}
                onChange={(e) => setSubmissionAmount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Τελικά έγγραφα</Label>
              {submissionDocs.length ? (
                <ul className="space-y-1 text-sm">
                  {submissionDocs.map((doc) => (
                    <li key={doc.id} className="flex items-center justify-between gap-2">
                      <span className="truncate">{doc.name}</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setSubmissionDocs((prev) => prev.filter((d) => d.id !== doc.id))
                        }
                      >
                        Αφαίρεση
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Καταγράφεται η ακριβής έκδοση κάθε εγγράφου που υποβλήθηκε.
                </p>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={() => setSubmissionPickerOpen(true)}
              >
                Επιλογή από Έγγραφα Εταιρείας
              </Button>
            </div>
            <div className="space-y-2">
              <Label htmlFor="submission-notes">Σημειώσεις</Label>
              <Textarea
                id="submission-notes"
                value={submissionNotes}
                onChange={(e) => setSubmissionNotes(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setSubmissionOpen(false)}>
                Ακύρωση
              </Button>
              <Button disabled={busy} onClick={() => void handleSubmission()}>
                Καταχώρηση υποβολής
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <CompanyDocumentPicker
        open={outreachPickerOpen}
        onOpenChange={setOutreachPickerOpen}
        multiple
        onSelectMany={(documents) =>
          setOutreachDocs((prev) => {
            const map = new Map(prev.map((doc) => [doc.id, doc]));
            documents.forEach((doc) => map.set(doc.id, doc));
            return [...map.values()];
          })
        }
      />

      <CompanyDocumentPicker
        open={submissionPickerOpen}
        onOpenChange={setSubmissionPickerOpen}
        multiple
        onSelectMany={(documents) =>
          setSubmissionDocs((prev) => {
            const map = new Map(prev.map((doc) => [doc.id, doc]));
            documents.forEach((doc) => map.set(doc.id, doc));
            return [...map.values()];
          })
        }
      />

      <CompanyDocumentPicker
        open={Boolean(workspaceSection)}
        onOpenChange={(open) => !open && setWorkspaceSection(null)}
        multiple
        onSelectMany={(documents) => void handleAddWorkspaceDocuments(documents)}
      />
    </div>
  );
};
