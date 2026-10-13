import { useEffect, useMemo, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useSessionContext } from "@/auth/SessionProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  saasApi,
  type BillingCatalogPlan,
  type BillingInterval,
  type BillingStatusResponse,
} from "@/lib/api";
import {
  peekPromoAttribution,
  rememberPendingCheckout,
  trackAnalyticsEvent,
  trackProTrialStartedFromActivation,
  trackPurchaseFromReturn,
} from "@/lib/analytics";
import { humanSaasError } from "@/lib/labels";
import { cn } from "@/lib/utils";

const formatSubscriptionPrice = (amount: number | null | undefined) => {
  if (amount == null) return "—";
  if (amount === 0) return "0 €";
  return `${amount.toLocaleString("el-GR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
};

export const SubscriptionPage = () => {
  const { activeOrganization, user } = useSessionContext();
  const [params] = useSearchParams();
  const [catalog, setCatalog] = useState<BillingCatalogPlan[]>([]);
  const [status, setStatus] = useState<BillingStatusResponse | null>(null);
  const [notes, setNotes] = useState<{
    contactForMoreSeatsMessage?: string;
    proSelfServiceSeatCap?: number;
  }>({});
  const [interval, setInterval] = useState<BillingInterval>("monthly");
  const [extraSeats, setExtraSeats] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const load = async () => {
    if (!activeOrganization) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [catalogRes, statusRes] = await Promise.all([
        saasApi.billingCatalog(),
        saasApi.billingStatus(activeOrganization.id),
      ]);
      setCatalog(catalogRes.plans);
      setNotes(catalogRes.notes ?? {});
      setStatus(statusRes);
      setExtraSeats(Math.max(0, statusRes.extraSeats ?? 0));
    } catch (error) {
      toast.error(
        humanSaasError(error instanceof Error ? error.message : "Αποτυχία φόρτωσης πλάνων"),
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [activeOrganization?.id]);

  useEffect(() => {
    const checkout = params.get("checkout");
    const billing = params.get("billing");
    if (checkout === "success") {
      trackPurchaseFromReturn();
      toast.success("Η πληρωμή ολοκληρώθηκε. Το πλάνο θα ενημερωθεί σε λίγο.");
      void load();
    } else if (checkout === "cancel") {
      toast.message("Η ολοκλήρωση αγοράς ακυρώθηκε.");
    } else if (billing === "canceled") {
      toast.message("Η ακύρωση καταχωρήθηκε. Η πρόσβαση παραμένει έως το τέλος της περιόδου.");
      void load();
    }
  }, [params]);

  const free = catalog.find((p) => p.key === "free");
  const basic = catalog.find((p) => p.key === "basic");
  const pro = catalog.find((p) => p.key === "pro");
  const seatCap = notes.proSelfServiceSeatCap ?? 20;
  const maxExtra = Math.max(0, seatCap - (pro?.includedSeats ?? 3));

  const launchPromo = status?.launchPromo;
  const activeLaunchPromo = launchPromo?.redemption?.status === "ACTIVE";

  const currentLabel = useMemo(() => {
    if (!status) return "—";
    if (activeLaunchPromo) return "Pro";
    if (status.planKey === "trial") return "Δοκιμή Pro";
    if (status.planKey === "free") return "Δωρεάν";
    if (status.planKey === "basic") return "Basic";
    if (status.planKey === "pro") return "Pro";
    return status.planKey;
  }, [status, activeLaunchPromo]);

  const promoExpiryLabel = activeLaunchPromo && status?.launchPromo?.redemption?.expiresAt
    ? new Date(status.launchPromo.redemption.expiresAt).toLocaleDateString(
        "el-GR",
        { day: "numeric", month: "long", year: "numeric" },
      )
    : null;
  const promoDaysRemaining =
    activeLaunchPromo && status?.launchPromo?.redemption?.daysRemaining != null
      ? status.launchPromo.redemption.daysRemaining
      : null;

  const priceFor = (plan: BillingCatalogPlan | undefined) => {
    if (!plan) return null;
    return interval === "annual" ? plan.annualEur : plan.monthlyEur;
  };

  const handleActivateLaunchPromo = async () => {
    if (!activeOrganization) return;
    if (user?.emailVerified === false) {
      toast.error(
        "Επιβεβαιώστε το email σας πριν την ενεργοποίηση της προσφοράς Pro.",
      );
      return;
    }
    if (status?.launchPromo && !status.launchPromo.canActivate) {
      if (status.launchPromo.reason === "promo_cap_reached") {
        toast.message("Η προσφορά ολοκληρώθηκε.");
        return;
      }
    }
    setBusyKey("launch-promo");
    try {
      const attribution = peekPromoAttribution();
      const result = await saasApi.activateArcProLaunch(
        activeOrganization.id,
        attribution,
      );
      trackProTrialStartedFromActivation({
        userId: user?.id,
        promotionKey: result.promotionKey,
        already: result.already,
        days: 30,
      });
      if (result.already) {
        toast.message("Η προσφορά Pro είναι ήδη ενεργή.");
      } else {
        toast.success("Ενεργοποιήθηκαν 30 ημέρες Pro — χωρίς χρέωση.");
      }
      await load();
    } catch (error) {
      toast.error(
        humanSaasError(
          error instanceof Error ? error.message : "Αποτυχία ενεργοποίησης προσφοράς",
        ),
      );
    } finally {
      setBusyKey(null);
    }
  };

  useEffect(() => {
    if (!activeOrganization || loading || !status) return;
    if (params.get("promo") !== "arc-pro-launch-30") return;
    if (!status.launchPromo?.canActivate) return;
    if (busyKey) return;
    void handleActivateLaunchPromo();
    // One-shot from landing / signup deep link.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOrganization?.id, loading, status?.launchPromo?.canActivate, params]);

  const handleStartProTrial = async () => {
    if (!activeOrganization) return;
    if (user?.emailVerified === false) {
      toast.error("Επιβεβαιώστε το email σας πριν τη δοκιμή Pro.");
      return;
    }
    setBusyKey("trial");
    try {
      const result = await saasApi.startProTrial(activeOrganization.id);
      if (result.already) {
        toast.message("Η δοκιμή Pro είναι ήδη ενεργή.");
      } else {
        toast.success("Ξεκίνησε η δοκιμή Pro για 7 ημέρες.");
      }
      await load();
    } catch (error) {
      toast.error(
        humanSaasError(error instanceof Error ? error.message : "Αποτυχία δοκιμής Pro"),
      );
    } finally {
      setBusyKey(null);
    }
  };

  const handleCheckout = async (plan: "basic" | "pro") => {
    if (!activeOrganization) return;
    if (user?.emailVerified === false) {
      toast.error("Επιβεβαιώστε το email σας πριν την αγορά.");
      return;
    }
    setBusyKey(plan);
    try {
      const result = await saasApi.billingCheckout(activeOrganization.id, {
        plan,
        interval,
        extraSeats: plan === "pro" ? extraSeats : 0,
      });
      if (result.mode === "same") {
        toast.message("Είστε ήδη σε αυτό το πλάνο / θέσεις.");
        return;
      }
      if (result.mode === "updated") {
        toast.success(
          result.extraSeats != null && result.extraSeats > 0
            ? `Οι θέσεις ενημερώθηκαν (+${result.extraSeats} έξτρα).`
            : "Η συνδρομή ενημερώθηκε.",
        );
        await load();
        return;
      }
      if (result.url) {
        const selected = catalog.find((entry) => entry.key === plan);
        const amount = interval === "annual" ? selected?.annualEur : selected?.monthlyEur;
        const checkoutParams = {
          plan,
          billing_interval: interval,
          currency: "EUR",
          ...(typeof amount === "number" ? { value: amount } : {}),
        };
        rememberPendingCheckout(checkoutParams);
        trackAnalyticsEvent("begin_checkout", checkoutParams);
        window.location.href = result.url;
        return;
      }
      toast.error("Δεν ήταν δυνατή η έναρξη checkout.");
    } catch (error) {
      toast.error(
        humanSaasError(error instanceof Error ? error.message : "Αποτυχία checkout"),
      );
    } finally {
      setBusyKey(null);
    }
  };

  const handlePortal = async (flow?: "cancel") => {
    if (!activeOrganization) return;
    setBusyKey(flow === "cancel" ? "cancel" : "portal");
    try {
      const result = await saasApi.billingPortal(activeOrganization.id, flow);
      if (result.alreadyCanceling) {
        toast.message("Η ακύρωση είναι ήδη προγραμματισμένη.");
        return;
      }
      if (result.url) {
        window.location.href = result.url;
        return;
      }
      toast.error("Δεν άνοιξε η διαχείριση χρέωσης.");
    } catch (error) {
      toast.error(
        humanSaasError(error instanceof Error ? error.message : "Αποτυχία portal"),
      );
    } finally {
      setBusyKey(null);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Φόρτωση πλάνων…
      </div>
    );
  }

  const periodEnd = status?.currentPeriodEnd
    ? new Date(status.currentPeriodEnd).toLocaleDateString("el-GR")
    : "";

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-10">
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary via-slate-800 to-slate-950 px-6 py-8 text-white shadow-xl shadow-primary/20 md:px-10 md:py-10">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_85%_20%,rgba(255,255,255,0.18),transparent_42%),radial-gradient(circle_at_10%_90%,rgba(255,255,255,0.08),transparent_40%)]"
        />
        <div className="relative max-w-xl space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/80">
            ARC Tenders
          </p>
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Συνδρομή</h1>
          <p className="text-sm text-white/90 md:text-base">
            {activeLaunchPromo
              ? "Αποτελεσματικό πακέτο: Pro · Προωθητική δοκιμή (δωρεάν) · χωρίς αυτόματη χρέωση."
              : launchPromo?.canActivate
                ? "Επιλέξτε το πακέτο που ταιριάζει στις ανάγκες σας. Διατίθεται προσφορά γνωριμίας: 30 ημέρες Pro δωρεάν, χωρίς κάρτα."
                : "Επιλέξτε το πακέτο που ταιριάζει στις ανάγκες σας. Ξεκινήστε δωρεάν ή δοκιμάστε το Pro για 7 ημέρες, χωρίς κάρτα."}
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <span className="rounded-full border border-white/25 bg-white/10 px-3 py-1 text-xs font-semibold">
              {activeLaunchPromo
                ? `Αποτελεσματικό: ${currentLabel}`
                : `Το πακέτο σας: ${currentLabel}`}
            </span>
            {activeLaunchPromo ? (
              <span className="rounded-full border border-emerald-300/40 bg-emerald-400/15 px-3 py-1 text-xs font-semibold">
                Δωρεάν προωθητική δοκιμή
              </span>
            ) : null}
            {activeLaunchPromo && promoExpiryLabel ? (
              <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs">
                Έως {promoExpiryLabel}
                {promoDaysRemaining != null
                  ? ` · ${promoDaysRemaining} ημ.`
                  : ""}
              </span>
            ) : status?.trialEndsAt && status.planKey === "trial" ? (
              <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs">
                Δοκιμή έως{" "}
                {new Date(status.trialEndsAt).toLocaleDateString("el-GR")}
              </span>
            ) : null}
            {status?.cancelAtPeriodEnd && periodEnd ? (
              <span className="rounded-full border border-amber-300/50 bg-amber-400/20 px-3 py-1 text-xs font-semibold">
                Ακύρωση · πρόσβαση έως {periodEnd}
              </span>
            ) : null}
          </div>
          {status?.configured &&
          status.canManageBilling &&
          (status.planKey === "basic" || status.planKey === "pro") ? (
            <div className="flex flex-wrap gap-2 pt-2">
              <Button
                variant="outline"
                className="border-white/50 bg-transparent text-white hover:bg-white/10"
                disabled={busyKey === "portal" || busyKey === "cancel"}
                onClick={() => void handlePortal()}
              >
                {busyKey === "portal" ? "Άνοιγμα…" : "Διαχείριση πληρωμών"}
              </Button>
              {!status.cancelAtPeriodEnd ? (
                <Button
                  variant="outline"
                  className="border-red-200/70 bg-transparent text-white hover:bg-red-500/20"
                  disabled={busyKey === "portal" || busyKey === "cancel"}
                  onClick={() => void handlePortal("cancel")}
                >
                  {busyKey === "cancel" ? "Άνοιγμα…" : "Ακύρωση συνδρομής"}
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>

      {activeLaunchPromo && status?.launchPromo?.redemption ? (
        <Card className="border-emerald-500/30 bg-emerald-500/[0.05]">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              Το Pro σου είναι ενεργό — προωθητική δοκιμή
            </CardTitle>
            <CardDescription>
              Διαφέρει από πληρωμένη συνδρομή Pro · χωρίς μέθοδο πληρωμής · χωρίς
              αυτόματη χρέωση
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <div className="text-xs text-muted-foreground">
                  Αποτελεσματικό πακέτο
                </div>
                <div className="font-medium">Pro</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Κατάσταση</div>
                <div className="font-medium">Δωρεάν προωθητική δοκιμή</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Λήξη</div>
                <div className="font-medium">
                  {new Date(
                    status.launchPromo.redemption.expiresAt,
                  ).toLocaleDateString("el-GR", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Απομένουν</div>
                <div className="font-medium">
                  {status.launchPromo.redemption.daysRemaining != null
                    ? status.launchPromo.redemption.daysRemaining === 1
                      ? "1 ημέρα"
                      : `${status.launchPromo.redemption.daysRemaining} ημέρες`
                    : "—"}
                </div>
              </div>
            </div>
            <ul className="space-y-1 text-muted-foreground">
              <li>• Χωρίς αυτόματη χρέωση και χωρίς κάρτα σε αρχείο.</li>
              <li>• Μετά τη λήξη: Free Plan (τα δεδομένα σας διατηρούνται).</li>
              <li>
                • Μπορείτε οποιαδήποτε στιγμή να συνεχίσετε με πληρωμένο Pro —
                ρητή αγορά μέσω Stripe.
              </li>
            </ul>
            <Button
              variant="outline"
              disabled={busyKey === "pro"}
              onClick={() => void handleCheckout("pro")}
            >
              Συνέχιση με πληρωμένο Pro
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {launchPromo?.enabled &&
      launchPromo.canActivate &&
      status?.canManageBilling ? (
        <Card className="border-primary/30 bg-primary/[0.04]">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              Προσφορά γνωριμίας: 30 ημέρες Pro δωρεάν
            </CardTitle>
            <CardDescription>
              Χωρίς πιστωτική κάρτα · χωρίς αυτόματη χρέωση · μία φορά ανά οργανισμό ·
              {typeof status.launchPromo?.totalSlots === "number"
                ? `μόνο ${status.launchPromo.totalSlots} λογαριασμοί συνολικά`
                : "περιορισμένες θέσεις"}
              {typeof status.launchPromo?.remainingSlots === "number"
                ? ` · Απομένουν ${status.launchPromo.remainingSlots}`
                : ""}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              disabled={busyKey === "launch-promo"}
              onClick={() => void handleActivateLaunchPromo()}
            >
              {busyKey === "launch-promo"
                ? "Ενεργοποίηση…"
                : "Ενεργοποίηση 30 ημερών Pro"}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {launchPromo?.enabled &&
      launchPromo.reason === "promo_cap_reached" &&
      !activeLaunchPromo ? (
        <Card className="border-border/70">
          <CardContent className="py-4 text-sm text-muted-foreground">
            Η προσφορά ολοκληρώθηκε. Οι διαθέσιμες θέσεις έχουν καλυφθεί. Μπορείτε να
            συνεχίσετε με το Free Plan ή να επιλέξετε πληρωμένη συνδρομή.
          </CardContent>
        </Card>
      ) : null}

      {status?.configured === false ? (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="py-4 text-sm text-muted-foreground">
            Το Stripe δεν είναι πλήρως ρυθμισμένο ακόμη (λείπουν Price IDs). Μπορείτε να
            δείτε τα πλάνα· το checkout θα ενεργοποιηθεί μόλις οριστούν τα προϊόντα στο
            Stripe Dashboard.
          </CardContent>
        </Card>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Επιλέξτε πακέτο</h2>
          <p className="text-sm text-muted-foreground">
            Οι τιμές δεν περιλαμβάνουν ΦΠΑ. Με ετήσια χρέωση πληρώνετε για 10 μήνες και
            χρησιμοποιείτε την υπηρεσία για 12.
          </p>
        </div>
        <div className="inline-flex rounded-lg border border-border bg-card p-1">
          {(["monthly", "annual"] as const).map((value) => (
            <button
              key={value}
              type="button"
              className={cn(
                "rounded-md px-3 py-1.5 text-sm transition-colors",
                interval === value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => setInterval(value)}
            >
              {value === "monthly" ? "Μηνιαία χρέωση" : "Ετήσια χρέωση"}
            </button>
          ))}
        </div>
      </div>

      {free ? (
        <Card className="mb-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{free.labelEl || free.label}</CardTitle>
            <CardDescription>{free.positioningEl || free.positioning}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-2xl font-semibold">0 €</p>
            <ul className="space-y-1.5 text-muted-foreground">
              {(free.featuresEl ?? []).map((feature) => (
                <li key={feature}>• {feature}</li>
              ))}
            </ul>
            {status?.planKey === "free" && !activeLaunchPromo ? (
              <Badge variant="success">Το πακέτο σας</Badge>
            ) : activeLaunchPromo ? (
              <p className="text-xs text-muted-foreground">
                Μετά τη λήξη της προσφοράς επιστρέφετε στο Free.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Δωρεάν χρήση, χωρίς κάρτα.
              </p>
            )}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        {[basic, pro].map((plan) => {
          if (!plan) return null;
          const highlight = plan.key === "pro";
          const amount = priceFor(plan);
          const isCurrent = status?.planKey === plan.key;
          const currentExtra = status?.extraSeats ?? 0;
          const seatsDirty =
            plan.key === "pro" && isCurrent && extraSeats !== currentExtra;
          const needsStripeCheckout =
            plan.key === "pro" &&
            isCurrent &&
            !status?.hasStripeSubscription &&
            !status?.stripeSubscriptionId;
          const canActOnCurrentPro = seatsDirty || needsStripeCheckout;
          const canTryPro =
            plan.key === "pro" && Boolean(status?.canStartProTrial);
          const onProTrial = status?.planKey === "trial";
          const onPromoPro = activeLaunchPromo && plan.key === "pro";
          const proButtonDisabled =
            Boolean(busyKey) ||
            user?.emailVerified === false ||
            (canTryPro
              ? false
              : status?.configured === false || (isCurrent && !canActOnCurrentPro));
          const basicButtonDisabled =
            Boolean(busyKey) ||
            isCurrent ||
            status?.configured === false ||
            user?.emailVerified === false;
          return (
            <Card
              key={plan.key}
              className={cn(
                "relative flex flex-col transition-transform hover:-translate-y-1",
                highlight && "border-primary shadow-lg shadow-primary/10 md:-translate-y-1",
              )}
            >
              {highlight ? (
                <div className="absolute -top-2.5 right-4 rounded-full bg-primary px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-foreground">
                  Προτεινόμενο
                </div>
              ) : null}
              <CardHeader>
                <CardTitle className="text-xl">{plan.labelEl}</CardTitle>
                <CardDescription>{plan.positioningEl || plan.positioning}</CardDescription>
                <div className="pt-2">
                  <span className="text-3xl font-semibold tracking-tight">
                    {formatSubscriptionPrice(amount)}
                  </span>
                  <span className="ml-1 text-sm text-muted-foreground">
                    {interval === "annual" ? "/ έτος" : "/ μήνα"}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-4">
                <ul className="space-y-2 text-sm">
                  {(plan.featuresEl ?? []).map((feature) => (
                    <li key={feature} className="flex gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                {plan.key === "pro" ? (
                  <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
                    <div className="flex items-center justify-between text-sm">
                      <label htmlFor="extra-seats">Επιπλέον χρήστες</label>
                      <span className="font-medium">{extraSeats}</span>
                    </div>
                    <input
                      id="extra-seats"
                      type="range"
                      min={0}
                      max={maxExtra}
                      value={extraSeats}
                      onChange={(e) => setExtraSeats(Number(e.target.value))}
                      className="w-full accent-[var(--arc-primary)]"
                      aria-label="Επιπλέον χρήστες Pro"
                    />
                    <p className="text-xs text-muted-foreground">
                      Περιλαμβάνονται {plan.includedSeats} χρήστες. Κάθε επιπλέον χρήστης
                      κοστίζει{" "}
                      {formatSubscriptionPrice(
                        interval === "annual"
                          ? plan.extraSeatAnnualEur ?? 24.9
                          : plan.extraSeatMonthlyEur ?? 2.49,
                      )}{" "}
                      τον μήνα. Επιλεγμένο σύνολο: {plan.includedSeats + extraSeats}{" "}
                      χρήστες. Μέγιστο όριο: {seatCap}.
                    </p>
                    {needsStripeCheckout ? (
                      <p className="text-xs text-amber-700 dark:text-amber-300">
                        Για χρέωση έξτρα θέσεων ολοκληρώστε αγορά Pro στο Stripe (το πλάνο
                        είναι ήδη ενεργό χωρίς συνδρομή πληρωμής).
                      </p>
                    ) : null}
                    {extraSeats >= maxExtra ? (
                      <p className="text-xs text-amber-700 dark:text-amber-300">
                        {notes.contactForMoreSeatsMessage ||
                          "Χρειάζεστε περισσότερους από 20 χρήστες; Επικοινωνήστε μαζί μας."}
                      </p>
                    ) : null}
                  </div>
                ) : null}

                <div className="mt-auto space-y-2 pt-2">
                  {canTryPro && !launchPromo?.canActivate ? (
                    <Button
                      className="w-full"
                      variant="default"
                      disabled={Boolean(busyKey) || user?.emailVerified === false}
                      onClick={() => void handleStartProTrial()}
                    >
                      {busyKey === "trial" ? "Ενεργοποίηση…" : "Δοκίμασε Pro 7 ημερών"}
                    </Button>
                  ) : null}
                  {canTryPro && launchPromo?.canActivate ? (
                    <Button
                      className="w-full"
                      variant="default"
                      disabled={Boolean(busyKey) || user?.emailVerified === false}
                      onClick={() => void handleActivateLaunchPromo()}
                    >
                      {busyKey === "launch-promo"
                        ? "Ενεργοποίηση…"
                        : "Ενεργοποίηση 30 ημερών Pro"}
                    </Button>
                  ) : null}
                  <Button
                    className="w-full"
                    variant={canTryPro ? "outline" : highlight ? "default" : "outline"}
                    disabled={
                      plan.key === "pro" ? proButtonDisabled : basicButtonDisabled
                    }
                    onClick={() => void handleCheckout(plan.key as "basic" | "pro")}
                  >
                    {busyKey === plan.key
                      ? seatsDirty || needsStripeCheckout
                        ? "Ενημέρωση…"
                        : "Μετάβαση σε Stripe…"
                      : plan.key === "pro" && seatsDirty
                        ? `Ενημέρωση θέσεων (+${extraSeats})`
                        : plan.key === "pro" && needsStripeCheckout
                          ? extraSeats > 0
                            ? `Αγορά Pro + ${extraSeats} θέσεις`
                            : "Ολοκλήρωση αγοράς Pro"
                          : onPromoPro
                            ? "Συνέχιση με πληρωμένο Pro"
                            : plan.key === "pro" && onProTrial
                              ? "Συνέχιση με πληρωμένο Pro"
                              : isCurrent
                                ? "Το πακέτο σας"
                                : canTryPro
                                  ? "Αγορά Pro χωρίς δοκιμή"
                                  : `Επιλογή ${plan.labelEl}`}
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Δωρεάν πακέτο και δοκιμή Pro</CardTitle>
          <CardDescription>
            Με την εγγραφή σας αποκτάτε το δωρεάν πακέτο, χωρίς κάρτα και χωρίς χρονικό
            περιορισμό.{" "}
            {activeLaunchPromo
              ? "Έχετε ενεργή δωρεάν προωθητική δοκιμή Pro (όχι πληρωμένη συνδρομή). Δεν απαιτείται κάρτα και δεν γίνεται αυτόματη χρέωση. Μετά τη λήξη συνεχίζετε με το Free, εκτός αν επιλέξετε ρητά πληρωμένο Pro."
              : launchPromo?.canActivate
                ? "Διατίθεται προσφορά γνωριμίας: 30 ημέρες Pro δωρεάν, χωρίς κάρτα και χωρίς αυτόματη χρέωση. Μετά τη λήξη συνεχίζετε με το Free."
                : "Μπορείτε να δοκιμάσετε το Pro για 7 ημέρες. Αν δεν επιλέξετε συνδρομή, μετά τη δοκιμή συνεχίζετε με το δωρεάν πακέτο."}
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Χρειάζεστε βοήθεια με την τιμολόγηση ή πρόσβαση για περισσότερους από 20
          χρήστες;{" "}
          <a
            className="font-medium text-primary underline-offset-4 hover:underline"
            href="mailto:contact@tekia.gr?subject=ARC%20Tenders%20-%20billing"
          >
            contact@tekia.gr
          </a>
          {" · "}
          <Link
            className="font-medium text-primary underline-offset-4 hover:underline"
            to="/app/settings/company"
          >
            Ρυθμίσεις εταιρείας
          </Link>
          <p className="mt-3 text-xs">
            Με την αγορά ισχύουν οι{" "}
            <Link
              className="text-primary underline-offset-4 hover:underline"
              to="/legal/terms"
              target="_blank"
              rel="noopener noreferrer"
            >
              Όροι Χρήσης
            </Link>{" "}
            και η{" "}
            <Link
              className="text-primary underline-offset-4 hover:underline"
              to="/legal/privacy"
              target="_blank"
              rel="noopener noreferrer"
            >
              Πολιτική Απορρήτου
            </Link>
            .
          </p>
        </CardContent>
      </Card>
    </div>
  );
};
