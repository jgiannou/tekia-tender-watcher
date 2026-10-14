import type { ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import { ArcBrand } from "@/components/brand/ArcMark";
import { PromoAnnouncementBar } from "@/components/marketing/PromoAnnouncementBar";
import { Button } from "@/components/ui/button";
import { LEGAL_CONTROLLER } from "@/legal/meta";
import { cn } from "@/lib/utils";

const COPYRIGHT_YEAR = new Date().getFullYear();

type PublicShellProps = {
  children: ReactNode;
  featuresHref?: string;
  howItWorksHref?: string;
  faqHref?: string;
  contactHref?: string;
};

export const PublicShell = ({
  children,
  featuresHref = "/#features",
  howItWorksHref = "/#how-it-works",
  faqHref = "/#faq",
  contactHref = "/#contact",
}: PublicShellProps) => {
  const [open, setOpen] = useState(false);

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      "text-sm text-muted-foreground transition-colors hover:text-foreground",
      isActive && "text-foreground",
    );

  const close = () => setOpen(false);

  return (
    <div className="arc-public-atmosphere relative min-h-screen overflow-x-clip bg-background text-foreground">
      <PromoAnnouncementBar />
      <header className="sticky top-0 z-20 border-b border-border/40 bg-background/70 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link
            to="/"
            className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="ARC Tenders"
          >
            <ArcBrand compact />
          </Link>

          <nav
            className="hidden items-center gap-7 md:flex"
            aria-label="Δημόσια πλοήγηση"
          >
            <a
              href={featuresHref}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Χαρακτηριστικά
            </a>
            <a
              href={howItWorksHref}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Πώς λειτουργεί
            </a>
            <NavLink to="/pricing" className={navLinkClass}>
              Τιμές
            </NavLink>
            <a
              href={faqHref}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Συχνές ερωτήσεις
            </a>
            <div className="ml-2 flex items-center gap-3">
              <NavLink to="/login" className={navLinkClass}>
                Σύνδεση
              </NavLink>
              <Button asChild size="sm">
                <Link to="/signup">Ξεκινήστε δωρεάν</Link>
              </Button>
            </div>
          </nav>

          <button
            type="button"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md md:hidden"
            aria-label={open ? "Κλείσιμο μενού" : "Άνοιγμα μενού"}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>

        {open ? (
          <div className="border-t border-border/40 px-4 py-4 md:hidden">
            <nav className="flex flex-col gap-3" aria-label="Κινητό μενού">
              <a href={featuresHref} className="text-sm" onClick={close}>
                Χαρακτηριστικά
              </a>
              <a href={howItWorksHref} className="text-sm" onClick={close}>
                Πώς λειτουργεί
              </a>
              <Link to="/pricing" className="text-sm" onClick={close}>
                Τιμές
              </Link>
              <a href={faqHref} className="text-sm" onClick={close}>
                Συχνές ερωτήσεις
              </a>
              <a href={contactHref} className="text-sm" onClick={close}>
                Επικοινωνία
              </a>
              <Link to="/login" className="text-sm" onClick={close}>
                Σύνδεση
              </Link>
              <Button asChild className="mt-1 w-full">
                <Link to="/signup" onClick={close}>
                  Ξεκινήστε δωρεάν
                </Link>
              </Button>
            </nav>
          </div>
        ) : null}
      </header>

      <div className="relative z-10">{children}</div>

      <footer className="relative z-10 border-t border-border/40">
        <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-10 text-xs text-muted-foreground sm:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <p className="max-w-xl">
              Το ARC Tenders είναι ανεξάρτητη ιδιωτική υπηρεσία. Δεν αποτελεί επίσημη
              πλατφόρμα του ΚΗΜΔΗΣ ή του ΕΣΗΔΗΣ και δεν συνεργάζεται επίσημα με αυτά.
            </p>
            <nav className="flex flex-wrap gap-3" aria-label="Νομικοί σύνδεσμοι">
              <Link className="hover:text-foreground" to="/legal/terms">
                Όροι Χρήσης
              </Link>
              <Link className="hover:text-foreground" to="/legal/privacy">
                Πολιτική Απορρήτου
              </Link>
              <Link className="hover:text-foreground" to="/legal/cookies">
                Cookies
              </Link>
              <Link className="hover:text-foreground" to="/legal/data-sources">
                Πηγές Δεδομένων
              </Link>
              <Link className="hover:text-foreground" to="/legal/provider">
                Στοιχεία Παρόχου
              </Link>
            </nav>
          </div>

          <div className="flex flex-col gap-2 border-t border-border/40 pt-5 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-1">
              <p>
                © {COPYRIGHT_YEAR}{" "}
                <a
                  href={LEGAL_CONTROLLER.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-foreground/90 underline-offset-4 hover:underline"
                  aria-label={`${LEGAL_CONTROLLER.tradingName} — ${LEGAL_CONTROLLER.website}`}
                >
                  {LEGAL_CONTROLLER.tradingName}
                </a>
                . Όλα τα δικαιώματα διατηρούνται.
              </p>
              <p>
                {LEGAL_CONTROLLER.productName} · Μια υπηρεσία της{" "}
                <a
                  href={LEGAL_CONTROLLER.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline-offset-4 hover:underline hover:text-foreground"
                >
                  TEKIA
                </a>
              </p>
            </div>
            <div className="space-y-1 sm:text-right">
              <p>
                <a
                  href={`mailto:${LEGAL_CONTROLLER.email}`}
                  className="underline-offset-4 hover:underline hover:text-foreground"
                >
                  {LEGAL_CONTROLLER.email}
                </a>
              </p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};
