import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArcBrand } from "@/components/brand/ArcMark";
import { LEGAL_CONTROLLER } from "@/legal/meta";
import { MARKETING_PLANS, formatEur } from "@/marketing/pricing";

const COPYRIGHT_YEAR = new Date().getFullYear();

const bullets = [
  "Αυτόματες αναζητήσεις",
  "Ειδοποιήσεις για νέες εξελίξεις",
  "Έγγραφα και παρακολούθηση σε ένα μέρος",
] as const;

type AuthShellProps = {
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
};

/** Compact auth layout — product story lives on / and /pricing. */
export const AuthShell = ({ title, description, children, footer }: AuthShellProps) => (
  <div className="arc-public-atmosphere relative min-h-screen overflow-hidden bg-background">
    <div className="relative mx-auto grid min-h-screen max-w-5xl lg:grid-cols-[1fr_1.05fr]">
      <aside className="auth-panel-enter relative flex flex-col justify-between px-6 py-8 sm:px-10 lg:border-r lg:border-border/60 lg:px-12 lg:py-12">
        <div>
          <Link
            to="/"
            className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="ARC Tenders"
          >
            <ArcBrand />
          </Link>

          <h1 className="mt-10 max-w-sm text-2xl font-semibold tracking-tight text-foreground sm:text-3xl lg:mt-14">
            Δημόσιοι διαγωνισμοί, πιο οργανωμένα.
          </h1>
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
            Εντοπίστε σχετικές ευκαιρίες, παρακολουθήστε την εξέλιξή τους και οργανώστε όλη
            τη διαδικασία σε ένα σημείο.
          </p>

          <ul className="mt-6 hidden space-y-2 sm:block">
            {bullets.map((item) => (
              <li key={item} className="text-sm text-muted-foreground">
                <span className="mr-2 text-primary">·</span>
                {item}
              </li>
            ))}
          </ul>

          <p className="mt-6 text-sm text-muted-foreground">
            Basic από €{formatEur(MARKETING_PLANS.basic.priceMonthlyEur)} / μήνα · Pro από €
            {formatEur(MARKETING_PLANS.pro.priceMonthlyEur)} / μήνα
          </p>
          <Link
            to="/pricing"
            className="mt-1 inline-block text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            Δείτε τα πλάνα
          </Link>
        </div>

        <div className="mt-10 space-y-2 text-xs leading-relaxed text-muted-foreground lg:mt-0">
          <p>
            Το ARC Tenders είναι ανεξάρτητη ιδιωτική υπηρεσία και δεν αποτελεί επίσημη
            πλατφόρμα ή συνεργάτη του ΚΗΜΔΗΣ / ΕΣΗΔΗΣ.
          </p>
          <p>Πηγή δεδομένων δημοσίων συμβάσεων: ΚΗΜΔΗΣ / ΟΠΣ ΕΣΗΔΗΣ — CC BY 4.0</p>
          <p>
            © {COPYRIGHT_YEAR}{" "}
            <a
              href={LEGAL_CONTROLLER.website}
              target="_blank"
              rel="noopener noreferrer"
              className="underline-offset-4 hover:underline hover:text-foreground"
            >
              {LEGAL_CONTROLLER.tradingName}
            </a>
            {" · "}
            <a
              href={`mailto:${LEGAL_CONTROLLER.email}`}
              className="underline-offset-4 hover:underline hover:text-foreground"
            >
              {LEGAL_CONTROLLER.email}
            </a>
          </p>
        </div>
      </aside>

      <main className="auth-form-enter flex items-center justify-center px-4 py-8 sm:px-8 lg:px-10 lg:py-12">
        <div className="w-full max-w-md">
          <div className="mb-6 lg:mb-8">
            <div className="lg:hidden">
              <ArcBrand compact />
            </div>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
              {title}
            </h2>
            <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>
          </div>

          <div className="border border-border bg-card p-5 sm:p-6">
            {children}
          </div>

          {footer ? <div className="mt-5">{footer}</div> : null}

          <p className="mt-6 text-center text-xs text-muted-foreground">
            <Link className="underline-offset-4 hover:underline" to="/legal/terms">
              Όροι Χρήσης
            </Link>
            {" · "}
            <Link className="underline-offset-4 hover:underline" to="/legal/privacy">
              Πολιτική Απορρήτου
            </Link>
            {" · "}
            <Link className="underline-offset-4 hover:underline" to="/legal/cookies">
              Cookies
            </Link>
            {" · "}
            <Link className="underline-offset-4 hover:underline" to="/legal/data-sources">
              Πηγές Δεδομένων
            </Link>
          </p>
        </div>
      </main>
    </div>
  </div>
);
