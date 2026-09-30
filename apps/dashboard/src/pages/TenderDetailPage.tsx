import { FormEvent, useEffect, useState } from "react";
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
  getGreekRelevanceLabel,
  getGreekStatusLabel,
  getGreekSubmissionMethodLabel,
  getNoExpiryNote,
} from "../lib/ui-labels";

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
      if (templateKey === "earlyOutreach") setEditingDraft("outreach");
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
    if (!tender) return;
    const form = new FormData(event.currentTarget);
    try {
      const result = await api.patchTender(referenceNumber, {
        contact_name: String(form.get("contact_name") || "") || null,
        contact_department: String(form.get("contact_department") || "") || null,
        contact_email: String(form.get("contact_email") || "") || null,
        contact_phone: String(form.get("contact_phone") || "") || null,
        submission_method: String(form.get("submission_method") || "UNKNOWN"),
        submission_email: String(form.get("submission_email") || "") || null,
        submission_portal: String(form.get("submission_portal") || "") || null,
        submission_instructions:
          String(form.get("submission_instructions") || "") || null,
        scope_summary: String(form.get("scope_summary") || "") || null,
      });
      setTender(result.tender);
      setEditingScope(false);
      setMessage(
        result.approvalInvalidated
          ? "Αποθηκεύτηκε. Η έγκριση ακυρώθηκε λόγω ουσιαστικών αλλαγών."
          : "Αποθηκεύτηκε.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
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
      setEditingDraft(key);
      setMessage(
        result.approvalInvalidated
          ? "Το πρόχειρο ενημερώθηκε. Η έγκριση ακυρώθηκε."
          : "Το πρόχειρο προετοιμάστηκε (χωρίς αποστολή).",
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
      void openExternalUrl(existingDrive.driveUrl);
      setEditingDraft("outreach");
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
      updatedAt: new Date().toISOString(),
    };
    try {
      const result = await api.patchTender(referenceNumber, {
        drafts: { [key]: next },
      });
      setTender(result.tender);
      setMessage(
        result.approvalInvalidated
          ? "Αποθηκεύτηκε. Η έγκριση ακυρώθηκε λόγω ουσιαστικών αλλαγών."
          : "Το πρόχειρο αποθηκεύτηκε.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
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
    if (outreachDrive) return getGreekDocumentStatusLabel(outreachDrive.status);
    if (outreachDraft.status === "NOT_STARTED") return UI.notCreated;
    return getGreekDocumentStatusLabel(outreachDraft.status);
  })();

  const isOutreachReady =
    outreachDrive?.status === "READY" || outreachDraft.status === "READY";

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
        className="form-grid"
        style={{ width: "100%", marginTop: 10 }}
        onSubmit={(e) => void handleSaveDraft(e, key)}
      >
        <label>
          Κατάσταση
          <select name="status" defaultValue={draft.status}>
            <option value="DRAFT">Πρόχειρο</option>
            <option value="READY">Έτοιμο</option>
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
                  onClick={() => setEditingDraft("outreach")}
                >
                  {UI.edit}
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
                {!outreachDrive && outreachDraft.status !== "READY" ? (
                  <button
                    type="button"
                    className="btn"
                    onClick={() => void handleMarkDraftReady("outreach")}
                  >
                    {UI.markReady}
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
      <form className="card form-grid" onSubmit={(e) => void handleSaveContact(e)}>
        <h3>{UI.contactSection}</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          Στοιχεία του φορέα — όχι τα στοιχεία αποστολέα της TEKIA.
        </p>
        <div className="grid-2">
          <label>
            {UI.contactPerson}
            <input
              name="contact_name"
              defaultValue={tender.contact.name ?? ""}
              placeholder={extractionEmptyLabel}
            />
          </label>
          <label>
            {UI.department}
            <input
              name="contact_department"
              defaultValue={tender.contact.department ?? ""}
              placeholder={extractionEmptyLabel}
            />
          </label>
          <label>
            {UI.contactEmail}
            <input
              name="contact_email"
              defaultValue={tender.contact.email ?? ""}
              placeholder={extractionEmptyLabel}
            />
          </label>
          <label>
            {UI.contactPhone}
            <input
              name="contact_phone"
              defaultValue={tender.contact.phone ?? ""}
              placeholder={extractionEmptyLabel}
            />
          </label>
        </div>
        <p className="muted" style={{ margin: 0 }}>
          Εξαγωγή: {displayOrMissing(tender.contact.name)} /{" "}
          {displayOrMissing(tender.contact.email)} /{" "}
          {displayOrMissing(tender.contact.phone)}
        </p>

        {/* 5. Compact scope */}
        <h3>{UI.scopeSummary}</h3>
        {!editingScope ? (
          <div>
            <p style={{ marginTop: 0 }}>
              {tender.scopeSummary?.trim()
                ? tender.scopeSummary
                : UI.scopeEmpty}
            </p>
            <button
              type="button"
              className="btn"
              onClick={() => setEditingScope(true)}
            >
              {UI.edit}
            </button>
            <input
              type="hidden"
              name="scope_summary"
              value={tender.scopeSummary ?? ""}
            />
          </div>
        ) : (
          <label>
            {UI.scopeSummary}
            <textarea
              name="scope_summary"
              defaultValue={tender.scopeSummary ?? ""}
              placeholder={UI.scopeEmpty}
            />
          </label>
        )}

        {/* Formal submission — open for PROC, collapsed for REQ */}
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
                  defaultValue={tender.submissionInfo.method || "UNKNOWN"}
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
                  defaultValue={tender.submissionInfo.email ?? ""}
                />
              </label>
              <label>
                {UI.portalOther}
                <input
                  name="submission_portal"
                  defaultValue={tender.submissionInfo.portal ?? ""}
                />
              </label>
              <label>
                {UI.instructions}
                <textarea
                  name="submission_instructions"
                  defaultValue={tender.submissionInfo.instructions ?? ""}
                />
              </label>
            </div>
          </>
        ) : (
          <>
            <input
              type="hidden"
              name="submission_method"
              value={tender.submissionInfo.method || "UNKNOWN"}
            />
            <input
              type="hidden"
              name="submission_email"
              value={tender.submissionInfo.email ?? ""}
            />
            <input
              type="hidden"
              name="submission_portal"
              value={tender.submissionInfo.portal ?? ""}
            />
            <input
              type="hidden"
              name="submission_instructions"
              value={tender.submissionInfo.instructions ?? ""}
            />
          </>
        )}

        <div className="actions">
          <button type="submit" className="btn primary">
            {UI.save}
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
                {event.eventType}
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
          <form className="form-grid" onSubmit={(e) => void handleSaveContact(e)}>
            <input
              type="hidden"
              name="contact_name"
              value={tender.contact.name ?? ""}
            />
            <input
              type="hidden"
              name="contact_department"
              value={tender.contact.department ?? ""}
            />
            <input
              type="hidden"
              name="contact_email"
              value={tender.contact.email ?? ""}
            />
            <input
              type="hidden"
              name="contact_phone"
              value={tender.contact.phone ?? ""}
            />
            <input
              type="hidden"
              name="scope_summary"
              value={tender.scopeSummary ?? ""}
            />
            <div className="grid-2">
              <label>
                {UI.submissionMethod}
                <select
                  name="submission_method"
                  defaultValue={tender.submissionInfo.method || "UNKNOWN"}
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
                  defaultValue={tender.submissionInfo.email ?? ""}
                />
              </label>
              <label>
                {UI.portalOther}
                <input
                  name="submission_portal"
                  defaultValue={tender.submissionInfo.portal ?? ""}
                />
              </label>
              <label>
                {UI.instructions}
                <textarea
                  name="submission_instructions"
                  defaultValue={tender.submissionInfo.instructions ?? ""}
                />
              </label>
            </div>
            <div className="actions">
              <button type="submit" className="btn primary">
                {UI.save}
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
