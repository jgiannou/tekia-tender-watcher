import { useEffect, useState } from "react";
import {
  ENV_PRESETS,
  fetchHealthOps,
  fetchLogs,
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
  type RequestEntry,
} from "./api";

const formatTime = (iso: string) => {
  try {
    return new Date(iso).toLocaleString([], {
      day: "2-digit",
      month: "2-digit",
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
  return "s2";
};

export const App = () => {
  const [activeEnv, setActiveEnv] = useState<EnvId>(() => loadActiveEnv());
  const [draft, setDraft] = useState<ConnectionConfig>(() => loadConfig());
  const [config, setConfig] = useState<ConnectionConfig>(() => loadConfig());
  const [stats, setStats] = useState<OpsStats | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [requests, setRequests] = useState<RequestEntry[]>([]);
  const [health, setHealth] = useState<HealthOps | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [logLevel, setLogLevel] = useState("error_warn");
  const [errorsOnlyHttp, setErrorsOnlyHttp] = useState(true);
  const [query, setQuery] = useState("");
  const [lastRefresh, setLastRefresh] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const [email, setEmail] = useState("jgiann94@gmail.com");
  const [planKey, setPlanKey] = useState<"trial" | "basic" | "pro">("pro");
  const [password, setPassword] = useState("");
  const [grantBusy, setGrantBusy] = useState(false);

  const preset = ENV_PRESETS.find((p) => p.id === activeEnv) ?? ENV_PRESETS[0];
  const connected = Boolean(config.token.trim() && config.apiUrl.trim());
  const isElectron = Boolean(window.arcTendersOps?.isElectron);

  const handleSave = () => {
    const next = {
      apiUrl: preset.apiUrl,
      token: draft.token.trim(),
      pollSeconds: Math.min(120, Math.max(5, Number(draft.pollSeconds) || 15)),
    };
    saveConfig(next, activeEnv);
    setConfig(next);
    setDraft(next);
    setSavedNote(`${preset.label} saved — reopen anytime.`);
    setError(null);
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
    setHealth(null);
    setError(null);
    setSavedNote(null);
  };

  const refresh = async (cfg = config) => {
    if (!cfg.token.trim() || !cfg.apiUrl.trim()) {
      setError("Paste Coolify ADMIN_TOKEN, then Save.");
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
      ]);
      setLogs(settled[0].status === "fulfilled" ? settled[0].value : []);
      setRequests(settled[1].status === "fulfilled" ? settled[1].value : []);
      setHealth(settled[2].status === "fulfilled" ? settled[2].value : null);
      const failed = settled
        .map((r, i) =>
          r.status === "rejected"
            ? (["logs", "requests", "health"] as const)[i]
            : null,
        )
        .filter(Boolean);
      if (failed.length) {
        setError(
          `Stats OK. Missing panels: ${failed.join(", ")} — Redeploy API (latest main).`,
        );
      }
      setLastRefresh(new Date().toISOString());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setHealth(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!connected) return;
    void refresh(config);
    const id = window.setInterval(
      () => void refresh(config),
      config.pollSeconds * 1000,
    );
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, logLevel, errorsOnlyHttp]);

  const handleNotify = async () => {
    try {
      setLoading(true);
      const data = await notifySlackStats(config);
      if (!data.slackSent) {
        setError("Slack notify ran but webhook failed (check SLACK_WEBHOOK_URL).");
      } else {
        setSavedNote(data.text || "Slack stats sent.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleGrant = async () => {
    setGrantBusy(true);
    setError(null);
    try {
      await grantPlan(config, {
        email,
        planKey,
        password: password || undefined,
      });
      setSavedNote(`Granted ${planKey} to ${email}`);
      setPassword("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGrantBusy(false);
    }
  };

  const handleOpenApp = async () => {
    if (window.arcTendersOps?.openExternal) {
      await window.arcTendersOps.openExternal(preset.appUrl);
      return;
    }
    window.open(preset.appUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="shell">
      <header className="topbar">
        <div>
          <div className="brand">TEKIA · ARC Tenders Ops</div>
          <p className="sub">
            {preset.label} pulse — users, plans, errors &amp; logs
            {isElectron ? " · Electron" : ""}
          </p>
        </div>
        <div className="top-actions">
          <span className={`pill ${health?.ok ? "ok" : connected ? "bad" : ""}`}>
            {health?.ok
              ? "API + DB OK"
              : connected
                ? "Unhealthy / offline"
                : "Not connected"}
          </span>
          <button
            type="button"
            className="btn"
            disabled={loading || !connected}
            onClick={() => void refresh()}
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={loading || !connected}
            onClick={() => void handleNotify()}
          >
            Slack stats
          </button>
        </div>
      </header>

      <div className="layout">
        <aside className="sidebar">
          <h2>Connection</h2>
          <div className="tabs">
            {ENV_PRESETS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={item.id === activeEnv ? "active" : ""}
                onClick={() => handleSwitchEnv(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>

          <label>
            API base URL
            <input value={preset.apiUrl} readOnly aria-label="API URL" />
          </label>
          <label>
            ADMIN_TOKEN ({preset.label})
            <input
              type="password"
              value={draft.token}
              onChange={(e) =>
                setDraft((d) => ({ ...d, token: e.target.value }))
              }
              placeholder="Coolify ADMIN_TOKEN"
              autoComplete="off"
              aria-label="Admin token"
            />
          </label>
          <label>
            Auto-refresh (seconds)
            <input
              type="number"
              min={5}
              max={120}
              value={draft.pollSeconds}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  pollSeconds: Number(e.target.value) || 15,
                }))
              }
              aria-label="Poll seconds"
            />
          </label>
          <button type="button" className="btn primary" onClick={handleSave}>
            Save {preset.label} connection
          </button>
          <button type="button" className="btn" onClick={handleOpenApp}>
            Open web app
          </button>
          {savedNote ? <p className="hint ok">{savedNote}</p> : null}
          <p className="hint">
            Token = Coolify API env <code>ADMIN_TOKEN</code> (not OPERATOR). Health
            alone does not prove auth.
          </p>
          {lastRefresh ? (
            <p className="hint">Last refresh: {formatTime(lastRefresh)}</p>
          ) : null}

          <h2>Grant plan</h2>
          <label>
            Email
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-label="Email"
            />
          </label>
          <label>
            Plan
            <select
              value={planKey}
              onChange={(e) =>
                setPlanKey(e.target.value as "trial" | "basic" | "pro")
              }
              aria-label="Plan"
            >
              <option value="trial">trial</option>
              <option value="basic">basic</option>
              <option value="pro">pro</option>
            </select>
          </label>
          <label>
            New password (optional)
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-label="Password"
            />
          </label>
          <button
            type="button"
            className="btn primary"
            disabled={!connected || grantBusy || !email.trim()}
            onClick={() => void handleGrant()}
          >
            {grantBusy ? "Granting…" : "Grant plan"}
          </button>
        </aside>

        <main className="main">
          {error ? <div className="error-banner">{error}</div> : null}

          <div className="section-head">
            <h2>Overview</h2>
            <span>{stats?.generatedAt ? formatTime(stats.generatedAt) : "—"}</span>
          </div>

          <div className="grid-stats">
            <div className="stat">
              <div className="label">Users</div>
              <div className="value">{stats?.users ?? "—"}</div>
              <div className="sub">
                {stats ? `${stats.memberships} memberships` : "—"}
              </div>
            </div>
            <div className="stat">
              <div className="label">Organizations</div>
              <div className="value">{stats?.organizations ?? "—"}</div>
              <div className="sub">
                {stats
                  ? `trial ${stats.byPlan.trial} · basic ${stats.byPlan.basic} · pro ${stats.byPlan.pro}`
                  : "—"}
              </div>
            </div>
            <div className="stat">
              <div className="label">Paying</div>
              <div className="value">{stats?.payingOrgs ?? "—"}</div>
              <div className="sub">
                {stats
                  ? `active ${stats.byBillingStatus.active} · past due ${stats.byBillingStatus.past_due}`
                  : "—"}
              </div>
            </div>
            <div className="stat">
              <div className="label">Errors (buffer)</div>
              <div className="value">
                {stats?.logs.errorsInBuffer ?? health?.errorsInBuffer ?? "—"}
              </div>
              <div className="sub">
                {stats
                  ? `warn ${stats.logs.warnsInBuffer} · 5xx ${stats.logs.http5xxInBuffer}`
                  : "—"}
              </div>
            </div>
          </div>

          <div className="panels">
            <section className="panel" aria-label="Event logs">
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
                  />
                </div>
              </div>
              <div className="table-wrap">
                {logs.length === 0 ? (
                  <p className="hint">
                    No buffered logs yet (in-memory — fills after API traffic /
                    redeploy).
                  </p>
                ) : (
                  <table>
                    <thead>
                      <tr>
                        <th>Time</th>
                        <th>Level</th>
                        <th>Message</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logs.map((row) => (
                        <tr key={row.id}>
                          <td>{formatTime(row.ts)}</td>
                          <td className={`lvl ${row.level}`}>{row.level}</td>
                          <td>
                            <div>{row.message}</div>
                            {row.meta ? (
                              <pre className="meta">
                                {JSON.stringify(row.meta)}
                              </pre>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </section>

            <section className="panel" aria-label="HTTP errors">
              <div className="panel-toolbar">
                <h3>HTTP errors</h3>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={errorsOnlyHttp}
                    onChange={(e) => setErrorsOnlyHttp(e.target.checked)}
                  />
                  4xx/5xx only
                </label>
              </div>
              <div className="table-wrap">
                {requests.length === 0 ? (
                  <p className="hint">No buffered requests yet.</p>
                ) : (
                  <table>
                    <thead>
                      <tr>
                        <th>Time</th>
                        <th>Status</th>
                        <th>Method</th>
                        <th>Path</th>
                        <th>ms</th>
                      </tr>
                    </thead>
                    <tbody>
                      {requests.map((row) => (
                        <tr key={row.id}>
                          <td>{formatTime(row.ts)}</td>
                          <td className={statusClass(row.status)}>{row.status}</td>
                          <td>{row.method}</td>
                          <td>{row.path}</td>
                          <td>{row.ms}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
};
