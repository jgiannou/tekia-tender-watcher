import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  api,
  isDesktop,
  openExternalUrl,
  type DraftPackage,
  type TenderDetail,
} from "../api";
import { TenderPhaseCard } from "../components/TenderPhaseCard";
import { ToastStack, type ToastItem, type ToastKind } from "../components/ToastStack";
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
import {
  buildOutreachDraftContent,
  hashOutreachContent,
  type MergeContext,
} from "../../../desktop/electron/google/template-merge";

const draftKeys = ["outreach", "technical", "economic", "declarations"] as const;
type DraftKey = (typeof draftKeys)[number];

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
  lastSyncedHash?: string | null;
};

type OutreachSyncState = "unknown" | "synced" | "stale" | "syncing" | "error";

export const TenderDetailPage = () => {
  const { referenceNumber = "" } = useParams();
  const [tender, setTender] = useState<TenderDetail | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [showRecordForm, setShowRecordForm] = useState(false);
  const [showOutreachSendForm, setShowOutreachSendForm] = useState(false);
  const [outreachSendForm, setOutreachSendForm] = useState({
    sentAt: "",
    recipient: "",
    subject: "",
    notes: "",
  });
  const [savingOutreachSent, setSavingOutreachSent] = useState(false);
  const [draftEditorKey, setDraftEditorKey] = useState(0);
  const [loadingDriveText, setLoadingDriveText] = useState(false);
  const [editingDraft, setEditingDraft] = useState<DraftKey | null>(null);
  const [editingScope, setEditingScope] = useState(false);
  const [outreachSync, setOutreachSync] = useState<OutreachSyncState>("unknown");
  const autoSyncedRef = useRef<string | null>(null);
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

  const pushToast = useCallback(
    (kind: ToastKind, message: string, sticky = false) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setToasts((prev) => [...prev.slice(-4), { id, kind, message, sticky }]);
    },
    [],
  );

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

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
    } catch (err) {
      pushToast("error", err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [referenceNumber]);

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
      pushToast("info", "Η προετοιμασία φακέλου προσφοράς είναι διαθέσιμη στην desktop εφαρμογή.");
      return;
    }
    try {
      const result = (await window.tekia.drive.packageReadiness(
        referenceNumber,
      )) as PackageReadiness;
      if (result?.__tekiaError) {
        pushToast("error", result.message ?? "Αποτυχία ελέγχου ετοιμότητας");
        return;
      }
      setPackageReadiness(result);
      pushToast("info", `Ετοιμότητα φακέλου: ${result.summary}. Δεν στάλθηκε τίποτα.`);
    } catch (err) {
      pushToast("error", err instanceof Error ? err.message : String(err));
    }
  };

  const handleCreateWorkspace = async () => {
    if (!isDesktop() || !window.tekia?.drive) return;
    try {
      const result = (await window.tekia.drive.createWorkspace(
        referenceNumber,
      )) as { webViewLink?: string; __tekiaError?: boolean; message?: string };
      if (result?.__tekiaError) {
        pushToast("error", result.message ?? "Αποτυχία δημιουργίας φακέλου");
        return;
      }
      pushToast("info", "Δημιουργήθηκε φάκελος διαγωνισμού στο Drive (Submissions/{ADAM}/).");
      if (result.webViewLink) void openExternalUrl(result.webViewLink);
    } catch (err) {
      pushToast("error", err instanceof Error ? err.message : String(err));
    }
  };

  const refreshDriveDocuments = async (): Promise<DriveDoc[]> => {
    if (!isDesktop() || !window.tekia?.drive?.tenderDocuments) return [];
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
      lastSyncedHash?: string | null;
    }>;
    if (rows && typeof rows === "object" && "__tekiaError" in (rows as object)) {
      return [];
    }
    const mapped = (rows ?? []).map((r) => ({
      ...r,
      unresolvedPlaceholders: r.unresolvedPlaceholders ?? [],
      lastSyncedHash: r.lastSyncedHash ?? null,
    }));
    setDriveDocuments(mapped);
    return mapped;
  };

  const evaluateOutreachSync = (
    subject: string | null | undefined,
    body: string | null | undefined,
    drive: DriveDoc | undefined,
  ): OutreachSyncState => {
    if (!drive) return "unknown";
    if (!subject && !body) return "unknown";
    const hash = hashOutreachContent(subject ?? "", body ?? "");
    if (!drive.lastSyncedHash) return "stale";
    return drive.lastSyncedHash === hash ? "synced" : "stale";
  };

  useEffect(() => {
    void refreshDriveDocuments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [referenceNumber]);

  useEffect(() => {
    if (!tender) return;
    const drive = driveDocuments.find((d) => OUTREACH_DRIVE_DOC_TYPES.has(d.type));
    setOutreachSync(
      evaluateOutreachSync(
        tender.drafts.outreach.subject,
        tender.drafts.outreach.body,
        drive,
      ),
    );
  }, [tender, driveDocuments]);

  const syncOutreachToDrive = async (
    subject: string,
    body: string,
  ): Promise<boolean> => {
    if (!isDesktop() || !window.tekia?.drive?.syncOutreachContent) {
      pushToast(
        "warning",
        "Ο συγχρονισμός Drive είναι διαθέσιμος μόνο στην desktop εφαρμογή.",
      );
      return false;
    }
    setOutreachSync("syncing");
    setBusyAction("syncOutreach");
    try {
      const result = (await window.tekia.drive.syncOutreachContent(
        referenceNumber,
        subject,
        body,
      )) as {
        __tekiaError?: boolean;
        message?: string;
        contentSynced?: boolean;
        lastSyncedHash?: string | null;
        reusedExisting?: boolean;
      };
      if (result?.__tekiaError) {
        setOutreachSync("error");
        pushToast(
          "error",
          `${UI.driveSyncFailed}: ${result.message ?? "άγνωστο σφάλμα"}`,
          true,
        );
        return false;
      }
      await refreshDriveDocuments();
      setOutreachSync(result.contentSynced ? "synced" : "stale");
      pushToast(
        "success",
        result.reusedExisting
          ? `${UI.driveSynced} (ενημερώθηκε το υπάρχον έγγραφο).`
          : `${UI.driveSynced} (δημιουργήθηκε νέο έγγραφο).`,
      );
      return Boolean(result.contentSynced);
    } catch (err) {
      setOutreachSync("error");
      pushToast(
        "error",
        `${UI.driveSyncFailed}: ${err instanceof Error ? err.message : String(err)}`,
        true,
      );
      return false;
    } finally {
      setBusyAction(null);
    }
  };

  // One-shot repair for existing mismatched Drive copies (e.g. 26REQ019873897).
  useEffect(() => {
    if (!isDesktop() || !tender || busyAction) return;
    const drive = driveDocuments.find((d) => OUTREACH_DRIVE_DOC_TYPES.has(d.type));
    const subject = tender.drafts.outreach.subject;
    const body = tender.drafts.outreach.body;
    if (!drive || !subject || !body) return;
    const state = evaluateOutreachSync(subject, body, drive);
    if (state !== "stale") return;
    if (autoSyncedRef.current === referenceNumber) return;
    autoSyncedRef.current = referenceNumber;
    void syncOutreachToDrive(subject, body);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tender, driveDocuments, referenceNumber]);

  const saveOutreachDraftFromContent = async (
    content: {
      subject: string;
      body: string;
      unresolvedKeys?: string[];
    },
    options?: { force?: boolean; syncDrive?: boolean },
  ): Promise<boolean> => {
    if (!tender) return false;
    const current = tender.drafts.outreach;
    if (current.manualEdited && !options?.force) {
      const ok = window.confirm(UI.regenerateOutreachConfirm);
      if (!ok) return false;
    }

    const next: DraftPackage = {
      ...current,
      status: current.status === "NOT_STARTED" ? "DRAFT" : current.status,
      subject: content.subject,
      body: content.body,
      manualEdited: false,
      updatedAt: new Date().toISOString(),
    };

    const result = await api.patchTender(referenceNumber, {
      drafts: { outreach: next },
    });
    setTender(result.tender);
    setEditingDraft("outreach");
    if (content.unresolvedKeys?.length) {
      pushToast(
        "warning",
        `${UI.unresolvedDraftWarning}: ${content.unresolvedKeys.join(", ")}`,
      );
    }

    if (options?.syncDrive !== false && isDesktop()) {
      await syncOutreachToDrive(content.subject, content.body);
    }
    return true;
  };

  const buildLocalOutreachDraft = async () => {
    if (!tender) return null;
    let company = {
      contact_name: "",
      email: "",
      phone: "",
      legal_name: "",
      brand_name: "TEKIA",
    };
    try {
      if (isDesktop() && window.tekia?.companySettings?.get) {
        const local = await window.tekia.companySettings.get();
        const localCompany = local?.company as Partial<typeof company> | undefined;
        if (localCompany) company = { ...company, ...localCompany };
      } else {
        const settings = await api.settings();
        company = { ...company, ...settings.company };
      }
    } catch {
      // keep defaults — never invent contact/legal beyond empty/brand default
    }

    const ctx: MergeContext = {
      organization: tender.organization,
      tenderTitle: tender.title,
      adam: tender.referenceNumber,
      recordType: tender.recordType,
      contactName: company.contact_name || null,
      contactEmail: company.email || null,
      contactPhone: company.phone || null,
      legalName: company.legal_name || null,
      brandName: company.brand_name || null,
      date: new Date().toLocaleDateString("el-GR"),
    };
    return buildOutreachDraftContent(ctx);
  };

  const handleCopyTemplate = async (
    templateKey:
      | "earlyOutreach"
      | "technicalOffer"
      | "economicOffer"
      | "declarations",
    options?: { forceDraftOverwrite?: boolean },
  ) => {
    if (!isDesktop() || !window.tekia?.drive) return;

    if (templateKey === "economicOffer") {
      const missing = Object.entries(economicValues).filter(
        ([key, value]) => key !== "NOTES" && !value.trim(),
      );
      if (missing.length > 0) {
        pushToast(
          "error",
          `Η Οικονομική Προσφορά απαιτεί τιμές από τον χρήστη πριν τη συγχώνευση: ${missing
            .map(([k]) => k)
            .join(", ")}`,
        );
        return;
      }
    }

    if (templateKey === "declarations") {
      if (!declarationValues.DECLARATION_TEXT.trim()) {
        pushToast(
          "error",
          "Η Δήλωση απαιτεί DECLARATION_TEXT από τον διαγωνισμό / χρήστη — χωρίς επινόηση.",
        );
        return;
      }
    }

    if (
      templateKey === "earlyOutreach" &&
      tender?.drafts.outreach.manualEdited &&
      !options?.forceDraftOverwrite
    ) {
      const ok = window.confirm(UI.regenerateOutreachConfirm);
      if (!ok) return;
    }

    const operatorValues =
      templateKey === "economicOffer"
        ? economicValues
        : templateKey === "declarations"
          ? declarationValues
          : templateKey === "technicalOffer"
            ? technicalValues
            : undefined;

    setBusyAction(`copy:${templateKey}`);
    try {
      let outreachContent: { subject: string; body: string } | undefined;
      if (templateKey === "earlyOutreach") {
        const local = await buildLocalOutreachDraft();
        if (!local) {
          pushToast("error", "Δεν ήταν δυνατή η δημιουργία προχείρου από το πρότυπο.");
          return;
        }
        outreachContent = { subject: local.subject, body: local.body };
        // App first (source of truth), Drive second from the same payload.
        await saveOutreachDraftFromContent(local, {
          force: true,
          syncDrive: false,
        });
      }

      const result = (await window.tekia.drive.copyTemplate(
        referenceNumber,
        templateKey,
        operatorValues,
        outreachContent,
      )) as {
        name?: string;
        driveUrl?: string;
        masterUntouched?: boolean;
        masterFileId?: string;
        driveFileId?: string;
        unresolvedPlaceholders?: string[];
        replacedKeys?: string[];
        reusedExisting?: boolean;
        contentSynced?: boolean;
        outreachDraft?: {
          subject: string;
          body: string;
          unresolvedKeys: string[];
        };
        __tekiaError?: boolean;
        message?: string;
      };
      if (result?.__tekiaError) {
        if (templateKey === "earlyOutreach") setOutreachSync("error");
        pushToast(
          "error",
          result.message ?? "Αποτυχία αντιγραφής / συγχώνευσης προτύπου",
          true,
        );
        return;
      }
      if (
        result.masterFileId &&
        result.driveFileId &&
        result.masterFileId === result.driveFileId
      ) {
        pushToast(
          "error",
          "Σφάλμα ασφαλείας: το master και το αντίγραφο έχουν το ίδιο ID",
        );
        return;
      }
      const unresolved = result.unresolvedPlaceholders ?? [];
      await refreshDriveDocuments();
      if (templateKey === "earlyOutreach") {
        setOutreachSync(result.contentSynced ? "synced" : "stale");
        pushToast(
          "success",
          `${result.reusedExisting ? "Ενημερώθηκε" : "Δημιουργήθηκε"} το Drive document από το ίδιο περιεχόμενο με το app. ${UI.safetyGenerate} ${
            unresolved.length
              ? `Εκκρεμή πεδία: ${unresolved.join(", ")}.`
              : "Χωρίς εκκρεμή πεδία."
          }`,
        );
      } else {
        pushToast(
          "info",
          `Δημιουργήθηκε αντίγραφο «${result.name}» (το master δεν άλλαξε). ${UI.safetyGenerate} ${
            unresolved.length
              ? `Εκκρεμή πεδία: ${unresolved.join(", ")} — παραμένει Πρόχειρο.`
              : "Δεν υπάρχουν εκκρεμή πεδία."
          }`,
        );
        if (result.driveUrl) void openExternalUrl(result.driveUrl);
      }
    } catch (err) {
      if (templateKey === "earlyOutreach") setOutreachSync("error");
      pushToast("error", err instanceof Error ? err.message : String(err), true);
    } finally {
      setBusyAction(null);
    }
  };

  const handleMarkDriveDocReady = async (documentId: string) => {
    if (!window.tekia?.drive?.markDocumentReady) return;
    if (outreachSync === "stale" || outreachSync === "error") {
      pushToast("warning", UI.readyBlockedOutOfSync, true);
      return;
    }
    setBusyAction("markDriveReady");
    try {
      const result = (await window.tekia.drive.markDocumentReady(documentId)) as {
        __tekiaError?: boolean;
        message?: string;
        status?: string;
      };
      if (result?.__tekiaError) {
        pushToast("error", result.message ?? "Δεν μπορεί να σημανθεί ως Έτοιμο");
        return;
      }
      // Keep app draft status in lockstep when Drive is Ready
      if (tender) {
        const patched = await api.patchTender(referenceNumber, {
          drafts: {
            outreach: {
              ...tender.drafts.outreach,
              status: "READY",
              updatedAt: new Date().toISOString(),
            },
          },
        });
        setTender(patched.tender);
      }
      pushToast(
        "success",
        `Το έγγραφο σημειώθηκε ως ${getGreekDocumentStatusLabel(result.status ?? "READY")}. ${UI.safetyReady}`,
      );
      await refreshDriveDocuments();
    } catch (err) {
      pushToast("error", err instanceof Error ? err.message : String(err));
    } finally {
      setBusyAction(null);
    }
  };

  const handleSaveContact = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!tender || savingDetails) return;
    setSavingDetails(true);
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
      pushToast("info", 
        result.approvalInvalidated
          ? "Αποθηκεύτηκε. Η έγκριση ακυρώθηκε λόγω ουσιαστικών αλλαγών."
          : "Αποθηκεύτηκε.",
      );
    } catch (err) {
      pushToast("error", err instanceof Error ? err.message : String(err));
    } finally {
      setSavingDetails(false);
    }
  };

  const handleSaveSubmissionOnly = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!tender || savingDetails) return;
    setSavingDetails(true);
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
      pushToast(
        "info",
        result.approvalInvalidated
          ? "Αποθηκεύτηκε. Η έγκριση ακυρώθηκε λόγω ουσιαστικών αλλαγών."
          : "Αποθηκεύτηκε.",
      );
    } catch (err) {
      pushToast("error", err instanceof Error ? err.message : String(err));
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
      pushToast("error", err instanceof Error ? err.message : String(err));
    }
  };

  const handlePrepareOutreach = async () => {
    if (!tender) return;
    setBusyAction("prepareOutreach");
    try {
      const existingDrive = driveDocuments.find((d) =>
        OUTREACH_DRIVE_DOC_TYPES.has(d.type),
      );

      // Always (re)build from template into app, then sync the same text to Drive.
      if (isDesktop() && window.tekia?.drive) {
        await handleCopyTemplate("earlyOutreach", {
          forceDraftOverwrite: !tender.drafts.outreach.manualEdited,
        });
        return;
      }

      const content = await buildLocalOutreachDraft();
      if (content) {
        await saveOutreachDraftFromContent(content, { syncDrive: false });
        pushToast("success", "Το πρόχειρο συμπληρώθηκε από το πρότυπο.");
      }
      if (existingDrive) void openExternalUrl(existingDrive.driveUrl);
      setEditingDraft("outreach");
    } catch (err) {
      pushToast("error", err instanceof Error ? err.message : String(err));
    } finally {
      setBusyAction(null);
    }
  };

  const handleRegenerateOutreach = async () => {
    if (!tender) return;
    if (tender.drafts.outreach.manualEdited) {
      const ok = window.confirm(UI.regenerateOutreachConfirm);
      if (!ok) return;
    }
    if (isDesktop() && window.tekia?.drive) {
      await handleCopyTemplate("earlyOutreach", { forceDraftOverwrite: true });
      return;
    }
    const content = await buildLocalOutreachDraft();
    if (content) {
      try {
        await saveOutreachDraftFromContent(content, {
          force: true,
          syncDrive: false,
        });
        pushToast("success", "Το πρόχειρο επαναδημιουργήθηκε από το πρότυπο.");
      } catch (err) {
        pushToast("error", err instanceof Error ? err.message : String(err));
      }
    }
  };

  const handleSaveDraft = async (
    event: FormEvent<HTMLFormElement>,
    key: DraftKey,
  ) => {
    event.preventDefault();
    if (!tender) return;
    const form = new FormData(event.currentTarget);
    const next: DraftPackage = {
      ...tender.drafts[key],
      status: String(form.get("status") || "DRAFT") as DraftPackage["status"],
      subject: String(form.get("subject") || "") || null,
      body: String(form.get("body") || "") || null,
      notes: String(form.get("notes") || "") || null,
      amountWithoutVat: form.get("amountWithoutVat")
        ? Number(form.get("amountWithoutVat"))
        : null,
      manualEdited: key === "outreach" ? true : tender.drafts[key].manualEdited,
      updatedAt: new Date().toISOString(),
    };
    setBusyAction(`saveDraft:${key}`);
    try {
      const result = await api.patchTender(referenceNumber, {
        drafts: { [key]: next },
      });
      setTender(result.tender);
      setEditingDraft(null);

      if (key === "outreach" && next.subject && next.body && isDesktop()) {
        const synced = await syncOutreachToDrive(next.subject, next.body);
        pushToast(
          synced ? "success" : "warning",
          synced
            ? "Αποθηκεύτηκε και συγχρονίστηκε με το Drive."
            : `${UI.driveOutOfSync} ${UI.syncDriveRetry}.`,
          !synced,
        );
      } else {
        pushToast(
          "info",
          result.approvalInvalidated
            ? "Αποθηκεύτηκε. Η έγκριση ακυρώθηκε λόγω ουσιαστικών αλλαγών."
            : "Το πρόχειρο αποθηκεύτηκε.",
        );
      }
    } catch (err) {
      pushToast("error", err instanceof Error ? err.message : String(err));
    } finally {
      setBusyAction(null);
    }
  };

  const handleMarkDraftReady = async (key: DraftKey) => {
    if (!tender) return;
    const linkedOutreach = driveDocuments.find((d) =>
      OUTREACH_DRIVE_DOC_TYPES.has(d.type),
    );
    if (key === "outreach") {
      if (outreachSync === "stale" || outreachSync === "error") {
        const subject = tender.drafts.outreach.subject;
        const body = tender.drafts.outreach.body;
        if (isDesktop() && subject && body) {
          const synced = await syncOutreachToDrive(subject, body);
          if (!synced) {
            pushToast("warning", UI.readyBlockedOutOfSync, true);
            return;
          }
        } else {
          pushToast("warning", UI.readyBlockedOutOfSync, true);
          return;
        }
      }
    }

    const draft = tender.drafts[key];
    setBusyAction(`markReady:${key}`);
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
      if (key === "outreach" && linkedOutreach && window.tekia?.drive?.markDocumentReady) {
        if (outreachSync !== "synced") {
          // already synced above when stale; re-check after sync
        }
        const mark = (await window.tekia.drive.markDocumentReady(
          linkedOutreach.id,
        )) as { __tekiaError?: boolean; message?: string };
        if (mark?.__tekiaError) {
          pushToast(
            "warning",
            `App: Έτοιμο, αλλά Drive όχι — ${mark.message ?? UI.driveOutOfSync}`,
            true,
          );
          setOutreachSync("error");
          return;
        }
        await refreshDriveDocuments();
      }
      pushToast(
        "success",
        result.approvalInvalidated
          ? `Σημάνθηκε ως Έτοιμο. Η έγκριση ακυρώθηκε. ${UI.safetyReady}`
          : `${getGreekDraftLabel(key)}: Έτοιμο. ${UI.safetyReady}`,
      );
    } catch (err) {
      pushToast("error", err instanceof Error ? err.message : String(err));
    } finally {
      setBusyAction(null);
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
      pushToast("info", `Σημάνθηκε ως Έτοιμο. ${UI.safetyReady}`);
    } catch (err) {
      pushToast("error", err instanceof Error ? err.message : String(err));
    }
  };

  const handleApprove = async () => {
    try {
      const result = await api.approve(referenceNumber);
      setTender(result.tender);
      pushToast("info", 
        `Εγκρίθηκε. ${UI.safetyApprove} Η αποστολή παραμένει μη διαθέσιμη έως ότου ρυθμιστεί τοπικά.`,
      );
    } catch (err) {
      pushToast("error", err instanceof Error ? err.message : String(err));
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
    try {
      const sentAt = new Date(outreachSendForm.sentAt).toISOString();
      if (Number.isNaN(new Date(outreachSendForm.sentAt).getTime())) {
        pushToast("error", "Μη έγκυρη ημερομηνία αποστολής");
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
      pushToast("success", 
        `Η Εκδήλωση Ενδιαφέροντος καταχωρήθηκε ως σταλμένη. Παρακολούθηση ενεργή. ${UI.safetyOutreachSent}`,
      );
    } catch (err) {
      pushToast("error", err instanceof Error ? err.message : String(err));
    } finally {
      setSavingOutreachSent(false);
    }
  };

  const handleConfirmRelation = async (procAdam: string) => {
    try {
      await api.confirmRelation(procAdam);
      // Reload current tender (REQ or PROC) to refresh linked cards
      await load(false);
      pushToast("success", `Επιβεβαιώθηκε η σύνδεση με ${procAdam}.`);
    } catch (err) {
      pushToast("error", err instanceof Error ? err.message : String(err));
    }
  };

  const handleDismissRelation = async (procAdam: string) => {
    try {
      await api.dismissRelation(procAdam);
      await load(false);
      pushToast("success", `Απορρίφθηκε η πιθανή σύνδεση με ${procAdam}.`);
    } catch (err) {
      pushToast("error", err instanceof Error ? err.message : String(err));
    }
  };


  const handleReloadOutreachFromDrive = async () => {
    if (!tender) return;
    const driveDoc = driveDocuments.find((d) =>
      OUTREACH_DRIVE_DOC_TYPES.has(d.type),
    );
    if (!driveDoc || !isDesktop() || !window.tekia?.drive?.readDocument) {
      pushToast("error", "Δεν υπάρχει Google Doc για φόρτωση από το Drive.");
      return;
    }
    const confirmed = window.confirm(
      "Το περιεχόμενο του πρόχειρου θα αντικατασταθεί με το κείμενο του Google Doc. Συνέχεια;",
    );
    if (!confirmed) return;

    setLoadingDriveText(true);
    try {
      const result = (await window.tekia.drive.readDocument(driveDoc.id)) as {
        subject?: string | null;
        body?: string;
        __tekiaError?: boolean;
        message?: string;
      };
      if (result?.__tekiaError) {
        pushToast("error", result.message ?? "Αποτυχία ανάγνωσης από το Drive");
        return;
      }
      const current = tender.drafts.outreach;
      const next: DraftPackage = {
        ...current,
        status: current.status === "NOT_STARTED" ? "DRAFT" : current.status,
        subject: (result.subject ?? current.subject ?? "").trim() || null,
        body: result.body?.trim() ? result.body : current.body ?? null,
        manualEdited: true,
        updatedAt: new Date().toISOString(),
      };
      const saved = await api.patchTender(referenceNumber, {
        drafts: { outreach: next },
      });
      setTender(saved.tender);
      setDraftEditorKey((n) => n + 1);
      setEditingDraft("outreach");
      setOutreachSync("synced");
      pushToast("success", "Φορτώθηκε από το Google Doc και αποθηκεύτηκε.");
    } catch (err) {
      pushToast("error", err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingDriveText(false);
    }
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
      pushToast("info", "Η υποβολή καταχωρίστηκε. Κατάσταση: Υποβλήθηκε.");
    } catch (err) {
      pushToast("error", err instanceof Error ? err.message : String(err));
    }
  };

  if (loading) return <p className="muted">{UI.loading}</p>;
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
    if (editingDraft !== key) return null;
    const draft = tender.drafts[key];
    return (
      <form
        key={`${key}-${draftEditorKey}`}
        className="form-grid"
        style={{ width: "100%", marginTop: 10 }}
        onSubmit={(e) => void handleSaveDraft(e, key)}
      >
        <label>
          Κατάσταση
          <select name="status" defaultValue={draft.status}>
            <option value="DRAFT">Πρόχειρο</option>
            <option value="READY">Έτοιμο</option>
            <option value="SENT">Στάλθηκε</option>
            <option value="NOT_STARTED">Δεν έχει ξεκινήσει</option>
          </select>
        </label>
        <label>
          Θέμα
          <input name="subject" defaultValue={draft.subject ?? ""} />
        </label>
        <label>
          Περιεχόμενο
          <textarea name="body" defaultValue={draft.body ?? ""} />
        </label>
        <label>
          Σημειώσεις
          <textarea name="notes" defaultValue={draft.notes ?? ""} />
        </label>
        {key === "economic" ? (
          <label>
            Ποσό χωρίς ΦΠΑ
            <input
              name="amountWithoutVat"
              type="number"
              defaultValue={draft.amountWithoutVat ?? ""}
            />
          </label>
        ) : null}
        <div className="actions">
          <button type="submit" className="btn primary">
            {UI.save}
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => setEditingDraft(null)}
          >
            {UI.close}
          </button>
          {key === "outreach" &&
          isDesktop() &&
          driveDocuments.some((d) => OUTREACH_DRIVE_DOC_TYPES.has(d.type)) ? (
            <button
              type="button"
              className="btn"
              disabled={loadingDriveText || Boolean(busyAction)}
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

      {toasts.length > 0 ? (
        <ToastStack toasts={toasts} onDismiss={dismissToast} />
      ) : null}

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
                Κατάσταση:{" "}
                <strong>
                  {outreachSync === "stale" || outreachSync === "error"
                    ? "Πρόχειρο (Drive μη συγχρονισμένο)"
                    : outreachStatusLabel}
                </strong>
              </p>
              {isDesktop() ? (
                <p style={{ margin: "8px 0 0" }}>
                  <span
                    className={`sync-pill ${
                      outreachSync === "synced"
                        ? "is-synced"
                        : outreachSync === "syncing"
                          ? "is-syncing"
                          : outreachSync === "stale" || outreachSync === "error"
                            ? "is-stale"
                            : ""
                    }`}
                  >
                    {outreachSync === "syncing" ? (
                      <span className="spinner" aria-hidden />
                    ) : null}
                    {outreachSync === "synced"
                      ? UI.driveSynced
                      : outreachSync === "syncing"
                        ? UI.driveSyncing
                        : outreachSync === "error"
                          ? UI.driveSyncFailed
                          : outreachSync === "stale"
                            ? UI.driveOutOfSync
                            : "Drive: —"}
                  </span>
                </p>
              ) : null}
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
                className={`btn primary${busyAction === "prepareOutreach" || busyAction === "copy:earlyOutreach" ? " is-busy" : ""}`}
                disabled={Boolean(busyAction)}
                onClick={() => void handlePrepareOutreach()}
              >
                {(busyAction === "prepareOutreach" ||
                  busyAction === "copy:earlyOutreach") && (
                  <span className="spinner" aria-hidden />
                )}
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
                  onClick={() => setEditingDraft("outreach")}
                  disabled={Boolean(busyAction)}
                >
                  {UI.edit}
                </button>
                <button
                  type="button"
                  className={`btn${busyAction === "copy:earlyOutreach" ? " is-busy" : ""}`}
                  disabled={Boolean(busyAction)}
                  onClick={() => void handleRegenerateOutreach()}
                >
                  {busyAction === "copy:earlyOutreach" ? (
                    <span className="spinner" aria-hidden />
                  ) : null}
                  {UI.regenerateOutreach}
                </button>
                {(outreachSync === "stale" || outreachSync === "error") &&
                outreachDraft.subject &&
                outreachDraft.body ? (
                  <button
                    type="button"
                    className={`btn primary${busyAction === "syncOutreach" ? " is-busy" : ""}`}
                    disabled={Boolean(busyAction)}
                    onClick={() =>
                      void syncOutreachToDrive(
                        outreachDraft.subject!,
                        outreachDraft.body!,
                      )
                    }
                  >
                    {busyAction === "syncOutreach" ? (
                      <span className="spinner" aria-hidden />
                    ) : null}
                    {outreachSync === "error"
                      ? UI.syncDriveRetry
                      : UI.syncDrive}
                  </button>
                ) : null}
                {outreachDrive && outreachDrive.status !== "READY" ? (
                  <button
                    type="button"
                    className={`btn${busyAction === "markDriveReady" ? " is-busy" : ""}`}
                    disabled={
                      Boolean(busyAction) ||
                      outreachDrive.unresolvedPlaceholders.length > 0 ||
                      outreachSync === "stale" ||
                      outreachSync === "error" ||
                      outreachSync === "syncing"
                    }
                    onClick={() => void handleMarkDriveDocReady(outreachDrive.id)}
                  >
                    {busyAction === "markDriveReady" ? (
                      <span className="spinner" aria-hidden />
                    ) : null}
                    {UI.markReady}
                  </button>
                ) : null}
                {!outreachDrive &&
                outreachDraft.status !== "READY" &&
                outreachDraft.status !== "SENT" ? (
                  <button
                    type="button"
                    className="btn"
                    disabled={Boolean(busyAction)}
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
                    disabled={Boolean(busyAction)}
                    onClick={() => void handleCopyTemplate("earlyOutreach")}
                  >
                    {UI.generateDriveDoc}
                  </button>
                ) : null}
              </>
            )}
          </div>

          {outreachDraft.subject || outreachDraft.body ? (
            <div style={{ marginTop: 16 }}>
              <div className="meta-item" style={{ display: "block" }}>
                <span className="k">{UI.subjectLabel}</span>
                <p style={{ margin: "4px 0 12px", whiteSpace: "pre-wrap" }}>
                  {outreachDraft.subject || "—"}
                </p>
              </div>
              <div className="meta-item" style={{ display: "block" }}>
                <span className="k">{UI.bodyLabel}</span>
                <pre
                  style={{
                    margin: "4px 0 0",
                    whiteSpace: "pre-wrap",
                    fontFamily: "inherit",
                    fontSize: "0.95rem",
                  }}
                >
                  {outreachDraft.body || "—"}
                </pre>
              </div>
              {outreachDraft.manualEdited ? (
                <p className="muted">Πρόχειρο με χειροκίνητες αλλαγές.</p>
              ) : null}
            </div>
          ) : null}

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
                {event.note && event.eventType !== "OUTREACH_SENT"
                  ? ` — ${event.note}`
                  : ""}
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

      {!tender.submission && !phase.isEarlyStage ? (
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
