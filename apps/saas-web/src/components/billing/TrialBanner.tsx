import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { X } from "lucide-react";
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

type BannerVariant = "promo_active" | "trial_active" | "trial_expired" | "free";

const DISMISS_PREFIX = "arc.trialBanner.dismissed.";

const dismissStorageKey = (
  userId: string,
  organizationId: string,
  variant: BannerVariant,
) => `${DISMISS_PREFIX}${userId}:${organizationId}:${variant}`;

const readDismissed = (key: string): boolean => {
  try {
    return sessionStorage.getItem(key) === "1";
  } catch {
    return false;
  }
};

const writeDismissed = (key: string) => {
  try {
    sessionStorage.setItem(key, "1");
  } catch {
    // ignore quota / private mode
  }
};

const bannerVariant = (banner: BannerState): BannerVariant => {
  if (banner.kind === "free") return "free";
  if (banner.kind === "trial_expired") return "trial_expired";
  if (banner.kind === "trial" && banner.promotional) return "promo_active";
  return "trial_active";
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

const DismissButton = ({ onClick }: { onClick: () => void }) => (
  <button
    type="button"
    onClick={onClick}
    className="absolute right-2 top-2 rounded-md p-1 text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
    aria-label="Κλείσιμο ειδοποίησης"
  >
    <X className="h-3.5 w-3.5" aria-hidden />
  </button>
);

export const TrialBanner = () => {
  const { activeOrganization, user } = useSessionContext();
  const location = useLocation();
  const [banner, setBanner] = useState<BannerState | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!activeOrganization || !user?.id) {
      setBanner(null);
      setDismissed(false);
      return;
    }
    // Email verify is the primary CTA — don't stack a promo banner on top.
    if (user.emailVerified === false) {
      setBanner(null);
      setDismissed(false);
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
        // Paid Pro / Basic — no trial/promo banner.
        if (
          billing?.hasStripeSubscription ||
          planKey === "pro" ||
          planKey === "basic"
        ) {
          setBanner(null);
          return;
        }

        let next: BannerState | null = null;
        if (status === "promo" || status === "trial") {
          next = {
            kind: "trial",
            trialEndsAt:
              entitlements.scanAccess?.promo?.expiresAt ??
              entitlements.scanAccess.trialEndsAt ??
              null,
            promotional: status === "promo",
          };
        } else if (status === "trial_expired") {
          next = {
            kind: "trial_expired",
            trialEndsAt: entitlements.scanAccess.trialEndsAt ?? null,
          };
        } else if (planKey === "free" || status === "active") {
          const isFree =
            planKey === "free" ||
            (!billing?.hasStripeSubscription &&
              planKey !== "basic" &&
              planKey !== "pro");
          if (isFree) {
            next = {
              kind: "free",
              canStartProTrial: Boolean(billing?.canStartProTrial),
              canStartLaunchPromo: Boolean(billing?.launchPromo?.canActivate),
            };
          }
        }

        if (!next) {
          setBanner(null);
          setDismissed(false);
          return;
        }

        const key = dismissStorageKey(
          user.id,
          activeOrganization.id,
          bannerVariant(next),
        );
        setDismissed(readDismissed(key));
        setBanner(next);
      } catch {
        if (!cancelled) {
          setBanner(null);
          setDismissed(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeOrganization?.id, user?.id, user?.emailVerified]);

  const handleDismiss = () => {
    if (!banner || !user?.id || !activeOrganization?.id) return;
    const key = dismissStorageKey(
      user.id,
      activeOrganization.id,
      bannerVariant(banner),
    );
    writeDismissed(key);
    setDismissed(true);
  };

  if (!banner || dismissed) return null;
  if (location.pathname.startsWith("/app/subscription")) return null;

  const basicPrice = formatPrice(MARKETING_PLANS.basic.priceMonthlyEur);

  if (banner.kind === "free") {
    const launchPromo = Boolean(banner.canStartLaunchPromo);
    return (
      <div
        className="relative mb-4 flex flex-col gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 pr-10 sm:flex-row sm:items-center sm:justify-between"
        role="status"
        aria-live="polite"
      >
        <DismissButton onClick={handleDismiss} />
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
      ? new Date(banner.trialEndsAt).toLocaleDateString("el-GR", {
          day: "numeric",
          month: "long",
          year: "numeric",
        })
      : null;
  const promotional = banner.kind === "trial" && banner.promotional;

  // Compact status banner for active promotional Pro — not a sales ad.
  if (promotional && !expired) {
    return (
      <div
        className="relative mb-4 flex flex-col gap-2.5 rounded-lg border border-emerald-500/25 bg-emerald-500/[0.06] px-3.5 py-2.5 pr-10 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
        role="status"
        aria-live="polite"
      >
        <DismissButton onClick={handleDismiss} />
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold tracking-tight text-foreground">
              Το Pro σου είναι ενεργό!
            </p>
            <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
              30 ημέρες δωρεάν
            </span>
            {remaining ? (
              <span className="text-[11px] text-muted-foreground">
                {remaining}
              </span>
            ) : null}
          </div>
          <p className="text-sm text-muted-foreground">
            {endsLabel
              ? `Απολαμβάνεις όλες τις δυνατότητες Pro έως τις ${endsLabel}.`
              : "Απολαμβάνεις όλες τις δυνατότητες Pro."}
          </p>
          <p className="text-xs text-muted-foreground/90">
            Χωρίς αυτόματη χρέωση · Μετά συνεχίζεις στο Free
          </p>
        </div>
        <Button asChild size="sm" variant="outline" className="shrink-0">
          <Link to="/app/subscription" aria-label="Διαχείριση συνδρομής">
            Διαχείριση συνδρομής
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative mb-4 flex flex-col gap-3 rounded-lg border px-4 py-3 pr-10 sm:flex-row sm:items-center sm:justify-between",
        expired
          ? "border-destructive/40 bg-destructive/5"
          : "border-primary/40 bg-primary/5",
      )}
      role="status"
      aria-live="polite"
    >
      <DismissButton onClick={handleDismiss} />
      <div className="min-w-0 space-y-1">
        <p className="text-sm font-medium">
          {expired ? "Η δοκιμή Pro έληξε" : "Είστε σε δοκιμή Pro"}
        </p>
        <p className="text-sm text-muted-foreground">
          {expired ? (
            "Επιστρέφετε στο Free. Ενεργοποιήστε Basic ή Pro για vault, checklist και περισσότερες αναζητήσεις."
          ) : (
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
        variant={expired ? "destructive" : "outline"}
      >
        <Link to="/app/subscription" aria-label="Μετάβαση στις συνδρομές">
          {expired ? "Δείτε τα πακέτα" : "Διαχείριση συνδρομής"}
        </Link>
      </Button>
    </div>
  );
};
