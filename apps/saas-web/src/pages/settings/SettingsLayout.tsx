import { NavLink, Outlet } from "react-router-dom";
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
      <div className="mb-4">
        <h2 className="text-2xl font-semibold tracking-tight">Ρυθμίσεις</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Διαμόρφωση λογαριασμού και οργανισμού.
        </p>
      </div>
      <nav className="space-y-3" aria-label="Ρυθμίσεις">
        {sections.map((section) => (
          <div key={section.title}>
            <div className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {section.title}
            </div>
            <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 lg:mx-0 lg:block lg:space-y-0.5 lg:overflow-visible lg:px-0 lg:pb-0">
              {section.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    cn(
                      "block shrink-0 whitespace-nowrap rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                      isActive && "bg-muted font-medium text-foreground",
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
      <Outlet />
    </div>
  </div>
);
