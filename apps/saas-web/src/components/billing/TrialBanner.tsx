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
  | { kind: "trial"; trialEndsAt: string | null; promotional?: boolean }
  | { kind: "trial_expired"; trialEndsAt: string | null }
  | { kind: "free"; canStartProTrial: boolean; canStartLaunchPromo?: boolean };

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
  const { activeOrganization, user } = useSessionContext();
  const location = useLocation();
  const [banner, setBanner] = useState<BannerState | null>(null);

  useEffect(() => {
    if (!activeOrganization) {
      setBanner(null);
      return;
    }
    // Email verify is the primary CTA — don't stack a promo banner on top.
    if (user?.emailVerified === false) {
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
        if (entitlements.scanAccess?.status === "unverified") {
          setBanner(null);
          return;
        }
        const status = entitlements.scanAccess?.status;
        const planKey =
          billing?.planKey ?? entitlements.scanAccess?.planKey ?? null;
        if (status === "promo" || status === "trial") {
          setBanner({
            kind: "trial",
            trialEndsAt:
              entitlements.scanAccess?.promo?.expiresAt ??
              entitlements.scanAccess.trialEndsAt ??
              null,
            promotional: status === "promo",
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
        if (planKey === "free" || status === "active") {
          const isFree =
            planKey === "free" ||
            (!billing?.hasStripeSubscription && planKey !== "basic" && planKey !== "pro");
          if (!isFree) {
            setBanner(null);
            return;
          }
          setBanner({
            kind: "free",
            canStartProTrial: Boolean(billing?.canStartProTrial),
            canStartLaunchPromo: Boolean(billing?.launchPromo?.canActivate),
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
  }, [activeOrganization?.id, user?.emailVerified]);

  if (!banner) return null;
  if (location.pathname.startsWith("/app/subscription")) return null;

  const basicPrice = formatPrice(MARKETING_PLANS.basic.priceMonthlyEur);

  if (banner.kind === "free") {
    const launchPromo = Boolean(banner.canStartLaunchPromo);
    return (
      <div
        className="mb-4 flex flex-col gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
        role="status"
        aria-live="polite"
      >
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium">
            {launchPromo
              ? "Δοκίμασε το ARC Tenders Pro δωρεάν για 30 ημέρες."
              : "Είστε στο δωρεάν πακέτο"}
          </p>
          <p className="text-sm text-muted-foreground">
            {launchPromo
              ? "Χωρίς κάρτα · Χωρίς αυτόματη χρέωση · Μία ενεργοποίηση ανά οργανισμό."
              : `1 ενεργή αποθηκευμένη αναζήτηση, έως 5 διαγωνισμοί σε παρακολούθηση και εβδομαδιαία σύνοψη email όταν υπάρχουν νέα.${
                  banner.canStartProTrial
                    ? ` Δοκιμάστε το Pro για ${TRIAL_DAYS} ημέρες χωρίς κάρτα.`
                    : ""
                }`}
          </p>
        </div>
        <Button asChild size="sm" className="shrink-0">
          <Link
            to={
              launchPromo
                ? "/app/subscription?promo=arc-pro-launch-30"
                : "/app/subscription"
            }
            aria-label={launchPromo ? "Ενεργοποίηση Pro" : "Δείτε τα πακέτα"}
          >
            {launchPromo ? "Ενεργοποίηση Pro" : "Δείτε τα πακέτα"}
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
  const promotional = banner.kind === "trial" && banner.promotional;

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
            : promotional
              ? "Το Pro είναι ενεργό"
              : "Είστε σε δοκιμή Pro"}
        </p>
        <p className="text-sm text-muted-foreground">
          {expired
            ? "Επιστρέφετε στο Free. Ενεργοποιήστε Basic ή Pro για vault, checklist και περισσότερες αναζητήσεις."
            : promotional
              ? [
                  endsLabel
                    ? `Το Pro είναι ενεργό δωρεάν μέχρι ${endsLabel}.`
                    : "Το Pro είναι ενεργό δωρεάν.",
                  "Δεν θα πραγματοποιηθεί αυτόματη χρέωση.",
                  remaining,
                ]
                  .filter(Boolean)
                  .join(" ")
              : (
                <>
                  {[remaining, endsLabel ? `έως ${endsLabel}` : null]
                    .filter(Boolean)
                    .join(" · ") || "Pro preview."}{" "}
                  Basic από{" "}
                  <span className="font-semibold text-foreground">
                    €{basicPrice}/μήνα
                  </span>
                  . {PRICING_TAX_LABEL}
                </>
              )}
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
          aria-label={
            promotional ? "Αναβάθμιση σε πληρωμένο Pro" : "Μετάβαση στις συνδρομές"
          }
        >
          {promotional ? "Αναβάθμιση Pro" : "Δείτε τα πακέτα"}
        </Link>
      </Button>
    </div>
  );
};
