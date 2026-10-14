import { Link } from "react-router-dom";
import { PublicShell } from "@/components/marketing/PublicShell";
import { PricingCards } from "@/components/marketing/PricingCards";
import { SeoHead } from "@/components/SeoHead";
import { Button } from "@/components/ui/button";
import { MARKETING_SEO } from "@/lib/seo";
import {
  PROMO_LAUNCH_PATH,
  useArcProLaunchAvailability,
} from "@/lib/promo-launch";
import {
  COMPARISON_ROWS,
  FAQ_EMAIL_WHEN,
  FAQ_SUBMIT_OFFER,
  FAQ_USES_AI,
  FAQ_WEEKLY_DELAY,
  INGEST_SPEED_HELP,
  MARKETING_PLANS,
  TRIAL_DAYS,
  formatEur,
} from "@/marketing/pricing";

export const PricingPage = () => {
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
      q: "Μπορώ να ακυρώσω τη συνδρομή μου;",
      a: "Ναι. Μπορείτε να ακυρώσετε τη συνδρομή σας από τη «Διαχείριση πληρωμών». Διατηρείτε την πρόσβαση στο πακέτο σας μέχρι τη λήξη της περιόδου που έχετε ήδη πληρώσει.",
    },
    {
      q: "Υπάρχει δωρεάν πακέτο;",
      a: promoOpen
        ? `Ναι. Το δωρεάν πακέτο διατίθεται χωρίς χρονικό περιορισμό και χωρίς κάρτα. Διατίθεται επίσης προσφορά γνωριμίας: 30 ημέρες Pro δωρεάν για τους πρώτους ${promo?.totalSlots ?? 25} λογαριασμούς, χωρίς κάρτα και χωρίς αυτόματη χρέωση.`
        : `Ναι. Το δωρεάν πακέτο διατίθεται χωρίς χρονικό περιορισμό και χωρίς κάρτα. Αν θέλετε να γνωρίσετε τις επιπλέον δυνατότητες του Pro, μπορείτε να ενεργοποιήσετε δοκιμή ${TRIAL_DAYS} ημερών.`,
    },
    {
      q: "Τι συμβαίνει όταν λήξει η δοκιμή του Pro;",
      a: promoOpen
        ? "Μετά τις 30 ημέρες της προσφοράς επιστρέφετε στο Free. Δεν γίνεται αυτόματη χρέωση. Μπορείτε να αγοράσετε Pro ρητά οποιαδήποτε στιγμή."
        : "Η δοκιμή του Pro ολοκληρώθηκε. Συνεχίζετε με το δωρεάν πακέτο και έως μία εβδομαδιαία σύνοψη email.",
    },
    {
      q: "Μπορώ να προσθέσω περισσότερους χρήστες;",
      a: `Το Basic περιλαμβάνει 1 χρήστη και το Pro ${MARKETING_PLANS.pro.includedSeats} χρήστες. Στο Pro μπορείτε να προσθέσετε επιπλέον χρήστες με ${formatEur(MARKETING_PLANS.pro.extraSeatMonthlyEur!)} € ανά χρήστη τον μήνα, έως ${MARKETING_PLANS.pro.maxSeatsSelfService} χρήστες συνολικά.`,
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
      q: "Πόσο συχνά ελέγχεται το ΚΗΜΔΗΣ;",
      a: INGEST_SPEED_HELP,
    },
  ] as const;

  return (
  <PublicShell>
    <SeoHead {...MARKETING_SEO.pricing} />
    <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:py-16">
      <div className="max-w-2xl">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
          Τιμές
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
          Επιλέξτε το πακέτο που ταιριάζει στην επιχείρησή σας
        </h1>
        <p className="mt-3 text-sm text-muted-foreground sm:text-base">
          {promoOpen
            ? "Ξεκινήστε δωρεάν, χωρίς κάρτα, ή δοκιμάστε το Pro δωρεάν για 30 ημέρες (προσφορά γνωριμίας)."
            : `Ξεκινήστε δωρεάν, χωρίς κάρτα, ή δοκιμάστε το Pro για ${trialDaysLabel} ημέρες.`}{" "}
          Το Basic ξεκινά από {formatEur(MARKETING_PLANS.basic.priceMonthlyEur)} € και το Pro από{" "}
          {formatEur(MARKETING_PLANS.pro.priceMonthlyEur)} € τον μήνα, πλέον ΦΠΑ.
        </p>
      </div>

      <div className="mt-10">
        <PricingCards mode="full" />
      </div>
      <p className="mt-4 text-sm text-muted-foreground">
        Στο Pro μπορείτε να προσθέσετε χρήστες από τις ρυθμίσεις σας, έως{" "}
        {MARKETING_PLANS.pro.maxSeatsSelfService} συνολικά. Κάθε επιπλέον χρήστης κοστίζει{" "}
        {formatEur(MARKETING_PLANS.pro.extraSeatMonthlyEur!)} € τον μήνα.
      </p>

      <section id="comparison" className="mt-14 scroll-mt-20">
        <h2 className="text-xl font-semibold tracking-tight">Σύγκριση πακέτων</h2>
        <div className="mt-5 overflow-x-auto rounded-lg border border-border/60">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Χαρακτηριστικό</th>
                <th className="px-4 py-3 font-medium">Δωρεάν</th>
                <th className="px-4 py-3 font-medium">Basic</th>
                <th className="px-4 py-3 font-medium">Pro</th>
              </tr>
            </thead>
            <tbody>
              {COMPARISON_ROWS.map((row) => (
                <tr key={row.label} className="border-t border-border/60">
                  <td className="px-4 py-3 text-foreground">{row.label}</td>
                  <td className="px-4 py-3 text-muted-foreground">{row.free}</td>
                  <td className="px-4 py-3 text-muted-foreground">{row.basic}</td>
                  <td className="px-4 py-3 text-muted-foreground">{row.pro}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-14">
        <h2 className="text-xl font-semibold tracking-tight">Συχνές ερωτήσεις</h2>
        <div className="mt-6 space-y-3">
          {faqs.map((item) => (
            <details
              key={item.q}
              className="rounded-lg border border-border/60 px-4 py-3"
            >
              <summary className="cursor-pointer text-sm font-medium">{item.q}</summary>
              <p className="mt-2 text-sm text-muted-foreground">{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="mt-14 rounded-lg border border-border/60 px-6 py-8 text-center">
        <h2 className="text-xl font-semibold">Ξεκινήστε δωρεάν — χωρίς κάρτα</h2>
        <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
          Ξεκινήστε με το δωρεάν πακέτο και επιλέξτε Basic ή Pro όταν χρειαστείτε περισσότερες
          δυνατότητες.{" "}
          {promoOpen
            ? "Διατίθεται προσφορά γνωριμίας: 30 ημέρες Pro δωρεάν."
            : `Διατίθεται δοκιμή Pro για ${trialDaysLabel} ημέρες.`}
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <Button asChild size="lg">
            <Link to="/signup">Ξεκινήστε δωρεάν</Link>
          </Button>
          {promoOpen ? (
            <Button asChild size="lg" variant="outline">
              <Link to={PROMO_LAUNCH_PATH}>Δοκίμασε Pro 30 ημέρες</Link>
            </Button>
          ) : null}
        </div>
      </section>
    </main>
  </PublicShell>
  );
};
