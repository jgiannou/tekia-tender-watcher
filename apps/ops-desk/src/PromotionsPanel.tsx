import { useCallback, useEffect, useState } from "react";
import {
  fetchPromoAudit,
  fetchPromoRedemptions,
  fetchPromoSummary,
  grantPromo,
  patchPromoCapacity,
  restorePromoSlot,
  revokePromo,
  type ConnectionConfig,
  type PromoAdminSummary,
  type PromoAuditRow,
  type PromoRedemptionRow,
} from "./api";

const formatTime = (iso: string) => {
  try {
    return new Date(iso).toLocaleString([], {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
};

const statusBadge = (status: string) => {
  const s = status.toUpperCase();
  if (s === "ACTIVE") return "badge ok";
  if (s === "EXPIRED") return "badge muted";
  if (s === "REVOKED") return "badge err";
  if (s.startsWith("SUPERSEDED")) return "badge warn";
  return "badge";
};

type Props = {
  config: ConnectionConfig;
  connected: boolean;
};

export const PromotionsPanel = ({ config, connected }: Props) => {
  const [summary, setSummary] = useState<PromoAdminSummary | null>(null);
  const [rows, setRows] = useState<PromoRedemptionRow[]>([]);
  const [total, setTotal] = useState(0);
  const [audit, setAudit] = useState<PromoAuditRow[]>([]);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [query, setQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const [grantOrgId, setGrantOrgId] = useState("");
  const [grantReason, setGrantReason] = useState("");
  const [forceDisabled, setForceDisabled] = useState(false);

  const [capacityDraft, setCapacityDraft] = useState("");
  const [capacityReason, setCapacityReason] = useState("");

  const [actionOrg, setActionOrg] = useState<PromoRedemptionRow | null>(null);
  const [actionReason, setActionReason] = useState("");
  const [restoreOnRevoke, setRestoreOnRevoke] = useState(false);

  const limit = 40;

  const refresh = useCallback(async () => {
    if (!connected) return;
    setBusy(true);
    setError(null);
    try {
      const [{ summary: s, syncedAt: at }, list, auditPage] = await Promise.all([
        fetchPromoSummary(config),
        fetchPromoRedemptions(config, {
          status: statusFilter,
          q: query.trim() || undefined,
          limit,
          offset,
        }),
        fetchPromoAudit(config, { limit: 30 }),
      ]);
      setSummary(s);
      setSyncedAt(at);
      setCapacityDraft(String(s.capacity));
      setRows(list.items);
      setTotal(list.total);
      setAudit(auditPage.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [connected, config, statusFilter, query, offset]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleGrant = async () => {
    if (!grantOrgId.trim() || grantReason.trim().length < 3) {
      setError("Organization ID and reason (min 3 chars) required.");
      return;
    }
    const confirmMsg = forceDisabled
      ? "Public campaign is/may be DISABLED. Force-grant 30 days Pro anyway?"
      : "Grant 30 days Pro to this organization? No Stripe charge.";
    if (!window.confirm(confirmMsg)) return;
    setBusy(true);
    setError(null);
    try {
      await grantPromo(config, {
        organizationId: grantOrgId.trim(),
        reason: grantReason.trim(),
        forceWhenDisabled: forceDisabled,
        idempotencyKey: `grant-${grantOrgId.trim()}-${Date.now()}`,
      });
      setNote("Promo granted.");
      setGrantReason("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleCapacity = async () => {
    const next = Number(capacityDraft);
    if (!Number.isFinite(next) || next < 1) {
      setError("Invalid capacity.");
      return;
    }
    if (capacityReason.trim().length < 3) {
      setError("Capacity change requires a reason.");
      return;
    }
    if (
      !window.confirm(
        `Set capacity to ${next}? Consumed slots stay; cannot go below consumed.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await patchPromoCapacity(config, {
        capacity: next,
        reason: capacityReason.trim(),
        idempotencyKey: `cap-${next}-${Date.now()}`,
      });
      setNote(`Capacity updated to ${next}.`);
      setCapacityReason("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleRevoke = async () => {
    if (!actionOrg || actionReason.trim().length < 3) {
      setError("Reason required for revoke.");
      return;
    }
    const msg = restoreOnRevoke
      ? "Revoke AND restore the consumed slot? This is irreversible for this allocation."
      : "Revoke promotional access only (keep slot consumed)?";
    if (!window.confirm(msg)) return;
    setBusy(true);
    setError(null);
    try {
      await revokePromo(config, {
        organizationId: actionOrg.organizationId,
        reason: actionReason.trim(),
        restoreSlot: restoreOnRevoke,
        idempotencyKey: `revoke-${actionOrg.organizationId}-${Date.now()}`,
      });
      setNote("Promotion revoked.");
      setActionOrg(null);
      setActionReason("");
      setRestoreOnRevoke(false);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleRestoreOnly = async (row: PromoRedemptionRow) => {
    const reason = window.prompt("Reason for restoring slot:");
    if (!reason || reason.trim().length < 3) return;
    if (!window.confirm("Restore consumed slot for this redemption?")) return;
    setBusy(true);
    setError(null);
    try {
      await restorePromoSlot(config, {
        organizationId: row.organizationId,
        reason: reason.trim(),
        idempotencyKey: `restore-${row.organizationId}-${Date.now()}`,
      });
      setNote("Slot restored.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel fade-in panel-wide" aria-label="Promotions">
      <div className="section-head">
        <h2>Promotions — ARC_PRO_LAUNCH_30</h2>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          {syncedAt ? (
            <span className="hint">Synced {formatTime(syncedAt)}</span>
          ) : null}
          <button
            type="button"
            className="btn"
            disabled={!connected || busy}
            onClick={() => void refresh()}
            aria-label="Refresh promotions"
          >
            {busy ? "…" : "Refresh"}
          </button>
        </div>
      </div>

      {error ? <div className="error-banner">{error}</div> : null}
      {note ? <p className="hint ok-hint">{note}</p> : null}

      {summary ? (
        <div className="grid-stats" style={{ marginBottom: "1rem" }}>
          <div className="stat">
            <div className="label">Campaign</div>
            <div className="value" style={{ fontSize: "1.1rem" }}>
              {summary.promotionEnabled ? (
                <span className="badge ok">ENABLED</span>
              ) : (
                <span className="badge muted">DISABLED</span>
              )}
            </div>
            <div className="sub">{summary.promotionKey}</div>
          </div>
          <div className="stat">
            <div className="label">Capacity</div>
            <div className="value">{summary.capacity}</div>
            <div className="sub">ceiling {summary.capacityCeiling}</div>
          </div>
          <div className="stat">
            <div className="label">Consumed</div>
            <div className="value">{summary.consumedSlots}</div>
            <div className="sub">slots holding capacity</div>
          </div>
          <div className="stat">
            <div className="label">Remaining</div>
            <div
              className={`value ${
                summary.exhausted
                  ? "text-err"
                  : summary.lowSlotsWarning
                    ? "text-warn"
                    : ""
              }`}
            >
              {summary.remainingSlots}
            </div>
            <div className="sub">
              {summary.exhausted
                ? "EXHAUSTED"
                : summary.lowSlotsWarning
                  ? "LOW (≤5)"
                  : "available"}
            </div>
          </div>
          <div className="stat">
            <div className="label">Active / Exp / Rev</div>
            <div className="value" style={{ fontSize: "1.25rem" }}>
              {summary.activeCount}/{summary.expiredCount}/{summary.revokedCount}
            </div>
            <div className="sub">status counts</div>
          </div>
          <div className="stat">
            <div className="label">Paid / Historical</div>
            <div className="value" style={{ fontSize: "1.25rem" }}>
              {summary.supersededCount}/{summary.historicalActivations}
            </div>
            <div className="sub">upgrades · all activations</div>
          </div>
        </div>
      ) : (
        <p className="hint">{connected ? "Loading summary…" : "Connect first."}</p>
      )}

      <div className="promo-ops-grid">
        <div className="field-block">
          <h3>Παροχή 30 ημερών Pro</h3>
          <div className="field">
            <label htmlFor="grantOrgId">Organization ID</label>
            <input
              id="grantOrgId"
              value={grantOrgId}
              onChange={(e) => setGrantOrgId(e.target.value)}
              placeholder="org_…"
              aria-label="Organization ID for promo grant"
            />
          </div>
          <div className="field">
            <label htmlFor="grantReason">Audit reason</label>
            <input
              id="grantReason"
              value={grantReason}
              onChange={(e) => setGrantReason(e.target.value)}
              aria-label="Grant reason"
            />
          </div>
          <label className="check-row">
            <input
              type="checkbox"
              checked={forceDisabled}
              onChange={(e) => setForceDisabled(e.target.checked)}
            />
            Force when public campaign disabled
          </label>
          <button
            type="button"
            className="btn primary"
            disabled={!connected || busy}
            onClick={() => void handleGrant()}
          >
            Παροχή 30 ημερών Pro
          </button>
        </div>

        <div className="field-block">
          <h3>Capacity</h3>
          <p className="hint">
            Ceiling {summary?.capacityCeiling ?? "—"}. Cannot reduce below
            consumed ({summary?.consumedSlots ?? 0}).
          </p>
          <div className="field">
            <label htmlFor="capacityDraft">Total capacity</label>
            <input
              id="capacityDraft"
              type="number"
              min={1}
              value={capacityDraft}
              onChange={(e) => setCapacityDraft(e.target.value)}
              aria-label="Promotion capacity"
            />
          </div>
          <div className="field">
            <label htmlFor="capacityReason">Reason</label>
            <input
              id="capacityReason"
              value={capacityReason}
              onChange={(e) => setCapacityReason(e.target.value)}
              aria-label="Capacity change reason"
            />
          </div>
          <button
            type="button"
            className="btn"
            disabled={!connected || busy}
            onClick={() => void handleCapacity()}
          >
            Update capacity
          </button>
        </div>
      </div>

      <div className="section-head" style={{ marginTop: "1.25rem" }}>
        <h3>Organizations</h3>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <select
            value={statusFilter}
            onChange={(e) => {
              setOffset(0);
              setStatusFilter(e.target.value);
            }}
            aria-label="Filter promotion status"
          >
            <option value="ALL">All</option>
            <option value="ACTIVE">Active</option>
            <option value="EXPIRED">Expired</option>
            <option value="REVOKED">Revoked</option>
            <option value="SUPERSEDED_BY_PAID">Paid upgrade</option>
          </select>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setOffset(0);
                void refresh();
              }
            }}
            placeholder="Search name or ID"
            aria-label="Search organizations"
            style={{ minWidth: 180 }}
          />
          <button
            type="button"
            className="btn"
            onClick={() => {
              setOffset(0);
              void refresh();
            }}
          >
            Search
          </button>
        </div>
      </div>

      <div className="mini-table" style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>Organization</th>
              <th>Owner</th>
              <th>Status</th>
              <th>Activated</th>
              <th>Expires</th>
              <th>Days</th>
              <th>Slot</th>
              <th>Source</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="hint">
                  No redemptions.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <div>{row.organizationName}</div>
                    <code className="hint">{row.organizationId}</code>
                  </td>
                  <td>{row.ownerEmail ?? "—"}</td>
                  <td>
                    <span className={statusBadge(row.status)}>{row.status}</span>
                  </td>
                  <td>{formatTime(row.activatedAt)}</td>
                  <td>{formatTime(row.expiresAt)}</td>
                  <td>{row.daysRemaining}</td>
                  <td>
                    {row.slotConsumed
                      ? row.slotRestoredAt
                        ? "restored"
                        : "consumed"
                      : "free"}
                  </td>
                  <td>{row.source}</td>
                  <td>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {row.status === "ACTIVE" || row.status === "EXPIRED" ? (
                        <button
                          type="button"
                          className="btn"
                          onClick={() => {
                            setActionOrg(row);
                            setRestoreOnRevoke(false);
                            setActionReason("");
                          }}
                        >
                          Ανάκληση
                        </button>
                      ) : null}
                      {row.slotConsumed &&
                      !row.slotRestoredAt &&
                      row.status !== "ACTIVE" ? (
                        <button
                          type="button"
                          className="btn"
                          onClick={() => void handleRestoreOnly(row)}
                        >
                          Restore slot
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: 8,
        }}
      >
        <span className="hint">
          {total} total · showing {offset + 1}–
          {Math.min(offset + limit, total)}
        </span>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            className="btn"
            disabled={offset <= 0 || busy}
            onClick={() => setOffset((o) => Math.max(0, o - limit))}
          >
            Prev
          </button>
          <button
            type="button"
            className="btn"
            disabled={offset + limit >= total || busy}
            onClick={() => setOffset((o) => o + limit)}
          >
            Next
          </button>
        </div>
      </div>

      {actionOrg ? (
        <div className="field-block" style={{ marginTop: "1rem" }}>
          <h3>Ανάκληση προσφοράς — {actionOrg.organizationName}</h3>
          <p className="hint">
            Status {actionOrg.status} · activated{" "}
            {formatTime(actionOrg.activatedAt)} · expires{" "}
            {formatTime(actionOrg.expiresAt)} · slot{" "}
            {actionOrg.slotConsumed ? "consumed" : "not consumed"}
          </p>
          <div className="field">
            <label htmlFor="revokeReason">Audit reason</label>
            <input
              id="revokeReason"
              value={actionReason}
              onChange={(e) => setActionReason(e.target.value)}
              aria-label="Revoke reason"
            />
          </div>
          <label className="check-row">
            <input
              type="checkbox"
              checked={restoreOnRevoke}
              onChange={(e) => setRestoreOnRevoke(e.target.checked)}
            />
            Also restore consumed slot (B — explicit)
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              className="btn"
              onClick={() => setActionOrg(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn primary"
              disabled={busy}
              onClick={() => void handleRevoke()}
            >
              Confirm ανάκληση
            </button>
          </div>
        </div>
      ) : null}

      <div className="section-head" style={{ marginTop: "1.25rem" }}>
        <h3>Audit ledger</h3>
      </div>
      <div className="mini-table">
        <table>
          <thead>
            <tr>
              <th>When</th>
              <th>Action</th>
              <th>Org</th>
              <th>Capacity</th>
              <th>By</th>
              <th>Reason</th>
            </tr>
          </thead>
          <tbody>
            {audit.length === 0 ? (
              <tr>
                <td colSpan={6} className="hint">
                  No audit events.
                </td>
              </tr>
            ) : (
              audit.map((e) => (
                <tr key={e.id}>
                  <td>{formatTime(e.createdAt)}</td>
                  <td>{e.actionType}</td>
                  <td>
                    <code className="hint">{e.organizationId ?? "—"}</code>
                  </td>
                  <td>
                    {e.previousCapacity != null || e.newCapacity != null
                      ? `${e.previousCapacity ?? "—"} → ${e.newCapacity ?? "—"}`
                      : "—"}
                  </td>
                  <td>{e.performedBy}</td>
                  <td>{e.reason}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
};
