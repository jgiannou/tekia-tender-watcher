import { FormEvent, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  api,
  isDesktop,
  openExternalUrl,
  type DraftPackage,
  type TenderDetail,
} from "../api";
import { TenderPhaseCard } from "../components/TenderPhaseCard";
import { formatDateTime, formatEuro, formatTime, statusClass } from "../lib/format";
import {
  EARLY_PHASE_DOC_KEYS,
  FORMAL_DRIVE_DOC_TYPES,
  OUTREACH_DRIVE_DOC_TYPES,
  extractionEmptyLabel,
  formatRecordTypeLabel,
  getTenderPhase,
} from "../lib/tender-phase";
import {
  UI,
  getGreekCategoryLabel,
  getGreekChecklistLabel,
  getGreekDocumentStatusLabel,
  getGreekDraftLabel,
  getGreekDriveDocTypeLabel,
  getGreekEventTypeLabel,
  getGreekRelevanceLabel,
  getGreekStatusLabel,
  getGreekSubmissionMethodLabel,
  getNoExpiryNote,
} from "../lib/ui-labels";

const draftKeys = ["outreach", "technical", "economic", "declarations"] as const;
type DraftKey = (typeof draftKeys)[number];

type DraftEditorForm = {
  status: DraftPackage["status"];
  subject: string;
  body: string;
  notes: string;
  amountWithoutVat: string;
};

const toDraftEditorForm = (draft: DraftPackage): DraftEditorForm => ({
  status: draft.status === "NOT_STARTED" ? "DRAFT" : draft.status,
  subject: draft.subject ?? "",
  body: draft.body ?? "",
  notes: draft.notes ?? "",
  amountWithoutVat:
    draft.amountWithoutVat != null ? String(draft.amountWithoutVat) : "",
});

const DRAFT_AUTOSAVE_MS = 700;

type VaultChecklistItem = {
  key: string;
  label: string;
  status: string;
  validUntil: string | null;
  driveUrl: string | null;
  note: string | null;
};

type PackageReadiness = {
  companyDocuments: Array<{ label: string; status: string; detail: string | null }>;
  generatedDocuments: Array<{ label: string; status: string; detail: string | null }>;
  ready: boolean;
  summary: string;
  __tekiaError?: boolean;
  message?: string;
};

type DriveDoc = {
  id: string;
  type: string;
  driveUrl: string;
  status: string;
  unresolvedPlaceholders: string[];
  masterFileId: string;
  driveFileId: string;
};

export const TenderDetailPage = () => {
  const { referenceNumber = "" } = useParams();
  const [tender, setTender] = useState<TenderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showRecordForm, setShowRecordForm] = useState(false);
  const [editingDraft, setEditingDraft] = useState<DraftKey | null>(null);
  const [editingScope, setEditingScope] = useState(false);
  const [contactForm, setContactForm] = useState({
    name: "",
    department: "",
    email: "",
    phone: "",
  });
  const [scopeDraft, setScopeDraft] = useState("");
  const [submissionForm, setSubmissionForm] = useState({
    method: "UNKNOWN",
    email: "",
    portal: "",
    instructions: "",
  });
  const [formRevision, setFormRevision] = useState(0);
  const [savingDetails, setSavingDetails] = useState(false);
  const [draftEditorKey, setDraftEditorKey] = useState(0);
  const [loadingDriveText, setLoadingDriveText] = useState(false);
  const [draftEditorForm, setDraftEditorForm] = useState<DraftEditorForm | null>(
    null,
  );
  const [draftSaveState, setDraftSaveState] = useState<
    "idle" | "dirty" | "saving" | "saved" | "error"
  >("idle");
  const [draftSaveError, setDraftSaveError] = useState<string | null>(null);
  const draftAutosaveSeq = useRef(0);
  const draftFormRef = useRef<DraftEditorForm | null>(null);
  const editingDraftRef = useRef<DraftKey | null>(null);
  const [showOutreachSendForm, setShowOutreachSendForm] = useState(false);
  const [outreachSendForm, setOutreachSendForm] = useState({
    sentAt: "",
    recipient: "",
    subject: "",
    notes: "",
  });
  const [savingOutreachSent, setSavingOutreachSent] = useState(false);
  const [vaultChecklist, setVaultChecklist] = useState<VaultChecklistItem[] | null>(
    null,
  );
  const [packageReadiness, setPackageReadiness] = useState<PackageReadiness | null>(
    null,
  );
  const [economicValues, setEconomicValues] = useState<Record<string, string>>({
    NET_AMOUNT: "",
    VAT_PERCENT: "",
    VAT_AMOUNT: "",
    GROSS_AMOUNT: "",
    PRICE_BREAKDOWN: "",
    VALIDITY_PERIOD: "",
    DELIVERY_TIME: "",
    PAYMENT_TERMS: "",
    NOTES: "",
  });
  const [declarationValues, setDeclarationValues] = useState<Record<string, string>>({
    CAPACITY: "",
    DECLARATION_TEXT: "",
    PROTOCOL_NUMBER: "",
  });
  const [technicalValues, setTechnicalValues] = useState<Record<string, string>>({
    SCOPE_SUMMARY: "",
    TECHNICAL_APPROACH: "",
    DELIVERABLES: "",
    TIMELINE: "",
    SUPPORT_TERMS: "",
    COMPLIANCE_NOTES: "",
    NOTES: "",
  });
  const [driveDocuments, setDriveDocuments] = useState<DriveDoc[]>([]);

  const syncFormsFromTender = (detail: TenderDetail) => {
    setContactForm({
      name: detail.contact.name ?? "",
      department: detail.contact.department ?? "",
      email: detail.contact.email ?? "",
      phone: detail.contact.phone ?? "",
    });
    setScopeDraft(detail.scopeSummary ?? "");
    setSubmissionForm({
      method: detail.submissionInfo.method || "UNKNOWN",
      email: detail.submissionInfo.email ?? "",
      portal: detail.submissionInfo.portal ?? "",
      instructions: detail.submissionInfo.instructions ?? "",
    });
    setEditingScope(false);
    setFormRevision((n) => n + 1);
  };

  const load = async (markReviewed = false) => {
    setLoading(true);
    try {
      let detail = await api.tender(referenceNumber);
      if (markReviewed && detail.currentStatus === "NEW") {
        const updated = await api.setStatus(
          referenceNumber,
          "REVIEW",
          "Opened in dashboard",
        );
        detail = updated.tender;
      }
      setTender(detail);
      syncFormsFromTender(detail);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [referenceNumber]);

  useEffect(() => {
    draftFormRef.current = draftEditorForm;
  }, [draftEditorForm]);

  useEffect(() => {
    editingDraftRef.current = editingDraft;
  }, [editingDraft]);

  const persistDraftToServer = async (
    key: DraftKey,
    form: DraftEditorForm,
    options?: { silent?: boolean },
  ): Promise<boolean> => {
    if (!tender) return false;
    const seq = ++draftAutosaveSeq.current;
    setDraftSaveState("saving");
    setDraftSaveError(null);
    const next: DraftPackage = {
      ...tender.drafts[key],
      status: form.status,
      subject: form.subject.trim() || null,
      body: form.body.trim() || null,
      notes: form.notes.trim() || null,
      amountWithoutVat:
        key === "economic" && form.amountWithoutVat.trim()
          ? Number(form.amountWithoutVat)
          : tender.drafts[key].amountWithoutVat ?? null,
      updatedAt: new Date().toISOString(),
    };
    try {
      const result = await api.patchTender(referenceNumber, {
        drafts: { [key]: next },
      });
      // Ignore stale responses if a newer save started.
      if (seq !== draftAutosaveSeq.current) return true;
      setTender(result.tender);
      setDraftSaveState("saved");
      if (!options?.silent) {
        setMessage(
          result.approvalInvalidated
            ? "Αποθηκεύτηκε στον server. Η έγκριση ακυρώθηκε λόγω ουσιαστικών αλλαγών."
            : "Αποθηκεύτηκε στον server.",
        );
      }
      return true;
    } catch (err) {
      if (seq !== draftAutosaveSeq.current) return false;
      const detail = err instanceof Error ? err.message : String(err);
      setDraftSaveState("error");
      setDraftSaveError(detail);
      setError(`Αποτυχία αποθήκευσης προχείρου στον server: ${detail}`);
      return false;
    }
  };

  // Debounced autosave — server is source of truth for draft fields.
  useEffect(() => {
    if (!editingDraft || !draftEditorForm || draftSaveState !== "dirty") return;
    const timer = window.setTimeout(() => {
      void persistDraftToServer(editingDraft, draftEditorForm, { silent: true });
    }, DRAFT_AUTOSAVE_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftEditorForm, editingDraft, draftSaveState]);

  const openDraftEditor = (key: DraftKey, draft: DraftPackage) => {
    const form = toDraftEditorForm(draft);
    setDraftEditorForm(form);
    draftFormRef.current = form;
    setDraftSaveState("idle");
    setDraftSaveError(null);
    setDraftEditorKey((n) => n + 1);
    setEditingDraft(key);
  };

  const closeDraftEditor = async () => {
    const key = editingDraftRef.current;
    const form = draftFormRef.current;
    if (key && form && draftSaveState === "dirty") {
      await persistDraftToServer(key, form, { silent: false });
    }
    setEditingDraft(null);
    setDraftEditorForm(null);
    setDraftSaveState("idle");
    setDraftSaveError(null);
  };

  useEffect(() => {
    if (!isDesktop() || !window.tekia?.drive) {
      setVaultChecklist(null);
      return;
    }
    void window.tekia.drive.checklist().then((rows) => {
      if (rows && typeof rows === "object" && "__tekiaError" in (rows as object)) {
        return;
      }
      setVaultChecklist(rows as VaultChecklistItem[]);
    });
  }, [referenceNumber]);

  const handlePreparePackage = async () => {
    if (!isDesktop() || !window.tekia?.drive) {
      setMessage("Η προετοιμασία φακέλου προσφοράς είναι διαθέσιμη στην desktop εφαρμογή.");
      return;
    }
    try {
      const result = (await window.tekia.drive.packageReadiness(
        referenceNumber,
      )) as PackageReadiness;
      if (result?.__tekiaError) {
        setError(result.message ?? "Αποτυχία ελέγχου ετοιμότητας");
        return;
      }
      setPackageReadiness(result);
      setMessage(`Ετοιμότητα φακέλου: ${result.summary}. Δεν στάλθηκε τίποτα.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleCreateWorkspace = async () => {
    if (!isDesktop() || !window.tekia?.drive) return;
    try {
      const result = (await window.tekia.drive.createWorkspace(
        referenceNumber,
      )) as { webViewLink?: string; __tekiaError?: boolean; message?: string };
      if (result?.__tekiaError) {
        setError(result.message ?? "Αποτυχία δημιουργίας φακέλου");
        return;
      }
      setMessage("Δημιουργήθηκε φάκελος διαγωνισμού στο Drive (Submissions/{ADAM}/).");
      if (result.webViewLink) void openExternalUrl(result.webViewLink);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const refreshDriveDocuments = async () => {
    if (!isDesktop() || !window.tekia?.drive?.tenderDocuments) return;
    const rows = (await window.tekia.drive.tenderDocuments(
      referenceNumber,
    )) as Array<{
      id: string;
      type: string;
      driveUrl: string;
      status: string;
      unresolvedPlaceholders?: string[];
      masterFileId: string;
      driveFileId: string;
    }>;
    if (rows && typeof rows === "object" && "__tekiaError" in (rows as object)) {
      return;
    }
    setDriveDocuments(
      (rows ?? []).map((r) => ({
        ...r,
        unresolvedPlaceholders: r.unresolvedPlaceholders ?? [],
      })),
    );
  };

  useEffect(() => {
    void refreshDriveDocuments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [referenceNumber]);

  const handleCopyTemplate = async (
    templateKey:
      | "earlyOutreach"
      | "technicalOffer"
      | "economicOffer"
      | "declarations",
  ) => {
    if (!isDesktop() || !window.tekia?.drive) return;

    if (templateKey === "economicOffer") {
      const missing = Object.entries(economicValues).filter(
        ([key, value]) => key !== "NOTES" && !value.trim(),
      );
      if (missing.length > 0) {
        setError(
          `Η Οικονομική Προσφορά απαιτεί τιμές από τον χρήστη πριν τη συγχώνευση: ${missing
            .map(([k]) => k)
            .join(", ")}`,
        );
        return;
      }
    }

    if (templateKey === "declarations") {
      if (!declarationValues.DECLARATION_TEXT.trim()) {
        setError(
          "Η Δήλωση απαιτεί DECLARATION_TEXT από τον διαγωνισμό / χρήστη — χωρίς επινόηση.",
        );
        return;
      }
    }

    const operatorValues =
      templateKey === "economicOffer"
        ? economicValues
        : templateKey === "declarations"
          ? declarationValues
          : templateKey === "technicalOffer"
            ? technicalValues
            : undefined;

    try {
      const result = (await window.tekia.drive.copyTemplate(
        referenceNumber,
        templateKey,
        operatorValues,
      )) as {
        name?: string;
        driveUrl?: string;
        masterUntouched?: boolean;
        masterFileId?: string;
        driveFileId?: string;
        unresolvedPlaceholders?: string[];
        replacedKeys?: string[];
        __tekiaError?: boolean;
        message?: string;
      };
      if (result?.__tekiaError) {
        setError(result.message ?? "Αποτυχία αντιγραφής / συγχώνευσης προτύπου");
        return;
      }
      if (
        result.masterFileId &&
        result.driveFileId &&
        result.masterFileId === result.driveFileId
      ) {
        setError("Σφάλμα ασφαλείας: το master και το αντίγραφο έχουν το ίδιο ID");
        return;
      }
      const unresolved = result.unresolvedPlaceholders ?? [];
      setMessage(
        `Δημιουργήθηκε αντίγραφο «${result.name}» (το master δεν άλλαξε). ${UI.safetyGenerate} ${
          unresolved.length
            ? `Εκκρεμή πεδία: ${unresolved.join(", ")} — παραμένει Πρόχειρο.`
            : "Δεν υπάρχουν εκκρεμή πεδία."
        }`,
      );
      if (result.driveUrl) void openExternalUrl(result.driveUrl);
      await refreshDriveDocuments();
      if (templateKey === "earlyOutreach" && tender) {
        openDraftEditor("outreach", tender.drafts.outreach);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleMarkDriveDocReady = async (documentId: string) => {
    if (!window.tekia?.drive?.markDocumentReady) return;
    try {
      const result = (await window.tekia.drive.markDocumentReady(documentId)) as {
        __tekiaError?: boolean;
        message?: string;
        status?: string;
      };
      if (result?.__tekiaError) {
        setError(result.message ?? "Δεν μπορεί να σημανθεί ως Έτοιμο");
        return;
      }
      setMessage(
        `Το έγγραφο σημειώθηκε ως ${getGreekDocumentStatusLabel(result.status ?? "READY")}. ${UI.safetyReady}`,
      );
      await refreshDriveDocuments();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleSaveContact = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!tender || savingDetails) return;
    setSavingDetails(true);
    setError(null);
    try {
      const result = await api.patchTender(referenceNumber, {
        contact_name: contactForm.name.trim() || null,
        contact_department: contactForm.department.trim() || null,
        contact_email: contactForm.email.trim() || null,
        contact_phone: contactForm.phone.trim() || null,
        submission_method: submissionForm.method || "UNKNOWN",
        submission_email: submissionForm.email.trim() || null,
        submission_portal: submissionForm.portal.trim() || null,
        submission_instructions: submissionForm.instructions.trim() || null,
        scope_summary: scopeDraft.trim() || null,
      });
      if (!result?.tender) {
        throw new Error("Η αποθήκευση δεν επέστρεψε ενημερωμένα στοιχεία");
      }
      setTender(result.tender);
      syncFormsFromTender(result.tender);
      setMessage(
        result.approvalInvalidated
          ? "Αποθηκεύτηκε. Η έγκριση ακυρώθηκε λόγω ουσιαστικών αλλαγών."
          : "Αποθηκεύτηκε.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingDetails(false);
    }
  };

  const handleSaveSubmissionOnly = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!tender || savingDetails) return;
    setSavingDetails(true);
    setError(null);
    try {
      const result = await api.patchTender(referenceNumber, {
        submission_method: submissionForm.method || "UNKNOWN",
        submission_email: submissionForm.email.trim() || null,
        submission_portal: submissionForm.portal.trim() || null,
        submission_instructions: submissionForm.instructions.trim() || null,
      });
      if (!result?.tender) {
        throw new Error("Η αποθήκευση δεν επέστρεψε ενημερωμένα στοιχεία");
      }
      setTender(result.tender);
      syncFormsFromTender(result.tender);
      setMessage(
        result.approvalInvalidated
          ? "Αποθηκεύτηκε. Η έγκριση ακυρώθηκε λόγω ουσιαστικών αλλαγών."
          : "Αποθηκεύτηκε.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingDetails(false);
    }
  };

  const handleChecklistToggle = async (key: string, status: string) => {
    if (!tender) return;
    const next = tender.documentChecklist.map((item) =>
      item.key === key ? { ...item, status } : item,
    );
    try {
      const result = await api.patchTender(referenceNumber, {
        document_checklist: next,
      });
      setTender(result.tender);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handlePrepareDraft = async (key: DraftKey) => {
    if (!tender) return;
    const current = tender.drafts[key];
    const next: DraftPackage = {
      ...current,
      status: current.status === "NOT_STARTED" ? "DRAFT" : current.status,
      updatedAt: new Date().toISOString(),
    };
    if (key === "outreach" && !next.subject) {
      next.subject = `Πρόταση συνεργασίας — ${tender.title ?? tender.referenceNumber}`;
      next.body =
        next.body ||
        `Αξιότιμε/η,\n\nΘα θέλαμε να εκδηλώσουμε ενδιαφέρον εκ μέρους της TEKIA για: ${tender.title ?? ""}.\n\nΜε εκτίμηση,\nΙωάννης Γιαννούσης\nTEKIA`;
    }
    try {
      const result = await api.patchTender(referenceNumber, {
        drafts: { [key]: next },
      });
      setTender(result.tender);
      openDraftEditor(key, result.tender.drafts[key]);
      setMessage(
        result.approvalInvalidated
          ? "Το πρόχειρο ενημερώθηκε στον server. Η έγκριση ακυρώθηκε."
          : "Το πρόχειρο προετοιμάστηκε και αποθηκεύτηκε στον server.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handlePrepareOutreach = async () => {
    if (!tender) return;
    const existingDrive = driveDocuments.find((d) =>
      OUTREACH_DRIVE_DOC_TYPES.has(d.type),
    );
    if (existingDrive) {
      // Prefer server draft as source of truth; Drive is optional import.
      openDraftEditor("outreach", tender.drafts.outreach);
      setMessage(
        "Εμφανίζονται τα αποθηκευμένα δεδομένα από τον server. Χρησιμοποίησε «Φόρτωση από Drive» αν θέλεις το Google Doc.",
      );
      return;
    }
    if (isDesktop() && window.tekia?.drive) {
      await handleCopyTemplate("earlyOutreach");
      return;
    }
    await handlePrepareDraft("outreach");
  };

  const handleSaveDraft = async (
    event: FormEvent<HTMLFormElement>,
    key: DraftKey,
  ) => {
    event.preventDefault();
    if (!draftEditorForm) return;
    const ok = await persistDraftToServer(key, draftEditorForm, {
      silent: false,
    });
    if (ok) setDraftSaveState("saved");
  };

  const updateDraftEditorField = <K extends keyof DraftEditorForm>(
    field: K,
    value: DraftEditorForm[K],
  ) => {
    setDraftEditorForm((prev) => (prev ? { ...prev, [field]: value } : prev));
    setDraftSaveState("dirty");
    setMessage(null);
  };

  const handleMarkDraftReady = async (key: DraftKey) => {
    if (!tender) return;
    const draft = tender.drafts[key];
    try {
      const result = await api.patchTender(referenceNumber, {
        drafts: {
          [key]: {
            ...draft,
            status: "READY",
            updatedAt: new Date().toISOString(),
          },
        },
      });
      setTender(result.tender);
      setMessage(
        result.approvalInvalidated
          ? `Σημάνθηκε ως Έτοιμο. Η έγκριση ακυρώθηκε. ${UI.safetyReady}`
          : `${getGreekDraftLabel(key)}: Έτοιμο. ${UI.safetyReady}`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const openOutreachSendForm = () => {
    if (!tender) return;
    const localNow = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const localIso = `${localNow.getFullYear()}-${pad(localNow.getMonth() + 1)}-${pad(localNow.getDate())}T${pad(localNow.getHours())}:${pad(localNow.getMinutes())}`;
    setOutreachSendForm({
      sentAt: localIso,
      recipient: tender.contact.email?.trim() || "",
      subject: tender.drafts.outreach.subject?.trim() || "",
      notes: tender.drafts.outreach.notes?.trim() || "",
    });
    setShowOutreachSendForm(true);
  };

  const handleRecordOutreachSent = async (
    e: React.FormEvent<HTMLFormElement>,
  ) => {
    e.preventDefault();
    if (!tender) return;
    setSavingOutreachSent(true);
    setError(null);
    try {
      const sentAt = new Date(outreachSendForm.sentAt).toISOString();
      if (Number.isNaN(new Date(outreachSendForm.sentAt).getTime())) {
        setError("Μη έγκυρη ημερομηνία αποστολής");
        return;
      }
      const result = await api.recordOutreachSent(referenceNumber, {
        sentAt,
        recipient: outreachSendForm.recipient.trim() || null,
        subject: outreachSendForm.subject.trim() || null,
        notes: outreachSendForm.notes.trim() || null,
      });
      setTender(result.tender);
      setShowOutreachSendForm(false);
      setMessage(
        `Η Εκδήλωση Ενδιαφέροντος καταχωρήθηκε ως σταλμένη. Παρακολούθηση ενεργή. ${UI.safetyOutreachSent}`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingOutreachSent(false);
    }
  };

  const handleMarkReady = async () => {
    try {
      const result = await api.setStatus(
        referenceNumber,
        "READY",
        "Package ready for review",
      );
      setTender(result.tender);
      setMessage(`Σημάνθηκε ως Έτοιμο. ${UI.safetyReady}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleApprove = async () => {
    try {
      const result = await api.approve(referenceNumber);
      setTender(result.tender);
      setMessage(
        `Εγκρίθηκε. ${UI.safetyApprove} Η αποστολή παραμένει μη διαθέσιμη έως ότου ρυθμιστεί τοπικά.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleConfirmRelation = async (procAdam: string) => {
    try {
      const result = await api.confirmRelation(procAdam);
      // Reload current tender (REQ or PROC) to refresh linked cards
      await load(false);
      setMessage(`Επιβεβαιώθηκε η σύνδεση με ${procAdam}.`);
      void result;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDismissRelation = async (procAdam: string) => {
    try {
      await api.dismissRelation(procAdam);
      await load(false);
      setMessage(`Απορρίφθηκε η πιθανή σύνδεση με ${procAdam}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleReloadOutreachFromDrive = async () => {
    if (!tender) return;
    const driveDoc = driveDocuments.find((d) =>
      OUTREACH_DRIVE_DOC_TYPES.has(d.type),
    );
    if (!driveDoc || !isDesktop() || !window.tekia?.drive?.readDocument) {
      setError("Δεν υπάρχει Google Doc για φόρτωση από το Drive.");
      return;
    }

    setLoadingDriveText(true);
    setError(null);
    try {
      const result = (await window.tekia.drive.readDocument(driveDoc.id)) as {
        subject?: string | null;
        body?: string;
        __tekiaError?: boolean;
        message?: string;
      };
      if (result?.__tekiaError) {
        setError(result.message ?? "Αποτυχία ανάγνωσης από το Drive");
        return;
      }

      const form: DraftEditorForm = {
        status:
          tender.drafts.outreach.status === "NOT_STARTED"
            ? "DRAFT"
            : tender.drafts.outreach.status,
        subject: (result.subject ?? tender.drafts.outreach.subject ?? "").trim(),
        body: result.body?.trim()
          ? result.body
          : (tender.drafts.outreach.body ?? ""),
        notes: tender.drafts.outreach.notes ?? "",
        amountWithoutVat: "",
      };
      setDraftEditorForm(form);
      setDraftEditorKey((n) => n + 1);
      setEditingDraft("outreach");
      // Persist Drive import to server immediately — server remains source of truth.
      const ok = await persistDraftToServer("outreach", form, { silent: false });
      if (ok) {
        setMessage(
          "Φορτώθηκε από το Google Doc και αποθηκεύτηκε στον server.",
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingDriveText(false);
    }
  };

  const handleOpenOutreachEditor = async () => {
    if (!tender) return;

    // Always open from server drafts. Drive import is explicit & optional.
    const serverDraft = tender.drafts.outreach;
    const hasServerContent = Boolean(
      serverDraft.subject?.trim() || serverDraft.body?.trim(),
    );

    openDraftEditor("outreach", serverDraft);
    setMessage(
      hasServerContent
        ? "Φορτώθηκαν τα αποθηκευμένα δεδομένα από τον server."
        : "Δεν υπάρχουν ακόμα αποθηκευμένα πεδία στον server — συμπλήρωσε και θα αποθηκευτούν αυτόματα.",
    );
  };

  const handleRecordSubmission = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const result = await api.recordSubmission(referenceNumber, {
        submitted_at: new Date(String(form.get("submitted_at"))).toISOString(),
        submission_method: String(form.get("submission_method")),
        recipient: String(form.get("recipient") || "") || null,
        subject: String(form.get("subject") || "") || null,
        amount_without_vat: form.get("amount_without_vat")
          ? Number(form.get("amount_without_vat"))
          : null,
        external_reference: String(form.get("external_reference") || "") || null,
        notes: String(form.get("notes") || "") || null,
      });
      setTender(result.tender);
      setShowRecordForm(false);
      setMessage("Η υποβολή καταχωρίστηκε. Κατάσταση: Υποβλήθηκε.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  if (loading) return <p className="muted">{UI.loading}</p>;
  if (error && !tender) return <div className="error">{error}</div>;
  if (!tender) return <div className="error">{UI.notFound}</div>;

  const phase = getTenderPhase(tender);
  const displayOrMissing = (value: string | null | undefined) =>
    value?.trim() ? value : extractionEmptyLabel;

  const outreachDrive = driveDocuments.find((d) =>
    OUTREACH_DRIVE_DOC_TYPES.has(d.type),
  );
  const formalDriveDocs = driveDocuments.filter((d) =>
    FORMAL_DRIVE_DOC_TYPES.has(d.type),
  );
  const outreachDraft = tender.drafts.outreach;

  const outreachStatusLabel = (() => {
    if (outreachDraft.status === "SENT") {
      return getGreekDocumentStatusLabel("SENT");
    }
    if (outreachDrive) return getGreekDocumentStatusLabel(outreachDrive.status);
    if (outreachDraft.status === "NOT_STARTED") return UI.notCreated;
    return getGreekDocumentStatusLabel(outreachDraft.status);
  })();

  const isOutreachReady =
    outreachDraft.status === "SENT" ||
    outreachDrive?.status === "READY" ||
    outreachDraft.status === "READY";

  const earlyVaultItems =
    vaultChecklist?.filter(
      (item) =>
        EARLY_PHASE_DOC_KEYS.has(item.key) ||
        item.key.toLowerCase().includes("outreach") ||
        item.key.toLowerCase().includes("profile"),
    ) ?? [];
  const laterVaultItems =
    vaultChecklist?.filter(
      (item) =>
        !EARLY_PHASE_DOC_KEYS.has(item.key) &&
        !item.key.toLowerCase().includes("outreach") &&
        !item.key.toLowerCase().includes("profile"),
    ) ?? [];

  const earlyChecklistItems = tender.documentChecklist.filter(
    (item) =>
      item.key.includes("outreach") ||
      item.key.includes("company_profile") ||
      item.key.includes("profile"),
  );
  const laterChecklistItems = tender.documentChecklist.filter(
    (item) =>
      !item.key.includes("outreach") &&
      !item.key.includes("company_profile") &&
      !item.key.includes("profile"),
  );

  const renderFormalOfferControls = () => (
    <>
      <h4>Τεχνική Προσφορά</h4>
      <p className="muted">{UI.safetyGenerate}</p>
      <div className="form-grid">
        {Object.keys(technicalValues).map((key) => (
          <label key={key}>
            {`{{${key}}}`}
            <textarea
              value={technicalValues[key]}
              onChange={(e) =>
                setTechnicalValues((prev) => ({
                  ...prev,
                  [key]: e.target.value,
                }))
              }
            />
          </label>
        ))}
      </div>
      <div className="actions">
        <button
          type="button"
          className="btn"
          onClick={() => void handleCopyTemplate("technicalOffer")}
        >
          Δημιουργία Τεχνικής Προσφοράς
        </button>
      </div>

      <h4>Οικονομική Προσφορά</h4>
      <p className="muted">
        Μην επινοείτε τιμές. Απαιτούνται ρητές τιμές πριν τη δημιουργία.{" "}
        {UI.safetyGenerate}
      </p>
      <div className="grid-2">
        {Object.keys(economicValues).map((key) => (
          <label key={key}>
            {`{{${key}}}`}
            <input
              value={economicValues[key]}
              onChange={(e) =>
                setEconomicValues((prev) => ({ ...prev, [key]: e.target.value }))
              }
            />
          </label>
        ))}
      </div>
      <div className="actions">
        <button
          type="button"
          className="btn"
          onClick={() => void handleCopyTemplate("economicOffer")}
        >
          Δημιουργία Οικονομικής Προσφοράς
        </button>
      </div>

      <h4>Δήλωση</h4>
      <div className="form-grid">
        <label>
          {`{{CAPACITY}}`}
          <input
            value={declarationValues.CAPACITY}
            onChange={(e) =>
              setDeclarationValues((prev) => ({
                ...prev,
                CAPACITY: e.target.value,
              }))
            }
          />
        </label>
        <label>
          {`{{PROTOCOL_NUMBER}}`} (προαιρετικό)
          <input
            value={declarationValues.PROTOCOL_NUMBER}
            onChange={(e) =>
              setDeclarationValues((prev) => ({
                ...prev,
                PROTOCOL_NUMBER: e.target.value,
              }))
            }
          />
        </label>
        <label>
          {`{{DECLARATION_TEXT}}`} (υποχρεωτικό)
          <textarea
            value={declarationValues.DECLARATION_TEXT}
            onChange={(e) =>
              setDeclarationValues((prev) => ({
                ...prev,
                DECLARATION_TEXT: e.target.value,
              }))
            }
          />
        </label>
      </div>
      <div className="actions">
        <button
          type="button"
          className="btn"
          onClick={() => void handleCopyTemplate("declarations")}
        >
          Δημιουργία Δήλωσης
        </button>
      </div>
    </>
  );

  const renderDraftEditor = (key: DraftKey) => {
    if (editingDraft !== key || !draftEditorForm) return null;
    const saveLabel =
      draftSaveState === "saving"
        ? "Αποθήκευση στον server…"
        : draftSaveState === "saved"
          ? "Αποθηκευμένο στον server"
          : draftSaveState === "dirty"
            ? "Μη αποθηκευμένες αλλαγές…"
            : draftSaveState === "error"
              ? "Σφάλμα αποθήκευσης"
              : UI.save;

    return (
      <form
        key={`${key}-${draftEditorKey}`}
        className="form-grid"
        style={{ width: "100%", marginTop: 10 }}
        onSubmit={(e) => void handleSaveDraft(e, key)}
      >
        <p className="muted" style={{ margin: 0 }} role="status" aria-live="polite">
          {draftSaveState === "saving"
            ? "Αποθήκευση στον server…"
            : draftSaveState === "saved"
              ? "✓ Αποθηκευμένο στον server — θα φορτωθεί ξανά από εκεί."
              : draftSaveState === "dirty"
                ? "Αλλαγές σε εξέλιξη — αυτόματη αποθήκευση σε λίγο…"
                : draftSaveState === "error"
                  ? `Αποτυχία αποθήκευσης: ${draftSaveError ?? "άγνωστο σφάλμα"}`
                  : "Οι αλλαγές αποθηκεύονται αυτόματα στον server."}
        </p>
        <label>
          Κατάσταση
          <select
            name="status"
            value={draftEditorForm.status}
            onChange={(e) =>
              updateDraftEditorField(
                "status",
                e.target.value as DraftPackage["status"],
              )
            }
            aria-label="Κατάσταση προχείρου"
          >
            <option value="DRAFT">Πρόχειρο</option>
            <option value="READY">Έτοιμο</option>
            <option value="SENT">Στάλθηκε</option>
            <option value="NOT_STARTED">Δεν έχει ξεκινήσει</option>
          </select>
        </label>
        <label>
          Θέμα
          <input
            name="subject"
            value={draftEditorForm.subject}
            onChange={(e) => updateDraftEditorField("subject", e.target.value)}
            aria-label="Θέμα"
          />
        </label>
        <label>
          Περιεχόμενο
          <textarea
            name="body"
            value={draftEditorForm.body}
            onChange={(e) => updateDraftEditorField("body", e.target.value)}
            rows={12}
            aria-label="Περιεχόμενο"
          />
        </label>
        <label>
          Σημειώσεις
          <textarea
            name="notes"
            value={draftEditorForm.notes}
            onChange={(e) => updateDraftEditorField("notes", e.target.value)}
            aria-label="Σημειώσεις"
          />
        </label>
        {key === "economic" ? (
          <label>
            Ποσό χωρίς ΦΠΑ
            <input
              name="amountWithoutVat"
              type="number"
              value={draftEditorForm.amountWithoutVat}
              onChange={(e) =>
                updateDraftEditorField("amountWithoutVat", e.target.value)
              }
              aria-label="Ποσό χωρίς ΦΠΑ"
            />
          </label>
        ) : null}
        <div className="actions">
          <button
            type="submit"
            className="btn primary"
            disabled={draftSaveState === "saving"}
          >
            {saveLabel}
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => void closeDraftEditor()}
          >
            {UI.close}
          </button>
          {key === "outreach" &&
          isDesktop() &&
          driveDocuments.some((d) => OUTREACH_DRIVE_DOC_TYPES.has(d.type)) ? (
            <button
              type="button"
              className="btn"
              disabled={loadingDriveText}
              onClick={() => void handleReloadOutreachFromDrive()}
              aria-label="Φόρτωση από Drive"
            >
              {loadingDriveText ? "Φόρτωση από Drive…" : "Φόρτωση από Drive"}
            </button>
          ) : null}
        </div>
      </form>
    );
  };

  const phaseActions = (
    <>
      {phase.isEarlyStage ? (
        <>
          <button
            type="button"
            className="btn primary"
            onClick={() => void handlePrepareOutreach()}
          >
            {UI.prepareOutreach}
          </button>
          {isDesktop() ? (
            <button
              type="button"
              className="btn"
              onClick={() => void handleCreateWorkspace()}
            >
              {UI.createWorkspace}
            </button>
          ) : null}
          {tender.officialPdfUrl ? (
            <button
              type="button"
              className="btn"
              onClick={() => void openExternalUrl(tender.officialPdfUrl!)}
            >
              {UI.openOfficialPdf}
            </button>
          ) : null}
        </>
      ) : null}
      {phase.isFormalStage ? (
        <>
          {isDesktop() ? (
            <button
              type="button"
              className="btn primary"
              onClick={() => void handlePreparePackage()}
            >
              {UI.prepareOfferPackage}
            </button>
          ) : (
            <p className="muted" style={{ margin: 0 }}>
              Η προετοιμασία φακέλου είναι διαθέσιμη στην desktop εφαρμογή.
            </p>
          )}
          {isDesktop() ? (
            <button
              type="button"
              className="btn"
              onClick={() => void handleCreateWorkspace()}
            >
              {UI.createWorkspace}
            </button>
          ) : null}
          {tender.officialPdfUrl ? (
            <button
              type="button"
              className="btn"
              onClick={() => void openExternalUrl(tender.officialPdfUrl!)}
            >
              {UI.openOfficialPdf}
            </button>
          ) : null}
        </>
      ) : null}
    </>
  );

  return (
    <div className="stack">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <Link className="btn ghost" to="/opportunities">
          {UI.backToOpportunities}
        </Link>
        <span className={statusClass(tender.currentStatus)}>
          {getGreekStatusLabel(tender.currentStatus)}
        </span>
      </div>

      {message ? <div className="alert-box">{message}</div> : null}
      {error ? <div className="error">{error}</div> : null}

      {/* 1. Header / metadata */}
      <section className="card">
        <h2>
          {tender.organization} — {tender.title}
        </h2>
        <div className="meta-grid">
          <div className="meta-item">
            <span className="k">ADAM</span>
            <span className="v">
              <code>{tender.referenceNumber}</code>
            </span>
          </div>
          <div className="meta-item">
            <span className="k">{UI.type}</span>
            <span className="v">{formatRecordTypeLabel(tender.recordType)}</span>
          </div>
          <div className="meta-item">
            <span className="k">{UI.category}</span>
            <span className="v">{getGreekCategoryLabel(tender.webCategory)}</span>
          </div>
          <div className="meta-item">
            <span className="k">{UI.score}</span>
            <span className="v">{tender.score ?? "—"}</span>
          </div>
          <div className="meta-item">
            <span className="k">{UI.budgetExVat}</span>
            <span className="v">{formatEuro(tender.budgetWithoutVat)}</span>
          </div>
          <div className="meta-item">
            <span className="k">{UI.budgetIncVat}</span>
            <span className="v">{formatEuro(tender.budgetWithVat)}</span>
          </div>
          <div className="meta-item">
            <span className="k">{UI.deadline}</span>
            <span className="v">{formatDateTime(tender.finalSubmissionDate)}</span>
          </div>
          <div className="meta-item">
            <span className="k">{UI.kimdisPublication}</span>
            <span className="v">{formatDateTime(tender.submissionDate)}</span>
          </div>
          <div className="meta-item">
            <span className="k">ΚΗΜΔΗΣ</span>
            <span className="v">
              {tender.publicKimdisUrl ? (
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => void openExternalUrl(tender.publicKimdisUrl!)}
                >
                  {UI.openInKimdis}
                </button>
              ) : (
                "—"
              )}
            </span>
          </div>
          <div className="meta-item">
            <span className="k">PDF</span>
            <span className="v">
              {tender.officialPdfUrl ? (
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => void openExternalUrl(tender.officialPdfUrl!)}
                >
                  {UI.openOfficialPdf}
                </button>
              ) : (
                "—"
              )}
            </span>
          </div>
        </div>
      </section>

      {/* 2. Unified phase card */}
      <TenderPhaseCard phase={phase} actions={phaseActions} />

      {tender.recordType === "REQ" &&
      (tender.drafts.outreach.status === "SENT" ||
        tender.monitoring?.watchForRelatedProc) ? (
        <section
          className="card monitoring-card"
          aria-label="Παρακολούθηση Ευκαιρίας"
        >
          <h3 style={{ marginTop: 0 }}>Παρακολούθηση Ευκαιρίας</h3>
          <div className="meta-grid">
            <div className="meta-item">
              <span className="k">Εκδήλωση ενδιαφέροντος</span>
              <span className="v">
                <span className={statusClass("SENT")}>Αποστάλθηκε</span>
              </span>
            </div>
            <div className="meta-item">
              <span className="k">Ημερομηνία</span>
              <span className="v">
                {formatDateTime(tender.drafts.outreach.sentAt ?? null)}
              </span>
            </div>
            <div className="meta-item">
              <span className="k">Παραλήπτης</span>
              <span className="v">
                {tender.drafts.outreach.recipient?.trim() || "—"}
              </span>
            </div>
            <div className="meta-item">
              <span className="k">Κατάσταση</span>
              <span className="v">
                {tender.monitoring?.stateLabel ?? "Αναμονή πρόσκλησης"}
              </span>
            </div>
            <div className="meta-item">
              <span className="k">Σχετική πρόσκληση</span>
              <span className="v">
                {tender.monitoring?.relatedProc ? (
                  <Link
                    to={`/tenders/${encodeURIComponent(
                      tender.monitoring.relatedProc.referenceNumber,
                    )}`}
                  >
                    <code>{tender.monitoring.relatedProc.referenceNumber}</code>
                  </Link>
                ) : (
                  "Δεν έχει εντοπιστεί ακόμη"
                )}
              </span>
            </div>
            <div className="meta-item">
              <span className="k">Συνιστώμενη ενέργεια</span>
              <span className="v">
                {tender.monitoring?.recommendedAction ?? "—"}
              </span>
            </div>
          </div>
          <p className="muted" style={{ marginBottom: 0 }}>
            Το σύστημα ελέγχει νέα PROC και προσπαθεί να εντοπίσει συνέχεια του
            συγκεκριμένου αιτήματος. Η εκδήλωση ενδιαφέροντος δεν είναι επίσημη
            υποβολή προσφοράς.
          </p>
        </section>
      ) : null}

      {(tender.linkedProcs?.length ?? 0) > 0 ||
      tender.relation?.parentTenderId ||
      tender.relation?.candidateTenderId ? (
        <section
          className={`card relation-card${
            tender.linkedProcs?.some((p) => p.possible) ||
            tender.relation?.candidateTenderId
              ? " possible"
              : ""
          }`}
          aria-label="Εξέλιξη ευκαιρίας"
        >
          <h3 style={{ marginTop: 0 }}>Εξέλιξη ευκαιρίας</h3>

          {tender.recordType === "REQ"
            ? (tender.linkedProcs ?? []).map((proc) => (
                <div key={proc.referenceNumber} style={{ marginBottom: 16 }}>
                  {proc.linked ? (
                    <p style={{ marginTop: 0 }}>
                      Η ευκαιρία εξελίχθηκε σε πρόσκληση υποβολής προσφοράς.
                    </p>
                  ) : (
                    <p style={{ marginTop: 0 }}>
                      Πιθανή συνέχεια προηγούμενου Πρωτογενούς Αιτήματος
                    </p>
                  )}
                  <div className="meta-grid">
                    <div className="meta-item">
                      <span className="k">Πρωτογενές Αίτημα</span>
                      <span className="v">
                        <code>{tender.referenceNumber}</code>
                      </span>
                    </div>
                    <div className="meta-item">
                      <span className="k">Σχετική Πρόσκληση</span>
                      <span className="v">
                        <Link
                          to={`/tenders/${encodeURIComponent(proc.referenceNumber)}`}
                        >
                          <code>{proc.referenceNumber}</code>
                        </Link>
                      </span>
                    </div>
                    <div className="meta-item">
                      <span className="k">Τύπος πρόσκλησης</span>
                      <span className="v">
                        {proc.invitationType === "TARGETED"
                          ? "Στοχευμένη"
                          : proc.invitationType === "OPEN"
                            ? "Ανοιχτή"
                            : "Άγνωστη"}
                      </span>
                    </div>
                    <div className="meta-item">
                      <span className="k">Προσκεκλημένος οικονομικός φορέας</span>
                      <span className="v">
                        {proc.invitedVendorName ?? "—"}
                      </span>
                    </div>
                    <div className="meta-item">
                      <span className="k">Κατάσταση TEKIA</span>
                      <span className="v">
                        {proc.ourInvitationStatus === "NOT_INVITED"
                          ? "Δεν προσκληθήκαμε"
                          : proc.ourInvitationStatus === "INVITED"
                            ? "Προσκληθήκαμε"
                            : proc.invitationType === "OPEN"
                              ? "Μπορούμε να συμμετέχουμε"
                              : "Άγνωστη"}
                      </span>
                    </div>
                    <div className="meta-item">
                      <span className="k">Confidence</span>
                      <span className="v">
                        {proc.relationConfidence === "HIGH"
                          ? "Υψηλή"
                          : proc.relationConfidence === "MEDIUM"
                            ? "Μεσαία"
                            : proc.relationConfidence ?? "—"}
                        {proc.relationScore != null
                          ? ` (${proc.relationScore})`
                          : ""}
                      </span>
                    </div>
                  </div>
                  {proc.ourInvitationStatus === "NOT_INVITED" ? (
                    <p className="alert-box">
                      Προτεινόμενη ενέργεια: Καμία υποβολή προσφοράς — η πρόσκληση
                      απευθύνεται σε άλλο οικονομικό φορέα.
                    </p>
                  ) : null}
                  {proc.relationReasons?.length ? (
                    <ul className="checklist">
                      {proc.relationReasons.map((r) => (
                        <li key={r.label}>
                          {r.points > 0 ? `+${r.points}` : ""} {r.label}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {proc.possible ? (
                    <div className="actions">
                      <button
                        type="button"
                        className="btn primary"
                        onClick={() =>
                          void handleConfirmRelation(proc.referenceNumber)
                        }
                      >
                        Επιβεβαίωση σύνδεσης
                      </button>
                      <button
                        type="button"
                        className="btn"
                        onClick={() =>
                          void handleDismissRelation(proc.referenceNumber)
                        }
                      >
                        Δεν σχετίζεται
                      </button>
                    </div>
                  ) : null}
                </div>
              ))
            : null}

          {tender.recordType === "PROC" && tender.relation?.parentTenderId ? (
            <div>
              <p style={{ marginTop: 0 }}>
                Σύνδεση με προϋπάρχον Πρωτογενές Αίτημα.
              </p>
              <div className="meta-grid">
                <div className="meta-item">
                  <span className="k">Γονικό REQ</span>
                  <span className="v">
                    <Link
                      to={`/tenders/${encodeURIComponent(tender.relation.parentTenderId)}`}
                    >
                      <code>{tender.relation.parentTenderId}</code>
                    </Link>
                  </span>
                </div>
                <div className="meta-item">
                  <span className="k">Τύπος πρόσκλησης</span>
                  <span className="v">
                    {tender.invitation.type === "TARGETED"
                      ? "Στοχευμένη"
                      : tender.invitation.type === "OPEN"
                        ? "Ανοιχτή"
                        : "Άγνωστη"}
                  </span>
                </div>
                <div className="meta-item">
                  <span className="k">Προσκεκλημένος</span>
                  <span className="v">
                    {tender.invitation.invitedVendorName ?? "—"}
                  </span>
                </div>
                <div className="meta-item">
                  <span className="k">Κατάσταση TEKIA</span>
                  <span className="v">
                    {tender.invitation.ourStatus === "NOT_INVITED"
                      ? "Δεν προσκλήθηκε"
                      : tender.invitation.ourStatus === "INVITED"
                        ? "Προσκλήθηκε"
                        : "Άγνωστη"}
                  </span>
                </div>
              </div>
              {tender.relation.reasons?.length ? (
                <ul className="checklist">
                  {tender.relation.reasons.map((r) => (
                    <li key={r.label}>
                      {r.points > 0 ? `+${r.points}` : ""} {r.label}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          {tender.recordType === "PROC" &&
          tender.relation?.candidateTenderId &&
          !tender.relation.parentTenderId ? (
            <div>
              <p style={{ marginTop: 0 }}>
                Πιθανή συνέχεια προηγούμενου Πρωτογενούς Αιτήματος
              </p>
              <p>
                Υποψήφιο REQ:{" "}
                <Link
                  to={`/tenders/${encodeURIComponent(tender.relation.candidateTenderId)}`}
                >
                  <code>{tender.relation.candidateTenderId}</code>
                </Link>{" "}
                (score {tender.relation.score ?? "—"})
              </p>
              <div className="actions">
                <button
                  type="button"
                  className="btn primary"
                  onClick={() => void handleConfirmRelation(tender.referenceNumber)}
                >
                  Επιβεβαίωση σύνδεσης
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => void handleDismissRelation(tender.referenceNumber)}
                >
                  Δεν σχετίζεται
                </button>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {tender.recordType === "PROC" ? (
        <section className="card">
          <h3>{UI.procVerification}</h3>
          <div className="meta-grid">
            <div className="meta-item">
              <span className="k">PDF επαληθευμένο</span>
              <span className="v">
                {tender.pdfTextStatus === "extracted" ? "ΝΑΙ" : "ΟΧΙ"}
              </span>
            </div>
            <div className="meta-item">
              <span className="k">Στοχευμένος ανάδοχος</span>
              <span className="v">{tender.targetedSupplier ? "ΝΑΙ" : "ΟΧΙ"}</span>
            </div>
            <div className="meta-item">
              <span className="k">Αποκλεισμός μη προσκεκλημένων</span>
              <span className="v">
                {tender.nonInvitedOffersRejected ? "ΝΑΙ" : "ΟΧΙ"}
              </span>
            </div>
            <div className="meta-item">
              <span className="k">Ανοιχτή προθεσμία</span>
              <span className="v">
                {tender.finalSubmissionDate &&
                new Date(tender.finalSubmissionDate).getTime() >= Date.now()
                  ? "ΝΑΙ"
                  : "ΟΧΙ"}
              </span>
            </div>
            <div className="meta-item">
              <span className="k">Κατάσταση watcher</span>
              <span className="v">
                {getGreekRelevanceLabel(tender.relevanceStatus)}
              </span>
            </div>
          </div>
          {tender.relevanceStatus === "TARGETED" ||
          tender.relevanceStatus === "EXPIRED" ||
          tender.relevanceStatus === "NEEDS_REVIEW" ? (
            <p className="alert-box" style={{ marginTop: 12 }}>
              Δεν είναι έτοιμο για υποβολή — κατάταξη:{" "}
              <strong>{getGreekRelevanceLabel(tender.relevanceStatus)}</strong>.
            </p>
          ) : null}
        </section>
      ) : null}

      {tender.submission ? (
        <section className="already-submitted">
          <strong>{UI.alreadySubmitted}</strong>
          <div className="meta-grid" style={{ marginTop: 10 }}>
            <div className="meta-item">
              <span className="k">Υποβολή</span>
              <span className="v">
                {formatDateTime(tender.submission.submittedAt)}
              </span>
            </div>
            <div className="meta-item">
              <span className="k">Τρόπος</span>
              <span className="v">
                {getGreekSubmissionMethodLabel(tender.submission.method)}
              </span>
            </div>
            <div className="meta-item">
              <span className="k">Παραλήπτης</span>
              <span className="v">{tender.submission.recipient ?? "—"}</span>
            </div>
            <div className="meta-item">
              <span className="k">Ποσό</span>
              <span className="v">
                {formatEuro(tender.submission.amountWithoutVat)}
              </span>
            </div>
          </div>
        </section>
      ) : null}

      {/* 3. Unified Outreach (REQ) or formal docs (PROC) */}
      {phase.isEarlyStage ? (
        <section className="card" aria-label="Εκδήλωση Ενδιαφέροντος">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div>
              <h3 style={{ marginTop: 0 }}>Εκδήλωση Ενδιαφέροντος</h3>
              <p className="muted" style={{ margin: 0 }}>
                Κατάσταση: <strong>{outreachStatusLabel}</strong>
              </p>
            </div>
          </div>

          {outreachDrive?.unresolvedPlaceholders?.length ? (
            <p className="muted">
              {UI.missingPrefix}: {outreachDrive.unresolvedPlaceholders.join(", ")}
            </p>
          ) : null}

          <div className="actions">
            {!outreachDrive && outreachDraft.status === "NOT_STARTED" ? (
              <button
                type="button"
                className="btn primary"
                onClick={() => void handlePrepareOutreach()}
              >
                {UI.prepareOutreach}
              </button>
            ) : (
              <>
                {outreachDrive ? (
                  <button
                    type="button"
                    className="btn"
                    onClick={() => void openExternalUrl(outreachDrive.driveUrl)}
                  >
                    {UI.openInDrive}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="btn"
                  disabled={loadingDriveText}
                  onClick={() => void handleOpenOutreachEditor()}
                >
                  {loadingDriveText ? "Φόρτωση από Drive…" : UI.edit}
                </button>
                {outreachDrive && outreachDrive.status !== "READY" ? (
                  <button
                    type="button"
                    className="btn"
                    disabled={outreachDrive.unresolvedPlaceholders.length > 0}
                    onClick={() => void handleMarkDriveDocReady(outreachDrive.id)}
                  >
                    {UI.markReady}
                  </button>
                ) : null}
                {!outreachDrive &&
                outreachDraft.status !== "READY" &&
                outreachDraft.status !== "SENT" ? (
                  <button
                    type="button"
                    className="btn"
                    onClick={() => void handleMarkDraftReady("outreach")}
                  >
                    {UI.markReady}
                  </button>
                ) : null}
                {outreachDraft.status !== "SENT" ? (
                  <button
                    type="button"
                    className="btn primary"
                    onClick={openOutreachSendForm}
                    aria-label={UI.recordOutreachSent}
                  >
                    {UI.recordOutreachSent}
                  </button>
                ) : null}
                {isDesktop() && !outreachDrive ? (
                  <button
                    type="button"
                    className="btn"
                    onClick={() => void handleCopyTemplate("earlyOutreach")}
                  >
                    {UI.generateDriveDoc}
                  </button>
                ) : null}
              </>
            )}
          </div>

          {showOutreachSendForm ? (
            <form
              className="form-grid"
              style={{ marginTop: 12 }}
              onSubmit={(e) => void handleRecordOutreachSent(e)}
              aria-label={UI.recordOutreachSent}
            >
              <label>
                Ημερομηνία αποστολής
                <input
                  type="datetime-local"
                  required
                  value={outreachSendForm.sentAt}
                  onChange={(e) =>
                    setOutreachSendForm((prev) => ({
                      ...prev,
                      sentAt: e.target.value,
                    }))
                  }
                />
              </label>
              <label>
                Παραλήπτης email
                <input
                  type="email"
                  value={outreachSendForm.recipient}
                  placeholder="Μόνο αν υπάρχει — δεν εφευρίσκεται"
                  onChange={(e) =>
                    setOutreachSendForm((prev) => ({
                      ...prev,
                      recipient: e.target.value,
                    }))
                  }
                />
              </label>
              <label>
                Θέμα
                <input
                  type="text"
                  value={outreachSendForm.subject}
                  onChange={(e) =>
                    setOutreachSendForm((prev) => ({
                      ...prev,
                      subject: e.target.value,
                    }))
                  }
                />
              </label>
              <label>
                Σημειώσεις (προαιρετικό)
                <textarea
                  value={outreachSendForm.notes}
                  onChange={(e) =>
                    setOutreachSendForm((prev) => ({
                      ...prev,
                      notes: e.target.value,
                    }))
                  }
                />
              </label>
              <p className="muted" style={{ gridColumn: "1 / -1", margin: 0 }}>
                Καταγράφει χειροκίνητη αποστολή εκτός εφαρμογής. Δεν αλλάζει την
                κατάσταση σε «Υποβλήθηκε» και δεν στέλνει email.
              </p>
              <div className="actions" style={{ gridColumn: "1 / -1" }}>
                <button
                  type="submit"
                  className="btn primary"
                  disabled={savingOutreachSent}
                >
                  {savingOutreachSent ? UI.loading : "Καταχώριση αποστολής"}
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setShowOutreachSendForm(false)}
                >
                  {UI.cancel}
                </button>
              </div>
            </form>
          ) : null}

          {renderDraftEditor("outreach")}
          {editingDraft === "outreach" ? (
            <p className="muted" style={{ marginTop: 8 }}>
              Πηγή αλήθειας: server (tenders.tekia.gr).{" "}
              {outreachDrive ? (
                <>
                  Το Google Doc είναι προαιρετικό αντίγραφο —{" "}
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => void openExternalUrl(outreachDrive.driveUrl)}
                  >
                    {UI.openInDrive}
                  </button>
                </>
              ) : null}
            </p>
          ) : null}

          {isOutreachReady ? (
            <div style={{ marginTop: 16 }}>
              <div className="actions">
                <button
                  type="button"
                  className="btn primary"
                  onClick={() => void handleApprove()}
                  disabled={
                    Boolean(tender.submission) ||
                    tender.currentStatus !== "READY" ||
                    tender.approvalStatus === "APPROVED"
                  }
                >
                  {UI.approve}
                </button>
                {tender.currentStatus !== "READY" &&
                tender.approvalStatus !== "APPROVED" ? (
                  <button
                    type="button"
                    className="btn"
                    onClick={() => void handleMarkReady()}
                    disabled={Boolean(tender.submission)}
                  >
                    {UI.markReady}
                  </button>
                ) : null}
              </div>
              <p className="muted" style={{ marginBottom: 0 }}>
                {UI.approveHelper}
              </p>
            </div>
          ) : null}

          <p className="muted" style={{ marginBottom: 0, marginTop: 12 }}>
            {UI.safetyCompact} {UI.safetyCloud}
          </p>
        </section>
      ) : null}

      {phase.isFormalStage && isDesktop() ? (
        <section className="card">
          <h3>Επίσημη Προσφορά</h3>
          <p className="muted" style={{ marginTop: 0 }}>
            {UI.safetyGenerate}
          </p>
          {renderFormalOfferControls()}

          {driveDocuments.length > 0 ? (
            <div style={{ marginTop: 16 }}>
              <h4>Δημιουργημένα έγγραφα</h4>
              <ul className="checklist">
                {driveDocuments.map((doc) => (
                  <li key={doc.id}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 12,
                      }}
                    >
                      <span>
                        {getGreekDriveDocTypeLabel(doc.type)} —{" "}
                        {getGreekDocumentStatusLabel(doc.status)}
                      </span>
                      <span className="actions" style={{ marginTop: 0 }}>
                        <button
                          type="button"
                          className="btn ghost"
                          onClick={() => void openExternalUrl(doc.driveUrl)}
                        >
                          {UI.openInDrive}
                        </button>
                        <button
                          type="button"
                          className="btn"
                          disabled={
                            doc.unresolvedPlaceholders.length > 0 ||
                            doc.status === "READY"
                          }
                          onClick={() => void handleMarkDriveDocReady(doc.id)}
                        >
                          {UI.markReady}
                        </button>
                      </span>
                    </div>
                    {doc.unresolvedPlaceholders.length > 0 ? (
                      <div className="muted">
                        {UI.missingPrefix}:{" "}
                        {doc.unresolvedPlaceholders.join(", ")}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {packageReadiness ? (
            <div style={{ marginTop: 12 }}>
              <strong>
                {UI.readiness} — {packageReadiness.summary}
              </strong>
              <h4>{UI.companyDocuments}</h4>
              <ul className="checklist">
                {packageReadiness.companyDocuments.map((row) => (
                  <li key={row.label}>
                    {row.status === "AVAILABLE" ? "✓" : "⚠"} {row.label} —{" "}
                    {getGreekDocumentStatusLabel(row.status)}
                    {row.detail ? ` (${row.detail})` : ""}
                  </li>
                ))}
              </ul>
              <h4>Δημιουργημένα έγγραφα</h4>
              <ul className="checklist">
                {packageReadiness.generatedDocuments.map((row) => (
                  <li key={row.label}>
                    {row.status === "DRAFT" || row.status === "READY" ? "✓" : "⚠"}{" "}
                    {row.label} — {getGreekDocumentStatusLabel(row.status)}
                    {row.detail ? ` (${row.detail})` : ""}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div style={{ marginTop: 16 }}>
            <div className="actions">
              <button
                type="button"
                className="btn"
                onClick={() => void handleMarkReady()}
                disabled={
                  Boolean(tender.submission) || tender.currentStatus === "READY"
                }
              >
                {UI.markReady}
              </button>
              <button
                type="button"
                className="btn primary"
                onClick={() => void handleApprove()}
                disabled={
                  Boolean(tender.submission) ||
                  tender.currentStatus !== "READY" ||
                  tender.approvalStatus === "APPROVED"
                }
              >
                {UI.approve}
              </button>
            </div>
            <p className="muted">
              {UI.safetyCompact} {UI.safetyCloud}
            </p>
            {tender.approvalStatus === "APPROVED" ? (
              <p className="alert-box">
                Εγκρίθηκε στις {formatDateTime(tender.approvedAt)}. Η αποστολή
                παραμένει μπλοκαρισμένη έως τοπική ρύθμιση.
              </p>
            ) : null}
          </div>
        </section>
      ) : null}

      {/* 4. Contact */}
      <form
        key={`details-${tender.referenceNumber}-${formRevision}`}
        className="card form-grid"
        onSubmit={(e) => void handleSaveContact(e)}
      >
        <h3>{UI.contactSection}</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          Στοιχεία του φορέα — όχι τα στοιχεία αποστολέα της TEKIA.
        </p>
        <div className="grid-2">
          <label>
            {UI.contactPerson}
            <input
              name="contact_name"
              value={contactForm.name}
              onChange={(e) =>
                setContactForm((prev) => ({ ...prev, name: e.target.value }))
              }
              placeholder={extractionEmptyLabel}
              autoComplete="off"
            />
          </label>
          <label>
            {UI.department}
            <input
              name="contact_department"
              value={contactForm.department}
              onChange={(e) =>
                setContactForm((prev) => ({
                  ...prev,
                  department: e.target.value,
                }))
              }
              placeholder={extractionEmptyLabel}
              autoComplete="off"
            />
          </label>
          <label>
            {UI.contactEmail}
            <input
              name="contact_email"
              value={contactForm.email}
              onChange={(e) =>
                setContactForm((prev) => ({ ...prev, email: e.target.value }))
              }
              placeholder={extractionEmptyLabel}
              autoComplete="off"
            />
          </label>
          <label>
            {UI.contactPhone}
            <input
              name="contact_phone"
              value={contactForm.phone}
              onChange={(e) =>
                setContactForm((prev) => ({ ...prev, phone: e.target.value }))
              }
              placeholder={extractionEmptyLabel}
              autoComplete="off"
            />
          </label>
        </div>
        <p className="muted" style={{ margin: 0 }}>
          Αποθηκευμένα: {displayOrMissing(tender.contact.name)} /{" "}
          {displayOrMissing(tender.contact.email)} /{" "}
          {displayOrMissing(tender.contact.phone)}
        </p>

        {/* 5. Compact scope */}
        <h3>{UI.scopeSummary}</h3>
        {!editingScope ? (
          <div>
            <p style={{ marginTop: 0 }}>
              {scopeDraft.trim() ? scopeDraft : UI.scopeEmpty}
            </p>
            <button
              type="button"
              className="btn"
              onClick={() => setEditingScope(true)}
            >
              {UI.edit}
            </button>
          </div>
        ) : (
          <label>
            {UI.scopeSummary}
            <textarea
              name="scope_summary"
              value={scopeDraft}
              onChange={(e) => setScopeDraft(e.target.value)}
              placeholder={UI.scopeEmpty}
            />
          </label>
        )}

        {/* Formal submission — open for PROC */}
        {phase.isFormalStage || Boolean(tender.submission) ? (
          <>
            <h3>{UI.formalSubmission}</h3>
            <p className="muted" style={{ marginTop: 0 }}>
              {UI.formalSubmissionHelper}
            </p>
            <div className="grid-2">
              <label>
                {UI.submissionMethod}
                <select
                  name="submission_method"
                  value={submissionForm.method}
                  onChange={(e) =>
                    setSubmissionForm((prev) => ({
                      ...prev,
                      method: e.target.value,
                    }))
                  }
                >
                  {["EMAIL", "PORTAL", "ESIDIS", "PHYSICAL", "OTHER", "UNKNOWN"].map(
                    (method) => (
                      <option key={method} value={method}>
                        {getGreekSubmissionMethodLabel(method)}
                      </option>
                    ),
                  )}
                </select>
              </label>
              <label>
                {UI.submissionEmail}
                <input
                  name="submission_email"
                  value={submissionForm.email}
                  onChange={(e) =>
                    setSubmissionForm((prev) => ({
                      ...prev,
                      email: e.target.value,
                    }))
                  }
                />
              </label>
              <label>
                {UI.portalOther}
                <input
                  name="submission_portal"
                  value={submissionForm.portal}
                  onChange={(e) =>
                    setSubmissionForm((prev) => ({
                      ...prev,
                      portal: e.target.value,
                    }))
                  }
                />
              </label>
              <label>
                {UI.instructions}
                <textarea
                  name="submission_instructions"
                  value={submissionForm.instructions}
                  onChange={(e) =>
                    setSubmissionForm((prev) => ({
                      ...prev,
                      instructions: e.target.value,
                    }))
                  }
                />
              </label>
            </div>
          </>
        ) : null}

        <div className="actions">
          <button
            type="submit"
            className="btn primary"
            disabled={savingDetails}
          >
            {savingDetails ? "Αποθήκευση…" : UI.save}
          </button>
        </div>
      </form>

      {/* 6. Current phase documents */}
      <section className="card">
        <h3>
          {phase.isEarlyStage ? UI.currentPhaseDocs : "Έλεγχος εγγράφων"}
        </h3>
        {phase.isEarlyStage ? (
          <p className="muted" style={{ marginTop: 0 }}>
            Στο Πρωτογενές Αίτημα αρκεί κυρίως το Εταιρικό Προφίλ.
          </p>
        ) : null}

        {vaultChecklist && vaultChecklist.length > 0 ? (
          <ul className="checklist">
            {(phase.isEarlyStage ? earlyVaultItems : vaultChecklist).map((item) => (
              <li key={item.key}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                  }}
                >
                  <span>
                    {item.status === "AVAILABLE" ? "✅" : "•"}{" "}
                    {getGreekChecklistLabel(item.key, item.label)}
                    <span className="muted">
                      {" "}
                      — {getGreekDocumentStatusLabel(item.status)}
                      {item.validUntil
                        ? ` · έως ${item.validUntil}`
                        : item.status === "AVAILABLE"
                          ? ` · ${item.note ?? getNoExpiryNote(item.key)}`
                          : item.note
                            ? ` · ${item.note}`
                            : ""}
                    </span>
                  </span>
                  {item.driveUrl ? (
                    <button
                      type="button"
                      className="btn ghost"
                      onClick={() => void openExternalUrl(item.driveUrl!)}
                    >
                      {UI.openInDrive}
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <ul className="checklist">
            {(phase.isEarlyStage
              ? earlyChecklistItems
              : tender.documentChecklist
            ).map((item) => (
              <li key={item.key}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                  }}
                >
                  <span>
                    {item.status === "AVAILABLE" ? "✅" : "•"}{" "}
                    {getGreekChecklistLabel(item.key, item.label)}
                    <span className="muted">
                      {" "}
                      — {getGreekDocumentStatusLabel(item.status)}
                    </span>
                  </span>
                  <select
                    aria-label={`${item.label} status`}
                    value={item.status}
                    onChange={(e) =>
                      void handleChecklistToggle(item.key, e.target.value)
                    }
                  >
                    {[
                      "AVAILABLE",
                      "MISSING",
                      "EXPIRED",
                      "REQUIRED",
                      "NOT_REQUIRED",
                      "UNKNOWN",
                    ].map((status) => (
                      <option key={status} value={status}>
                        {getGreekDocumentStatusLabel(status)}
                      </option>
                    ))}
                  </select>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 7. Collapsed secondary areas */}
      <details className="card">
        <summary>
          <strong>{UI.whyMatched}</strong>
        </summary>
        <ul className="trace-list" style={{ marginTop: 12 }}>
          {tender.decisionTrace.map((item) => (
            <li key={item.text} className={`tone-${item.tone}`}>
              {item.tone === "positive" ? "✅" : item.tone === "warning" ? "⚠" : "❌"}{" "}
              {item.text}
            </li>
          ))}
        </ul>
      </details>

      <details className="card">
        <summary>
          <strong>{UI.timeline}</strong>
        </summary>
        <ul className="timeline" style={{ marginTop: 12 }}>
          {tender.events.map((event) => (
            <li key={event.id}>
              <span className="muted">{formatTime(event.createdAt)}</span>
              <span>
                {getGreekEventTypeLabel(event.eventType)}
                {event.note ? ` — ${event.note}` : ""}
              </span>
            </li>
          ))}
        </ul>
      </details>

      {phase.isEarlyStage ? (
        <details className="card">
          <summary>
            <strong>
              {formalDriveDocs.length > 0
                ? UI.laterStageTestDocs
                : UI.laterStageDocs}
            </strong>
          </summary>
          <p className="muted">{UI.laterStageHelper}</p>
          {vaultChecklist && laterVaultItems.length > 0 ? (
            <ul className="checklist">
              {laterVaultItems.map((item) => (
                <li key={item.key}>
                  {getGreekChecklistLabel(item.key, item.label)}
                  <span className="muted"> — Δεν απαιτείται σε αυτό το στάδιο</span>
                </li>
              ))}
            </ul>
          ) : (
            <ul className="checklist">
              {laterChecklistItems.map((item) => (
                <li key={item.key}>
                  {getGreekChecklistLabel(item.key, item.label)}
                  <span className="muted"> — Δεν απαιτείται σε αυτό το στάδιο</span>
                </li>
              ))}
            </ul>
          )}
          {formalDriveDocs.length > 0 ? (
            <ul className="checklist">
              {formalDriveDocs.map((doc) => (
                <li key={doc.id}>
                  {getGreekDriveDocTypeLabel(doc.type)} —{" "}
                  {getGreekDocumentStatusLabel(doc.status)}{" "}
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => void openExternalUrl(doc.driveUrl)}
                  >
                    {UI.openInDrive}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </details>
      ) : null}

      {phase.isEarlyStage ? (
        <details className="card">
          <summary>
            <strong>{UI.formalSubmission}</strong>
          </summary>
          <p className="muted">{UI.formalSubmissionHelper}</p>
          <form
            className="form-grid"
            onSubmit={(e) => void handleSaveSubmissionOnly(e)}
          >
            <div className="grid-2">
              <label>
                {UI.submissionMethod}
                <select
                  name="submission_method"
                  value={submissionForm.method}
                  onChange={(e) =>
                    setSubmissionForm((prev) => ({
                      ...prev,
                      method: e.target.value,
                    }))
                  }
                >
                  {["EMAIL", "PORTAL", "ESIDIS", "PHYSICAL", "OTHER", "UNKNOWN"].map(
                    (method) => (
                      <option key={method} value={method}>
                        {getGreekSubmissionMethodLabel(method)}
                      </option>
                    ),
                  )}
                </select>
              </label>
              <label>
                {UI.submissionEmail}
                <input
                  name="submission_email"
                  value={submissionForm.email}
                  onChange={(e) =>
                    setSubmissionForm((prev) => ({
                      ...prev,
                      email: e.target.value,
                    }))
                  }
                />
              </label>
              <label>
                {UI.portalOther}
                <input
                  name="submission_portal"
                  value={submissionForm.portal}
                  onChange={(e) =>
                    setSubmissionForm((prev) => ({
                      ...prev,
                      portal: e.target.value,
                    }))
                  }
                />
              </label>
              <label>
                {UI.instructions}
                <textarea
                  name="submission_instructions"
                  value={submissionForm.instructions}
                  onChange={(e) =>
                    setSubmissionForm((prev) => ({
                      ...prev,
                      instructions: e.target.value,
                    }))
                  }
                />
              </label>
            </div>
            <div className="actions">
              <button
                type="submit"
                className="btn primary"
                disabled={savingDetails}
              >
                {savingDetails ? "Αποθήκευση…" : UI.save}
              </button>
            </div>
          </form>
        </details>
      ) : null}

      {!tender.submission ? (
        <details className="card">
          <summary>
            <strong>{UI.moreActions}</strong>
          </summary>
          <p className="muted">{UI.recordSubmissionHelper}</p>
          {!showRecordForm ? (
            <button
              type="button"
              className="btn"
              onClick={() => setShowRecordForm(true)}
            >
              {UI.recordSubmission}
            </button>
          ) : (
            <form
              className="form-grid"
              onSubmit={(e) => void handleRecordSubmission(e)}
            >
              <label>
                Ημερομηνία υποβολής
                <input
                  name="submitted_at"
                  type="datetime-local"
                  required
                  defaultValue={new Date().toISOString().slice(0, 16)}
                />
              </label>
              <label>
                Τρόπος
                <select name="submission_method" required defaultValue="EMAIL">
                  {["EMAIL", "PORTAL", "ESIDIS", "PHYSICAL", "OTHER"].map(
                    (method) => (
                      <option key={method} value={method}>
                        {getGreekSubmissionMethodLabel(method)}
                      </option>
                    ),
                  )}
                </select>
              </label>
              <label>
                Παραλήπτης
                <input name="recipient" />
              </label>
              <label>
                Θέμα
                <input name="subject" />
              </label>
              <label>
                Ποσό χωρίς ΦΠΑ
                <input name="amount_without_vat" type="number" />
              </label>
              <label>
                Εξωτερική / αριθμός πρωτοκόλλου
                <input name="external_reference" />
              </label>
              <label>
                Σημειώσεις
                <textarea name="notes" />
              </label>
              <div className="actions">
                <button type="submit" className="btn primary">
                  Επιβεβαίωση καταχώρισης
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setShowRecordForm(false)}
                >
                  {UI.cancel}
                </button>
              </div>
            </form>
          )}
        </details>
      ) : null}
    </div>
  );
};
