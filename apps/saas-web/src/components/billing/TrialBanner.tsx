import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useSessionContext } from "@/auth/SessionProvider";
import { Button } from "@/components/ui/button";
import { saasApi } from "@/lib/api";
import {
  MARKETING_PLANS,
  PRICING_TAX_LABEL,
  TRIAL_DAYS,
} from "@/marketing/pricing";
import { cn } from "@/lib/utils";

type BannerState =
  | { kind: "trial"; trialEndsAt: string | null }
  | { kind: "trial_expired"; trialEndsAt: string | null }
  | { kind: "free"; canStartProTrial: boolean };

const formatPrice = (amount: number) =>
  amount.toLocaleString("el-GR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const daysLeftLabel = (trialEndsAt: string | null): string | null => {
  if (!trialEndsAt) return null;
  const end = new Date(trialEndsAt).getTime();
  if (Number.isNaN(end)) return null;
  const ms = end - Date.now();
  if (ms <= 0) return null;
  const days = Math.max(1, Math.ceil(ms / (24 * 60 * 60 * 1000)));
  return days === 1 ? "απομένει 1 ημέρα" : `απομένουν ${days} ημέρες`;
};

export const TrialBanner = () => {
  const { activeOrganization } = useSessionContext();
  const location = useLocation();
  const [banner, setBanner] = useState<BannerState | null>(null);

  useEffect(() => {
    if (!activeOrganization) {
      setBanner(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const [entitlements, billing] = await Promise.all([
          saasApi.getEntitlements(activeOrganization.id),
          saasApi.billingStatus(activeOrganization.id).catch(() => null),
        ]);
        if (cancelled) return;
        const status = entitlements.scanAccess?.status;
        const planKey =
          billing?.planKey ?? entitlements.scanAccess?.planKey ?? null;
        if (status === "trial") {
          setBanner({
            kind: "trial",
            trialEndsAt: entitlements.scanAccess.trialEndsAt ?? null,
          });
          return;
        }
        if (status === "trial_expired") {
          setBanner({
            kind: "trial_expired",
            trialEndsAt: entitlements.scanAccess.trialEndsAt ?? null,
          });
          return;
        }
        if (planKey === "free") {
          setBanner({
            kind: "free",
            canStartProTrial: Boolean(billing?.canStartProTrial),
          });
          return;
        }
        setBanner(null);
      } catch {
        if (!cancelled) setBanner(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeOrganization?.id]);

  if (!banner) return null;
  if (location.pathname.startsWith("/app/subscription")) return null;

  const basicPrice = formatPrice(MARKETING_PLANS.basic.priceMonthlyEur);

  if (banner.kind === "free") {
    return (
      <div
        className="mb-4 flex flex-col gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
        role="status"
        aria-live="polite"
      >
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium">Είστε στο δωρεάν πλάνο</p>
          <p className="text-sm text-muted-foreground">
            Ίδια ταχύτητα εισαγωγής ΚΗΜΔΗΣ.{" "}
            {banner.canStartProTrial
              ? `Δοκιμάστε το Pro για ${TRIAL_DAYS} ημέρες χωρίς κάρτα, ή Basic από `
              : "Basic από "}
            <span className="font-semibold text-foreground">
              €{basicPrice}/μήνα
            </span>{" "}
            {PRICING_TAX_LABEL}.
          </p>
        </div>
        <Button asChild size="sm" className="shrink-0">
          <Link to="/app/subscription" aria-label="Μετάβαση στις συνδρομές">
            {banner.canStartProTrial ? "Δοκίμασε Pro / συνδρομές" : "Δείτε συνδρομές"}
          </Link>
        </Button>
      </div>
    );
  }

  const remaining = daysLeftLabel(banner.trialEndsAt);
  const expired = banner.kind === "trial_expired";
  const endsLabel =
    banner.trialEndsAt && !expired
      ? new Date(banner.trialEndsAt).toLocaleDateString("el-GR")
      : null;

  return (
    <div
      className={cn(
        "mb-4 flex flex-col gap-3 rounded-lg border px-4 py-3 sm:flex-row sm:items-center sm:justify-between",
        expired
          ? "border-destructive/40 bg-destructive/5"
          : "border-primary/40 bg-primary/5",
      )}
      role="status"
      aria-live="polite"
    >
      <div className="min-w-0 space-y-1">
        <p className="text-sm font-medium">
          {expired
            ? "Η δοκιμή Pro έληξε"
            : "Είστε σε δοκιμή Pro"}
        </p>
        <p className="text-sm text-muted-foreground">
          {expired
            ? "Επιστρέφετε στο Free. Ενεργοποιήστε Basic ή Pro για vault, checklist και περισσότερες αναζητήσεις."
            : [
                remaining,
                endsLabel ? `έως ${endsLabel}` : null,
              ]
                .filter(Boolean)
                .join(" · ") || "Pro preview."}{" "}
          Basic από{" "}
          <span className="font-semibold text-foreground">
            €{basicPrice}/μήνα
          </span>{" "}
          {PRICING_TAX_LABEL}.
        </p>
      </div>
      <Button
        asChild
        size="sm"
        className="shrink-0"
        variant={expired ? "destructive" : "default"}
      >
        <Link to="/app/subscription" aria-label="Μετάβαση στις συνδρομές">
          Δείτε συνδρομές
        </Link>
      </Button>
    </div>
  );
};
