import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useSessionContext } from "@/auth/SessionProvider";
import { Button } from "@/components/ui/button";
import { saasApi } from "@/lib/api";
import {
  MARKETING_PLANS,
  PRICING_TAX_LABEL,
} from "@/marketing/pricing";
import { cn } from "@/lib/utils";

type TrialState = {
  status: "trial" | "trial_expired";
  trialEndsAt: string | null;
};

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
  const [trial, setTrial] = useState<TrialState | null>(null);

  useEffect(() => {
    if (!activeOrganization) {
      setTrial(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const data = await saasApi.getEntitlements(activeOrganization.id);
        const status = data.scanAccess?.status;
        if (cancelled) return;
        if (status === "trial" || status === "trial_expired") {
          setTrial({
            status,
            trialEndsAt: data.scanAccess.trialEndsAt ?? null,
          });
          return;
        }
        setTrial(null);
      } catch {
        if (!cancelled) setTrial(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeOrganization?.id]);

  if (!trial) return null;
  if (location.pathname.startsWith("/app/subscription")) return null;

  const basicPrice = formatPrice(MARKETING_PLANS.basic.priceMonthlyEur);
  const remaining = daysLeftLabel(trial.trialEndsAt);
  const expired = trial.status === "trial_expired";
  const endsLabel =
    trial.trialEndsAt && !expired
      ? new Date(trial.trialEndsAt).toLocaleDateString("el-GR")
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
            ? "Η δοκιμαστική περίοδος έληξε"
            : "Είστε σε δοκιμαστική περίοδο"}
        </p>
        <p className="text-sm text-muted-foreground">
          {expired
            ? "Ενεργοποιήστε συνδρομή για να συνεχίσετε σαρώσεις και ειδοποιήσεις."
            : [
                remaining,
                endsLabel ? `έως ${endsLabel}` : null,
              ]
                .filter(Boolean)
                .join(" · ") || "Περιορισμένες δυνατότητες δοκιμής."}{" "}
          Ξεκινήστε από Basic με μόλις{" "}
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
        <Link
          to="/app/subscription"
          aria-label="Μετάβαση στις συνδρομές"
        >
          Δείτε συνδρομές
        </Link>
      </Button>
    </div>
  );
};
