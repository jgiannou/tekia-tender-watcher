import { useEffect, useMemo, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useSessionContext } from "@/auth/SessionProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader, SectionHeader } from "@/components/ui/page-header";
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
      <PageHeader
        title="Συνδρομή"
        description={
          activeLaunchPromo
            ? "Αποτελεσματικό πακέτο: Pro · Προωθητική δοκιμή (δωρεάν) · χωρίς αυτόματη χρέωση."
            : launchPromo?.canActivate
              ? "Επιλέξτε το πακέτο που ταιριάζει στις ανάγκες σας. Διατίθεται προσφορά γνωριμίας: 30 ημέρες Pro δωρεάν, χωρίς κάρτα."
              : "Επιλέξτε το πακέτο που ταιριάζει στις ανάγκες σας. Ξεκινήστε δωρεάν ή δοκιμάστε το Pro για 7 ημέρες, χωρίς κάρτα."
        }
        meta={
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="font-medium text-foreground">
              {activeLaunchPromo
                ? `Αποτελεσματικό: ${currentLabel}`
                : `Το πακέτο σας: ${currentLabel}`}
            </span>
            {activeLaunchPromo ? (
              <span className="text-primary">Δωρεάν προωθητική δοκιμή</span>
            ) : null}
            {activeLaunchPromo && promoExpiryLabel ? (
              <span>
                Έως {promoExpiryLabel}
                {promoDaysRemaining != null ? ` · ${promoDaysRemaining} ημ.` : ""}
              </span>
            ) : status?.trialEndsAt && status.planKey === "trial" ? (
              <span>
                Δοκιμή έως {new Date(status.trialEndsAt).toLocaleDateString("el-GR")}
              </span>
            ) : null}
            {status?.cancelAtPeriodEnd && periodEnd ? (
              <span className="text-amber-700 dark:text-amber-400">
                Ακύρωση · πρόσβαση έως {periodEnd}
              </span>
            ) : null}
          </div>
        }
        actions={
          status?.configured &&
          status.canManageBilling &&
          (status.planKey === "basic" || status.planKey === "pro") ? (
            <>
              <Button
                variant="outline"
                disabled={busyKey === "portal" || busyKey === "cancel"}
                onClick={() => void handlePortal()}
              >
                {busyKey === "portal" ? "Άνοιγμα…" : "Διαχείριση πληρωμών"}
              </Button>
              {!status.cancelAtPeriodEnd ? (
                <Button
                  variant="ghost"
                  className="text-muted-foreground hover:text-destructive"
                  disabled={busyKey === "portal" || busyKey === "cancel"}
                  onClick={() => void handlePortal("cancel")}
                >
                  {busyKey === "cancel" ? "Άνοιγμα…" : "Ακύρωση συνδρομής"}
                </Button>
              ) : null}
            </>
          ) : undefined
        }
      />

      {activeLaunchPromo && status?.launchPromo?.redemption ? (
        <Card className="border-primary/30">
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
        <Card className="border-border/60">
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
        <Card className="border-border/50">
          <CardContent className="py-4 text-sm text-muted-foreground">
            Η προσφορά ολοκληρώθηκε. Οι διαθέσιμες θέσεις έχουν καλυφθεί. Μπορείτε να
            συνεχίσετε με το Free Plan ή να επιλέξετε πληρωμένη συνδρομή.
          </CardContent>
        </Card>
      ) : null}

      {status?.configured === false ? (
        <Card className="border-amber-500/30">
          <CardContent className="py-4 text-sm text-muted-foreground">
            Το Stripe δεν είναι πλήρως ρυθμισμένο ακόμη (λείπουν Price IDs). Μπορείτε να
            δείτε τα πλάνα· το checkout θα ενεργοποιηθεί μόλις οριστούν τα προϊόντα στο
            Stripe Dashboard.
          </CardContent>
        </Card>
      ) : null}

      <SectionHeader
        className="mb-0 sm:items-end"
        title="Επιλέξτε πακέτο"
        description="Οι τιμές δεν περιλαμβάνουν ΦΠΑ. Με ετήσια χρέωση πληρώνετε για 10 μήνες και χρησιμοποιείτε την υπηρεσία για 12."
        action={
          <div className="inline-flex rounded-md bg-muted/40 p-0.5" role="group" aria-label="Διάστημα χρέωσης">
            {(["monthly", "annual"] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={interval === value}
                className={cn(
                  "rounded px-3 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  interval === value
                    ? "bg-background font-medium text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
                onClick={() => setInterval(value)}
              >
                {value === "monthly" ? "Μηνιαία χρέωση" : "Ετήσια χρέωση"}
              </button>
            ))}
          </div>
        }
      />

      {free ? (
        <Card className="border-border/50 bg-transparent">
          <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 space-y-1.5">
              <div className="flex items-baseline gap-3">
                <h3 className="text-base font-semibold tracking-tight">
                  {free.labelEl || free.label}
                </h3>
                <span className="text-sm text-muted-foreground">0 €</span>
              </div>
              <p className="text-sm text-muted-foreground">
                {free.positioningEl || free.positioning}
              </p>
              <ul className="space-y-1 pt-1 text-[13px] text-muted-foreground">
                {(free.featuresEl ?? []).map((feature) => (
                  <li key={feature}>• {feature}</li>
                ))}
              </ul>
            </div>
            <div className="shrink-0 text-xs text-muted-foreground">
              {status?.planKey === "free" && !activeLaunchPromo ? (
                <Badge variant="success">Το πακέτο σας</Badge>
              ) : activeLaunchPromo ? (
                "Μετά τη λήξη της προσφοράς επιστρέφετε στο Free."
              ) : (
                "Δωρεάν χρήση, χωρίς κάρτα."
              )}
            </div>
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
                "relative flex flex-col",
                highlight ? "border-primary/60" : "border-border/70",
              )}
            >
              {highlight ? (
                <div className="absolute right-4 top-4 rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">
                  Προτεινόμενο
                </div>
              ) : null}
              <CardHeader>
                <CardTitle className="text-base">{plan.labelEl}</CardTitle>
                <CardDescription>{plan.positioningEl || plan.positioning}</CardDescription>
                <div className="pt-2">
                  <span className="text-2xl font-semibold tracking-tight">
                    {formatSubscriptionPrice(amount)}
                  </span>
                  <span className="ml-1 text-sm text-muted-foreground">
                    {interval === "annual" ? "/ έτος" : "/ μήνα"}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-4">
                <ul className="space-y-2 text-[13px] text-muted-foreground">
                  {(plan.featuresEl ?? []).map((feature) => (
                    <li key={feature} className="flex gap-2">
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/80" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                {plan.key === "pro" ? (
                  <div className="space-y-2 border-t border-border/50 pt-4">
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

      <Card className="border-border/50 bg-transparent">
        <CardHeader>
          <CardTitle className="text-sm">Δωρεάν πακέτο και δοκιμή Pro</CardTitle>
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
