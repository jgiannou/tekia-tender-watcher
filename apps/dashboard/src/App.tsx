import { useEffect, useState } from "react";
import { NavLink, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { OpportunitiesPage } from "./pages/OpportunitiesPage";
import { TenderDetailPage } from "./pages/TenderDetailPage";
import { SubmittedPage } from "./pages/SubmittedPage";
import { SettingsPage } from "./pages/SettingsPage";
import { isConfigured, isDesktop } from "./api";

export const App = () => {
  const navigate = useNavigate();
  const [desktopReady, setDesktopReady] = useState(!isDesktop());
  const [desktopError, setDesktopError] = useState<string | null>(null);
  const [needsConnection, setNeedsConnection] = useState(false);

  useEffect(() => {
    if (!isDesktop() || !window.tekia) return;

    let cancelled = false;
    window.tekia.connection
      .get()
      .then((conn) => {
        if (cancelled) return;
        if (!conn.apiUrl || !conn.hasToken) {
          setNeedsConnection(true);
          setDesktopReady(true);
          return;
        }
        return window.tekia!.connection.test().then((result) => {
          if (cancelled) return;
          if (result.status !== "connected") {
            setDesktopError(result.message);
            setNeedsConnection(result.status === "not_configured");
          }
          setDesktopReady(true);
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setDesktopError(err instanceof Error ? err.message : String(err));
        setDesktopReady(true);
      });

    const offTender = window.tekia.navigation.onOpenTender((ref) => {
      navigate(`/tenders/${encodeURIComponent(ref)}`);
    });
    const offSettings = window.tekia.navigation.onOpenSettings(() => {
      navigate("/settings");
    });

    return () => {
      cancelled = true;
      offTender();
      offSettings();
    };
  }, [navigate]);

  const webBlocked = !isDesktop() && !isConfigured();

  return (
    <div className="app-shell">
      <header className="topnav">
        <div className="brand">
          <strong>TEKIA</strong>
          <span>
            Tender Ops · {isDesktop() ? "desktop" : "local web"}
          </span>
        </div>
        <nav className="nav-links" aria-label="Main">
          <NavLink
            to="/opportunities"
            className={({ isActive }) => (isActive ? "active" : undefined)}
          >
            Opportunities
          </NavLink>
          <NavLink
            to="/submitted"
            className={({ isActive }) => (isActive ? "active" : undefined)}
          >
            Submitted
          </NavLink>
          <NavLink
            to="/settings"
            className={({ isActive }) => (isActive ? "active" : undefined)}
          >
            Settings / Vault
          </NavLink>
        </nav>
      </header>

      {webBlocked ? (
        <div className="error" role="alert">
          Configure <code>apps/dashboard/.env</code> with{" "}
          <code>VITE_WATCHER_API_URL</code> and{" "}
          <code>VITE_OPERATOR_API_TOKEN</code>, then restart{" "}
          <code>pnpm dashboard:dev:web</code>.
        </div>
      ) : !desktopReady ? (
        <p className="muted">Starting desktop shell…</p>
      ) : needsConnection ? (
        <div className="stack">
          <div className="alert-box" role="status">
            Configure Watcher API URL and Operator API Token in Settings to
            connect the desktop app to the cloud watcher.
          </div>
          <Routes>
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/settings" replace />} />
          </Routes>
        </div>
      ) : (
        <>
          {desktopError ? (
            <div className="error" role="alert" style={{ marginBottom: 12 }}>
              <div>Watcher API unavailable / authentication issue.</div>
              <div className="muted" style={{ marginTop: 4 }}>
                {desktopError}
              </div>
              <div className="actions">
                <button
                  type="button"
                  className="btn"
                  onClick={() => window.location.reload()}
                >
                  Retry
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => navigate("/settings")}
                >
                  Open Settings
                </button>
              </div>
            </div>
          ) : null}
          <Routes>
            <Route path="/" element={<Navigate to="/opportunities" replace />} />
            <Route path="/opportunities" element={<OpportunitiesPage />} />
            <Route
              path="/tenders/:referenceNumber"
              element={<TenderDetailPage />}
            />
            <Route path="/submitted" element={<SubmittedPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </>
      )}
    </div>
  );
};
