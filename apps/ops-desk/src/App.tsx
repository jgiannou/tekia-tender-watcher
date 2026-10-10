import { useEffect, useMemo, useState } from "react";
import {
  ENV_PRESETS,
  createSandbox,
  fetchHealthOps,
  fetchLogs,
  fetchPipeline,
  fetchProductEvents,
  fetchRequests,
  fetchStats,
  grantPlan,
  loadActiveEnv,
  loadConfig,
  notifySlackStats,
  saveConfig,
  switchEnv,
  type ConnectionConfig,
  type EnvId,
  type HealthOps,
  type LogEntry,
  type OpsStats,
  type PipelineMetrics,
  type ProductEventEntry,
  type RequestEntry,
} from "./api";
import { DetailModal, type DrillState } from "./DetailModal";

const formatTime = (iso: string) => {
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

const statusClass = (status: number) => {
  if (status >= 500) return "s5";
  if (status >= 400) return "s4";
  if (status >= 300) return "s3";
  return "s2";
};

const formatBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
};

const formatAge = (ms: number | null | undefined): string => {
  if (ms == null || !Number.isFinite(ms)) return "—";
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  return `${(ms / 3_600_000).toFixed(1)}h`;
};

const kvChips = (record: Record<string, number> | undefined) =>
  Object.entries(record ?? {})
    .sort((a, b) => b[1] - a[1])
    .map(([key, value]) => (
      <span className="chip" key={key}>
        {key}: {value}
      </span>
    ));

export const App = () => {
  const [activeEnv, setActiveEnv] = useState<EnvId>(() => loadActiveEnv());
  const [config, setConfig] = useState<ConnectionConfig>(() => loadConfig());
  const [draft, setDraft] = useState<ConnectionConfig>(() => loadConfig());
  const [stats, setStats] = useState<OpsStats | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [requests, setRequests] = useState<RequestEntry[]>([]);
  const [productEvents, setProductEvents] = useState<ProductEventEntry[]>([]);
  const [productEventType, setProductEventType] = useState("all");
  const [health, setHealth] = useState<HealthOps | null>(null);
  const [pipeline, setPipeline] = useState<PipelineMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [logLevel, setLogLevel] = useState("error_warn");
  const [errorsOnlyHttp, setErrorsOnlyHttp] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [drill, setDrill] = useState<DrillState | null>(null);
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const [sandboxPlan, setSandboxPlan] = useState<"free" | "trial" | "basic" | "pro">("pro");
  const [sandboxRole, setSandboxRole] = useState<"owner" | "admin" | "member">("owner");
  const [sandboxBusy, setSandboxBusy] = useState(false);
  const [grantEmail, setGrantEmail] = useState("");
  const [grantPlanKey, setGrantPlanKey] = useState<"free" | "trial" | "basic" | "pro">("pro");
  const [grantPassword, setGrantPassword] = useState("");
  const [grantBusy, setGrantBusy] = useState(false);

  const isElectron = Boolean(window.arcTendersOps?.isElectron);
  const connected = Boolean(config.token.trim() && config.apiUrl.trim());
  const activePreset = ENV_PRESETS.find((p) => p.id === activeEnv) ?? ENV_PRESETS[0];

  const planMax = useMemo(() => {
    if (!stats) return 1;
    return Math.max(
      1,
      stats.byPlan.free ?? 0,
      stats.byPlan.trial,
      stats.byPlan.basic,
      stats.byPlan.pro,
    );
  }, [stats]);

  const handleSave = () => {
    const next = {
      ...draft,
      apiUrl: activePreset.apiUrl,
      token: draft.token.trim(),
      pollSeconds: Math.min(120, Math.max(5, Number(draft.pollSeconds) || 15)),
    };
    saveConfig(next, activeEnv);
    setConfig(next);
    setDraft(next);
    setStats(null);
    setLogs([]);
    setRequests([]);
    setProductEvents([]);
    setHealth(null);
    setPipeline(null);
    setSavedNote(
      isElectron
        ? `${activePreset.label} saved on this Mac — reopen anytime.`
        : `${activePreset.label} saved in this browser.`,
    );
  };

  const handleSwitchEnv = (env: EnvId) => {
    if (env === activeEnv) return;
    const next = switchEnv(env);
    setActiveEnv(env);
    setConfig(next);
    setDraft(next);
    setStats(null);
    setLogs([]);
    setRequests([]);
    setProductEvents([]);
    setHealth(null);
    setPipeline(null);
    setError(null);
    setDrill(null);
    setSavedNote(null);
  };

  const refresh = async (cfg = config) => {
    if (!cfg.token.trim() || !cfg.apiUrl.trim()) {
      setError("Set API URL and ADMIN_TOKEN, then Save.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const s = await fetchStats(cfg);
      setStats(s);
      const settled = await Promise.allSettled([
        fetchLogs(cfg, { level: logLevel, limit: 100, q: query }),
        fetchRequests(cfg, { errors: errorsOnlyHttp, limit: 100 }),
        fetchHealthOps(cfg),
        fetchProductEvents(cfg, {
          limit: 40,
          type: productEventType === "all" ? undefined : productEventType,
        }),
        fetchPipeline(cfg),
      ]);
      const [logsResult, requestsResult, healthResult, eventsResult, pipelineResult] =
        settled;
      setLogs(logsResult.status === "fulfilled" ? logsResult.value : []);
      setRequests(requestsResult.status === "fulfilled" ? requestsResult.value : []);
      setProductEvents(eventsResult.status === "fulfilled" ? eventsResult.value : []);
      setPipeline(pipelineResult.status === "fulfilled" ? pipelineResult.value : null);
      setHealth(
        healthResult.status === "fulfilled"
          ? healthResult.value
          : {
              ok: true,
              service: "arc-tenders-api",
              db: true,
              slackConfigured: false,
              generatedAt: new Date().toISOString(),
              bufferedLogs: 0,
              bufferedRequests: 0,
              errorsInBuffer: 0,
              warnsInBuffer: 0,
              http5xxInBuffer: 0,
              http4xxInBuffer: 0,
            },
      );
      const failed = settled
        .map((r, i) =>
          r.status === "rejected"
            ? (["logs", "requests", "health", "product-events", "pipeline"] as const)[i]
            : null,
        )
        .filter(Boolean);
      if (failed.length > 0) {
        setError(`Connected to stats. Missing ops routes: ${failed.join(", ")} — deploy latest API.`);
      }
      setLastRefresh(new Date().toISOString());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setHealth(null);
      setPipeline(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!connected) return;
    void refresh(config);
    const id = window.setInterval(() => void refresh(config), config.pollSeconds * 1000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, logLevel, errorsOnlyHttp, productEventType]);

  const openExternalUrl = async (url: string) => {
    if (window.arcTendersOps?.openExternal) {
      await window.arcTendersOps.openExternal(url);
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleCreateSandbox = async () => {
    if (!connected) {
      setError("Connect first (token), then create a sandbox.");
      return;
    }
    setSandboxBusy(true);
    setError(null);
    try {
      const data = await createSandbox(config, { planKey: sandboxPlan, role: sandboxRole });
      await openExternalUrl(data.openUrl);
      setSavedNote(
        `Opened ${sandboxPlan}/${sandboxRole} sandbox${
          data.credentials ? ` (${data.credentials.email})` : ""
        }.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSandboxBusy(false);
    }
  };

  const handleGrant = async () => {
    if (!grantEmail.trim()) return;
    setGrantBusy(true);
    setError(null);
    try {
      await grantPlan(config, {
        email: grantEmail.trim(),
        planKey: grantPlanKey,
        password: grantPassword.trim() || undefined,
      });
      setSavedNote(`Granted ${grantPlanKey} to ${grantEmail.trim()}`);
      setGrantPassword("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGrantBusy(false);
    }
  };

  const handleNotify = async () => {
    try {
      setLoading(true);
      const data = await notifySlackStats(config);
      if (data && "users" in data) setStats(data);
      if (!data.slackSent) {
        setError("Slack notify ran but webhook was not sent (check SLACK_WEBHOOK_URL).");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const openDrill = (next: DrillState) => {
    if (!connected) {
      setError("Connect first (API URL + token), then open details.");
      return;
    }
    setDrill(next);
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <h1>
            <img
              src="/favicon.png"
              alt=""
              width={28}
              height={28}
              style={{
                verticalAlign: "middle",
                marginRight: 10,
                borderRadius: 7,
              }}
            />
            ARC Tenders Ops
          </h1>
          <p>
            {activePreset.label} pulse — signups, product actions, plans &amp; errors
            {isElectron ? " · Electron" : ""}
          </p>
        </div>
        <div className="top-actions">
          <span className={`pill env ${activeEnv}`}>
            <span className="dot" />
            {activePreset.label}
          </span>
          <span className={`pill ${health?.ok ? "ok" : connected ? "bad" : ""}`}>
            <span className="dot" />
            {health?.ok ? "API + DB OK" : connected ? "Unhealthy / offline" : "Not connected"}
          </span>
          <button
            type="button"
            className="btn"
            onClick={() => void refresh()}
            disabled={loading || !connected}
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={() => void handleNotify()}
            disabled={loading || !connected}
          >
            Slack stats
          </button>
        </div>
      </header>

      <div className="layout">
        <aside className="sidebar">
          <h2>Connection</h2>
          <div className="env-switch" role="tablist" aria-label="Environment">
            {ENV_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                role="tab"
                aria-selected={activeEnv === preset.id}
                className={`env-tab ${activeEnv === preset.id ? "active" : ""} ${preset.id}`}
                onClick={() => handleSwitchEnv(preset.id)}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <div className="field">
            <label htmlFor="apiUrl">API base URL</label>
            <input id="apiUrl" value={activePreset.apiUrl} readOnly aria-readonly="true" />
          </div>
          <div className="field">
            <label htmlFor="token">ADMIN_TOKEN ({activePreset.label})</label>
            <input
              id="token"
              type="password"
              value={draft.token}
              onChange={(e) => setDraft((d) => ({ ...d, token: e.target.value }))}
              placeholder="Coolify ADMIN_TOKEN"
              autoComplete="off"
            />
          </div>
          <div className="field">
            <label htmlFor="poll">Auto-refresh (seconds)</label>
            <input
              id="poll"
              type="number"
              min={5}
              max={120}
              value={draft.pollSeconds}
              onChange={(e) =>
                setDraft((d) => ({ ...d, pollSeconds: Number(e.target.value) || 15 }))
              }
            />
          </div>
          <button type="button" className="btn primary" onClick={handleSave} style={{ width: "100%" }}>
            Save {activePreset.label} connection
          </button>
          {savedNote ? <p className="hint ok-hint">{savedNote}</p> : null}

          <h2 style={{ marginTop: "1.4rem" }}>Feature lab</h2>
          <div className="field">
            <label htmlFor="sandboxPlan">Plan</label>
            <select
              id="sandboxPlan"
              value={sandboxPlan}
              onChange={(e) =>
                setSandboxPlan(e.target.value as "free" | "trial" | "basic" | "pro")
              }
            >
              <option value="free">Free</option>
              <option value="trial">Trial</option>
              <option value="basic">Basic</option>
              <option value="pro">Pro</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="sandboxRole">Role</label>
            <select
              id="sandboxRole"
              value={sandboxRole}
              onChange={(e) => setSandboxRole(e.target.value as "owner" | "admin" | "member")}
            >
              <option value="owner">Owner</option>
              <option value="admin">Admin</option>
              <option value="member">Member</option>
            </select>
          </div>
          <button
            type="button"
            className="btn primary"
            style={{ width: "100%" }}
            disabled={!connected || sandboxBusy}
            onClick={() => void handleCreateSandbox()}
          >
            {sandboxBusy ? "Opening…" : "Create & open sandbox"}
          </button>

          <h2 style={{ marginTop: "1.4rem" }}>Grant plan</h2>
          <div className="field">
            <label htmlFor="grantEmail">Email</label>
            <input
              id="grantEmail"
              value={grantEmail}
              onChange={(e) => setGrantEmail(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="grantPlan">Plan</label>
            <select
              id="grantPlan"
              value={grantPlanKey}
              onChange={(e) =>
                setGrantPlanKey(e.target.value as "free" | "trial" | "basic" | "pro")
              }
            >
              <option value="free">free</option>
              <option value="trial">trial</option>
              <option value="basic">basic</option>
              <option value="pro">pro</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="grantPassword">New password (optional)</label>
            <input
              id="grantPassword"
              type="password"
              value={grantPassword}
              onChange={(e) => setGrantPassword(e.target.value)}
            />
          </div>
          <button
            type="button"
            className="btn"
            style={{ width: "100%" }}
            disabled={!connected || grantBusy || !grantEmail.trim()}
            onClick={() => void handleGrant()}
          >
            {grantBusy ? "Granting…" : "Grant plan"}
          </button>

          {lastRefresh ? <p className="hint">Last refresh: {formatTime(lastRefresh)}</p> : null}
        </aside>

        <main className="main">
          {error ? <div className="error-banner fade-in">{error}</div> : null}

          <div className="section-head">
            <h2>Overview</h2>
            <span>{stats?.generatedAt ? formatTime(stats.generatedAt) : "—"}</span>
          </div>

          <div className="grid-stats fade-in">
            <button
              type="button"
              className="stat clickable"
              onClick={() => openDrill({ kind: "users", title: "Users" })}
              aria-label="Open users list"
            >
              <div className="label">Users</div>
              <div className="value">{stats?.users ?? "—"}</div>
              <div className="sub">
                {stats
                  ? `+${stats.usersLast24h ?? 0} 24h · +${stats.usersLast7d ?? 0} 7d · unverified ${stats.unverifiedUsers ?? 0}`
                  : "—"}
              </div>
            </button>
            <button
              type="button"
              className="stat clickable"
              onClick={() => openDrill({ kind: "organizations", title: "Organizations" })}
              aria-label="Open organizations list"
            >
              <div className="label">Organizations</div>
              <div className="value">{stats?.organizations ?? "—"}</div>
              <div className="sub">
                {stats
                  ? `+${stats.orgsLast7d ?? 0} 7d · active ${stats.byBillingStatus.active} · past due ${stats.byBillingStatus.past_due}`
                  : "—"}
              </div>
            </button>
            <button
              type="button"
              className="stat clickable"
              onClick={() => openDrill({ kind: "paying", title: "Paying organizations" })}
              aria-label="Open paying organizations"
            >
              <div className="label">Paying</div>
              <div className="value">{stats?.payingOrgs ?? "—"}</div>
              <div className="sub">
                {stats ? `${stats.payingUsers} seats on paid plans · open` : "—"}
              </div>
            </button>
            <button
              type="button"
              className="stat clickable"
              onClick={() => openDrill({ kind: "errors", title: "Errors & failed requests" })}
              aria-label="Open errors buffer"
            >
              <div className="label">Errors (buffer)</div>
              <div className="value">{stats?.logs.errorsInBuffer ?? health?.errorsInBuffer ?? "—"}</div>
              <div className="sub">
                {stats
                  ? `warn ${stats.logs.warnsInBuffer} · 5xx ${stats.logs.http5xxInBuffer}`
                  : "—"}
              </div>
            </button>
          </div>

          <div className="section-head" style={{ marginTop: "1.25rem" }}>
            <h2>Pipeline</h2>
            <span>
              {pipeline?.generatedAt
                ? formatTime(pipeline.generatedAt)
                : health?.pipeline
                  ? "summary from /health"
                  : "—"}
            </span>
          </div>

          {(pipeline?.alerts.length || health?.pipeline?.alertCount) ? (
            <div className="alert-stack fade-in" role="status" aria-label="Pipeline alerts">
              {(pipeline?.alerts ?? []).map((alert) => (
                <div key={alert.code} className={`pipeline-alert ${alert.level}`}>
                  <strong>{alert.code}</strong>
                  <span>{alert.messageEl}</span>
                </div>
              ))}
              {!pipeline && health?.pipeline ? (
                <div className="pipeline-alert warn">
                  <strong>pipeline_summary</strong>
                  <span>
                    alerts {health.pipeline.alertCount} · outbox failed{" "}
                    {health.pipeline.outboxFailed} · email failed 24h{" "}
                    {health.pipeline.emailFailed24h}
                  </span>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="grid-stats fade-in pipeline-grid">
            <div className="stat">
              <div className="label">Outbox pending</div>
              <div className="value">
                {pipeline?.outbox.pending ?? health?.pipeline?.outboxPending ?? "—"}
              </div>
              <div className="sub">
                due {pipeline?.outbox.dueNow ?? "—"} · lag{" "}
                {formatAge(
                  pipeline?.outbox.oldestPendingAgeMs ??
                    health?.pipeline?.outboxLagMs,
                )}{" "}
                · stuck {pipeline?.outbox.stuckRunning ?? "—"}
              </div>
            </div>
            <div className="stat">
              <div className="label">Outbox failed</div>
              <div className="value">
                {pipeline?.outbox.failed ?? health?.pipeline?.outboxFailed ?? "—"}
              </div>
              <div className="sub">
                process fail {pipeline?.outbox.process.failed ?? "—"} · retry{" "}
                {pipeline?.outbox.process.retried ?? "—"} · ok{" "}
                {pipeline?.outbox.process.succeeded ?? "—"}
              </div>
            </div>
            <div className="stat">
              <div className="label">Ingest freshness</div>
              <div className="value">
                {(pipeline?.ingest.fresh ?? health?.pipeline?.ingestFresh) === true
                  ? "OK"
                  : (pipeline?.ingest.fresh ?? health?.pipeline?.ingestFresh) === false
                    ? "STALE"
                    : "—"}
              </div>
              <div className="sub">
                age{" "}
                {formatAge(
                  pipeline?.ingest.successAgeMs ??
                    health?.pipeline?.ingestSuccessAgeMs,
                )}
                {pipeline?.ingest.completeness?.pageBudgetExhausted
                  ? " · page budget hit"
                  : ""}
              </div>
            </div>
            <div className="stat">
              <div className="label">Email 24h</div>
              <div className="value">{pipeline?.email.sent24h ?? "—"}</div>
              <div className="sub">
                fail {pipeline?.email.failed24h ?? health?.pipeline?.emailFailed24h ?? "—"} ·
                pending {pipeline?.email.pending24h ?? "—"} · skip{" "}
                {pipeline?.email.skipped24h ?? "—"}
              </div>
            </div>
            <div className="stat">
              <div className="label">Storage used</div>
              <div className="value">
                {pipeline ? formatBytes(pipeline.storage.totalBytesUsed) : "—"}
              </div>
              <div className="sub">
                {pipeline
                  ? `${pipeline.storage.documentCount} files · ${pipeline.storage.orgsWithVault} orgs`
                  : "—"}
              </div>
            </div>
            <div className="stat">
              <div className="label">PDF extract</div>
              <div className="value">
                {pipeline?.pdf.process.avgMs != null
                  ? `${pipeline.pdf.process.avgMs}ms`
                  : "—"}
              </div>
              <div className="sub">
                n={pipeline?.pdf.process.count ?? "—"} · max{" "}
                {pipeline?.pdf.process.maxMs ?? "—"}ms
              </div>
            </div>
          </div>

          <div className="panels pipeline-panels">
            <section className="panel fade-in" aria-label="Outbox detail">
              <div className="panel-toolbar">
                <h3>Outbox</h3>
                <span className="hint">
                  process lag {formatAge(pipeline?.outbox.process.lastLagMs)}
                </span>
              </div>
              <div className="panel-body">
                <div className="chip-row">{kvChips(pipeline?.outbox.byStatus)}</div>
                <div className="chip-row" style={{ marginTop: 8 }}>
                  {kvChips(pipeline?.outbox.byType)}
                </div>
                {(pipeline?.outbox.recentFailed.length ?? 0) === 0 ? (
                  <div className="empty" style={{ marginTop: 12 }}>
                    No failed outbox jobs.
                  </div>
                ) : (
                  <div className="mini-table" style={{ marginTop: 12 }}>
                    {pipeline!.outbox.recentFailed.map((row) => (
                      <div className="row" key={row.id}>
                        <div className="ts">{formatTime(row.updatedAt)}</div>
                        <div className="level error">{row.type}</div>
                        <div className="msg">
                          attempts {row.attempts}
                          {row.lastError ? ` · ${row.lastError}` : ""}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>

            <section className="panel fade-in" aria-label="Ingest and email detail">
              <div className="panel-toolbar">
                <h3>Ingest · Email · PDF</h3>
              </div>
              <div className="panel-body">
                <p className="hint" style={{ marginTop: 0 }}>
                  Last success:{" "}
                  {pipeline?.ingest.lastSuccessAt
                    ? formatTime(pipeline.ingest.lastSuccessAt)
                    : "—"}
                  {pipeline?.ingest.lastError
                    ? ` · last error: ${pipeline.ingest.lastError.slice(0, 120)}`
                    : ""}
                </p>
                {pipeline?.ingest.completeness?.noteEl ? (
                  <p className="hint">{pipeline.ingest.completeness.noteEl}</p>
                ) : null}
                <div className="chip-row">
                  <span className="chip">email 24h SENT {pipeline?.email.sent24h ?? 0}</span>
                  <span className="chip">FAILED {pipeline?.email.failed24h ?? 0}</span>
                  <span className="chip">PENDING {pipeline?.email.pending24h ?? 0}</span>
                  <span className="chip">SKIPPED {pipeline?.email.skipped24h ?? 0}</span>
                </div>
                <div className="chip-row" style={{ marginTop: 8 }}>
                  {kvChips(pipeline?.email.last7d)}
                </div>
                <div className="chip-row" style={{ marginTop: 8 }}>
                  {kvChips(pipeline?.pdf.tendersByPdfStatus)}
                  {kvChips(pipeline?.pdf.process.byStatus)}
                </div>
                <p className="hint" style={{ marginBottom: 0 }}>
                  Storage root: {pipeline?.storage.root ?? "—"} ·{" "}
                  {pipeline?.storage.noteEl ?? ""}
                </p>
              </div>
            </section>
          </div>

          <div className="panels">
            <section className="panel fade-in" aria-label="Event logs">
              <div className="panel-toolbar">
                <h3>Event log</h3>
                <div className="top-actions">
                  <select
                    aria-label="Log level filter"
                    value={logLevel}
                    onChange={(e) => setLogLevel(e.target.value)}
                  >
                    <option value="error_warn">errors + warns</option>
                    <option value="error">errors only</option>
                    <option value="warn">warns only</option>
                    <option value="all">all</option>
                  </select>
                  <input
                    aria-label="Search logs"
                    placeholder="Search…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void refresh();
                    }}
                    style={{
                      width: 140,
                      border: "1px solid var(--line-strong)",
                      background: "var(--bg)",
                      color: "var(--text)",
                      borderRadius: "0.45rem",
                      padding: "0.35rem 0.55rem",
                    }}
                  />
                </div>
              </div>
              <div className="panel-body">
                {logs.length === 0 ? (
                  <div className="empty">No buffered events yet.</div>
                ) : (
                  logs.map((row) => (
                    <div className="row" key={row.id}>
                      <div className="ts">{formatTime(row.ts)}</div>
                      <div className={`level ${row.level}`}>{row.level}</div>
                      <div className="msg">
                        {row.message}
                        {row.meta ? <code>{JSON.stringify(row.meta)}</code> : null}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="panel fade-in" aria-label="HTTP requests and plans">
              <div className="panel-toolbar">
                <h3>HTTP {errorsOnlyHttp ? "errors" : "requests"}</h3>
                <label style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
                  <input
                    type="checkbox"
                    checked={errorsOnlyHttp}
                    onChange={(e) => setErrorsOnlyHttp(e.target.checked)}
                    style={{ marginRight: 6 }}
                  />
                  4xx/5xx only
                </label>
              </div>
              <div className="panel-body" style={{ maxHeight: 220 }}>
                {requests.length === 0 ? (
                  <div className="empty">No matching requests in buffer.</div>
                ) : (
                  requests.map((row) => (
                    <button
                      type="button"
                      className="row req clickable-row"
                      key={row.id}
                      onClick={() =>
                        openDrill({
                          kind: "errors",
                          title: "Errors & failed requests",
                          requestId: row.id,
                        })
                      }
                    >
                      <div className="ts">{formatTime(row.ts)}</div>
                      <div className="msg" style={{ fontFamily: "var(--mono)", fontSize: "0.72rem" }}>
                        {row.method}
                      </div>
                      <div className={`status ${statusClass(row.status)}`}>{row.status}</div>
                      <div className="msg">{row.path}</div>
                      <div className="ts">{row.ms}ms</div>
                    </button>
                  ))
                )}
              </div>

              <div className="panel-toolbar" style={{ borderTop: "1px solid var(--line)" }}>
                <h3>Plans</h3>
              </div>
              <div className="plan-bars">
                {(
                  [
                    ["free", stats?.byPlan.free ?? 0],
                    ["trial", stats?.byPlan.trial ?? 0],
                    ["basic", stats?.byPlan.basic ?? 0],
                    ["pro", stats?.byPlan.pro ?? 0],
                  ] as const
                ).map(([name, n]) => (
                  <button
                    type="button"
                    className="plan-row clickable"
                    key={name}
                    onClick={() =>
                      openDrill({
                        kind: "plan",
                        title: `Organizations · ${name}`,
                        plan: name,
                      })
                    }
                    aria-label={`Open ${name} organizations`}
                  >
                    <div className="name">{name}</div>
                    <div className="bar">
                      <span style={{ width: `${Math.round((n / planMax) * 100)}%` }} />
                    </div>
                    <div className="n">{n}</div>
                  </button>
                ))}
              </div>
            </section>
          </div>

          <section className="panel fade-in panel-wide" aria-label="Product analytics">
            <div className="panel-toolbar">
              <h3>Product events</h3>
              <div className="top-actions">
                <select
                  aria-label="Product event type filter"
                  value={productEventType}
                  onChange={(e) => setProductEventType(e.target.value)}
                >
                  <option value="all">all types</option>
                  <option value="user_signed_up">user_signed_up</option>
                  <option value="email_verified">email_verified</option>
                  <option value="login_succeeded">login_succeeded</option>
                  <option value="organization_created">organization_created</option>
                  <option value="trial_started">trial_started</option>
                  <option value="watch_profile_created">watch_profile_created</option>
                  <option value="tender_followed">tender_followed</option>
                  <option value="checkout_started">checkout_started</option>
                  <option value="subscription_started">subscription_started</option>
                </select>
                <button
                  type="button"
                  className="btn"
                  onClick={() =>
                    openDrill({ kind: "product-events", title: "Product events" })
                  }
                  disabled={!connected}
                  aria-label="Open full product events list"
                >
                  Open full list
                </button>
              </div>
            </div>
            <div className="panel-body" style={{ maxHeight: 280 }}>
              {productEvents.length === 0 ? (
                <div className="empty">
                  No product events yet — new signups, logins, orgs, follows, and checkouts appear here.
                </div>
              ) : (
                productEvents.slice(0, 40).map((row) => (
                  <button
                    type="button"
                    className="row evt clickable-row"
                    key={row.id}
                    onClick={() => {
                      if (row.userId) {
                        const label =
                          row.userEmail ||
                          row.userName ||
                          `${row.userId.slice(0, 10)}…`;
                        openDrill({
                          kind: "trial-activity",
                          title: `Activity · ${label}`,
                          userId: row.userId,
                        });
                        return;
                      }
                      openDrill({ kind: "product-events", title: "Product events" });
                    }}
                    aria-label={`Open timeline for ${row.type}`}
                  >
                    <div className="ts">{formatTime(row.createdAt)}</div>
                    <div className="level info">{row.type}</div>
                    <div className="msg">
                      {row.userEmail ||
                        row.userName ||
                        (row.entityType && row.entityId
                          ? `${row.entityType}:${row.entityId.slice(0, 12)}…`
                          : row.userId
                            ? `user ${row.userId.slice(0, 12)}…`
                            : "—")}
                      {row.organizationName ? (
                        <code>{row.organizationName}</code>
                      ) : null}
                    </div>
                  </button>
                ))
              )}
            </div>
          </section>
        </main>
      </div>

      <DetailModal open={drill} config={config} onClose={() => setDrill(null)} />
    </div>
  );
};
