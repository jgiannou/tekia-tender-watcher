import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Building2, Eye, Landmark, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useSessionContext } from "@/auth/SessionProvider";
import { CompanyDocumentPicker } from "@/components/CompanyDocumentPicker";
import { IconAction } from "@/components/IconAction";
import { PdfPreviewModal } from "@/components/PdfPreviewModal";
import { EmptyState, ErrorState, PageSkeleton } from "@/components/states";
import { ScoreBadge } from "@/components/ScoreBadge";
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
  type OutreachDraft,
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

/** REQ → αίτημα, PROC → διαγωνισμός (avoid generic «νήμα»). */
const tenderKindLabel = (type: string | null | undefined) => {
  if (type === "PROC") {
    return {
      nominative: "διαγωνισμός",
      genitive: "διαγωνισμού",
      accusative: "τον διαγωνισμό",
    };
  }
  if (type === "AWRD") {
    return {
      nominative: "ανάθεση",
      genitive: "ανάθεσης",
      accusative: "την ανάθεση",
    };
  }
  return {
    nominative: "αίτημα",
    genitive: "αιτήματος",
    accusative: "το αίτημα",
  };
};

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
  const [outreachSubject, setOutreachSubject] = useState("");
  const [outreachBody, setOutreachBody] = useState("");
  const [outreachContactName, setOutreachContactName] = useState("");
  const [outreachContactDept, setOutreachContactDept] = useState("");
  const [outreachContactEmail, setOutreachContactEmail] = useState("");
  const [outreachContactPhone, setOutreachContactPhone] = useState("");
  const [outreachUnresolved, setOutreachUnresolved] = useState<string[]>([]);
  const [outreachSuggestedSource, setOutreachSuggestedSource] = useState<string>("none");
  const [draftLoading, setDraftLoading] = useState(false);

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

      // Enrichment must not wipe a successful record load (transient workflow 500s).
      try {
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
      } catch {
        setWorkflow(null);
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
  const kind = tenderKindLabel(item?.recordType ?? recordType);

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

  const handleUnfollow = async () => {
    if (!activeOrganization || !tenderId) return;
    const confirmed = window.confirm(
      `Να διακοπεί η παρακολούθηση αυτού του ${kind.genitive}; Δεν θα ειδοποιείστε για νέες σχετικές πράξεις.`,
    );
    if (!confirmed) return;
    setBusy(true);
    try {
      await saasApi.unfollowTender(activeOrganization.id, tenderId);
      toast.success("Διακόπηκε η παρακολούθηση.");
      await load();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Αποτυχία διακοπής παρακολούθησης",
      );
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmResult = async (result: "WON" | "LOST") => {
    if (!activeOrganization || !workflow?.latestSubmission?.id) return;
    const confirmed = window.confirm(
      result === "WON"
        ? "Να επιβεβαιωθεί επιτυχία (WON); Η παρακολούθηση θα σταματήσει."
        : "Να επιβεβαιωθεί ανεπιτυχές αποτέλεσμα (LOST); Η παρακολούθηση θα σταματήσει.",
    );
    if (!confirmed) return;
    setBusy(true);
    try {
      await saasApi.confirmSubmissionResult(
        activeOrganization.id,
        workflow.latestSubmission.id,
        { result },
      );
      toast.success(
        result === "WON"
          ? "Καταχωρήθηκε επιτυχία. Η παρακολούθηση ολοκληρώθηκε."
          : "Καταχωρήθηκε ανεπιτυχές αποτέλεσμα. Η παρακολούθηση ολοκληρώθηκε.",
      );
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Αποτυχία καταχώρησης αποτελέσματος");
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmRelatedAct = async (linkId: string) => {
    if (!activeOrganization) return;
    setBusy(true);
    try {
      await saasApi.confirmRelatedAct(activeOrganization.id, linkId);
      toast.success("Επιβεβαιώθηκε η σχετική πράξη.");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Αποτυχία επιβεβαίωσης");
    } finally {
      setBusy(false);
    }
  };

  const handleDismissRelatedAct = async (linkId: string) => {
    if (!activeOrganization) return;
    const confirmed = window.confirm(
      `Να σημειωθεί ότι αυτή η πράξη δεν σχετίζεται με ${kind.accusative};`,
    );
    if (!confirmed) return;
    setBusy(true);
    try {
      await saasApi.dismissRelatedAct(activeOrganization.id, linkId);
      toast.success("Απορρίφθηκε η πιθανή σχετική πράξη.");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Αποτυχία απόρριψης");
    } finally {
      setBusy(false);
    }
  };

  const isDeadlineExpired = (() => {
    if (!item?.finalSubmissionDate) return false;
    const date = new Date(item.finalSubmissionDate);
    if (Number.isNaN(date.getTime())) return false;
    return date.getTime() < Date.now();
  })();

  const handleDismiss = async () => {
    if (!activeOrganization || !tenderId) return;
    const confirmed = window.confirm(
      isDeadlineExpired
        ? "Να σημανθεί ως ληγμένο και να μην εμφανίζεται ξανά στις ευκαιρίες;"
        : "Να αποκρυφτεί αυτή η πράξη ώστε να μην εμφανίζεται ξανά στις ευκαιρίες;",
    );
    if (!confirmed) return;
    setBusy(true);
    try {
      await saasApi.dismissTender(
        activeOrganization.id,
        tenderId,
        isDeadlineExpired ? "EXPIRED" : "NOT_INTERESTED",
      );
      toast.success(
        isDeadlineExpired
          ? "Σημάνθηκε ως ληγμένο και αποκρύφτηκε."
          : "Η πράξη αποκρύφτηκε από τις ευκαιρίες.",
      );
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Αποτυχία απόκρυψης");
    } finally {
      setBusy(false);
    }
  };

  const applyDraftToForm = (draft: OutreachDraft) => {
    setOutreachSubject(draft.subject);
    setOutreachBody(draft.body);
    setOutreachUnresolved(draft.unresolvedKeys);
    setOutreachContactName(draft.contacts.name ?? "");
    setOutreachContactDept(draft.contacts.department ?? "");
    setOutreachContactEmail(draft.contacts.email ?? "");
    setOutreachContactPhone(draft.contacts.phone ?? "");
    setOutreachSuggestedSource(draft.suggestedContacts.source);
    if (draft.contacts.email) {
      setOutreachRecipient(draft.contacts.email);
    }
  };

  const handleOpenOutreach = async () => {
    setOutreachOpen(true);
    if (!activeOrganization || !tenderId) return;
    setDraftLoading(true);
    try {
      const { draft } = await saasApi.getOutreachDraft(
        activeOrganization.id,
        tenderId,
      );
      applyDraftToForm(draft);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Αποτυχία φόρτωσης προτύπου",
      );
    } finally {
      setDraftLoading(false);
    }
  };

  const handleRegenerateDraft = async () => {
    if (!activeOrganization || !tenderId) return;
    setBusy(true);
    try {
      const { draft } = await saasApi.saveOutreachDraft(
        activeOrganization.id,
        tenderId,
        {
          regenerate: true,
          contacts: {
            name: outreachContactName.trim() || null,
            department: outreachContactDept.trim() || null,
            email: outreachContactEmail.trim() || null,
            phone: outreachContactPhone.trim() || null,
          },
        },
      );
      applyDraftToForm(draft);
      toast.success("Το email ξαναδημιουργήθηκε από το πρότυπο.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Αποτυχία προτύπου");
    } finally {
      setBusy(false);
    }
  };

  const handleSaveContacts = async () => {
    if (!activeOrganization || !tenderId) return;
    setBusy(true);
    try {
      const { draft } = await saasApi.saveOutreachDraft(
        activeOrganization.id,
        tenderId,
        {
          subject: outreachSubject,
          body: outreachBody,
          manualEdited: true,
          contacts: {
            name: outreachContactName.trim() || null,
            department: outreachContactDept.trim() || null,
            email: outreachContactEmail.trim() || null,
            phone: outreachContactPhone.trim() || null,
          },
        },
      );
      applyDraftToForm(draft);
      toast.success("Αποθηκεύτηκαν επαφές και πρόχειρο.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Αποτυχία αποθήκευσης");
    } finally {
      setBusy(false);
    }
  };

  const handleGenerateCompanyProfile = async () => {
    if (!activeOrganization) return;
    setBusy(true);
    try {
      const result = await saasApi.generateCompanyProfile(activeOrganization.id);
      setOutreachDocs((prev) => {
        if (prev.some((d) => d.id === result.document.id)) return prev;
        return [...prev, result.document];
      });
      toast.success(
        result.created
          ? "Δημιουργήθηκε εταιρικό προφίλ και προστέθηκε στα συνημμένα."
          : "Ανανεώθηκε το εταιρικό προφίλ και προστέθηκε στα συνημμένα.",
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Αποτυχία δημιουργίας προφίλ",
      );
    } finally {
      setBusy(false);
    }
  };

  const handleCopyOutreach = async () => {
    const text = `Θέμα: ${outreachSubject}\n\n${outreachBody}`;
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Αντιγράφηκε θέμα + κείμενο.");
    } catch {
      toast.error("Αποτυχία αντιγραφής");
    }
  };

  const mailtoHref = (() => {
    const to = outreachContactEmail.trim() || outreachRecipient.trim();
    if (!to) return null;
    const params = new URLSearchParams();
    if (outreachSubject.trim()) params.set("subject", outreachSubject.trim());
    if (outreachBody.trim()) params.set("body", outreachBody.trim());
    return `mailto:${encodeURIComponent(to)}?${params.toString()}`;
  })();

  const handleOutreach = async () => {
    if (!activeOrganization || !tenderId) return;
    setBusy(true);
    try {
      await saasApi.saveOutreachDraft(activeOrganization.id, tenderId, {
        subject: outreachSubject,
        body: outreachBody,
        manualEdited: true,
        contacts: {
          name: outreachContactName.trim() || null,
          department: outreachContactDept.trim() || null,
          email: outreachContactEmail.trim() || null,
          phone: outreachContactPhone.trim() || null,
        },
      });
      await saasApi.recordOutreach(activeOrganization.id, tenderId, {
        sentAt: new Date(outreachAt).toISOString(),
        method: outreachMethod,
        recipient:
          outreachRecipient.trim() ||
          outreachContactEmail.trim() ||
          null,
        subject: outreachSubject.trim() || null,
        body: outreachBody.trim() || null,
        externalReference: outreachReference.trim() || null,
        notes: outreachNotes.trim() || null,
        documentIds: outreachDocs.map((doc) => doc.id),
      });
      toast.success(
        "Καταγράφηκε. Προστέθηκε αυτόματα στα Παρακολουθούμενα — παρακολουθούμε για επίσημη πρόσκληση.",
      );
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

  const canPrepareOutreach =
    item.recordType === "REQ" && !hasOutreach;

  const primaryAction = (() => {
    // Outreach is available before Follow — recording as sent auto-follows.
    if (canPrepareOutreach && (!following || nextActionCode === "RECORD_OUTREACH")) {
      return {
        label: "Προετοιμασία Εκδήλωσης Ενδιαφέροντος",
        onClick: () => void handleOpenOutreach(),
      };
    }
    if (!following) {
      return {
        label: "Παρακολούθηση",
        onClick: () => void handleFollow(),
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
          <h2 className="text-xl font-semibold leading-snug tracking-tight sm:text-2xl">
            {item.title || "—"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {item.contractingAuthority || "—"}
          </p>
          <p
            className="text-3xl font-bold tracking-tight tabular-nums text-foreground sm:text-4xl"
            aria-label={`Αξία χωρίς ΦΠΑ ${formatMoney(item.budgetWithoutVat)}`}
          >
            {formatMoney(item.budgetWithoutVat)}
            <span className="ml-2 align-middle text-sm font-medium text-muted-foreground">
              χωρίς ΦΠΑ
            </span>
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
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
          {canPrepareOutreach &&
          following &&
          nextActionCode !== "RECORD_OUTREACH" ? (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void handleOpenOutreach()}
            >
              Προετοιμασία Εκδήλωσης Ενδιαφέροντος
            </Button>
          ) : null}
          {!following &&
          primaryAction?.label !== "Παρακολούθηση" ? (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void handleFollow()}
            >
              Παρακολούθηση
            </Button>
          ) : null}
          {following ? (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void handleUnfollow()}
            >
              Διακοπή παρακολούθησης
            </Button>
          ) : null}
          {tenderId ? (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void handleDismiss()}
            >
              {isDeadlineExpired ? "Σήμανση ως ληγμένο" : "Απόκρυψη από ευκαιρίες"}
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
              {relatedProcs.some(
                (link) =>
                  link.confidence === "LIKELY" || link.confidence === "POSSIBLE",
              )
                ? "Πιθανή σχετική δημοσίευση — επιβεβαιώστε ή απορρίψτε."
                : relatedProcs.length > 0
                  ? "Εντοπίστηκε σχετική επίσημη πρόσκληση."
                  : "Δημοσιεύτηκε σχετική απόφαση ανάθεσης."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {[...relatedProcs, ...relatedAwards].map((link) => {
              const needsReview =
                link.confidence === "LIKELY" || link.confidence === "POSSIBLE";
              const type =
                link.targetTender.recordType === "PROC" ? "PROC" : "REQ";
              return (
                <div
                  key={link.id}
                  className="flex flex-col gap-2 rounded-md border border-border/70 bg-background/70 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={needsReview ? "outline" : "success"}>
                        {needsReview
                          ? "Πιθανή σχέση"
                          : link.confidence === "CONFIRMED"
                            ? "Επιβεβαιωμένη"
                            : link.confidence}
                      </Badge>
                      <span className="font-mono text-xs text-muted-foreground">
                        {link.targetTender.recordType} {link.targetTender.referenceNumber}
                      </span>
                    </div>
                    <div className="text-sm font-medium">
                      {link.targetTender.title || "—"}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {needsReview ? (
                      <>
                        <Button
                          size="sm"
                          disabled={busy}
                          onClick={() => void handleConfirmRelatedAct(link.id)}
                        >
                          Επιβεβαίωση
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => void handleDismissRelatedAct(link.id)}
                        >
                          Δεν σχετίζεται
                        </Button>
                      </>
                    ) : null}
                    <Button size="sm" variant="outline" asChild>
                      <Link
                        to={`/app/tenders/${type}/${encodeURIComponent(link.targetTender.referenceNumber)}`}
                      >
                        Προβολή
                      </Link>
                    </Button>
                  </div>
                </div>
              );
            })}
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
          {/* Next action — always in main column so the page is never empty */}
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
              {canPrepareOutreach ? (
                <p className="text-xs text-muted-foreground">
                  Η καταγραφή δεν στέλνει email στον φορέα — καταγράφει ό,τι κάνατε εσείς
                  και ξεκινά αυτόματα παρακολούθηση.
                </p>
              ) : null}
              {following && isSubmitted ? (
                <Button size="sm" variant="outline" onClick={() => setSubmissionOpen(true)}>
                  Καταγραφή νέας υποβολής
                </Button>
              ) : null}
            </CardContent>
          </Card>

          {/* History under next action */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Ιστορικό {kind.genitive}</CardTitle>
              <CardDescription>
                Μόνο γεγονότα που έχουν συμβεί — επίσημες πράξεις ΚΗΜΔΗΣ και ενέργειες της
                εταιρείας.
              </CardDescription>
            </CardHeader>
            <CardContent className="max-h-72 space-y-3 overflow-y-auto pr-1">
              {(() => {
                const timeline = (workflow?.timeline ?? []).filter((entry) =>
                  following ? true : entry.kind === "official",
                );
                if (timeline.length === 0) {
                  return (
                    <p className="text-sm text-muted-foreground">
                      Δεν υπάρχουν ακόμη γεγονότα για αυτό το {kind.nominative}.
                    </p>
                  );
                }
                return timeline.map((entry) => {
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
              });
              })()}
            </CardContent>
          </Card>

          {/* Company state — always visible */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Κατάσταση εταιρείας</CardTitle>
              <CardDescription>
                Τι έχουμε κάνει εμείς και τι περιμένουμε από το ΚΗΜΔΗΣ.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {!following ? (
                <p className="text-muted-foreground">
                  Δεν παρακολουθείται ακόμη. Ξεκινήστε με εκδήλωση ενδιαφέροντος ή
                  πατήστε Παρακολούθηση.
                </p>
              ) : (
                <>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div>
                      <span className="text-muted-foreground">Στάδιο: </span>
                      {workflow?.stageLabel}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Παρακολούθηση: </span>
                      {workflow?.organizationTender?.monitoringActive
                        ? "Ενεργή"
                        : "Ανενεργή"}
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
                  {workflow?.latestSubmission ? (
                    <div className="flex flex-wrap items-center gap-2 rounded-md border border-border px-3 py-2">
                      <span className="text-sm text-muted-foreground">Αποτέλεσμα:</span>
                      {workflow.latestSubmission.result === "WON" ? (
                        <Badge variant="success">Επιτυχία</Badge>
                      ) : workflow.latestSubmission.result === "LOST" ? (
                        <Badge variant="destructive">Ανεπιτυχές</Badge>
                      ) : (
                        <>
                          <Badge variant="outline">Εκκρεμεί</Badge>
                          <Button
                            size="sm"
                            disabled={busy}
                            onClick={() => void handleConfirmResult("WON")}
                          >
                            Επιτυχία
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => void handleConfirmResult("LOST")}
                          >
                            Ανεπιτυχές
                          </Button>
                        </>
                      )}
                    </div>
                  ) : null}
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
                </>
              )}
            </CardContent>
          </Card>

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

          {/* Tender workspace reusing Company Vault */}
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

        {/* Right rail — context only */}
        <div className="space-y-4">
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
                      <ScoreBadge score={profile.score} />
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

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Επίσημη πηγή</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div>Τύπος: {item.recordType}</div>
              <div className="font-mono text-xs">{item.adam}</div>
              <div className="text-lg font-semibold tabular-nums">
                Αξία: {formatMoney(item.budgetWithoutVat)}
                <span className="ml-1 text-xs font-normal text-muted-foreground">
                  χωρίς ΦΠΑ
                </span>
              </div>
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
        <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Προετοιμασία Εκδήλωσης Ενδιαφέροντος</DialogTitle>
            <DialogDescription>
              Συμπληρώστε επαφή φορέα, ετοιμάστε το email από πρότυπο, επισυνάψτε εταιρικό
              προφίλ — και καταγράψτε όταν το στείλετε εσείς. Η εφαρμογή δεν στέλνει τίποτα
              αυτόματα.
            </DialogDescription>
          </DialogHeader>
          {draftLoading ? (
            <p className="text-sm text-muted-foreground">Φόρτωση προτύπου…</p>
          ) : (
            <div className="space-y-4">
              <div className="rounded-md border border-border bg-muted/30 p-3 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">Επαφή φορέα (από αίτημα)</p>
                  {outreachSuggestedSource === "extracted" ? (
                    <Badge variant="outline">Βρέθηκε στο κείμενο</Badge>
                  ) : outreachSuggestedSource === "stored" ? (
                    <Badge variant="outline">Αποθηκευμένη</Badge>
                  ) : (
                    <Badge variant="outline">Συμπληρώστε χειροκίνητα</Badge>
                  )}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="oc-name">Όνομα</Label>
                    <Input
                      id="oc-name"
                      value={outreachContactName}
                      onChange={(e) => setOutreachContactName(e.target.value)}
                      placeholder="π.χ. Υπεύθυνος προμηθειών"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="oc-dept">Τμήμα</Label>
                    <Input
                      id="oc-dept"
                      value={outreachContactDept}
                      onChange={(e) => setOutreachContactDept(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="oc-email">Email</Label>
                    <Input
                      id="oc-email"
                      type="email"
                      value={outreachContactEmail}
                      onChange={(e) => {
                        setOutreachContactEmail(e.target.value);
                        setOutreachRecipient(e.target.value);
                      }}
                      placeholder="name@orga.gr"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="oc-phone">Τηλέφωνο</Label>
                    <Input
                      id="oc-phone"
                      value={outreachContactPhone}
                      onChange={(e) => setOutreachContactPhone(e.target.value)}
                    />
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void handleSaveContacts()}
                >
                  Αποθήκευση επαφών
                </Button>
              </div>

              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label htmlFor="outreach-subject">Θέμα email (από πρότυπο)</Label>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => void handleRegenerateDraft()}
                  >
                    Επαναδημιουργία από πρότυπο
                  </Button>
                </div>
                <Input
                  id="outreach-subject"
                  value={outreachSubject}
                  onChange={(e) => setOutreachSubject(e.target.value)}
                />
                <Label htmlFor="outreach-body">Κείμενο</Label>
                <Textarea
                  id="outreach-body"
                  className="min-h-[220px] font-sans text-sm"
                  value={outreachBody}
                  onChange={(e) => setOutreachBody(e.target.value)}
                />
                {outreachUnresolved.length ? (
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    Συμπληρώστε στα στοιχεία εταιρείας:{" "}
                    {outreachUnresolved.map((k) => `{{${k}}}`).join(", ")}
                  </p>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void handleCopyOutreach()}
                  >
                    Αντιγραφή
                  </Button>
                  {mailtoHref ? (
                    <Button size="sm" variant="outline" asChild>
                      <a href={mailtoHref}>Άνοιγμα στο email σας</a>
                    </Button>
                  ) : null}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="outreach-at">Ημερομηνία / ώρα αποστολής</Label>
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
              </div>

              <div className="space-y-2">
                <Label>Συνημμένα από Έγγραφα Εταιρείας</Label>
                {outreachDocs.length ? (
                  <ul className="space-y-1 text-sm">
                    {outreachDocs.map((doc) => (
                      <li
                        key={doc.id}
                        className="flex items-center justify-between gap-2"
                      >
                        <span className="truncate">{doc.name}</span>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            setOutreachDocs((prev) =>
                              prev.filter((d) => d.id !== doc.id),
                            )
                          }
                        >
                          Αφαίρεση
                        </Button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Προτείνεται εταιρικό προφίλ + συνοδευτικά.
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => void handleGenerateCompanyProfile()}
                  >
                    Δημιουργία εταιρικού προφίλ
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setOutreachPickerOpen(true)}
                  >
                    Επιλογή από Έγγραφα
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
                  Καταγραφή ως απεσταλμένο
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={submissionOpen} onOpenChange={setSubmissionOpen}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Καταγραφή Υποβολής</DialogTitle>
            <DialogDescription>
              Καταγράφει ότι υποβάλατε προσφορά εσείς (π.χ. στο ΕΣΗΔΗΣ/ΚΗΜΔΗΣ). Η εφαρμογή
              δεν στέλνει ούτε υποβάλλει τίποτα αυτόματα· η παρακολούθηση αποτελέσματος
              παραμένει ενεργή.
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
