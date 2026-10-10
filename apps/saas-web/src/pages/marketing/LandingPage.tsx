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
  FAQ_EMAIL_WHEN,
  FAQ_SUBMIT_OFFER,
  FAQ_USES_AI,
  FAQ_WEEKLY_DELAY,
  MARKETING_PLANS,
  TRIAL_DAYS,
  formatEur,
} from "@/marketing/pricing";

const values = [
  {
    icon: Radar,
    title: "Εντοπίστε ευκαιρίες από το πρωτογενές αίτημα.",
    body: "Βρείτε αιτήματα που σχετίζονται με τη δραστηριότητά σας και προετοιμαστείτε για πιθανές προσκλήσεις που θα ακολουθήσουν.",
  },
  {
    icon: Bell,
    title: "Παρακολουθήστε την πορεία κάθε διαγωνισμού",
    body: "Προσθέστε έναν διαγωνισμό στην παρακολούθηση. Το ARC Tenders ελέγχει για σχετικές δημοσιεύσεις και σας ενημερώνει για νέες εξελίξεις.",
  },
  {
    icon: FolderSearch,
    title: "Όλες οι εξελίξεις σε μία σελίδα",
    body: "Δείτε συγκεντρωμένα το αίτημα, την πρόσκληση, την προθεσμία και την κατακύρωση. Ξεχωρίστε εύκολα ό,τι έχει αλλάξει από την τελευταία σας επίσκεψη.",
  },
] as const;

const steps = [
  {
    n: "1",
    title: "Πρωτογενές αίτημα",
    body: "Αποθηκεύστε μια αναζήτηση με λέξεις-κλειδιά, κωδικούς CPV και περιφέρεια. Η εφαρμογή εντοπίζει νέα αιτήματα που ταιριάζουν στα κριτήριά σας.",
  },
  {
    n: "2",
    title: "Πρόσκληση",
    body: "Προσθέστε το αίτημα στην παρακολούθηση. Όταν εντοπιστεί σχετική πρόσκληση, θα εμφανιστεί στην ίδια σελίδα και θα ενημερωθείτε.",
  },
  {
    n: "3",
    title: "Προθεσμία υποβολής",
    body: "Δείτε πότε λήγει η προθεσμία υποβολής και οργανώστε εγκαίρως την προετοιμασία της προσφοράς σας.",
  },
  {
    n: "4",
    title: "Κατακύρωση",
    body: "Η εφαρμογή συνεχίζει να ελέγχει για εξελίξεις μέχρι την κατακύρωση. Μπορείτε να διακόψετε την παρακολούθηση όποτε θέλετε.",
  },
] as const;

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
    a: "Ναι. Το δωρεάν πακέτο διατίθεται χωρίς χρονικό περιορισμό και χωρίς κάρτα. Αν θέλετε να γνωρίσετε τις επιπλέον δυνατότητες του Pro, μπορείτε να ενεργοποιήσετε δοκιμή 7 ημερών.",
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

const ProductVisual = () => (
  <div
    className="relative overflow-hidden border border-border/70 bg-card/70 p-5 sm:p-6"
    aria-hidden
  >
    <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
      Πορεία διαγωνισμού
    </p>
    <p className="mt-2 text-lg font-semibold tracking-tight text-foreground">
      Από το πρωτογενές αίτημα μέχρι την κατακύρωση
    </p>
    <ol className="mt-6 space-y-0 border-l border-border/80 pl-4">
      {[
        {
          title: "Πρωτογενές αίτημα",
          body: "Εντοπισμός του αρχικού αιτήματος στο ΚΗΜΔΗΣ",
        },
        {
          title: "Πρόσκληση",
          body: "Η σχετική πρόσκληση στην ίδια σελίδα",
        },
        {
          title: "Προθεσμία υποβολής",
          body: "Υπενθύμιση πριν λήξει η προθεσμία",
        },
        {
          title: "Κατακύρωση",
          body: "Ενημέρωση για την έκβαση του διαγωνισμού",
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
            Εντοπίστε έγκαιρα δημόσιους διαγωνισμούς. Παρακολουθήστε κάθε εξέλιξη μέχρι το αποτέλεσμα.
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            Το ARC Tenders εντοπίζει δημοσιεύσεις στο ΚΗΜΔΗΣ που σας ενδιαφέρουν και συγκεντρώνει
            την πορεία κάθε διαγωνισμού σε μία σελίδα. Από το πρωτογενές αίτημα μέχρι την
            κατακύρωση, βλέπετε τις νέες εξελίξεις και οργανώνετε τις επόμενες ενέργειές σας.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to="/signup">Ξεκινήστε δωρεάν</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/pricing">Δείτε τα πακέτα</Link>
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
          <h2 className="text-2xl font-semibold tracking-tight">Πώς σας βοηθά το ARC Tenders</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Βρείτε ευκαιρίες για την επιχείρησή σας, παρακολουθήστε τις εξελίξεις και οργανώστε τη
            συμμετοχή σας.
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
            Ξεκινήστε δωρεάν. Επιλέξτε περισσότερες δυνατότητες όταν τις χρειαστείτε.
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Αναζητήστε και παρακολουθήστε διαγωνισμούς δωρεάν, χωρίς κάρτα. Με το Basic, από{" "}
            {formatEur(MARKETING_PLANS.basic.priceMonthlyEur)} € τον μήνα πλέον ΦΠΑ, αποκτάτε
            περισσότερες δυνατότητες παρακολούθησης και οργάνωσης της συμμετοχής σας.
          </p>
          <div className="mt-8">
            <PricingCards mode="teaser" />
          </div>
          <p className="mt-5 text-sm">
            <Link
              to="/pricing"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              Συγκρίνετε αναλυτικά τα πακέτα →
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
            Δημιουργήστε λογαριασμό, αποθηκεύστε τα κριτήριά σας και βρείτε τις πρώτες ευκαιρίες
            για την επιχείρησή σας. Μπορείτε επίσης να δοκιμάσετε το Pro για {TRIAL_DAYS} ημέρες.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg">
              <Link to="/signup">Ξεκινήστε δωρεάν</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/pricing">Δείτε τα πακέτα</Link>
            </Button>
          </div>
        </div>
      </section>

      <section id="contact" className="border-t border-border/60 scroll-mt-20">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <h2 className="text-2xl font-semibold tracking-tight">Επικοινωνία</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Επικοινωνήστε μαζί μας για πληροφορίες σχετικά με το {LEGAL_CONTROLLER.productName}, τις
            συνδρομές ή για βοήθεια με την εφαρμογή.
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
