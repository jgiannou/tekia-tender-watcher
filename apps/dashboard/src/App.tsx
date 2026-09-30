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

  useEffect(() => {
    if (!isDesktop() || !window.tekia) return;

    let cancelled = false;
    window.tekia.connection
      .get()
      .then(() => {
        if (!cancelled) setDesktopReady(true);
      })
      .catch(() => {
        if (!cancelled) setDesktopReady(true);
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
      ) : (
        <div className="page-scroll">
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
        </div>
      )}
    </div>
  );
};
