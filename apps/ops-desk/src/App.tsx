import { useMemo, useState } from "react";
import {
  ENV_PRESETS,
  fetchHealth,
  grantPlan,
  loadActiveEnv,
  loadConfig,
  saveConfig,
  type ConnectionConfig,
  type EnvId,
} from "./api";

export const App = () => {
  const [activeEnv, setActiveEnv] = useState<EnvId>(() => loadActiveEnv());
  const [draft, setDraft] = useState<ConnectionConfig>(() => loadConfig());
  const [config, setConfig] = useState<ConnectionConfig>(() => loadConfig());
  const [health, setHealth] = useState<Record<string, unknown> | null>(null);
  const [grantResult, setGrantResult] = useState<Record<string, unknown> | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("jgiann94@gmail.com");
  const [planKey, setPlanKey] = useState<"trial" | "basic" | "pro">("pro");
  const [organizationId, setOrganizationId] = useState("");
  const [password, setPassword] = useState("");

  const preset = useMemo(
    () => ENV_PRESETS.find((p) => p.id === activeEnv) ?? ENV_PRESETS[0],
    [activeEnv],
  );
  const connected = Boolean(config.token.trim() && config.apiUrl.trim());
  const isElectron = Boolean(window.arcTendersOps?.isElectron);

  const handleSwitchEnv = (env: EnvId) => {
    setActiveEnv(env);
    const next = loadConfig(env);
    next.apiUrl = ENV_PRESETS.find((p) => p.id === env)!.apiUrl;
    setDraft(next);
    setConfig(next);
    setHealth(null);
    setGrantResult(null);
    setError(null);
  };

  const handleSave = () => {
    const next = {
      apiUrl: preset.apiUrl,
      token: draft.token.trim(),
    };
    saveConfig(next, activeEnv);
    setConfig(next);
    setDraft(next);
    setError(null);
  };

  const handleHealth = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await fetchHealth(config);
      setHealth(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleGrant = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await grantPlan(config, {
        email,
        planKey,
        organizationId: organizationId || undefined,
        password: password || undefined,
      });
      setGrantResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
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
    <div className="app">
      <aside className="side">
        <div className="brand">TEKIA</div>
        <h1>ARC Tenders Ops</h1>
        <p className="muted">
          Local ops desk — health checks and plan grants without Stripe.
          {isElectron ? " Running as Mac app." : " Browser mode."}
        </p>

        <div className="tabs" role="tablist" aria-label="Environment">
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
          API URL
          <input value={preset.apiUrl} readOnly aria-label="API URL" />
        </label>

        <label>
          Admin token
          <input
            type="password"
            value={draft.token}
            onChange={(event) =>
              setDraft((prev) => ({ ...prev, token: event.target.value }))
            }
            placeholder="X-Admin-Token from Coolify"
            aria-label="Admin token"
          />
        </label>

        <button type="button" className="btn" onClick={handleSave}>
          Save connection
        </button>
        <button
          type="button"
          className="btn secondary"
          onClick={handleOpenApp}
        >
          Open web app
        </button>
      </aside>

      <main className="main">
        {!connected ? (
          <div className="card">
            <h2>Connect first</h2>
            <p className="muted">
              Paste the Coolify <code>ADMIN_TOKEN</code> for the API, then Save.
            </p>
          </div>
        ) : (
          <>
            <div className="card">
              <div className="row" style={{ justifyContent: "space-between" }}>
                <h2 style={{ margin: 0 }}>Health</h2>
                <button
                  type="button"
                  className="btn secondary"
                  disabled={busy}
                  onClick={handleHealth}
                >
                  Refresh
                </button>
              </div>
              {health ? (
                <div className="pre">{JSON.stringify(health, null, 2)}</div>
              ) : (
                <p className="muted">Not loaded yet.</p>
              )}
            </div>

            <div className="card">
              <h2>Grant plan</h2>
              <p className="muted">
                Verify email + set trial/basic/pro. Optional password reset for
                bootstrap logins.
              </p>
              <div className="grid" style={{ marginTop: 12 }}>
                <label>
                  Email
                  <input
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    aria-label="User email"
                  />
                </label>
                <label>
                  Plan
                  <select
                    value={planKey}
                    onChange={(event) =>
                      setPlanKey(event.target.value as "trial" | "basic" | "pro")
                    }
                    aria-label="Plan"
                  >
                    <option value="trial">trial</option>
                    <option value="basic">basic</option>
                    <option value="pro">pro</option>
                  </select>
                </label>
                <label>
                  Organization ID (optional)
                  <input
                    value={organizationId}
                    onChange={(event) => setOrganizationId(event.target.value)}
                    aria-label="Organization ID"
                  />
                </label>
                <label>
                  New password (optional)
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    aria-label="New password"
                  />
                </label>
              </div>
              <div className="row" style={{ marginTop: 14 }}>
                <button
                  type="button"
                  className="btn"
                  disabled={busy || !email.trim()}
                  onClick={handleGrant}
                >
                  Grant plan
                </button>
              </div>
              {grantResult ? (
                <div className="pre" style={{ marginTop: 12 }}>
                  {JSON.stringify(grantResult, null, 2)}
                </div>
              ) : null}
            </div>
          </>
        )}

        {error ? (
          <div className="card">
            <h2 className="bad">Error</h2>
            <div className="pre">{error}</div>
          </div>
        ) : null}
      </main>
    </div>
  );
};
