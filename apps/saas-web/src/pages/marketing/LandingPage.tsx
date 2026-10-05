import { Link } from "react-router-dom";
import { Bell, FolderSearch, Radar } from "lucide-react";
import { PublicShell } from "@/components/marketing/PublicShell";
import { PricingCards } from "@/components/marketing/PricingCards";
import { Button } from "@/components/ui/button";
import { LEGAL_CONTROLLER } from "@/legal/meta";
import { MARKETING_PLANS, TRIAL_DAYS, formatEur } from "@/marketing/pricing";

const values = [
  {
    icon: Radar,
    title: "Αυτόματες αναζητήσεις",
    body: "Αποθηκεύστε τα κριτήρια που σας ενδιαφέρουν και το ARC Tenders αναζητά αυτόματα νέες σχετικές δημοσιεύσεις στο ΚΗΜΔΗΣ.",
  },
  {
    icon: Bell,
    title: "Ειδοποιήσεις για νέες εξελίξεις",
    body: "Ενημερωθείτε όταν εμφανίζονται νέες ευκαιρίες ή σχετικές πράξεις για διαγωνισμούς που παρακολουθείτε.",
  },
  {
    icon: FolderSearch,
    title: "Όλη η διαδικασία οργανωμένη",
    body: "Έγγραφα, εκδήλωση ενδιαφέροντος, προετοιμασία και καταγραφή υποβολών, συγκεντρωμένα σε έναν χώρο εργασίας.",
  },
] as const;

const steps = [
  {
    n: "1",
    title: "Ορίστε τι σας ενδιαφέρει",
    body: "Δημιουργήστε Αποθηκευμένες Αναζητήσεις με λέξεις-κλειδιά, CPV και άλλα διαθέσιμα φίλτρα.",
  },
  {
    n: "2",
    title: "Δείτε σχετικές ευκαιρίες",
    body: "Το ARC Tenders ελέγχει νέες δημοσιεύσεις και σας εμφανίζει τις σχετικές ευκαιρίες με βαθμό συνάφειας.",
  },
  {
    n: "3",
    title: "Παρακολουθήστε ό,τι σας ενδιαφέρει",
    body: "Ακολουθήστε συγκεκριμένα αιτήματα ή διαγωνισμούς και ενημερωθείτε για νέες σχετικές πράξεις.",
  },
  {
    n: "4",
    title: "Οργανώστε την προετοιμασία",
    body: "Χρησιμοποιήστε το Company Vault και το Tender Workspace για έγγραφα, εκδήλωση ενδιαφέροντος και υποβολές.",
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
    q: "Μπορώ να ακυρώσω τη συνδρομή μου;",
    a: "Ναι. Από τη διαχείριση χρέωσης (Stripe Customer Portal) μπορείτε να ακυρώσετε στο τέλος της τρέχουσας περιόδου· η πρόσβαση παραμένει έως τότε.",
  },
  {
    q: "Τι συμβαίνει όταν λήξει η δοκιμή;",
    a: `Μετά τις ${TRIAL_DAYS} ημέρες, οι αυτόματες σαρώσεις και οι σχετικές δυνατότητες συνδρομής απενεργοποιούνται μέχρι να επιλέξετε Basic ή Pro. Η χειροκίνητη αναζήτηση ΚΗΜΔΗΣ παραμένει διαθέσιμη.`,
  },
  {
    q: "Μπορώ να προσθέσω περισσότερους χρήστες;",
    a: `Basic: 1 χρήστης. Pro: ${MARKETING_PLANS.pro.includedSeats} χρήστες περιλαμβάνονται και επιπλέον €${formatEur(MARKETING_PLANS.pro.extraSeatMonthlyEur!)} / χρήστη / μήνα, έως ${MARKETING_PLANS.pro.maxSeatsSelfService} self-service.`,
  },
] as const;

const ProductVisual = () => (
  <div
    className="relative overflow-hidden rounded-2xl border border-border/70 bg-card/80 p-4 shadow-2xl shadow-primary/10 sm:p-5"
    aria-hidden
  >
    <div className="mb-4 flex items-center justify-between gap-3">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
          Ευκαιρίες
        </p>
        <p className="mt-1 text-sm text-muted-foreground">Από Αποθηκευμένες Αναζητήσεις</p>
      </div>
      <span className="rounded-md border border-primary/25 bg-primary/10 px-2 py-1 text-xs text-primary">
        ΚΗΜΔΗΣ
      </span>
    </div>
    <div className="space-y-3">
      {[
        { title: "Προμήθεια λογισμικού διαχείρισης", score: "86", tag: "Νέα" },
        { title: "Υπηρεσίες ανάπτυξης εφαρμογών", score: "74", tag: "REQ" },
        { title: "Συντήρηση πληροφοριακών συστημάτων", score: "69", tag: "PROC" },
      ].map((row) => (
        <div
          key={row.title}
          className="rounded-lg border border-border/60 bg-background/60 px-3 py-3"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-foreground">{row.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Αποθηκευμένη αναζήτηση · βαθμός συνάφειας {row.score}
              </p>
            </div>
            <span className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {row.tag}
            </span>
          </div>
        </div>
      ))}
    </div>
    <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-primary/10 blur-2xl" />
  </div>
);

export const LandingPage = () => (
  <PublicShell featuresHref="#features" contactHref="#contact">
    <main>
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-12 sm:px-6 lg:grid-cols-2 lg:py-20">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-primary">
            ARC Tenders
          </p>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl lg:text-5xl lg:leading-[1.1]">
            Βρείτε δημόσιους διαγωνισμούς που σας αφορούν.
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            Το ARC Tenders σας βοηθά να εντοπίζετε σχετικές ευκαιρίες στο ΚΗΜΔΗΣ, να
            παρακολουθείτε την εξέλιξή τους και να οργανώνετε όλη τη διαδικασία σε ένα σημείο.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to="/signup">Δωρεάν δοκιμή {TRIAL_DAYS} ημερών</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/pricing">Δείτε τα πλάνα</Link>
            </Button>
            <Button asChild size="lg" variant="ghost">
              <Link to="/login">Σύνδεση</Link>
            </Button>
          </div>
        </div>
        <ProductVisual />
      </section>

      <section id="features" className="border-t border-border/60 scroll-mt-20">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <h2 className="text-2xl font-semibold tracking-tight">Τι σας προσφέρει</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Χωρίς επαναλαμβανόμενη χειροκίνητη αναζήτηση στο ΚΗΜΔΗΣ — με οργανωμένη ροή εργασίας.
          </p>
          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {values.map((item) => (
              <div
                key={item.title}
                className="rounded-xl border border-border/70 bg-card/50 p-5"
              >
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-primary/25 bg-primary/10 text-primary">
                  <item.icon className="h-4 w-4" aria-hidden />
                </span>
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
          <ol className="mt-8 grid gap-4 md:grid-cols-2">
            {steps.map((step) => (
              <li
                key={step.n}
                className="rounded-xl border border-border/70 bg-card/40 p-5"
              >
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                  Βήμα {step.n}
                </div>
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
            Απλά πλάνα, χωρίς περίπλοκες χρεώσεις
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Ξεκινήστε από €{formatEur(MARKETING_PLANS.basic.priceMonthlyEur)} / μήνα και
            αναβαθμίστε μόνο όταν χρειάζεστε περισσότερες αναζητήσεις, παρακολουθήσεις ή μέλη
            ομάδας.
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
                className="rounded-xl border border-border/70 bg-card/40 px-4 py-3"
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
            Ξεκινήστε με δωρεάν δοκιμή {TRIAL_DAYS} ημερών
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
            Δημιουργήστε οργανισμό, δοκιμάστε τις Αποθηκευμένες Αναζητήσεις και επιλέξτε Basic
            ή Pro πριν λήξει η δοκιμή.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg">
              <Link to="/signup">Δωρεάν δοκιμή {TRIAL_DAYS} ημερών</Link>
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
