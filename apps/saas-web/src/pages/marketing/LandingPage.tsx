import { Link, Navigate } from "react-router-dom";
import { Bell, FolderSearch, Radar } from "lucide-react";
import { PublicShell } from "@/components/marketing/PublicShell";
import { PricingCards } from "@/components/marketing/PricingCards";
import { JsonLd } from "@/components/JsonLd";
import { SeoHead } from "@/components/SeoHead";
import { PageLoading } from "@/components/states";
import { Button } from "@/components/ui/button";
import { ArcMark } from "@/components/brand/ArcMark";
import { LEGAL_CONTROLLER } from "@/legal/meta";
import { authClient } from "@/lib/auth-client";
import { MARKETING_SEO } from "@/lib/seo";
import {
  MARKETING_PLANS,
  TRIAL_DAYS,
  formatEur,
  priceWithTaxHint,
} from "@/marketing/pricing";

const values = [
  {
    icon: Radar,
    title: "Πρωτογενές αίτημα νωρίς",
    body: "Ειδοποίηση μόλις δημοσιευτεί το αίτημα στο ΚΗΜΔΗΣ — εβδομάδες πριν τη διακήρυξη, όχι μετά.",
  },
  {
    icon: Bell,
    title: "Παρακολούθηση μέχρι την κατακύρωση",
    body: "Όταν ακολουθήσετε έναν διαγωνισμό, το ARC προσέχει σχετικές πράξεις και προθεσμίες μέχρι να κλείσει το νήμα.",
  },
  {
    icon: FolderSearch,
    title: "Ένα νήμα, όχι inbox",
    body: "Αίτημα → πρόσκληση → προθεσμία → κατακύρωση σε μία οθόνη, με καθαρή «Νέα εξέλιξη».",
  },
] as const;

const steps = [
  {
    n: "1",
    title: "Πρωτογενές αίτημα",
    body: "Ορίστε Αποθηκευμένη Αναζήτηση (λέξεις-κλειδιά, CPV, περιφέρεια). Το REQ έρχεται μόλις δημοσιευτεί.",
  },
  {
    n: "2",
    title: "Πρόσκληση",
    body: "Παρακολουθήστε το αίτημα· όταν βγει η σχετική πρόσκληση, ενημερώνεστε στο ίδιο νήμα.",
  },
  {
    n: "3",
    title: "Προθεσμία",
    body: "Βλέπετε την προθεσμία υποβολής και λαμβάνετε ειδοποίηση όταν πλησιάζει.",
  },
  {
    n: "4",
    title: "Κατακύρωση",
    body: "Η παρακολούθηση συνεχίζει μέχρι την κατακύρωση ή μέχρι να τη διακόψετε εσείς.",
  },
] as const;

const faqs = [
  {
    q: "Είναι το ARC Tenders επίσημη υπηρεσία του ΚΗΜΔΗΣ;",
    a: "Όχι. Το ARC Tenders είναι ανεξάρτητη ιδιωτική υπηρεσία λογισμικού που χρησιμοποιεί δημόσια διαθέσιμα δεδομένα δημοσίων συμβάσεων. Δεν αποτελεί επίσημη πλατφόρμα ή συνεργάτη του ΚΗΜΔΗΣ / ΕΣΗΔΗΣ.",
  },
  {
    q: "Το ARC Tenders υποβάλλει προσφορές αυτόματα;",
    a: "Όχι. Καταγράφετε εκδήλωση ενδιαφέροντος ή υποβολή που πραγματοποιήσατε εσείς μέσω του επίσημου καναλιού. Το ARC Tenders οργανώνει τη ροή εργασίας· δεν αποστέλλει ούτε υποβάλλει προσφορές.",
  },
  {
    q: "Υπάρχει δωρεάν πλάνο;",
    a: "Ναι. Ξεκινάτε στο Δωρεάν πλάνο χωρίς κάρτα και χωρίς λήξη. Η δοκιμή Pro είναι χωριστή ενέργεια.",
  },
  {
    q: "Πόσο γρήγορα έρχονται οι ειδοποιήσεις;",
    a: "Η κοινή εισαγωγή ΚΗΜΔΗΣ τρέχει κάθε 1–2 λεπτά. Στόχος: in-app και push εντός 5 λεπτών από τη στιγμή που η πράξη φαίνεται στο Open Data, σε όλα τα πλάνα.",
  },
  {
    q: "Μπορώ να προσθέσω περισσότερους χρήστες;",
    a: `Basic: 1 χρήστης. Pro: ${MARKETING_PLANS.pro.includedSeats} χρήστες περιλαμβάνονται και επιπλέον €${formatEur(MARKETING_PLANS.pro.extraSeatMonthlyEur!)} / χρήστη / μήνα, έως ${MARKETING_PLANS.pro.maxSeatsSelfService} self-service.`,
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

const ProductVisual = () => (
  <div
    className="relative overflow-hidden border border-border/70 bg-card/70 p-5 sm:p-6"
    aria-hidden
  >
    <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
      Νήμα διαγωνισμού
    </p>
    <p className="mt-2 text-lg font-semibold tracking-tight text-foreground">
      Από το πρωτογενές αίτημα μέχρι την κατακύρωση
    </p>
    <ol className="mt-6 space-y-0 border-l border-border/80 pl-4">
      {[
        {
          title: "Πρωτογενές αίτημα",
          body: "Ειδοποίηση εβδομάδες πριν τη διακήρυξη",
        },
        {
          title: "Πρόσκληση",
          body: "Σχετική PROC στο ίδιο νήμα",
        },
        {
          title: "Προθεσμία",
          body: "Υπενθύμιση πριν κλείσει η υποβολή",
        },
        {
          title: "Κατακύρωση",
          body: "Παρακολούθηση μέχρι το αποτέλεσμα",
        },
      ].map((step, index) => (
        <li key={step.title} className="relative pb-5 last:pb-0">
          <span className="absolute -left-[1.3rem] top-1 h-2 w-2 rounded-sm bg-primary" />
          <p className="text-sm font-medium text-foreground">
            <span className="mr-2 font-mono text-xs text-muted-foreground">
              0{index + 1}
            </span>
            {step.title}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{step.body}</p>
        </li>
      ))}
    </ol>
  </div>
);

export const LandingPage = () => {
  const { data: session, isPending } = authClient.useSession();

  // Logged-in users opening the marketing root go straight into the app.
  // Crawlers / logged-out visitors still see the public landing (SEO).
  if (isPending) {
    return <PageLoading label="Έλεγχος συνεδρίας…" />;
  }
  if (session?.user) {
    return <Navigate to="/app" replace />;
  }

  return (
  <PublicShell featuresHref="#features" contactHref="#contact">
    <SeoHead {...MARKETING_SEO.home} />
    <JsonLd id="home-faq" data={faqJsonLd} />
    <main>
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-12 sm:px-6 lg:grid-cols-2 lg:py-20">
        <div className="arc-hero-copy">
          <div className="inline-flex items-center gap-2.5">
            <ArcMark className="h-8 w-8" />
            <p className="font-mono text-sm font-semibold tracking-tight text-foreground">
              ARC Tenders
            </p>
          </div>
          <h1 className="mt-5 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl lg:text-[2.75rem] lg:leading-[1.15]">
            Βλέπεις το πρωτογενές αίτημα νωρίς. Το ARC προσέχει τον διαγωνισμό μέχρι την κατακύρωση.
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            Όχι άλλη λίστα στο inbox. Ένα νήμα ανά διαγωνισμό στο ΚΗΜΔΗΣ — αίτημα, πρόσκληση,
            προθεσμία, κατακύρωση — με ειδοποίηση εντός λεπτών.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to="/signup">Ξεκινήστε δωρεάν</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/pricing">Δείτε τα πλάνα</Link>
            </Button>
            <Button asChild size="lg" variant="ghost">
              <Link to="/login">Σύνδεση</Link>
            </Button>
          </div>
        </div>
        <div className="arc-hero-visual">
          <ProductVisual />
        </div>
      </section>

      <section id="features" className="border-t border-border/60 scroll-mt-20">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <h2 className="text-2xl font-semibold tracking-tight">Τι σας προσφέρει</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Χωρίς επαναλαμβανόμενη χειροκίνητη αναζήτηση στο ΚΗΜΔΗΣ — με οργανωμένη ροή εργασίας.
          </p>
          <div className="mt-8 grid gap-8 md:grid-cols-3 md:gap-10">
            {values.map((item) => (
              <div key={item.title} className="border-t border-border/70 pt-5">
                <item.icon className="h-5 w-5 text-primary" aria-hidden />
                <h3 className="mt-4 text-base font-semibold">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-border/60">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <h2 className="text-2xl font-semibold tracking-tight">Πώς λειτουργεί</h2>
          <ol className="mt-8 grid gap-8 md:grid-cols-2">
            {steps.map((step) => (
              <li key={step.n} className="border-t border-border/70 pt-5">
                <div className="font-mono text-xs text-muted-foreground">Βήμα {step.n}</div>
                <h3 className="mt-2 text-base font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="border-t border-border/60">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <h2 className="text-2xl font-semibold tracking-tight">
            Δωρεάν πλάνο, ίδια ταχύτητα εισαγωγής
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Ξεκινήστε δωρεάν χωρίς κάρτα. Basic από{" "}
            {priceWithTaxHint(MARKETING_PLANS.basic.priceMonthlyEur)} όταν χρειάζεστε vault,
            φάκελο συμμετοχής και μνήμη τιμής.
          </p>
          <div className="mt-8">
            <PricingCards mode="teaser" />
          </div>
          <p className="mt-5 text-sm">
            <Link
              to="/pricing"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              Αναλυτική σύγκριση πλάνων →
            </Link>
          </p>
        </div>
      </section>

      <section className="border-t border-border/60">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <h2 className="text-2xl font-semibold tracking-tight">Συχνές ερωτήσεις</h2>
          <div className="mt-8 space-y-4">
            {faqs.map((item) => (
              <details
                key={item.q}
                className="border-b border-border/70 py-3 first:border-t"
              >
                <summary className="cursor-pointer text-sm font-medium text-foreground">
                  {item.q}
                </summary>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-border/60">
        <div className="mx-auto max-w-6xl px-4 py-14 text-center sm:px-6">
          <h2 className="text-2xl font-semibold tracking-tight">
            Ξεκινήστε δωρεάν — χωρίς κάρτα
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
            Δημιουργήστε οργανισμό, ορίστε Αποθηκευμένη Αναζήτηση και παρακολουθήστε το πρώτο
            πρωτογενές αίτημα. Δοκιμή Pro {TRIAL_DAYS} ημερών όποτε θέλετε.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg">
              <Link to="/signup">Ξεκινήστε δωρεάν</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/pricing">Δείτε τα πλάνα</Link>
            </Button>
          </div>
        </div>
      </section>

      <section id="contact" className="border-t border-border/60 scroll-mt-20">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <h2 className="text-2xl font-semibold tracking-tight">Επικοινωνία</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Για ερωτήσεις σχετικά με το {LEGAL_CONTROLLER.productName}, συνδρομές ή υποστήριξη —
            γράψτε μας.
          </p>
          <div className="mt-8 flex flex-col gap-4 text-sm sm:flex-row sm:items-baseline sm:gap-10">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Email
              </p>
              <a
                href={`mailto:${LEGAL_CONTROLLER.email}?subject=ARC%20Tenders`}
                className="mt-1 inline-block font-medium text-foreground underline-offset-4 hover:underline"
              >
                {LEGAL_CONTROLLER.email}
              </a>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Ιστότοπος
              </p>
              <a
                href={LEGAL_CONTROLLER.website}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-block font-medium text-foreground underline-offset-4 hover:underline"
              >
                tekia.gr
              </a>
            </div>
          </div>
        </div>
      </section>
    </main>
  </PublicShell>
  );
};
