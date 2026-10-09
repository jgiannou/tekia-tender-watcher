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
  priceWithTaxHint,
} from "@/marketing/pricing";

const faqs = [
  {
    q: "Είναι το ARC Tenders επίσημη υπηρεσία του ΚΗΜΔΗΣ;",
    a: "Όχι. Είναι ανεξάρτητη ιδιωτική υπηρεσία που χρησιμοποιεί δημόσια δεδομένα δημοσίων συμβάσεων.",
  },
  {
    q: "Το ARC Tenders υποβάλλει προσφορές αυτόματα;",
    a: "Όχι. Καταγράφετε ενέργειες που κάνατε εσείς στο επίσημο κανάλι· η πλατφόρμα δεν υποβάλλει προσφορές.",
  },
  {
    q: "Μπορώ να ακυρώσω τη συνδρομή μου;",
    a: "Ναι, μέσω της διαχείρισης χρέωσης. Η ακύρωση ισχύει στο τέλος της τρέχουσας περιόδου.",
  },
  {
    q: "Υπάρχει δωρεάν πλάνο;",
    a: "Ναι. Το Δωρεάν πλάνο δεν λήγει και δεν απαιτεί κάρτα. Η δοκιμή Pro είναι χωριστή ενέργεια 7 ημερών.",
  },
  {
    q: "Τι συμβαίνει όταν λήξει η δοκιμή Pro;",
    a: `Μετά ${TRIAL_DAYS} ημέρες επανέρχεστε στο Δωρεάν πλάνο, εκτός αν επιλέξετε Basic ή Pro. Η χειροκίνητη αναζήτηση ΚΗΜΔΗΣ παραμένει διαθέσιμη.`,
  },
  {
    q: "Μπορώ να προσθέσω περισσότερους χρήστες;",
    a: `Basic: 1 χρήστης. Pro: ${MARKETING_PLANS.pro.includedSeats} περιλαμβάνονται + €${formatEur(MARKETING_PLANS.pro.extraSeatMonthlyEur!)} / χρήστη / μήνα (έως ${MARKETING_PLANS.pro.maxSeatsSelfService}).`,
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
          Δωρεάν, Basic και Pro — ίδια ταχύτητα εισαγωγής
        </h1>
        <p className="mt-3 text-sm text-muted-foreground sm:text-base">
          Ξεκινήστε δωρεάν, χωρίς κάρτα. Basic από{" "}
          {priceWithTaxHint(MARKETING_PLANS.basic.priceMonthlyEur)} · Pro από{" "}
          {priceWithTaxHint(MARKETING_PLANS.pro.priceMonthlyEur)}. Η δοκιμή Pro είναι{" "}
          {TRIAL_DAYS} ημέρες.
        </p>
      </div>

      <div className="mt-10">
        <PricingCards mode="full" />
      </div>
      <p className="mt-4 text-sm text-muted-foreground">
        Επιπλέον χρήστες Pro: €{formatEur(MARKETING_PLANS.pro.extraSeatMonthlyEur!)} / χρήστη /
        μήνα (έως {MARKETING_PLANS.pro.maxSeatsSelfService} self-service).
      </p>

      <section className="mt-14">
        <h2 className="text-xl font-semibold tracking-tight">Σύγκριση πλάνων</h2>
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
          Δημιουργήστε λογαριασμό στο Free. Δοκιμή Pro {TRIAL_DAYS} ημερών ή Basic/Pro όταν
          είστε έτοιμοι.
        </p>
        <Button asChild className="mt-5" size="lg">
          <Link to="/signup">Ξεκινήστε δωρεάν</Link>
        </Button>
      </section>
    </main>
  </PublicShell>
);
