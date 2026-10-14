import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useSessionContext } from "@/auth/SessionProvider";
import { CompanyDocumentPicker } from "@/components/CompanyDocumentPicker";
import { CreateTenderDriveFolderDialog } from "@/components/CreateTenderDriveFolderDialog";
import { IconAction } from "@/components/IconAction";
import { PdfPreviewModal } from "@/components/PdfPreviewModal";
import { EmptyState, ErrorState, PageSkeleton } from "@/components/states";
import { OfficialTimeline } from "@/components/tender-detail/OfficialTimeline";
import { OrganizationActivityTimeline } from "@/components/tender-detail/OrganizationActivityTimeline";
import {
  formatDate,
  formatDateTime,
  formatMoney,
  tenderKindLabel,
  waitingStatusLabel,
} from "@/components/tender-detail/format";
import { TenderHeader } from "@/components/tender-detail/TenderHeader";
import { TenderNextActionCard } from "@/components/tender-detail/TenderNextActionCard";
import { TenderPreparationCard } from "@/components/tender-detail/TenderPreparationCard";
import { TenderRelevanceCard } from "@/components/tender-detail/TenderRelevanceCard";
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
import { trackAnalyticsEvent } from "@/lib/analytics";
import {
  saasApi,
  type DiavgeiaLink,
  type GoogleIntegrationsResponse,
  type KimdisSearchItem,
  type Opportunity,
  type OutreachDraft,
  type ParticipationChecklist,
  type PriceMemory,
  type TenderWorkflow,
  type TenderWorkspaceResponse,
  type VaultDocument,
} from "@/lib/api";
import { formatCpvBadge } from "@/lib/cpv-options";
import { outreachMethodLabel, submissionMethodLabel } from "@/lib/labels";
import { formatRegion } from "@/lib/regions";
import { useTenderNav } from "@/lib/tender-nav-context";

const formatDateTimeLocalValue = (date = new Date()) => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const OUTREACH_METHODS = ["EMAIL", "PHONE", "PORTAL", "PHYSICAL", "OTHER"] as const;
const SUBMISSION_METHODS = ["PORTAL", "EMAIL", "PHYSICAL", "OTHER"] as const;

export const TenderDetailPage = () => {
  const { activeOrganization } = useSessionContext();
  const navigate = useNavigate();
  const { setViewingFollowedTender } = useTenderNav();
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
  const [checklist, setChecklist] = useState<ParticipationChecklist | null>(null);
  const [priceMemory, setPriceMemory] = useState<PriceMemory | null>(null);
  const [diavgeia, setDiavgeia] = useState<DiavgeiaLink | null>(null);
  const [googleView, setGoogleView] = useState<GoogleIntegrationsResponse | null>(null);
  const [driveFolderOpen, setDriveFolderOpen] = useState(false);

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
          // Single-tender fetch — never pull the full opportunities inbox here.
          saasApi
            .listOpportunities(activeOrganization.id, {
              tenderId: data.tender.id,
              limit: 1,
            })
            .catch(() => ({
              opportunities: [] as Opportunity[],
            })),
          saasApi.getTenderWorkflow(activeOrganization.id, data.tender.id),
        ]);
        setOpportunity(oppData.opportunities[0] ?? null);
        setWorkflow(workflowData.workflow);

        const firstOpp = oppData.opportunities[0];
        if (firstOpp?.isNew) {
          void saasApi
            .markOpportunitySeen(activeOrganization.id, firstOpp.id)
            .catch(() => null);
        }

        if (workflowData.workflow.organizationTender) {
          const ws = await saasApi
            .tenderWorkspace(activeOrganization.id, data.tender.id)
            .catch(() => null);
          setWorkspace(ws);
        } else {
          setWorkspace(null);
        }

        const followingRow = Boolean(
          workflowData.workflow.organizationTender?.following,
        );
        const [checklistRes, memoryRes, diavgeiaRes] = await Promise.all([
          followingRow
            ? saasApi
                .getParticipationChecklist(activeOrganization.id, data.tender.id)
                .catch(() => null)
            : Promise.resolve(null),
          followingRow
            ? saasApi
                .getPriceMemory(activeOrganization.id, data.tender.id)
                .catch(() => null)
            : Promise.resolve(null),
          saasApi
            .getDiavgeiaLink(activeOrganization.id, data.tender.id)
            .catch(() => null),
        ]);
        setChecklist(checklistRes?.checklist ?? null);
        setPriceMemory(memoryRes?.memory ?? null);
        setDiavgeia(diavgeiaRes?.diavgeia ?? null);
      } catch {
        setWorkflow(null);
        setWorkspace(null);
        setChecklist(null);
        setPriceMemory(null);
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

  // Drive availability decides whether the «Δημιουργία φακέλου στο Drive» action shows.
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
  useEffect(() => {
    setViewingFollowedTender(following);
    return () => setViewingFollowedTender(false);
  }, [following, setViewingFollowedTender]);

  const handleFollow = async () => {
    if (!activeOrganization || !item) return;
    setBusy(true);
    try {
      await saasApi.followKimdisItem(activeOrganization.id, item);
      trackAnalyticsEvent("tender_followed", {
        content_type: item.recordType,
        item_id: item.adam,
        source: "tender",
      });
      toast.success("Προστέθηκε στην Παρακολούθηση. Η παρακολούθηση είναι ενεργή.");
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
        "Καταγράφηκε. Προστέθηκε αυτόματα στην Παρακολούθηση — παρακολουθούμε για επίσημη πρόσκληση.",
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
  const relatedProcCount = relatedProcs.length;
  const relatedAwardCount = relatedAwards.length;
  const monitoringActive = Boolean(
    workflow?.organizationTender?.monitoringActive,
  );
  const waitingLabel = waitingStatusLabel({
    following,
    hasOutreach,
    hasSubmission: Boolean(workflow?.latestSubmission),
    relatedProcCount,
    relatedAwardCount,
    recordType: item.recordType,
    nextActionCode,
  });
  const hasRelatedProc =
    item.recordType === "PROC" || relatedProcCount > 0;
  const canPrepareOutreach = item.recordType === "REQ" && !hasOutreach;
  const relatedNeedsReview = relatedProcs.filter(
    (link) => link.confidence === "LIKELY" || link.confidence === "POSSIBLE",
  );
  const confirmedRelatedProcs = relatedProcs.filter(
    (link) =>
      link.confidence === "CONFIRMED" || link.confidence === "LIKELY",
  );
  const invitationIssued =
    Boolean(opportunity?.invitationIssued) || confirmedRelatedProcs.length > 0;
  const relatedProcAdam =
    opportunity?.relatedProcAdam ??
    confirmedRelatedProcs[0]?.targetTender.referenceNumber ??
    null;

  const waitingForRelatedProc =
    following && item.recordType === "REQ" && relatedProcCount === 0;

  const primaryAction = (() => {
    if (!following) {
      return {
        label: "Έναρξη παρακολούθησης",
        onClick: () => void handleFollow(),
      };
    }
    if (nextActionCode === "RECORD_SUBMISSION") {
      return {
        label: "Καταγραφή Υποβολής",
        onClick: () => setSubmissionOpen(true),
      };
    }
    // Once a related PROC exists, preparation is the operating priority (not Outreach).
    if (
      nextActionCode === "START_PREPARATION" ||
      (hasRelatedProc && !workflow?.latestSubmission)
    ) {
      return {
        label: "Έναρξη προετοιμασίας",
        onClick: () => void handlePrepare(),
      };
    }
    // Outreach only while still waiting for invitation — never as a fake status chip.
    if (canPrepareOutreach) {
      return {
        label: "Καταγραφή Εκδήλωσης Ενδιαφέροντος",
        onClick: () => void handleOpenOutreach(),
      };
    }
    return null;
  })();

  const overflowAction =
    canPrepareOutreach &&
    primaryAction?.label !== "Καταγραφή Εκδήλωσης Ενδιαφέροντος"
      ? {
          label: "Καταγραφή Εκδήλωσης Ενδιαφέροντος",
          onClick: () => void handleOpenOutreach(),
        }
      : null;

  const nextActionLabel = waitingForRelatedProc
    ? "Αναμένεται η δημοσίευση σχετικής πρόσκλησης."
    : (workflow?.nextAction.label ??
      (following
        ? "Παρακολουθούμε εξελίξεις στο ΚΗΜΔΗΣ."
        : "Προσθέστε στην παρακολούθηση για να ενημερώνεστε."));

  const nextActionDescription = waitingForRelatedProc
    ? "Παρακολουθούμε το ΚΗΜΔΗΣ για σχετική επίσημη πρόσκληση."
    : workflow?.nextAction.description;

  const sourceLabel = item.adam.startsWith("TED:")
    ? "TED"
    : item.adam.startsWith("DIAVGEIA:")
      ? "Διαύγεια"
      : "ΚΗΜΔΗΣ";
  const publicUrlLabel = item.adam.startsWith("TED:")
    ? "Άνοιγμα στο TED"
    : item.adam.startsWith("DIAVGEIA:")
      ? "Άνοιγμα στη Διαύγεια"
      : "Άνοιγμα στο ΚΗΜΔΗΣ";
  const secondaryPdf =
    item.adam.startsWith("TED:") || item.adam.startsWith("DIAVGEIA:")
      ? item.officialPdfUrl || item.publicKimdisUrl
        ? {
            label: item.adam.startsWith("TED:")
              ? "Επίσημο έγγραφο TED"
              : "Επίσημο έγγραφο Διαύγειας",
            href: item.officialPdfUrl || item.publicKimdisUrl,
          }
        : null
      : {
          label: "Προβολή PDF",
          onClick: () => setPdfOpen(true),
        };

  const driveCreate =
    googleView?.drive.featureAvailable &&
    googleView.drive.entitled &&
    workflow?.organizationTender
      ? () => setDriveFolderOpen(true)
      : null;
  const showDriveUpgrade =
    Boolean(googleView?.drive.featureAvailable) &&
    !googleView?.drive.entitled &&
    Boolean(workflow?.organizationTender);

  const timeline = workflow?.timeline ?? [];
  const expected = workflow?.expectedDevelopment;

  return (
    <div className="space-y-6">
      <TenderHeader
        recordType={item.recordType}
        title={item.title}
        authority={item.contractingAuthority}
        summaryDescription={item.description}
        adam={item.adam}
        budgetWithoutVat={item.budgetWithoutVat}
        budgetLabel={item.adam.startsWith("TED:") ? "εκτιμώμενη αξία" : "χωρίς ΦΠΑ"}
        submissionDate={item.submissionDate}
        signedDate={item.signedDate}
        finalSubmissionDate={item.finalSubmissionDate}
        contractTypeLabel={item.contractTypeLabel}
        regionLabel={formatRegion(item.nutsCode)}
        sourceLabel={sourceLabel}
        publicUrl={item.publicKimdisUrl}
        publicUrlLabel={publicUrlLabel}
        following={following}
        waitingLabel={waitingLabel}
        hasOutreach={hasOutreach}
        invitationIssued={invitationIssued}
        relatedProcAdam={relatedProcAdam}
        diavgeiaAda={diavgeia?.ada ?? null}
        diavgeiaUrl={diavgeia?.url ?? null}
        busy={busy}
        primaryAction={primaryAction}
        overflowAction={overflowAction}
        secondaryPdf={secondaryPdf}
        onBack={() => navigate(-1)}
        onUnfollow={following ? () => void handleUnfollow() : undefined}
        onDismiss={tenderId ? () => void handleDismiss() : undefined}
        dismissLabel={
          isDeadlineExpired ? "Σήμανση ως ληγμένο" : "Απόκρυψη από τις Ευκαιρίες"
        }
        onCreateDriveFolder={driveCreate}
        driveUpgradeHref={showDriveUpgrade ? "/app/subscription" : null}
        showDriveUpgradeHint={showDriveUpgrade}
      />

      {following || workflow?.nextAction ? (
        <TenderNextActionCard
          label={nextActionLabel}
          description={nextActionDescription}
          monitoringActive={monitoringActive}
          hasOutreach={hasOutreach}
          // Header already owns the primary Outreach CTA — avoid duplicating it here.
          contextualAction={null}
          busy={busy}
        />
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <OfficialTimeline
            entries={timeline}
            expectedLabel={
              following && expected
                ? expected.code === "PROC"
                  ? "Σχετική πρόσκληση / PROC"
                  : expected.label
                : null
            }
            expectedDescription={following ? expected?.description : null}
            relatedNeedsReview={relatedNeedsReview}
            busy={busy}
            onConfirmRelated={(linkId) => void handleConfirmRelatedAct(linkId)}
            onDismissRelated={(linkId) => void handleDismissRelatedAct(linkId)}
          />

          <OrganizationActivityTimeline
            entries={timeline}
            following={following}
            // Suggested hollow step only when header has no primary Outreach CTA.
            suggestedAction={
              canPrepareOutreach && following && !hasOutreach && !primaryAction
                ? {
                    label: "Καταγραφή Εκδήλωσης Ενδιαφέροντος",
                    onClick: () => void handleOpenOutreach(),
                  }
                : null
            }
            busy={busy}
          />

          {hasRelatedProc && relatedProcs.length > 0 && !isSubmitted ? (
            <Card className="border-border/70">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Σχετική πρόσκληση</CardTitle>
                <CardDescription>
                  Επίσημη πρόσκληση που συνδέθηκε με αυτό το αίτημα.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {relatedProcs.map((link) => {
                  const type =
                    link.targetTender.recordType === "PROC" ? "PROC" : "REQ";
                  return (
                    <div
                      key={link.id}
                      className="flex flex-col gap-2 rounded-md border border-border/60 bg-muted/10 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge
                            variant={
                              link.confidence === "CONFIRMED"
                                ? "success"
                                : "outline"
                            }
                          >
                            {link.confidence === "CONFIRMED"
                              ? "Επιβεβαιωμένη"
                              : link.confidence === "LIKELY" ||
                                  link.confidence === "POSSIBLE"
                                ? "Πιθανή σχέση"
                                : link.confidence}
                          </Badge>
                          <span className="font-mono text-xs text-muted-foreground">
                            {link.targetTender.recordType}{" "}
                            {link.targetTender.referenceNumber}
                          </span>
                        </div>
                        <div className="text-sm font-medium">
                          {link.targetTender.title || "—"}
                        </div>
                      </div>
                      <Button size="sm" variant="outline" asChild>
                        <Link
                          to={`/app/tenders/${type}/${encodeURIComponent(link.targetTender.referenceNumber)}`}
                        >
                          Προβολή
                        </Link>
                      </Button>
                    </div>
                  );
                })}
                {nextActionCode === "START_PREPARATION" ? (
                  <Button size="sm" disabled={busy} onClick={() => void handlePrepare()}>
                    Έναρξη προετοιμασίας
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          <TenderPreparationCard
            mode={hasRelatedProc ? "checklist" : "early"}
            checklist={checklist}
            following={following}
            showStartPreparation={nextActionCode === "START_PREPARATION"}
            onStartPreparation={() => void handlePrepare()}
            busy={busy}
          />

          {following && priceMemory ? (
            <Card className="border-border/70">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Ιστορικό τιμών</CardTitle>
                <CardDescription>
                  Δείτε προηγούμενες τιμές για να προετοιμάσετε την προσφορά σας
                  {priceMemory.cpv ? ` · ${priceMemory.cpv}` : ""}
                  {priceMemory.regionCode ? ` · ${priceMemory.regionCode}` : ""}.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {priceMemory.note ? (
                  <p className="text-muted-foreground">{priceMemory.note}</p>
                ) : null}
                {priceMemory.coverage?.descriptionEl ? (
                  <p className="text-xs text-muted-foreground">
                    {priceMemory.coverage.descriptionEl}
                  </p>
                ) : null}
                {priceMemory.samples.length === 0 ? (
                  <p className="text-muted-foreground">
                    Δεν υπάρχουν ακόμη αποτελέσματα ανάθεσης για αυτό το ζεύγος.
                  </p>
                ) : (
                  priceMemory.samples.map((sample) => (
                    <div
                      key={sample.referenceNumber}
                      className="rounded-md border border-border/60 bg-muted/10 px-3 py-2"
                    >
                      <div className="font-medium">
                        {sample.winnerName || "Άγνωστος ανάδοχος"}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span className="font-mono">{sample.referenceNumber}</span>
                        <span>{formatDate(sample.signedDate)}</span>
                        <span>
                          Ποσό ανάθεσης: {formatMoney(sample.awardAmount)}
                        </span>
                        {sample.ratio != null ? (
                          <span>
                            {Math.round(sample.ratio * 100)}% της εκτιμώμενης αξίας
                          </span>
                        ) : null}
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          ) : null}

          {following ? (
            <Card className="border-border/70">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Κατάσταση συμμετοχής</CardTitle>
                <CardDescription>
                  Συνοπτική εικόνα των καταγεγραμμένων ενεργειών σας.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <span className="text-muted-foreground">Στάδιο: </span>
                    {workflow?.stageLabel}
                  </div>
                  <div>
                    <span className="text-muted-foreground">
                      {workflow?.priorityMonitoring?.active
                        ? "Παρακολούθηση Προτεραιότητας: "
                        : "Παρακολούθηση: "}
                    </span>
                    {workflow?.priorityMonitoring?.active
                      ? "Ενεργή · Έλεγχος υψηλής συχνότητας"
                      : monitoringActive
                        ? "Ενεργή"
                        : "Ανενεργή"}
                  </div>
                  {workflow?.priorityMonitoring?.active &&
                  workflow.priorityMonitoring.lastCheckAt ? (
                    <div>
                      <span className="text-muted-foreground">Τελευταίος έλεγχος: </span>
                      {formatDateTime(workflow.priorityMonitoring.lastCheckAt)}
                    </div>
                  ) : null}
                  <div>
                    <span className="text-muted-foreground">
                      Εκδήλωση ενδιαφέροντος:{" "}
                    </span>
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
                  <div className="flex flex-wrap items-center gap-2 rounded-md border border-border/60 px-3 py-2">
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
                {following && isSubmitted ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setSubmissionOpen(true)}
                  >
                    Καταγραφή νέας υποβολής
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          {hasOutreach ? (
            <Card className="border-border/70">
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

          {workspace?.workspace ? (
            <Card className="border-border/70">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Φάκελος υποβολής</CardTitle>
                <CardDescription>
                  {workspace.documentCount} συνδεδεμένα έγγραφα εταιρείας — χωρίς
                  επαναφόρτωση.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {workspace.sections.map((section) => (
                  <div
                    key={section.id}
                    className="rounded-md border border-border/60 bg-muted/10 px-3 py-3"
                  >
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

        <div className="space-y-4">
          <TenderRelevanceCard matchMeta={matchMeta ?? null} />

          <Card className="border-border/70">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Επίσημη πηγή</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div>Τύπος: {item.recordType}</div>
              <div className="font-mono text-xs">{item.adam}</div>
              <div className="font-medium tabular-nums">
                {item.adam.startsWith("TED:")
                  ? "Εκτιμώμενη αξία"
                  : "Αξία χωρίς ΦΠΑ"}
                : {formatMoney(item.budgetWithoutVat)}
              </div>
              {item.awardAmount != null ? (
                <div className="text-sm font-medium tabular-nums">
                  Ποσό ανάθεσης: {formatMoney(item.awardAmount)}
                </div>
              ) : null}
              <div>Καταχώριση: {formatDate(item.submissionDate || item.signedDate)}</div>
              {item.finalSubmissionDate ? (
                <div>Προθεσμία υποβολής: {formatDate(item.finalSubmissionDate)}</div>
              ) : null}
              {item.contractTypeLabel ? (
                <div>Είδος: {item.contractTypeLabel}</div>
              ) : null}
              {formatRegion(item.nutsCode) ? (
                <div>{formatRegion(item.nutsCode)}</div>
              ) : null}
              {item.cpvs?.length ? (
                <div className="flex flex-wrap gap-1 pt-1">
                  {item.cpvs.slice(0, 6).map((code) => (
                    <Badge
                      key={code}
                      variant="outline"
                      className="max-w-full truncate font-normal"
                      title={formatCpvBadge(code)}
                    >
                      {formatCpvBadge(code)}
                    </Badge>
                  ))}
                </div>
              ) : null}
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

      {googleView?.drive.featureAvailable &&
      googleView.drive.entitled &&
      activeOrganization &&
      tenderId ? (
        <CreateTenderDriveFolderDialog
          open={driveFolderOpen}
          onOpenChange={setDriveFolderOpen}
          organizationId={activeOrganization.id}
          tenderId={tenderId}
          driveStatus={googleView.drive.status}
        />
      ) : null}

      <Dialog open={outreachOpen} onOpenChange={setOutreachOpen}>
        <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Καταγραφή Εκδήλωσης Ενδιαφέροντος</DialogTitle>
            <DialogDescription>
              Καταγράψτε μια επικοινωνία που πραγματοποιήσατε εκτός ARC Tenders. Μπορείτε
              να ετοιμάσετε πρόχειρο email και εταιρικό προφίλ εδώ — το ARC Tenders δεν
              αποστέλλει αυτόματα το μήνυμα στον φορέα.
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
              Καταγράψτε μια υποβολή που πραγματοποιήθηκε μέσω του επίσημου καναλιού της
              διαδικασίας (π.χ. ΕΣΗΔΗΣ/ΚΗΜΔΗΣ). Το ARC Tenders δεν πραγματοποιεί την επίσημη
              υποβολή· η παρακολούθηση αποτελέσματος παραμένει ενεργή.
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
