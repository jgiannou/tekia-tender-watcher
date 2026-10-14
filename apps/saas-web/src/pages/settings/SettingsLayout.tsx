import { Suspense } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { PageLoading } from "@/components/states";
import { cn } from "@/lib/utils";

const sections = [
  {
    title: "Προσωπικά",
    items: [
      { to: "/app/settings/profile", label: "Προφίλ" },
      { to: "/app/settings/appearance", label: "Εμφάνιση" },
    ],
  },
  {
    title: "Επιχείρηση",
    items: [
      { to: "/app/settings/company", label: "Στοιχεία επιχείρησης" },
      { to: "/app/settings/team", label: "Ομάδα" },
      { to: "/app/settings/activities", label: "Δραστηριότητες / ΚΑΔ" },
    ],
  },
  {
    title: "Παρακολούθηση",
    items: [
      { to: "/app/settings/notifications", label: "Ειδοποιήσεις" },
      { to: "/app/settings/connections", label: "Συνδέσεις" },
    ],
  },
  {
    title: "Χρέωση",
    items: [{ to: "/app/subscription", label: "Συνδρομή / πλάνα" }],
  },
  {
    title: "Νομικά & Πηγές",
    items: [{ to: "/app/settings/legal", label: "Νομικά & Πηγές" }],
  },
] as const;

export const SettingsLayout = () => (
  <div className="mx-auto flex max-w-6xl flex-col gap-6 lg:flex-row">
    <aside className="w-full shrink-0 lg:w-56">
      <div className="mb-5">
        <h2 className="text-xl font-semibold tracking-tight">Ρυθμίσεις</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Διαμόρφωση λογαριασμού και οργανισμού.
        </p>
      </div>
      <nav className="space-y-4" aria-label="Ρυθμίσεις">
        {sections.map((section) => (
          <div key={section.title}>
            <div className="mb-1 px-2.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
              {section.title}
            </div>
            <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 lg:mx-0 lg:block lg:space-y-0.5 lg:overflow-visible lg:px-0 lg:pb-0">
              {section.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    cn(
                      "block shrink-0 whitespace-nowrap rounded-md border-l-2 border-transparent px-2.5 py-1.5 text-[13px] text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      isActive && "border-primary bg-muted/50 font-medium text-foreground",
                    )
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>
    </aside>
    <div className="min-w-0 flex-1">
      {/* Nested Suspense: SPA nav into lazy settings pages must not blank the outlet. */}
      <Suspense fallback={<PageLoading label="Φόρτωση…" />}>
        <Outlet />
      </Suspense>
    </div>
  </div>
);
