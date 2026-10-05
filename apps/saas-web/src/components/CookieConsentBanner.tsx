import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  CONSENT_FEATURES,
  acceptAllOptionalConsent,
  loadOptionalTrackersIfAllowed,
  optionalConsentRequired,
  readConsentState,
  rejectOptionalConsent,
  saveCustomConsent,
  type ConsentState,
} from "@/legal";

/**
 * Renders ONLY when analytics/marketing feature flags are on.
 * Today those flags are false → component returns null (no fake banner).
 */
export const CookieConsentBanner = () => {
  const [state, setState] = useState<ConsentState | null>(null);
  const [manageOpen, setManageOpen] = useState(false);
  const [draftAnalytics, setDraftAnalytics] = useState(false);
  const [draftMarketing, setDraftMarketing] = useState(false);

  useEffect(() => {
    if (!optionalConsentRequired()) return;
    const current = readConsentState();
    setState(current);
    setDraftAnalytics(current.analytics);
    setDraftMarketing(current.marketing);
    if (current.decidedAt) {
      loadOptionalTrackersIfAllowed();
    }
  }, []);

  if (!optionalConsentRequired() || !state || state.decidedAt) {
    return null;
  }

  const handleAcceptAll = () => {
    const next = acceptAllOptionalConsent();
    setState(next);
    loadOptionalTrackersIfAllowed();
  };

  const handleReject = () => {
    const next = rejectOptionalConsent();
    setState(next);
  };

  const handleSaveCustom = () => {
    const next = saveCustomConsent({
      analytics: draftAnalytics,
      marketing: draftMarketing,
    });
    setState(next);
    setManageOpen(false);
    loadOptionalTrackersIfAllowed();
  };

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card/95 p-4 shadow-lg backdrop-blur"
      role="dialog"
      aria-label="Προτιμήσεις cookies"
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1 text-sm">
          <p className="font-medium text-foreground">Cookies &amp; προαιρετικές μετρήσεις</p>
          <p className="text-muted-foreground">
            Χρησιμοποιούμε απαραίτητα cookies για σύνδεση. Προαιρετικά analytics
            {CONSENT_FEATURES.marketingEnabled ? " / διαφήμιση" : ""} μόνο με τη
            συναίνεσή σας.{" "}
            <Link
              to="/legal/cookies"
              className="text-primary underline-offset-4 hover:underline"
            >
              Πολιτική Cookies
            </Link>
          </p>
          {manageOpen ? (
            <div className="mt-2 space-y-2 rounded-md border border-border p-3">
              {CONSENT_FEATURES.analyticsEnabled ? (
                <label className="flex items-center justify-between gap-3 text-sm">
                  <span>Analytics</span>
                  <input
                    type="checkbox"
                    checked={draftAnalytics}
                    onChange={(e) => setDraftAnalytics(e.target.checked)}
                    aria-label="Συναίνεση analytics"
                  />
                </label>
              ) : null}
              {CONSENT_FEATURES.marketingEnabled ? (
                <label className="flex items-center justify-between gap-3 text-sm">
                  <span>Marketing / διαφήμιση</span>
                  <input
                    type="checkbox"
                    checked={draftMarketing}
                    onChange={(e) => setDraftMarketing(e.target.checked)}
                    aria-label="Συναίνεση marketing"
                  />
                </label>
              ) : null}
              <Button size="sm" onClick={handleSaveCustom}>
                Αποθήκευση προτιμήσεων
              </Button>
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={handleReject}>
            Απόρριψη προαιρετικών
          </Button>
          <Button variant="outline" onClick={() => setManageOpen((o) => !o)}>
            Ρυθμίσεις
          </Button>
          <Button onClick={handleAcceptAll}>Αποδοχή</Button>
        </div>
      </div>
    </div>
  );
};
