import { Link } from "react-router-dom";
import { PublicShell } from "@/components/marketing/PublicShell";
import { PricingCards } from "@/components/marketing/PricingCards";
import { SeoHead } from "@/components/SeoHead";
import { Button } from "@/components/ui/button";
import { MARKETING_SEO } from "@/lib/seo";
import {
  COMPARISON_ROWS,
  MARKETING_PLANS,
  TRIAL_DAYS,
  formatEur,
} from "@/marketing/pricing";

const faqs = [
  {
    q: "Είναι το ARC Tenders επίσημη υπηρεσία του ΚΗΜΔΗΣ;",
    a: "Όχι. Το ARC Tenders είναι ανεξάρτητη ιδιωτική υπηρεσία που χρησιμοποιεί δημόσια διαθέσιμα δεδομένα για δημόσιες συμβάσεις.",
  },
  {
    q: "Μπορώ να υποβάλω προσφορά μέσα από το ARC Tenders;",
    a: "Όχι. Υποβάλλετε την προσφορά σας με τον τρόπο που ορίζει η πρόσκληση ή η διακήρυξη. Στο ARC Tenders καταγράφετε την υποβολή και παρακολουθείτε τις εξελίξεις του διαγωνισμού.",
  },
  {
    q: "Μπορώ να ακυρώσω τη συνδρομή μου;",
    a: "Ναι. Μπορείτε να ακυρώσετε τη συνδρομή σας από τη «Διαχείριση πληρωμών». Διατηρείτε την πρόσβαση στο πακέτο σας μέχρι τη λήξη της περιόδου που έχετε ήδη πληρώσει.",
  },
  {
    q: "Υπάρχει δωρεάν πακέτο;",
    a: "Ναι. Το δωρεάν πακέτο διατίθεται χωρίς χρονικό περιορισμό και χωρίς κάρτα. Αν θέλετε να γνωρίσετε τις επιπλέον δυνατότητες του Pro, μπορείτε να ενεργοποιήσετε δοκιμή 7 ημερών.",
  },
  {
    q: "Τι συμβαίνει όταν λήξει η δοκιμή του Pro;",
    a: "Αν δεν επιλέξετε συνδρομή Basic ή Pro, συνεχίζετε με το δωρεάν πακέτο. Η αναζήτηση στο ΚΗΜΔΗΣ παραμένει διαθέσιμη.",
  },
  {
    q: "Μπορώ να προσθέσω περισσότερους χρήστες;",
    a: `Το Basic περιλαμβάνει 1 χρήστη και το Pro ${MARKETING_PLANS.pro.includedSeats} χρήστες. Στο Pro μπορείτε να προσθέσετε επιπλέον χρήστες με ${formatEur(MARKETING_PLANS.pro.extraSeatMonthlyEur!)} € ανά χρήστη τον μήνα, έως ${MARKETING_PLANS.pro.maxSeatsSelfService} χρήστες συνολικά.`,
  },
  {
    q: "Πότε λαμβάνω ειδοποιήσεις;",
    a: "Η συχνότητα των email εξαρτάται από το πακέτο σας. Στο δωρεάν πακέτο λαμβάνετε ένα συγκεντρωτικό email την ημέρα. Στο Basic επιλέγετε τις ώρες αποστολής, ενώ στο Pro λαμβάνετε άμεσα email για νέες εξελίξεις.",
  },
] as const;

export const PricingPage = () => (
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
          Ξεκινήστε δωρεάν, χωρίς κάρτα, ή δοκιμάστε το Pro για {TRIAL_DAYS} ημέρες. Το Basic
          ξεκινά από {formatEur(MARKETING_PLANS.basic.priceMonthlyEur)} € και το Pro από{" "}
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

      <section className="mt-14">
        <h2 className="text-xl font-semibold tracking-tight">Σύγκριση πακέτων</h2>
        <div className="mt-5 overflow-x-auto rounded-xl border border-border/70">
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
              className="rounded-xl border border-border/70 bg-card/40 px-4 py-3"
            >
              <summary className="cursor-pointer text-sm font-medium">{item.q}</summary>
              <p className="mt-2 text-sm text-muted-foreground">{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="mt-14 rounded-2xl border border-border/70 bg-card/40 px-6 py-8 text-center">
        <h2 className="text-xl font-semibold">Ξεκινήστε δωρεάν — χωρίς κάρτα</h2>
        <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
          Ξεκινήστε με το δωρεάν πακέτο και επιλέξτε Basic ή Pro όταν χρειαστείτε περισσότερες
          δυνατότητες. Διατίθεται δοκιμή Pro για {TRIAL_DAYS} ημέρες.
        </p>
        <Button asChild className="mt-5" size="lg">
          <Link to="/signup">Ξεκινήστε δωρεάν</Link>
        </Button>
      </section>
    </main>
  </PublicShell>
);
