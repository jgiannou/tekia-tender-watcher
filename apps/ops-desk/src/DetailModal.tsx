import { useEffect, useMemo, useState } from "react";
import {
  type ConnectionConfig,
  type LogEntry,
  type OpsOrgListItem,
  type OpsUserListItem,
  type ProductEventEntry,
  type RequestEntry,
  type TrialActivityEntry,
  type TrialActivityUser,
  deleteUser,
  fetchLogs,
  fetchOrganizationDetail,
  fetchOrganizations,
  fetchProductEvents,
  fetchRequests,
  fetchTrialActivity,
  fetchUserDetail,
  fetchUsers,
  impersonateUser,
  issueUserPassword,
  patchOrganizationPlan,
} from "./api";

export type DrillKind =
  | "users"
  | "organizations"
  | "paying"
  | "errors"
  | "plan"
  | "product-events"
  | "trial-activity";

export type DrillState = {
  kind: DrillKind;
  title: string;
  plan?: string;
  requestId?: string;
  userId?: string;
};

type Props = {
  open: DrillState | null;
  config: ConnectionConfig;
  onClose: () => void;
};

type ErrorSelection = { type: "log"; id: string } | { type: "request"; id: string };

const formatDate = (iso: string | null | undefined) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString([], {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return iso;
  }
};

const prettyBody = (raw: string | undefined) => {
  if (!raw) return null;
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
};

type OpsPlanId = "trial" | "basic" | "pro";

export const DetailModal = ({ open, config, onClose }: Props) => {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [users, setUsers] = useState<OpsUserListItem[]>([]);
  const [orgs, setOrgs] = useState<OpsOrgListItem[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [requests, setRequests] = useState<RequestEntry[]>([]);
  const [productEvents, setProductEvents] = useState<ProductEventEntry[]>([]);
  const [trialActivity, setTrialActivity] = useState<TrialActivityEntry[]>([]);
  const [trialUser, setTrialUser] = useState<TrialActivityUser | null>(null);
  const [total, setTotal] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [errorSelection, setErrorSelection] = useState<ErrorSelection | null>(null);
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionNote, setActionNote] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<{ email: string; password: string } | null>(null);
  const [opsPassword, setOpsPassword] = useState("");
  const [opsPasswordAt, setOpsPasswordAt] = useState<string | null>(null);
  const [opsPasswordEnabled, setOpsPasswordEnabled] = useState(true);
  const [customPassword, setCustomPassword] = useState("");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  type UserMembershipOrg = {
    role: string;
    organization: {
      id: string;
      name: string;
      plan: string;
      billingStatus: string;
    };
  };

  const userMemberships = useMemo((): UserMembershipOrg[] => {
    if (open?.kind !== "users" || !detail) return [];
    const raw = detail.memberships;
    if (!Array.isArray(raw)) return [];
    return raw.filter((m): m is UserMembershipOrg => {
      if (!m || typeof m !== "object") return false;
      const org = (m as UserMembershipOrg).organization;
      return Boolean(org && typeof org.id === "string" && typeof org.name === "string");
    });
  }, [open?.kind, detail]);

  const openExternalUrl = async (url: string) => {
    if (window.arcTendersOps?.openExternal) {
      await window.arcTendersOps.openExternal(url);
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleOpenAsUser = async (userId: string) => {
    setActionBusy(true);
    setActionNote(null);
    setCredentials(null);
    setError(null);
    try {
      const data = await impersonateUser(config, { userId, rotatePassword: false });
      if (data.credentials) {
        setCredentials(data.credentials);
        setOpsPassword(data.credentials.password);
      }
      await openExternalUrl(data.openUrl);
      setActionNote(
        data.credentials
          ? `Opened as ${data.credentials.email}. Password unchanged.`
          : "Opened browser session for this user. Password unchanged.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setActionBusy(false);
    }
  };

  const handleIssuePassword = async (userId: string, password?: string) => {
    setActionBusy(true);
    setActionNote(null);
    setError(null);
    try {
      const data = await issueUserPassword(
        config,
        userId,
        password?.trim() ? { password: password.trim() } : undefined,
      );
      setCredentials(data.credentials);
      setOpsPassword(data.credentials.password);
      setOpsPasswordAt(new Date().toISOString());
      setOpsPasswordEnabled(data.opsPasswordEnabled);
      setCustomPassword("");
      setUsers((prev) =>
        prev.map((u) =>
          u.id === userId
            ? {
                ...u,
                opsPassword: data.opsPasswordEnabled ? data.credentials.password : "",
                opsPasswordAt: data.opsPasswordEnabled ? new Date().toISOString() : null,
              }
            : u,
        ),
      );
      setDetail((prev) =>
        prev
          ? {
              ...prev,
              opsPassword: data.opsPasswordEnabled ? data.credentials.password : "",
              opsPasswordAt: data.opsPasswordEnabled ? new Date().toISOString() : null,
            }
          : prev,
      );
      setActionNote(
        data.note ||
          `Password set for ${data.credentials.email}. Shown below.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setActionBusy(false);
    }
  };

  const handleCopyPassword = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setActionNote("Password copied.");
    } catch {
      setError("Could not copy password.");
    }
  };

  const handleSetOrgPlan = async (orgId: string, planKey: OpsPlanId) => {
    setActionBusy(true);
    setActionNote(null);
    setError(null);
    try {
      await patchOrganizationPlan(config, orgId, { planKey });
      setActionNote(`Plan set to ${planKey}. Re-open as a member to refresh entitlements.`);
      if (open?.kind === "users" && selectedId) {
        setDetail(await fetchUserDetail(config, selectedId));
      } else {
        setDetail(await fetchOrganizationDetail(config, orgId));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setActionBusy(false);
    }
  };

  const renderPlanForceControls = (orgId: string, orgLabel?: string) => (
    <div
      className="top-actions"
      style={{ marginBottom: "0.75rem", flexWrap: "wrap", gap: "0.5rem" }}
      role="group"
      aria-label={orgLabel ? `Force plan for ${orgLabel}` : "Force organization plan"}
    >
      <span className="hint" style={{ width: "100%", margin: 0 }}>
        {orgLabel ? (
          <>
            Force plan for <strong>{orgLabel}</strong> (no Stripe)
          </>
        ) : (
          "Force plan without Stripe"
        )}
      </span>
      {(["trial", "basic", "pro"] as const).map((plan) => (
        <button
          key={plan}
          type="button"
          className="btn"
          disabled={actionBusy}
          onClick={() => void handleSetOrgPlan(orgId, plan)}
          aria-label={`Set plan to ${plan}${orgLabel ? ` for ${orgLabel}` : ""}`}
        >
          Set {plan}
        </button>
      ))}
    </div>
  );

  const handleDeleteUser = async (userId: string) => {
    if (deleteConfirmText !== "DELETE") {
      setError("Type DELETE to confirm.");
      return;
    }
    setActionBusy(true);
    setActionNote(null);
    setError(null);
    try {
      const data = await deleteUser(config, userId);
      setUsers((prev) => prev.filter((u) => u.id !== userId));
      setTotal((n) => Math.max(0, n - 1));
      setSelectedId(null);
      setDetail(null);
      setDeleteConfirmOpen(false);
      setDeleteConfirmText("");
      setCredentials(null);
      setActionNote(
        `Deleted ${data.email}${
          data.orgsDeleted > 0
            ? ` · also removed ${data.orgsDeleted} sole-owned org${data.orgsDeleted === 1 ? "" : "s"}`
            : ""
        }.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setActionBusy(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    setQ("");
    setSelectedId(null);
    setDetail(null);
    setError(null);
    setActionNote(null);
    setCredentials(null);
    setOpsPassword("");
    setOpsPasswordAt(null);
    setCustomPassword("");
    setDeleteConfirmOpen(false);
    setDeleteConfirmText("");
    setProductEvents([]);
    setTrialActivity([]);
    setTrialUser(null);
    setErrorSelection(
      open.kind === "errors" && open.requestId
        ? { type: "request", id: open.requestId }
        : null,
    );
  }, [open?.kind, open?.plan, open?.title, open?.requestId, open?.userId]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        if (open.kind === "users") {
          const page = await fetchUsers(config, { q, limit: 100 });
          if (cancelled) return;
          setUsers(page.items);
          setOpsPasswordEnabled(page.opsPasswordEnabled !== false);
          setOrgs([]);
          setLogs([]);
          setRequests([]);
          setProductEvents([]);
          setTrialActivity([]);
          setTotal(page.total);
        } else if (open.kind === "organizations" || open.kind === "paying" || open.kind === "plan") {
          const page = await fetchOrganizations(config, {
            q,
            limit: 100,
            paying: open.kind === "paying",
            plan: open.kind === "plan" ? open.plan : undefined,
          });
          if (cancelled) return;
          setOrgs(page.items);
          setUsers([]);
          setLogs([]);
          setRequests([]);
          setProductEvents([]);
          setTrialActivity([]);
          setTotal(page.total);
        } else if (open.kind === "errors") {
          const [l, r] = await Promise.all([
            fetchLogs(config, { level: "error_warn", limit: 100, q }),
            fetchRequests(config, { errors: true, limit: 100 }),
          ]);
          if (cancelled) return;
          setLogs(l);
          setRequests(r);
          setUsers([]);
          setOrgs([]);
          setProductEvents([]);
          setTrialActivity([]);
          setTotal(l.length + r.length);
          if (open.requestId && r.some((row) => row.id === open.requestId)) {
            setErrorSelection({ type: "request", id: open.requestId });
          }
        } else if (open.kind === "product-events") {
          const rows = await fetchProductEvents(config, { limit: 200 });
          if (cancelled) return;
          const filtered = q.trim()
            ? rows.filter((r) =>
                `${r.type} ${r.userId || ""} ${r.organizationId || ""}`
                  .toLowerCase()
                  .includes(q.trim().toLowerCase()),
              )
            : rows;
          setProductEvents(filtered);
          setUsers([]);
          setOrgs([]);
          setLogs([]);
          setRequests([]);
          setTotal(filtered.length);
        } else if (open.kind === "trial-activity" && open.userId) {
          const page = await fetchTrialActivity(config, open.userId, { limit: 300 });
          if (cancelled) return;
          setTrialUser(page.user);
          setTrialActivity(page.events);
          setTotal(page.events.length);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    const t = window.setTimeout(() => void run(), q ? 250 : 0);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [open, config, q]);

  useEffect(() => {
    if (!open || !selectedId) {
      setDetail(null);
      return;
    }
    if (open.kind === "errors" || open.kind === "product-events" || open.kind === "trial-activity") return;
    let cancelled = false;
    const run = async () => {
      setDetailLoading(true);
      try {
        const data =
          open.kind === "users"
            ? await fetchUserDetail(config, selectedId)
            : await fetchOrganizationDetail(config, selectedId);
        if (cancelled) return;
        setDetail(data);
        if (open.kind === "users") {
          const pw = typeof data.opsPassword === "string" ? data.opsPassword : "";
          const at =
            typeof data.opsPasswordAt === "string" ? data.opsPasswordAt : null;
          setOpsPassword(pw);
          setOpsPasswordAt(at);
          if (typeof data.opsPasswordEnabled === "boolean") {
            setOpsPasswordEnabled(data.opsPasswordEnabled);
          }
          if (pw && typeof data.email === "string") {
            setCredentials({ email: data.email, password: pw });
          } else {
            setCredentials(null);
          }
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [open, selectedId, config]);

  const selectedRequest = useMemo(() => {
    if (!errorSelection || errorSelection.type !== "request") return null;
    return requests.find((r) => r.id === errorSelection.id) || null;
  }, [errorSelection, requests]);

  const selectedLog = useMemo(() => {
    if (!errorSelection || errorSelection.type !== "log") return null;
    return logs.find((r) => r.id === errorSelection.id) || null;
  }, [errorSelection, logs]);

  if (!open) return null;

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal fade-in"
        role="dialog"
        aria-modal="true"
        aria-label={open.title}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <h2>{open.title}</h2>
            <p>
              {loading ? "Loading…" : `${total} result${total === 1 ? "" : "s"}`} · click a row for
              details
            </p>
          </div>
          <button type="button" className="btn" onClick={onClose} aria-label="Close details">
            Close
          </button>
        </div>

        <div className="modal-search">
          <input
            aria-label="Search list"
            placeholder={
              open.kind === "users"
                ? "Search email, name…"
                : open.kind === "errors"
                  ? "Filter log messages…"
                  : "Search org name, Stripe id…"
            }
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoFocus
          />
        </div>

        {error ? <div className="error-banner">{error}</div> : null}

        <div className="modal-split">
          <div className="modal-list">
            {open.kind === "users"
              ? users.map((u) => {
                  const name = `${u.firstName} ${u.lastName}`.trim() || "—";
                  const org = u.memberships[0]?.organization;
                  const selectRow = () => {
                    setSelectedId(u.id);
                    setDeleteConfirmOpen(false);
                    setDeleteConfirmText("");
                  };
                  return (
                    <div
                      key={u.id}
                      role="button"
                      tabIndex={0}
                      className={`list-row ${selectedId === u.id ? "active" : ""}`}
                      aria-label={`Inspect ${u.email}`}
                      onClick={selectRow}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter" && e.key !== " ") return;
                        e.preventDefault();
                        selectRow();
                      }}
                    >
                      <div className="list-title">{u.email}</div>
                      <div className="list-sub">
                        {name}
                        {org ? ` · ${org.name} (${org.plan})` : ""}
                      </div>
                      <div className="list-meta">{formatDate(u.createdAt)}</div>
                    </div>
                  );
                })
              : null}

            {open.kind === "organizations" || open.kind === "paying" || open.kind === "plan"
              ? orgs.map((o) => (
                  <button
                    type="button"
                    key={o.id}
                    className={`list-row ${selectedId === o.id ? "active" : ""}`}
                    onClick={() => setSelectedId(o.id)}
                  >
                    <div className="list-title">{o.name}</div>
                    <div className="list-sub">
                      {o.plan} · {o.billingStatus} · {o._count.memberships} members ·{" "}
                      {o._count.tenders} tenders
                    </div>
                    <div className="list-meta">{formatDate(o.createdAt)}</div>
                  </button>
                ))
              : null}

            {open.kind === "errors" ? (
              <>
                {logs.map((row) => (
                  <button
                    type="button"
                    className={`list-row ${
                      errorSelection?.type === "log" && errorSelection.id === row.id ? "active" : ""
                    }`}
                    key={row.id}
                    onClick={() => setErrorSelection({ type: "log", id: row.id })}
                  >
                    <div className="list-title">
                      <span className={`level ${row.level}`}>{row.level}</span> {row.message}
                    </div>
                    <div className="list-meta">{formatDate(row.ts)}</div>
                  </button>
                ))}
                {requests.map((row) => (
                  <button
                    type="button"
                    className={`list-row ${
                      errorSelection?.type === "request" && errorSelection.id === row.id
                        ? "active"
                        : ""
                    }`}
                    key={row.id}
                    onClick={() => setErrorSelection({ type: "request", id: row.id })}
                  >
                    <div className="list-title">
                      <span className={`status s${String(row.status)[0]}`}>{row.status}</span>{" "}
                      {row.method} {row.path}
                    </div>
                    <div className="list-meta">{formatDate(row.ts)}</div>
                  </button>
                ))}
              </>
            ) : null}

            {!loading && total === 0 ? <div className="empty">No rows.</div> : null}
          </div>

          <div className="modal-detail">
            {open.kind === "errors" ? (
              selectedRequest ? (
                <div className="detail-block">
                  <div className="detail-kvs">
                    <div>
                      <span>Status</span>
                      <strong>{selectedRequest.status}</strong>
                    </div>
                    <div>
                      <span>Path</span>
                      <strong>{selectedRequest.path}</strong>
                    </div>
                    <div>
                      <span>Request ID</span>
                      <strong>{selectedRequest.requestId}</strong>
                    </div>
                  </div>
                  <h4>Response body</h4>
                  {selectedRequest.responseBody ? (
                    <pre className="detail-json">{prettyBody(selectedRequest.responseBody)}</pre>
                  ) : (
                    <div className="empty">No response body captured.</div>
                  )}
                </div>
              ) : selectedLog ? (
                <div className="detail-block">
                  <pre className="detail-json">
                    {selectedLog.meta ? JSON.stringify(selectedLog.meta, null, 2) : "—"}
                  </pre>
                </div>
              ) : (
                <div className="empty">Select a log or HTTP error.</div>
              )
            ) : !selectedId ? (
              <div className="empty">Select a row to inspect details.</div>
            ) : detailLoading ? (
              <div className="empty">Loading detail…</div>
            ) : detail ? (
              <div className="detail-block">
                {open.kind === "users" ? (
                  <>
                    <div className="top-actions" style={{ marginBottom: "0.75rem" }}>
                      <button
                        type="button"
                        className="btn primary"
                        disabled={actionBusy}
                        onClick={() => void handleOpenAsUser(selectedId)}
                        aria-label="Open web app as this user"
                      >
                        {actionBusy ? "Opening…" : "Open as this user"}
                      </button>
                      <button
                        type="button"
                        className="btn danger"
                        disabled={actionBusy}
                        onClick={() => {
                          setDeleteConfirmOpen((v) => !v);
                          setDeleteConfirmText("");
                        }}
                      >
                        Delete user
                      </button>
                    </div>
                    <div className="detail-block" style={{ marginBottom: "0.75rem" }}>
                      <h4>Ops password</h4>
                      {!opsPasswordEnabled ? (
                        <p className="hint">
                          Storage disabled (OPS_PASSWORD_VISIBLE=0). You can still issue a new
                          password; it will not be retained for later viewing.
                        </p>
                      ) : null}
                      <div className="detail-kvs" style={{ marginBottom: "0.5rem" }}>
                        <div>
                          <span>Stored password</span>
                          <strong style={{ fontFamily: "var(--mono)" }}>
                            {opsPassword || "— (not issued via Ops yet)"}
                          </strong>
                        </div>
                        <div>
                          <span>Last set</span>
                          <strong>{formatDate(opsPasswordAt)}</strong>
                        </div>
                      </div>
                      <div
                        className="top-actions"
                        style={{ flexWrap: "wrap", gap: "0.5rem", marginBottom: "0.5rem" }}
                      >
                        {opsPassword ? (
                          <button
                            type="button"
                            className="btn"
                            disabled={actionBusy}
                            onClick={() => void handleCopyPassword(opsPassword)}
                            aria-label="Copy stored password"
                          >
                            Copy password
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="btn"
                          disabled={actionBusy}
                          onClick={() => void handleIssuePassword(selectedId)}
                          aria-label="Issue new random password"
                        >
                          {actionBusy ? "Saving…" : "Issue new password"}
                        </button>
                      </div>
                      <div
                        className="top-actions"
                        style={{ flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}
                      >
                        <input
                          type="text"
                          value={customPassword}
                          onChange={(e) => setCustomPassword(e.target.value)}
                          placeholder="Custom password (min 8)"
                          aria-label="Custom password"
                          style={{ flex: "1 1 12rem", minWidth: "10rem" }}
                        />
                        <button
                          type="button"
                          className="btn"
                          disabled={actionBusy || customPassword.trim().length < 8}
                          onClick={() =>
                            void handleIssuePassword(selectedId, customPassword)
                          }
                          aria-label="Set custom password"
                        >
                          Set password
                        </button>
                      </div>
                      <p className="hint" style={{ marginTop: "0.5rem" }}>
                        Issuing a password replaces the login password for this account. Signup
                        passwords are not recoverable — only Ops-issued ones are stored here.
                      </p>
                    </div>
                  </>
                ) : null}
                {open.kind === "users" && userMemberships.length > 0
                  ? userMemberships.map((m) =>
                      renderPlanForceControls(
                        m.organization.id,
                        `${m.organization.name} (${m.organization.plan} · ${m.role})`,
                      ),
                    )
                  : null}
                {open.kind === "users" && deleteConfirmOpen ? (
                  <div className="delete-confirm">
                    <p>Type DELETE to permanently remove this user.</p>
                    <input
                      value={deleteConfirmText}
                      onChange={(e) => setDeleteConfirmText(e.target.value)}
                      placeholder="DELETE"
                      aria-label="Confirm delete"
                    />
                    <button
                      type="button"
                      className="btn danger"
                      disabled={actionBusy || deleteConfirmText !== "DELETE"}
                      onClick={() => void handleDeleteUser(selectedId)}
                    >
                      Confirm delete
                    </button>
                  </div>
                ) : null}
                {open.kind === "organizations" || open.kind === "paying" || open.kind === "plan"
                  ? renderPlanForceControls(selectedId)
                  : null}
                {actionNote ? <p className="hint ok-hint">{actionNote}</p> : null}
                {credentials && open.kind !== "users" ? (
                  <div className="detail-kvs" style={{ marginBottom: "0.75rem" }}>
                    <div>
                      <span>Email</span>
                      <strong>{credentials.email}</strong>
                    </div>
                    <div>
                      <span>Temp password</span>
                      <strong style={{ fontFamily: "var(--mono)" }}>{credentials.password}</strong>
                    </div>
                  </div>
                ) : null}
                <pre className="detail-json">{JSON.stringify(detail, null, 2)}</pre>
              </div>
            ) : (
              <div className="empty">No detail.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
