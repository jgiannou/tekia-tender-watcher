import { FormEvent, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  api,
  isDesktop,
  openExternalUrl,
  type DraftPackage,
  type TenderDetail,
} from "../api";
import { formatDateTime, formatEuro, formatTime, statusClass } from "../lib/format";

const draftKeys = ["outreach", "technical", "economic", "declarations"] as const;
type DraftKey = (typeof draftKeys)[number];

const draftLabels: Record<DraftKey, string> = {
  outreach: "Outreach Email",
  technical: "Technical Offer",
  economic: "Economic Offer",
  declarations: "Declarations",
};

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

export const TenderDetailPage = () => {
  const { referenceNumber = "" } = useParams();
  const [tender, setTender] = useState<TenderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showRecordForm, setShowRecordForm] = useState(false);
  const [editingDraft, setEditingDraft] = useState<DraftKey | null>(null);
  const [vaultChecklist, setVaultChecklist] = useState<VaultChecklistItem[] | null>(
    null,
  );
  const [packageReadiness, setPackageReadiness] = useState<PackageReadiness | null>(
    null,
  );

  const load = async (markReviewed = false) => {
    setLoading(true);
    try {
      let detail = await api.tender(referenceNumber);
      if (markReviewed && detail.currentStatus === "NEW") {
        const updated = await api.setStatus(referenceNumber, "REVIEW", "Opened in dashboard");
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
      setMessage("Prepare Package (Drive) is available in the desktop app.");
      return;
    }
    try {
      const result = (await window.tekia.drive.packageReadiness(
        referenceNumber,
      )) as PackageReadiness;
      if (result?.__tekiaError) {
        setError(result.message ?? "Package readiness failed");
        return;
      }
      setPackageReadiness(result);
      setMessage(
        `Package readiness: ${result.summary}. Nothing was sent.`,
      );
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
        setError(result.message ?? "Workspace creation failed");
        return;
      }
      setMessage("Tender workspace created under Submissions/{ADAM}/.");
      if (result.webViewLink) void openExternalUrl(result.webViewLink);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleCopyTemplate = async (
    templateKey:
      | "earlyOutreach"
      | "technicalOffer"
      | "economicOffer"
      | "declarations",
  ) => {
    if (!isDesktop() || !window.tekia?.drive) return;
    try {
      const result = (await window.tekia.drive.copyTemplate(
        referenceNumber,
        templateKey,
      )) as {
        name?: string;
        driveUrl?: string;
        masterUntouched?: boolean;
        __tekiaError?: boolean;
        message?: string;
      };
      if (result?.__tekiaError) {
        setError(result.message ?? "Template copy failed");
        return;
      }
      setMessage(
        `Created tender copy “${result.name}” (master untouched). Nothing sent.`,
      );
      if (result.driveUrl) void openExternalUrl(result.driveUrl);
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
      setMessage(
        result.approvalInvalidated
          ? "Saved. Approval invalidated due to material changes."
          : "Saved.",
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
        `Αξιότιμε/η,\n\nΘα θέλαμε να εκδηλώσουμε ενδιαφέρον για: ${tender.title ?? ""}.\n\nΜε εκτίμηση,\nTEKIA`;
    }
    try {
      const result = await api.patchTender(referenceNumber, {
        drafts: { [key]: next },
      });
      setTender(result.tender);
      setEditingDraft(key);
      setMessage(
        result.approvalInvalidated
          ? "Draft updated. Approval invalidated."
          : "Draft prepared (not sent).",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleSaveDraft = async (event: FormEvent<HTMLFormElement>, key: DraftKey) => {
    event.preventDefault();
    if (!tender) return;
    const form = new FormData(event.currentTarget);
    const next: DraftPackage = {
      ...tender.drafts[key],
      status: (String(form.get("status") || "DRAFT") as DraftPackage["status"]),
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
          ? "Draft saved. Approval invalidated due to material changes."
          : "Draft saved.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleMarkReady = async () => {
    try {
      const result = await api.setStatus(referenceNumber, "READY", "Package ready for review");
      setTender(result.tender);
      setMessage("Marked READY. Approval is still required before any send.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleApprove = async () => {
    try {
      const result = await api.approve(referenceNumber);
      setTender(result.tender);
      setMessage("Approved. Send remains unavailable until local sending is configured.");
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
      setMessage("Submission recorded. Status is now SUBMITTED.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  if (loading) return <p className="muted">Loading tender…</p>;
  if (error && !tender) return <div className="error">{error}</div>;
  if (!tender) return <div className="error">Tender not found</div>;

  const displayOrMissing = (value: string | null | undefined) =>
    value?.trim() ? value : "Not detected";

  return (
    <div className="stack">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <Link className="btn ghost" to="/opportunities">
          ← Opportunities
        </Link>
        <span className={statusClass(tender.currentStatus)}>{tender.currentStatus}</span>
      </div>

      {message ? <div className="alert-box">{message}</div> : null}
      {error ? <div className="error">{error}</div> : null}

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
            <span className="k">Type</span>
            <span className="v">{tender.recordType}</span>
          </div>
          <div className="meta-item">
            <span className="k">Category</span>
            <span className="v">{tender.webCategory ?? "—"}</span>
          </div>
          <div className="meta-item">
            <span className="k">Score</span>
            <span className="v">{tender.score ?? "—"}</span>
          </div>
          <div className="meta-item">
            <span className="k">Budget (ex VAT)</span>
            <span className="v">{formatEuro(tender.budgetWithoutVat)}</span>
          </div>
          <div className="meta-item">
            <span className="k">Budget (inc VAT)</span>
            <span className="v">{formatEuro(tender.budgetWithVat)}</span>
          </div>
          <div className="meta-item">
            <span className="k">Deadline</span>
            <span className="v">{formatDateTime(tender.finalSubmissionDate)}</span>
          </div>
          <div className="meta-item">
            <span className="k">KIMDIS publication</span>
            <span className="v">{formatDateTime(tender.submissionDate)}</span>
          </div>
          <div className="meta-item">
            <span className="k">KIMDIS URL</span>
            <span className="v">
              {tender.publicKimdisUrl ? (
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => void openExternalUrl(tender.publicKimdisUrl!)}
                >
                  Open in KIMDIS
                </button>
              ) : (
                "—"
              )}
            </span>
          </div>
          <div className="meta-item">
            <span className="k">Official PDF</span>
            <span className="v">
              {tender.officialPdfUrl ? (
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => void openExternalUrl(tender.officialPdfUrl!)}
                >
                  Open Official PDF
                </button>
              ) : (
                "—"
              )}
            </span>
          </div>
        </div>
      </section>

      {tender.recordType === "PROC" ? (
        <section className="card">
          <h3>PROC verification</h3>
          <div className="meta-grid">
            <div className="meta-item">
              <span className="k">PDF verified</span>
              <span className="v">
                {tender.pdfTextStatus === "extracted" ? "YES" : "NO"}
              </span>
            </div>
            <div className="meta-item">
              <span className="k">Targeted supplier</span>
              <span className="v">{tender.targetedSupplier ? "YES" : "NO"}</span>
            </div>
            <div className="meta-item">
              <span className="k">Non-invited rejected</span>
              <span className="v">
                {tender.nonInvitedOffersRejected ? "YES" : "NO"}
              </span>
            </div>
            <div className="meta-item">
              <span className="k">Deadline open</span>
              <span className="v">
                {tender.finalSubmissionDate &&
                new Date(tender.finalSubmissionDate).getTime() >= Date.now()
                  ? "YES"
                  : "NO"}
              </span>
            </div>
            <div className="meta-item">
              <span className="k">Watcher status</span>
              <span className="v">{tender.relevanceStatus ?? "—"}</span>
            </div>
          </div>
          {tender.relevanceStatus === "TARGETED" ||
          tender.relevanceStatus === "EXPIRED" ||
          tender.relevanceStatus === "NEEDS_REVIEW" ? (
            <p className="alert-box" style={{ marginTop: 12 }}>
              Not ready to submit — watcher classified this as{" "}
              <strong>{tender.relevanceStatus}</strong>.
            </p>
          ) : null}
        </section>
      ) : null}

      {tender.submission ? (
        <section className="already-submitted">
          <strong>Already submitted</strong>
          <div className="meta-grid" style={{ marginTop: 10 }}>
            <div className="meta-item">
              <span className="k">Submitted</span>
              <span className="v">{formatDateTime(tender.submission.submittedAt)}</span>
            </div>
            <div className="meta-item">
              <span className="k">Method</span>
              <span className="v">{tender.submission.method}</span>
            </div>
            <div className="meta-item">
              <span className="k">Recipient</span>
              <span className="v">{tender.submission.recipient ?? "—"}</span>
            </div>
            <div className="meta-item">
              <span className="k">Amount</span>
              <span className="v">
                {formatEuro(tender.submission.amountWithoutVat)}
              </span>
            </div>
          </div>
        </section>
      ) : null}

      <div className="grid-2">
        <section className="card">
          <h3>Why this tender matters</h3>
          <ul className="trace-list">
            {tender.decisionTrace.map((item) => (
              <li key={item.text} className={`tone-${item.tone}`}>
                {item.tone === "positive" ? "✅" : item.tone === "warning" ? "⚠" : "❌"}{" "}
                {item.text}
              </li>
            ))}
          </ul>
        </section>

        <section className="card">
          <h3>Timeline</h3>
          <ul className="timeline">
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
        </section>
      </div>

      <form className="card form-grid" onSubmit={(e) => void handleSaveContact(e)}>
        <h3>Scope / Contact / Submission info</h3>
        <label>
          Scope summary
          <textarea
            name="scope_summary"
            defaultValue={
              tender.scopeSummary ??
              [tender.title, ...(tender.scoreReasons ?? [])].filter(Boolean).join("\n")
            }
          />
        </label>
        <div className="grid-2">
          <label>
            Contact person
            <input name="contact_name" defaultValue={tender.contact.name ?? ""} placeholder="Not detected" />
          </label>
          <label>
            Department
            <input
              name="contact_department"
              defaultValue={tender.contact.department ?? ""}
              placeholder="Not detected"
            />
          </label>
          <label>
            Email
            <input name="contact_email" defaultValue={tender.contact.email ?? ""} placeholder="Not detected" />
          </label>
          <label>
            Phone
            <input name="contact_phone" defaultValue={tender.contact.phone ?? ""} placeholder="Not detected" />
          </label>
        </div>
        <p className="muted" style={{ margin: 0 }}>
          Contact shown as: {displayOrMissing(tender.contact.name)} /{" "}
          {displayOrMissing(tender.contact.email)} /{" "}
          {displayOrMissing(tender.contact.phone)}
        </p>
        <div className="grid-2">
          <label>
            Probable submission method
            <select
              name="submission_method"
              defaultValue={tender.submissionInfo.method || "UNKNOWN"}
            >
              {["EMAIL", "PORTAL", "ESIDIS", "PHYSICAL", "OTHER", "UNKNOWN"].map(
                (method) => (
                  <option key={method} value={method}>
                    {method}
                  </option>
                ),
              )}
            </select>
          </label>
          <label>
            Submission email
            <input
              name="submission_email"
              defaultValue={tender.submissionInfo.email ?? ""}
            />
          </label>
          <label>
            Portal / other
            <input
              name="submission_portal"
              defaultValue={tender.submissionInfo.portal ?? ""}
            />
          </label>
          <label>
            Notes / instructions
            <textarea
              name="submission_instructions"
              defaultValue={tender.submissionInfo.instructions ?? ""}
            />
          </label>
        </div>
        <div className="actions">
          <button type="submit" className="btn primary">
            Save details
          </button>
        </div>
      </form>

      <section className="card">
        <h3>Document checklist</h3>
        {vaultChecklist && vaultChecklist.length > 0 ? (
          <ul className="checklist">
            {vaultChecklist.map((item) => (
              <li key={item.key}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <span>
                    {item.status === "AVAILABLE"
                      ? "✅"
                      : item.status === "EXPIRED" ||
                          item.status === "MISSING" ||
                          item.status === "TO_GENERATE"
                        ? "⚠"
                        : "•"}{" "}
                    {item.label}
                    <span className="muted">
                      {" "}
                      — {item.status}
                      {item.validUntil ? ` · until ${item.validUntil}` : ""}
                      {item.note ? ` · ${item.note}` : ""}
                    </span>
                  </span>
                  {item.driveUrl ? (
                    <button
                      type="button"
                      className="btn ghost"
                      onClick={() => void openExternalUrl(item.driveUrl!)}
                    >
                      Open in Drive
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <ul className="checklist">
            {tender.documentChecklist.map((item) => (
              <li key={item.key}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <span>
                    {item.status === "AVAILABLE"
                      ? "✅"
                      : item.status === "REQUIRED" || item.status === "MISSING"
                        ? "⚠"
                        : "•"}{" "}
                    {item.label}
                  </span>
                  <select
                    aria-label={`${item.label} status`}
                    value={item.status}
                    onChange={(e) => void handleChecklistToggle(item.key, e.target.value)}
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
                        {status}
                      </option>
                    ))}
                  </select>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {isDesktop() ? (
        <section className="card">
          <h3>Prepare Offer Package</h3>
          <p className="muted">
            Inspects Vault documents and templates. Does not send anything.
          </p>
          <div className="actions">
            <button
              type="button"
              className="btn primary"
              onClick={() => void handlePreparePackage()}
            >
              Prepare Offer Package
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => void handleCreateWorkspace()}
            >
              Create Tender Workspace
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => void handleCopyTemplate("technicalOffer")}
            >
              Copy Technical Offer → draft
            </button>
          </div>
          {packageReadiness ? (
            <div style={{ marginTop: 12 }}>
              <strong>PACKAGE READINESS — {packageReadiness.summary}</strong>
              <h4>Company Documents</h4>
              <ul className="checklist">
                {packageReadiness.companyDocuments.map((row) => (
                  <li key={row.label}>
                    {row.status === "AVAILABLE" ? "✓" : "⚠"} {row.label} — {row.status}
                    {row.detail ? ` (${row.detail})` : ""}
                  </li>
                ))}
              </ul>
              <h4>Generated Documents</h4>
              <ul className="checklist">
                {packageReadiness.generatedDocuments.map((row) => (
                  <li key={row.label}>
                    {row.status === "DRAFT" || row.status === "READY" ? "✓" : "⚠"}{" "}
                    {row.label} — {row.status}
                    {row.detail ? ` (${row.detail})` : ""}
                  </li>
                ))}
              </ul>
              <p className="muted">Readiness: {packageReadiness.ready ? "READY" : "NOT READY"}</p>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="card">
        <h3>Draft area</h3>
        {draftKeys.map((key) => {
          const draft = tender.drafts[key];
          return (
            <div key={key} className="draft-row">
              <div>
                <strong>{draftLabels[key]}</strong>
                <div className="muted">{draft.status}</div>
              </div>
              <div className="actions" style={{ marginTop: 0 }}>
                <button
                  type="button"
                  className="btn"
                  onClick={() => void handlePrepareDraft(key)}
                >
                  {draft.status === "NOT_STARTED" ? "Prepare" : "Open Draft"}
                </button>
                {draft.status !== "READY" ? (
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      void (async () => {
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
                              ? "Draft marked ready. Approval invalidated."
                              : `${draftLabels[key]} marked READY.`,
                          );
                        } catch (err) {
                          setError(err instanceof Error ? err.message : String(err));
                        }
                      })();
                    }}
                  >
                    Mark Ready
                  </button>
                ) : null}
              </div>
              {editingDraft === key ? (
                <form
                  className="form-grid"
                  style={{ width: "100%", marginTop: 10 }}
                  onSubmit={(e) => void handleSaveDraft(e, key)}
                >
                  <label>
                    Status
                    <select name="status" defaultValue={draft.status}>
                      <option value="DRAFT">DRAFT</option>
                      <option value="READY">READY</option>
                      <option value="NOT_STARTED">NOT_STARTED</option>
                    </select>
                  </label>
                  <label>
                    Subject
                    <input name="subject" defaultValue={draft.subject ?? ""} />
                  </label>
                  <label>
                    Body / content
                    <textarea name="body" defaultValue={draft.body ?? ""} />
                  </label>
                  <label>
                    Notes
                    <textarea name="notes" defaultValue={draft.notes ?? ""} />
                  </label>
                  {key === "economic" ? (
                    <label>
                      Amount without VAT
                      <input
                        name="amountWithoutVat"
                        type="number"
                        defaultValue={draft.amountWithoutVat ?? ""}
                      />
                    </label>
                  ) : null}
                  <div className="actions">
                    <button type="submit" className="btn primary">
                      Save draft
                    </button>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => setEditingDraft(null)}
                    >
                      Close
                    </button>
                  </div>
                </form>
              ) : null}
            </div>
          );
        })}
      </section>

      <section className="card">
        <h3>Approval & send gate</h3>
        <p className="muted">
          Explicit approval is mandatory. Opening, marking READY, or editing a draft
          is not approval. Cloud watcher never sends externally.
        </p>
        <div className="actions">
          <button
            type="button"
            className="btn"
            onClick={() => void handleMarkReady()}
            disabled={Boolean(tender.submission) || tender.currentStatus === "READY"}
          >
            Mark Ready
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
            Approve
          </button>
          <button type="button" className="btn" disabled title="Sending integration not configured">
            Send — Sending integration not configured
          </button>
        </div>
        {tender.approvalStatus === "APPROVED" ? (
          <p className="alert-box" style={{ marginTop: 12 }}>
            Approved at {formatDateTime(tender.approvedAt)}. Send is still blocked
            until local sending is configured.
          </p>
        ) : null}
      </section>

      {!tender.submission ? (
        <section className="card">
          <h3>Record existing submission</h3>
          <p className="muted">
            Use only when something was already sent outside the dashboard. This
            does not send anything.
          </p>
          {!showRecordForm ? (
            <button
              type="button"
              className="btn"
              onClick={() => setShowRecordForm(true)}
            >
              Record Existing Submission
            </button>
          ) : (
            <form className="form-grid" onSubmit={(e) => void handleRecordSubmission(e)}>
              <label>
                Submission date
                <input
                  name="submitted_at"
                  type="datetime-local"
                  required
                  defaultValue={new Date().toISOString().slice(0, 16)}
                />
              </label>
              <label>
                Method
                <select name="submission_method" required defaultValue="EMAIL">
                  {["EMAIL", "PORTAL", "ESIDIS", "PHYSICAL", "OTHER"].map((method) => (
                    <option key={method} value={method}>
                      {method}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Recipient
                <input name="recipient" />
              </label>
              <label>
                Subject
                <input name="subject" />
              </label>
              <label>
                Amount without VAT
                <input name="amount_without_vat" type="number" />
              </label>
              <label>
                External / protocol reference
                <input name="external_reference" />
              </label>
              <label>
                Notes
                <textarea name="notes" />
              </label>
              <div className="actions">
                <button type="submit" className="btn primary">
                  Confirm record
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setShowRecordForm(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </section>
      ) : null}
    </div>
  );
};
