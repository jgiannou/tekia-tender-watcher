import { Link, Navigate } from "react-router-dom";
import { PublicShell } from "@/components/marketing/PublicShell";
import { PricingCards } from "@/components/marketing/PricingCards";
import { HeroProductComposition } from "@/components/marketing/HeroProductComposition";
import {
  MonitoringProductPreview,
  SavedSearchProductPreview,
  SearchProductPreview,
} from "@/components/marketing/ProductPreviewFrames";
import { JsonLd } from "@/components/JsonLd";
import { SeoHead } from "@/components/SeoHead";
import { PageLoading } from "@/components/states";
import { Button } from "@/components/ui/button";
import { LEGAL_CONTROLLER } from "@/legal/meta";
import { authClient } from "@/lib/auth-client";
import { MARKETING_SEO } from "@/lib/seo";
import {
  PROMO_LAUNCH_PATH,
  useArcProLaunchAvailability,
} from "@/lib/promo-launch";
import {
  FAQ_EMAIL_WHEN,
  FAQ_SUBMIT_OFFER,
  FAQ_USES_AI,
  FAQ_WEEKLY_DELAY,
  MARKETING_PLANS,
  TRIAL_DAYS,
  formatEur,
} from "@/marketing/pricing";

const audience = [
  "Τεχνικές εταιρείες",
  "Ψηφιακές υπηρεσίες",
  "Σύμβουλοι",
  "Κατασκευαστικές",
  "Προμηθευτές",
] as const;

const flowSteps = [
  { title: "Αναζήτηση", body: "Κριτήρια και ΚΗΜΔΗΣ" },
  { title: "Ευκαιρία", body: "Συνάφεια με το προφίλ σας" },
  { title: "Παρακολούθηση", body: "Σχετικές επίσημες πράξεις" },
  { title: "Προετοιμασία", body: "Έγγραφα και φάκελος" },
  { title: "Υποβολή", body: "Καταγραφή συμμετοχής" },
  { title: "Αποτέλεσμα", body: "Έκβαση του διαγωνισμού" },
] as const;

export const LandingPage = () => {
  const { data: session, isPending } = authClient.useSession();
  const { meta: promo } = useArcProLaunchAvailability();
  const promoOpen = Boolean(promo?.promotionActive && promo.acceptingRedemptions);
  const trialDaysLabel = promoOpen ? 30 : TRIAL_DAYS;

  const faqs = [
    {
      q: "Είναι το ARC Tenders επίσημη υπηρεσία του ΚΗΜΔΗΣ;",
      a: "Όχι. Το ARC Tenders είναι ανεξάρτητη ιδιωτική υπηρεσία που χρησιμοποιεί δημόσια διαθέσιμα δεδομένα για δημόσιες συμβάσεις.",
    },
    {
      q: "Μπορώ να υποβάλω προσφορά μέσα από το ARC Tenders;",
      a: FAQ_SUBMIT_OFFER,
    },
    {
      q: "Υπάρχει δωρεάν πακέτο;",
      a: promoOpen
        ? `Ναι. Το δωρεάν πακέτο διατίθεται χωρίς χρονικό περιορισμό και χωρίς κάρτα. Διατίθεται επίσης προσφορά γνωριμίας: 30 ημέρες Pro δωρεάν για τους πρώτους ${promo?.totalSlots ?? 25} λογαριασμούς, χωρίς κάρτα και χωρίς αυτόματη χρέωση.`
        : `Ναι. Το δωρεάν πακέτο διατίθεται χωρίς χρονικό περιορισμό και χωρίς κάρτα. Αν θέλετε να γνωρίσετε τις επιπλέον δυνατότητες του Pro, μπορείτε να ενεργοποιήσετε δοκιμή ${TRIAL_DAYS} ημερών.`,
    },
    {
      q: "Πότε λαμβάνω email;",
      a: FAQ_EMAIL_WHEN,
    },
    {
      q: "Η εβδομαδιαία ενημέρωση καθυστερεί τα αποτελέσματά μου;",
      a: FAQ_WEEKLY_DELAY,
    },
    {
      q: "Χρησιμοποιεί AI η εφαρμογή;",
      a: FAQ_USES_AI,
    },
    {
      q: "Μπορώ να προσθέσω περισσότερους χρήστες;",
      a: `Το Basic περιλαμβάνει 1 χρήστη και το Pro ${MARKETING_PLANS.pro.includedSeats} χρήστες. Στο Pro μπορείτε να προσθέσετε επιπλέον χρήστες με ${formatEur(MARKETING_PLANS.pro.extraSeatMonthlyEur!)} € ανά χρήστη τον μήνα, έως ${MARKETING_PLANS.pro.maxSeatsSelfService} χρήστες συνολικά.`,
    },
  ] as const;

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };

  if (isPending) {
    return <PageLoading label="Έλεγχος συνεδρίας…" />;
  }
  if (session?.user) {
    return <Navigate to="/app" replace />;
  }

  return (
    <PublicShell
      featuresHref="#features"
      howItWorksHref="#how-it-works"
      faqHref="#faq"
      contactHref="#contact"
    >
      <SeoHead {...MARKETING_SEO.home} />
      <JsonLd id="home-faq" data={faqJsonLd} />
      <main>
        {/* 01 HERO */}
        <section className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pb-20 pt-14 sm:px-6 lg:grid-cols-2 lg:gap-16 lg:pb-28 lg:pt-20">
          <div className="arc-hero-copy relative z-10">
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
              Δημόσιοι διαγωνισμοί · ΚΗΜΔΗΣ · Για επιχειρήσεις
            </p>
            <h1 className="mt-5 text-[2rem] font-semibold leading-[1.15] tracking-tight text-foreground sm:text-4xl lg:text-[2.65rem] lg:leading-[1.12]">
              Εντοπίστε έγκαιρα
              <br />
              δημόσιους διαγωνισμούς.
              <br />
              Παρακολουθήστε κάθε
              <br />
              <span className="text-primary">εξέλιξη μέχρι το αποτέλεσμα.</span>
            </h1>
            <p className="mt-5 max-w-md text-base leading-relaxed text-muted-foreground">
              Το ARC Tenders εντοπίζει ευκαιρίες στο ΚΗΜΔΗΣ που ταιριάζουν στα
              κριτήριά σας και παρακολουθεί τις επόμενες επίσημες εξελίξεις για εσάς.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link to="/signup">Ξεκινήστε δωρεάν</Link>
              </Button>
              <Button asChild size="lg" variant="ghost">
                <a href="#how-it-works">Δείτε πώς λειτουργεί</a>
              </Button>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              {promoOpen
                ? `Χωρίς πιστωτική κάρτα · ${trialDaysLabel} ημέρες Pro δωρεάν`
                : `Χωρίς πιστωτική κάρτα · Δοκιμή Pro ${TRIAL_DAYS} ημερών`}
            </p>
          </div>
          <div className="arc-hero-visual relative z-10 px-2 sm:px-4 lg:px-0">
            <HeroProductComposition />
          </div>
        </section>

        {/* Audience — no fake social proof */}
        <section className="border-t border-border/40">
          <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
            <p className="text-sm text-muted-foreground">
              Σχεδιασμένο για επιχειρήσεις που συμμετέχουν σε δημόσιους διαγωνισμούς
            </p>
            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
              {audience.map((label) => (
                <span
                  key={label}
                  className="text-sm font-medium text-foreground/80"
                >
                  {label}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* 02 CORE VALUE */}
        <section id="features" className="scroll-mt-20 border-t border-border/40">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 sm:px-6 md:grid-cols-3 md:gap-12">
            {[
              {
                title: "Βρείτε ό,τι σας αφορά.",
                body: "Αποθηκευμένες αναζητήσεις και βαθμολογία συνάφειας — χωρίς καθημερινό χειροκίνητο έλεγχο του ΚΗΜΔΗΣ.",
              },
              {
                title: "Παρακολουθήστε τι αλλάζει.",
                body: "Σχετικές πράξεις, προθεσμίες και νέα επίσημα γεγονότα συγκεντρωμένα στο ίδιο νήμα διαγωνισμού.",
              },
              {
                title: "Οργανώστε τη συμμετοχή σας.",
                body: "Έγγραφα εταιρείας, φάκελος διαγωνισμού και καταγραφή υποβολής σε έναν χώρο εργασίας.",
              },
            ].map((item) => (
              <div key={item.title}>
                <h2 className="text-lg font-semibold tracking-tight">{item.title}</h2>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  {item.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* 03 Opportunities story */}
        <section className="border-t border-border/40">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:gap-16">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                Ευκαιρίες
              </p>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
                Δεν χρειάζεται να ελέγχετε καθημερινά το ΚΗΜΔΗΣ.
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                Ορίστε κριτήρια μία φορά. Το ARC Tenders εντοπίζει νέα αιτήματα και
                προσκλήσεις που ταιριάζουν, με σαφή λόγους συνάφειας — ώστε να
                αποφασίζετε γρήγορα τι αξίζει παρακολούθηση.
              </p>
            </div>
            <SearchProductPreview />
          </div>
        </section>

        {/* 04 Monitoring story */}
        <section className="border-t border-border/40">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:gap-16">
            <div className="order-2 lg:order-1">
              <MonitoringProductPreview />
            </div>
            <div className="order-1 lg:order-2">
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                Παρακολούθηση
              </p>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
                Από το αίτημα στην πρόσκληση — και στο αποτέλεσμα.
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                Κάθε παρακολουθούμενος διαγωνισμός έχει στάδιο, επόμενη ενέργεια και
                ιστορικό επίσημων εξελίξεων. Βλέπετε τι περιμένετε τώρα, χωρίς να
                χάνετε το νήμα μεταξύ REQ και PROC.
              </p>
            </div>
          </div>
        </section>

        {/* 05 Preparation story */}
        <section className="border-t border-border/40">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:gap-16">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                Προετοιμασία
              </p>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
                Έγγραφα εταιρείας και φάκελος διαγωνισμού.
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                Κρατήστε δικαιολογητικά, εκδοχές και υλικό υποβολής οργανωμένα.
                Όταν έρθει η πρόσκληση, η προετοιμασία ξεκινά από ήδη συγκεντρωμένο
                υλικό — όχι από αρχή.
              </p>
            </div>
            <SavedSearchProductPreview />
          </div>
        </section>

        {/* 06 How it works — horizontal timeline */}
        <section
          id="how-it-works"
          className="scroll-mt-20 border-t border-border/40"
        >
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <h2 className="text-2xl font-semibold tracking-tight">Πώς λειτουργεί</h2>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">
              Μια γραμμική ροή από την εύρεση μέχρι το αποτέλεσμα.
            </p>
            <ol className="mt-12 flex flex-col gap-8 md:flex-row md:items-start md:gap-0">
              {flowSteps.map((step, index) => (
                <li
                  key={step.title}
                  className="relative flex-1 md:px-3 md:text-center"
                >
                  {index < flowSteps.length - 1 ? (
                    <span
                      className="absolute left-4 top-3 hidden h-px w-[calc(100%-0.5rem)] bg-border md:block"
                      aria-hidden
                    />
                  ) : null}
                  <div className="relative flex items-start gap-3 md:flex-col md:items-center md:gap-2">
                    <span className="relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border bg-background font-mono text-[10px] text-muted-foreground">
                      {index + 1}
                    </span>
                    <div>
                      <p className="text-sm font-semibold">{step.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{step.body}</p>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Limited promo — one quiet banner */}
        {promoOpen ? (
          <section className="border-t border-border/40">
            <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-12 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <div>
                <p className="text-lg font-semibold tracking-tight">
                  30 ημέρες Pro δωρεάν
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Χωρίς κάρτα · χωρίς αυτόματη χρέωση
                  {promo?.totalSlots
                    ? ` · Μόνο για ${promo.totalSlots} λογαριασμούς`
                    : ""}
                </p>
              </div>
              <Button asChild>
                <Link to={PROMO_LAUNCH_PATH}>Δοκιμάστε Pro</Link>
              </Button>
            </div>
          </section>
        ) : null}

        {/* 07 Pricing teaser */}
        <section id="pricing" className="scroll-mt-20 border-t border-border/40">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <h2 className="text-2xl font-semibold tracking-tight">Τιμές</h2>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">
              Ξεκινήστε δωρεάν. Αναβαθμίστε όταν χρειαστείτε περισσότερη χωρητικότητα
              και οργανωτικές δυνατότητες.
            </p>
            <div className="mt-10">
              <PricingCards mode="teaser" />
            </div>
            <p className="mt-6 text-sm">
              <Link
                to="/pricing"
                className="font-medium text-foreground underline-offset-4 hover:underline"
              >
                Συγκρίνετε αναλυτικά τα πακέτα →
              </Link>
            </p>
          </div>
        </section>

        {/* 08 FAQ */}
        <section id="faq" className="scroll-mt-20 border-t border-border/40">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <h2 className="text-2xl font-semibold tracking-tight">
              Συχνές ερωτήσεις
            </h2>
            <div className="mt-10 max-w-3xl space-y-0">
              {faqs.map((item) => (
                <details
                  key={item.q}
                  className="group border-b border-border/50 py-4 first:border-t"
                >
                  <summary className="cursor-pointer list-none text-sm font-medium text-foreground marker:content-none [&::-webkit-details-marker]:hidden">
                    {item.q}
                  </summary>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {item.a}
                  </p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* 09 Final CTA */}
        <section className="border-t border-border/40">
          <div className="mx-auto max-w-6xl px-4 py-24 text-center sm:px-6">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Ξεκινήστε δωρεάν — χωρίς κάρτα
            </h2>
            <p className="mx-auto mt-3 max-w-lg text-sm text-muted-foreground">
              Δημιουργήστε λογαριασμό, ορίστε κριτήρια και δείτε τις πρώτες ευκαιρίες
              για την επιχείρησή σας.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Button asChild size="lg">
                <Link to="/signup">Ξεκινήστε δωρεάν</Link>
              </Button>
              <Button asChild size="lg" variant="ghost">
                <Link to={promoOpen ? PROMO_LAUNCH_PATH : "/pricing"}>
                  {promoOpen ? "Δοκιμάστε Pro 30 ημέρες" : "Δείτε τα πακέτα"}
                </Link>
              </Button>
            </div>
          </div>
        </section>

        <section id="contact" className="scroll-mt-20 border-t border-border/40">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <h2 className="text-lg font-semibold tracking-tight">Επικοινωνία</h2>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">
              Για πληροφορίες σχετικά με το {LEGAL_CONTROLLER.productName} ή βοήθεια
              με την εφαρμογή.
            </p>
            <a
              href={`mailto:${LEGAL_CONTROLLER.email}?subject=ARC%20Tenders`}
              className="mt-4 inline-block text-sm font-medium text-foreground underline-offset-4 hover:underline"
            >
              {LEGAL_CONTROLLER.email}
            </a>
          </div>
        </section>
      </main>
    </PublicShell>
  );
};
