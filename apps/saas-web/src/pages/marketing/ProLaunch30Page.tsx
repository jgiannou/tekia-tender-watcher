import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  CheckCircle2,
  CreditCard,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useSessionContext } from "@/auth/SessionProvider";
import { PublicShell } from "@/components/marketing/PublicShell";
import {
  MonitoringProductPreview,
  SavedSearchProductPreview,
  SearchProductPreview,
} from "@/components/marketing/ProductPreviewFrames";
import { SeoHead } from "@/components/SeoHead";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  rememberPromoIntent,
  trackAnalyticsEvent,
} from "@/lib/analytics";
import { MARKETING_SEO } from "@/lib/seo";
import {
  PROMO_ACTIVATE_QUERY,
  PROMO_LAUNCH_PATH,
  useArcProLaunchAvailability,
} from "@/lib/promo-launch";
import { MARKETING_PLANS, PRICING_TAX_LABEL } from "@/marketing/pricing";
import { cn } from "@/lib/utils";

const formatPrice = (amount: number | null | undefined) => {
  if (amount == null) return "—";
  return amount.toLocaleString("el-GR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const FAQ = [
  {
    q: "Χρειάζεται πιστωτική κάρτα;",
    a: "Όχι. Η ενεργοποίηση γίνεται χωρίς κάρτα και χωρίς Stripe Checkout.",
  },
  {
    q: "Θα χρεωθώ μετά τις 30 ημέρες;",
    a: "Όχι. Δεν δημιουργείται συνδρομή και δεν γίνεται αυτόματη χρέωση. Μετά τη λήξη συνεχίζετε στο Free Plan.",
  },
  {
    q: "Τι συμβαίνει όταν λήξει το Pro;",
    a: "Επιστρέφετε στο Free. Τα δεδομένα σας παραμένουν. Αν ξεπεράσετε τα όρια του Free, ορισμένες αναζητήσεις μπορεί να γίνουν ανενεργές μέχρι να επιλέξετε ποιες θα κρατήσετε ενεργές.",
  },
  {
    q: "Θα χάσω τις αποθηκευμένες αναζητήσεις μου;",
    a: "Όχι. Δεν διαγράφονται. Στο Free μπορεί να παραμείνει ενεργή μόνο όσες επιτρέπει το πλάνο.",
  },
  {
    q: "Μπορώ να ενεργοποιήσω την προσφορά αν έχω ήδη λογαριασμό;",
    a: "Ναι, αν είστε σε Free, έχετε επιβεβαιώσει το email σας, και ο οργανισμός δεν έχει ήδη χρησιμοποιήσει την προσφορά.",
  },
  {
    q: "Μπορώ να συνεχίσω με πληρωμένη συνδρομή;",
    a: "Ναι. Μπορείτε να αναβαθμίσετε ρητά σε πληρωμένο Pro οποιαδήποτε στιγμή από τη σελίδα Συνδρομής.",
  },
] as const;

export const ProLaunch30Page = () => {
  const navigate = useNavigate();
  const { user, activeOrganization } = useSessionContext();
  const { meta, loading } = useArcProLaunchAvailability();

  const accepting = Boolean(meta?.acceptingRedemptions);
  const exhausted =
    Boolean(meta?.promotionActive) && !accepting && (meta?.redeemedSlots ?? 0) > 0;
  const proPrice = meta?.proMonthlyEur ?? MARKETING_PLANS.pro.priceMonthlyEur;
  const remaining = meta?.remainingSlots ?? 0;
  const total = meta?.totalSlots ?? 25;

  useEffect(() => {
    rememberPromoIntent("ARC_PRO_LAUNCH_30");
    trackAnalyticsEvent("promo_landing_viewed", {
      promotion_key: "ARC_PRO_LAUNCH_30",
      page_path: PROMO_LAUNCH_PATH,
      source: "landing",
    });
  }, []);

  const handlePrimaryCta = (source: string) => {
    rememberPromoIntent("ARC_PRO_LAUNCH_30");
    trackAnalyticsEvent("promo_cta_clicked", {
      promotion_key: "ARC_PRO_LAUNCH_30",
      button_name: "activate_30_days",
      source,
    });
    if (!accepting) {
      navigate("/signup");
      return;
    }
    if (!user) {
      navigate(`/signup?next=/app/subscription?${PROMO_ACTIVATE_QUERY}`);
      return;
    }
    if (!activeOrganization) {
      navigate(`/app/setup?${PROMO_ACTIVATE_QUERY}`);
      return;
    }
    navigate(`/app/subscription?${PROMO_ACTIVATE_QUERY}`);
  };

  return (
    <PublicShell featuresHref="#value" contactHref="#faq">
      <SeoHead {...MARKETING_SEO.pro30} />
      <main>
        <section className="relative overflow-hidden border-b border-border/60">
          <div
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(45,212,191,0.12),_transparent_55%)]"
            aria-hidden
          />
          <div className="relative mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[0.95fr_1.05fr] lg:py-16">
            <div className="space-y-5">
              <Badge
                variant="outline"
                className="border-primary/40 bg-primary/10 text-primary"
              >
                ΠΡΟΣΦΟΡΑ ΓΝΩΡΙΜΙΑΣ
              </Badge>
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl lg:text-[2.75rem] lg:leading-[1.12]">
                30 ημέρες ARC Tenders Pro δωρεάν.
              </h1>
              <p className="max-w-xl text-base text-muted-foreground sm:text-lg">
                Μη χάνεις δημόσιες ευκαιρίες που ταιριάζουν στην επιχείρησή σου.
              </p>
              <p className="max-w-xl text-sm text-muted-foreground">
                Αναζήτησε προκηρύξεις από το ΚΗΜΔΗΣ, παρακολούθησε διαγωνισμούς και
                οργάνωσε τις ενέργειές σου μέσα από μία πλατφόρμα.
              </p>

              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5 rounded-md border border-border/70 px-2 py-1">
                  <CreditCard className="h-3.5 w-3.5" aria-hidden />
                  Χωρίς κάρτα
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-md border border-border/70 px-2 py-1">
                  <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
                  Χωρίς αυτόματη χρέωση
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-md border border-border/70 px-2 py-1">
                  Μετά συνεχίζεις δωρεάν
                </span>
              </div>

              <p className="text-sm font-medium text-foreground">
                Αποκλειστικά για τους πρώτους {total} λογαριασμούς
              </p>
              {!loading && accepting && remaining > 0 ? (
                <p className="text-sm text-muted-foreground">
                  Απομένουν {remaining} από τις {total} θέσεις
                </p>
              ) : null}
              {!loading && exhausted ? (
                <p className="rounded-md border border-border/70 bg-card/40 px-3 py-2 text-sm text-muted-foreground">
                  Η προσφορά ολοκληρώθηκε. Μπορείτε να ξεκινήσετε δωρεάν στο Free Plan.
                </p>
              ) : null}
              {!loading && !meta?.promotionActive ? (
                <p className="text-sm text-muted-foreground">
                  Η προσφορά δεν είναι ενεργή αυτή τη στιγμή.
                </p>
              ) : null}

              <div className="flex flex-wrap gap-3 pt-1">
                <Button
                  size="lg"
                  disabled={loading || (!accepting && !exhausted && Boolean(meta))}
                  onClick={() => handlePrimaryCta("landing_hero")}
                >
                  {loading
                    ? "Έλεγχος διαθεσιμότητας…"
                    : accepting
                      ? "Ενεργοποίησε 30 ημέρες Pro"
                      : exhausted
                        ? "Ξεκίνα δωρεάν"
                        : "Η προσφορά δεν είναι διαθέσιμη"}
                  {!loading ? (
                    <ArrowRight className="h-4 w-4" aria-hidden />
                  ) : null}
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <a href="#how">Δες πώς λειτουργεί</a>
                </Button>
              </div>
              {accepting ? (
                <p className="text-xs text-muted-foreground">
                  Απαιτείται επιβεβαίωση email πριν την ενεργοποίηση. Κανονική τιμή Pro: €
                  {formatPrice(proPrice)}/μήνα. {PRICING_TAX_LABEL}
                </p>
              ) : null}
            </div>

            <div className="min-w-0">
              <SearchProductPreview className="hidden sm:block" />
              <SearchProductPreview className="sm:hidden max-h-[320px] overflow-hidden" />
            </div>
          </div>
        </section>

        <section id="value" className="mx-auto max-w-6xl space-y-10 px-4 py-14 sm:px-6">
          <div className="max-w-2xl space-y-2">
            <h2 className="text-2xl font-semibold tracking-tight">
              Από την αναζήτηση μέχρι την παρακολούθηση.
            </h2>
            <p className="text-muted-foreground">
              Μόνο δυνατότητες που υπάρχουν ήδη στο ARC Tenders.
            </p>
          </div>
          <div className="grid gap-8 lg:grid-cols-3">
            {[
              {
                title: "Βρες τις σωστές ευκαιρίες",
                body: "Αναζήτησε δημόσιους διαγωνισμούς και εντόπισε προκηρύξεις που σχετίζονται με τη δραστηριότητα της επιχείρησής σου.",
                visual: <SearchProductPreview />,
              },
              {
                title: "Ενημερώσου έγκαιρα",
                body: "Δημιούργησε αποθηκευμένες αναζητήσεις και λάβε ειδοποιήσεις για σχετικές νέες ευκαιρίες.",
                visual: <SavedSearchProductPreview />,
              },
              {
                title: "Παρακολούθησε κάθε εξέλιξη",
                body: "Ακολούθησε διαγωνισμούς που σε ενδιαφέρουν και διατήρησε οργανωμένη την παρακολούθησή τους.",
                visual: <MonitoringProductPreview />,
              },
            ].map((item) => (
              <div key={item.title} className="space-y-4">
                <div className="md:hidden">{item.visual}</div>
                <div className="hidden md:block">{item.visual}</div>
                <div>
                  <h3 className="font-semibold">{item.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{item.body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section id="how" className="border-y border-border/60 bg-card/20">
          <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
            <h2 className="text-2xl font-semibold tracking-tight">
              Ξεκίνα σε 3 απλά βήματα
            </h2>
            <ol className="mt-8 grid gap-4 md:grid-cols-3">
              {[
                {
                  n: "1",
                  title: "Δημιούργησε λογαριασμό",
                  body: "Εγγραφή και επιβεβαίωση email — χωρίς κάρτα.",
                },
                {
                  n: "2",
                  title: "Ενεργοποίησε το Pro δωρεάν",
                  body: "Ρητή ενεργοποίηση της προσφοράς για τον οργανισμό σου.",
                },
                {
                  n: "3",
                  title: "Βρες και παρακολούθησε ευκαιρίες",
                  body: "Αποθηκευμένες αναζητήσεις, παρακολούθηση και οργάνωση.",
                },
              ].map((step) => (
                <li
                  key={step.n}
                  className="rounded-xl border border-border/70 bg-background/50 p-4"
                >
                  <div className="font-mono text-xs text-primary">Βήμα {step.n}</div>
                  <div className="mt-2 font-medium">{step.title}</div>
                  <p className="mt-2 text-sm text-muted-foreground">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <Card className="border-primary/25 bg-primary/[0.04]">
            <CardContent className="grid gap-6 p-6 md:grid-cols-[1.2fr_0.8fr] md:p-8">
              <div className="space-y-3">
                <div className="inline-flex items-center gap-2 text-primary">
                  <Sparkles className="h-4 w-4" aria-hidden />
                  <span className="text-xs font-semibold uppercase tracking-wider">
                    Λεπτομέρειες προσφοράς
                  </span>
                </div>
                <h2 className="text-2xl font-semibold tracking-tight">
                  30 ημέρες Pro. Χωρίς καμία χρέωση.
                </h2>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  {[
                    "Η δοκιμή διαρκεί 30 ημέρες από την επιτυχή ενεργοποίηση.",
                    "Δεν απαιτείται πιστωτική κάρτα.",
                    "Δεν δημιουργείται συνδρομή Stripe και δεν γίνεται αυτόματη χρέωση.",
                    "Μετά τη λήξη επιστρέφετε στο Free Plan.",
                    "Τα δεδομένα σας διατηρούνται.",
                    "Μπορείτε να αγοράσετε Pro ρητά οποιαδήποτε στιγμή.",
                    `Μία ενεργοποίηση ανά οργανισμό · συνολικά ${total} λογαριασμοί.`,
                  ].map((line) => (
                    <li key={line} className="flex gap-2">
                      <CheckCircle2
                        className="mt-0.5 h-4 w-4 shrink-0 text-primary"
                        aria-hidden
                      />
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div
                className={cn(
                  "rounded-xl border px-4 py-5",
                  accepting
                    ? "border-primary/30 bg-background/60"
                    : "border-border/70 bg-background/40",
                )}
              >
                <div className="text-3xl font-semibold tracking-tight">0€</div>
                <div className="mt-1 text-sm text-muted-foreground">για 30 ημέρες Pro</div>
                <div className="mt-4 text-sm text-muted-foreground">
                  Κανονική τιμή μετά: €{formatPrice(proPrice)}/μήνα. {PRICING_TAX_LABEL}
                </div>
                <Button
                  className="mt-5 w-full"
                  disabled={loading || (!accepting && !exhausted)}
                  onClick={() => handlePrimaryCta("offer_card")}
                >
                  {accepting
                    ? "Ενεργοποίησε την προσφορά"
                    : exhausted
                      ? "Ξεκίνα δωρεάν"
                      : "Μη διαθέσιμη"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </section>

        <section id="faq" className="border-t border-border/60">
          <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
            <h2 className="text-2xl font-semibold tracking-tight">Συχνές ερωτήσεις</h2>
            <div className="mt-6 space-y-2">
              {FAQ.map((item) => (
                <details
                  key={item.q}
                  className="rounded-lg border border-border/70 bg-card/30 px-4 py-3"
                >
                  <summary className="cursor-pointer text-sm font-medium">
                    {item.q}
                  </summary>
                  <p className="mt-2 text-sm text-muted-foreground">{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-border/60">
          <div className="mx-auto max-w-6xl px-4 py-14 text-center sm:px-6">
            <h2 className="text-2xl font-semibold tracking-tight">
              Οι επόμενες δημόσιες ευκαιρίες μπορεί να σε αφορούν.
            </h2>
            <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
              Δοκίμασε τις δυνατότητες του ARC Tenders Pro για 30 ημέρες, χωρίς κάρτα.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Button
                size="lg"
                disabled={loading || (!accepting && !exhausted)}
                onClick={() => handlePrimaryCta("final_cta")}
              >
                {accepting ? "Ξεκίνα δωρεάν" : exhausted ? "Ξεκίνα δωρεάν" : "Δείτε τα πακέτα"}
              </Button>
              <Button size="lg" variant="ghost" asChild>
                <Link to="/pricing">Όλες οι τιμές</Link>
              </Button>
            </div>
            {accepting && remaining > 0 ? (
              <p className="mt-4 text-xs text-muted-foreground">
                Απομένουν {remaining} από τις {total} διαθέσιμες θέσεις · διαδρομή{" "}
                {PROMO_LAUNCH_PATH}
              </p>
            ) : null}
          </div>
        </section>
      </main>
    </PublicShell>
  );
};
