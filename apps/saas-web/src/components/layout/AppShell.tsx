import { Suspense, useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { ArcMark } from "@/components/brand/ArcMark";
import { PageLoading } from "@/components/states";
import {
  Binoculars,
  Bookmark,
  Building2,
  Check,
  ChevronsUpDown,
  FileText,
  FolderOpen,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  Radar,
  Search,
  Settings,
  Send,
} from "lucide-react";
import { useSessionContext } from "@/auth/SessionProvider";
import { CreateOrganizationDialog } from "@/components/CreateOrganizationDialog";
import { EmailVerificationBanner } from "@/components/auth/EmailVerificationBanner";
import { TrialBanner } from "@/components/billing/TrialBanner";
import { CommandPalette } from "@/components/layout/CommandPalette";
import { NotificationBell } from "@/components/layout/NotificationBell";
import { SeoHead } from "@/components/SeoHead";
import { authClient } from "@/lib/auth-client";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { TenderNavProvider, useTenderNav } from "@/lib/tender-nav-context";

type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  end?: boolean;
};

type NavSection = {
  title: string;
  items: NavItem[];
};

const navSections: NavSection[] = [
  {
    title: "Αρχική",
    items: [{ to: "/app", label: "Επισκόπηση", icon: LayoutDashboard, end: true }],
  },
  {
    title: "Εύρεση",
    items: [
      { to: "/app/search", label: "Αναζήτηση", icon: Search },
      { to: "/app/opportunities", label: "Ευκαιρίες", icon: Radar },
      { to: "/app/saved-searches", label: "Αποθηκευμένες αναζητήσεις", icon: Bookmark },
      { to: "/app/expiring-contracts", label: "Συμβάσεις που λήγουν", icon: FileText },
    ],
  },
  {
    title: "Διαγωνισμοί",
    items: [
      { to: "/app/monitoring", label: "Παρακολουθούμενα", icon: Binoculars },
      { to: "/app/submissions", label: "Υποβολές", icon: Send },
    ],
  },
  {
    title: "Εταιρεία",
    items: [{ to: "/app/documents", label: "Έγγραφα", icon: FolderOpen }],
  },
];

const prefetchRoute = (to: string) => {
  const loaders: Record<string, () => Promise<unknown>> = {
    "/app": () => import("@/pages/OverviewPage"),
    "/app/search": () => import("@/pages/SearchPage"),
    "/app/opportunities": () => import("@/pages/OpportunitiesPage"),
    "/app/expiring-contracts": () => import("@/pages/ExpiringContractsPage"),
    "/app/monitoring": () => import("@/pages/MonitoringPage"),
    "/app/submissions": () => import("@/pages/SubmissionsPage"),
    "/app/documents": () => import("@/pages/DocumentsPage"),
    "/app/saved-searches": () => import("@/pages/SavedSearchesPage"),
    "/app/subscription": () => import("@/pages/SubscriptionPage"),
    "/app/settings": () =>
      Promise.all([
        import("@/pages/settings/SettingsLayout"),
        import("@/pages/settings/ProfileSettingsPage"),
      ]),
    "/app/settings/profile": () =>
      Promise.all([
        import("@/pages/settings/SettingsLayout"),
        import("@/pages/settings/ProfileSettingsPage"),
      ]),
    "/app/notifications": () => import("@/pages/NotificationsPage"),
  };
  void loaders[to]?.().catch(() => null);
};

const titleForPath = (pathname: string): string => {
  if (pathname.startsWith("/app/settings")) return "Ρυθμίσεις";
  if (pathname.startsWith("/app/setup")) return "Ρύθμιση επιχείρησης";
  if (pathname.startsWith("/app/search")) return "Αναζήτηση";
  if (pathname.startsWith("/app/tenders/")) return "Δημοσίευση στο ΚΗΜΔΗΣ";
  if (pathname.startsWith("/app/opportunities")) return "Ευκαιρίες";
  if (pathname.startsWith("/app/monitoring")) return "Παρακολουθούμενα";
  if (pathname.startsWith("/app/submissions")) return "Υποβολές";
  if (pathname.startsWith("/app/documents")) return "Έγγραφα";
  if (pathname.startsWith("/app/saved-searches")) return "Αποθηκευμένες αναζητήσεις";
  if (pathname.startsWith("/app/expiring-contracts")) return "Συμβάσεις που λήγουν";
  if (pathname.startsWith("/app/notifications")) return "Ειδοποιήσεις";
  if (pathname.startsWith("/app/subscription")) return "Συνδρομή";
  return "Επισκόπηση";
};

type SidebarPanelProps = {
  onNavigate?: () => void;
  onCreateOrganization: () => void;
};

const SidebarPanel = ({ onNavigate, onCreateOrganization }: SidebarPanelProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { viewingFollowedTender } = useTenderNav();
  const {
    organizations,
    activeOrganization,
    setActiveOrganizationId,
    signOut,
    user,
  } = useSessionContext();

  const initials = (user?.name || activeOrganization?.name || "U")
    .slice(0, 2)
    .toUpperCase();
  const ownedOrganizationCount = organizations.filter(
    (org) => org.role === "OWNER",
  ).length;
  const atOwnedOrganizationLimit = ownedOrganizationCount >= 3;

  const handleNav = () => {
    onNavigate?.();
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-sidebar text-sidebar-foreground">
      <div className="px-4 py-5">
        <Link
          to="/app"
          className="inline-flex items-center gap-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="ARC Tenders"
        >
          <ArcMark className="h-7 w-7" />
          <div>
            <div className="font-mono text-[10px] font-semibold tracking-[0.12em] text-sidebar-muted">
              ARC
            </div>
            <div className="text-sm font-semibold leading-tight">Tenders</div>
          </div>
        </Link>
      </div>

      <div className="px-3 pb-4">
        {/* modal=false avoids nested scroll-lock fighting the mobile Sheet */}
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-md bg-sidebar-accent/80 px-3 py-2 text-left text-sm transition-colors hover:bg-sidebar-accent"
              aria-label="Εναλλαγή οργανισμού"
            >
              <Building2 className="h-4 w-4 shrink-0 text-sidebar-muted" />
              <span className="flex-1 truncate font-medium">
                {activeOrganization?.name ?? "Χωρίς οργανισμό"}
              </span>
              <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-sidebar-muted" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="z-[60] w-60"
            collisionPadding={12}
          >
            <DropdownMenuLabel>Οργανισμοί</DropdownMenuLabel>
            {organizations.map((org) => (
              <DropdownMenuItem
                key={org.id}
                onClick={() => void setActiveOrganizationId(org.id)}
              >
                <span className="flex-1 truncate">{org.name}</span>
                {activeOrganization?.id === org.id ? (
                  <Check className="h-4 w-4" />
                ) : null}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={atOwnedOrganizationLimit}
              onClick={() => {
                if (atOwnedOrganizationLimit) return;
                onNavigate?.();
                onCreateOrganization();
              }}
            >
              <Plus className="h-4 w-4" />
              {atOwnedOrganizationLimit
                ? "Όριο 3 οργανισμών"
                : "Νέος οργανισμός"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <nav
        className="flex flex-1 flex-col gap-5 overflow-y-auto px-2 pb-2"
        aria-label="Κύρια πλοήγηση"
      >
        {navSections.map((section) => (
          <div key={section.title}>
            <div className="px-3 pb-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-sidebar-muted/80">
              {section.title}
            </div>
            <div className="flex flex-col gap-0.5">
              {section.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    onClick={handleNav}
                    onMouseEnter={() => prefetchRoute(item.to)}
                    onFocus={() => prefetchRoute(item.to)}
                    className={({ isActive }) => {
                      const highlightFollowedTender =
                        item.to === "/app/monitoring" &&
                        viewingFollowedTender &&
                        location.pathname.startsWith("/app/tenders/");
                      const active = isActive || highlightFollowedTender;
                      return cn(
                        "flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px] text-sidebar-muted transition-colors hover:bg-sidebar-accent/70 hover:text-sidebar-foreground",
                        active &&
                          "arc-nav-active bg-sidebar-accent font-medium text-sidebar-foreground",
                      );
                    }}
                  >
                  <item.icon className="h-3.5 w-3.5 shrink-0 opacity-70" />
                  <span className="truncate">{item.label}</span>
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="mt-auto space-y-1 border-t border-sidebar-border/80 p-3">
        <NavLink
          to="/app/settings/profile"
          onClick={handleNav}
          onMouseEnter={() => prefetchRoute("/app/settings/profile")}
          onFocus={() => prefetchRoute("/app/settings/profile")}
          className={({ isActive }) =>
            cn(
              "flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px] text-sidebar-muted transition-colors hover:bg-sidebar-accent/70 hover:text-sidebar-foreground",
              isActive &&
                "arc-nav-active bg-sidebar-accent font-medium text-sidebar-foreground",
            )
          }
        >
          <Settings className="h-3.5 w-3.5 shrink-0 opacity-70" />
          Ρυθμίσεις
        </NavLink>

        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left hover:bg-sidebar-accent"
              aria-label="Μενού λογαριασμού"
            >
              <Avatar>
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">
                  {user?.name || "Λογαριασμός"}
                </div>
                <div className="truncate text-[11px] text-sidebar-muted">
                  {user?.email || "—"}
                </div>
              </div>
            </button>
          </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="z-[60] w-56"
              collisionPadding={12}
            >
              <DropdownMenuLabel>Λογαριασμός</DropdownMenuLabel>
            <DropdownMenuItem
              onClick={() => {
                handleNav();
                navigate("/app/settings/profile");
              }}
            >
              <FileText className="h-4 w-4" />
              Προφίλ
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => void signOut()}>
              <LogOut className="h-4 w-4" />
              Αποσύνδεση
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
};

export const AppShell = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { refresh } = useSessionContext();
  const [createOrgOpen, setCreateOrgOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  // After Better Auth email verify redirect (?verified=1), refresh /me + session
  // so entitlements unlock without requiring sign-out.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("verified") !== "1") return;
    let cancelled = false;
    void (async () => {
      try {
        await authClient.getSession();
        if (!cancelled) await refresh();
      } finally {
        if (cancelled) return;
        params.delete("verified");
        const next = params.toString();
        navigate(
          { pathname: location.pathname, search: next ? `?${next}` : "" },
          { replace: true },
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [location.pathname, location.search, navigate, refresh]);

  // Preserve scroll position while the mobile nav sheet is open. Radix scroll
  // lock alone can jump the page (and the drawer) upward after deep scrolls.
  useEffect(() => {
    if (!mobileNavOpen) return;
    const scrollY = window.scrollY;
    const { body } = document;
    const previous = {
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
      overflow: body.style.overflow,
      paddingRight: body.style.paddingRight,
    };
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.width = "100%";
    body.style.overflow = "hidden";
    return () => {
      body.style.position = previous.position;
      body.style.top = previous.top;
      body.style.width = previous.width;
      body.style.overflow = previous.overflow;
      body.style.paddingRight = previous.paddingRight;
      window.scrollTo(0, scrollY);
    };
  }, [mobileNavOpen]);

  const handleCreateOrganization = () => setCreateOrgOpen(true);

  return (
    <TenderNavProvider>
    <div className="flex min-h-screen overflow-x-clip">
      <SeoHead
        title="Εφαρμογή | ARC Tenders"
        description="Ιδιωτικός χώρος εργασίας ARC Tenders."
        path="/app"
        noindex
      />
      {/* Desktop sidebar — unchanged above lg */}
      <aside className="sticky top-0 hidden h-screen w-[15.5rem] shrink-0 flex-col border-r border-sidebar-border lg:flex">
        <SidebarPanel onCreateOrganization={handleCreateOrganization} />
      </aside>

      {/* Tablet / phone navigation drawer */}
      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent
          className="left-0 right-auto w-[min(100vw,18rem)] max-w-[18rem] border-l-0 border-r border-sidebar-border bg-sidebar p-0 text-sidebar-foreground [&>button]:text-sidebar-foreground"
          aria-describedby={undefined}
          onOpenAutoFocus={(event) => {
            // Keep focus inside the drawer without scrolling the page under it.
            event.preventDefault();
          }}
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Μενού πλοήγησης</SheetTitle>
            <SheetDescription>Κύρια πλοήγηση εφαρμογής</SheetDescription>
          </SheetHeader>
          <SidebarPanel
            onNavigate={() => setMobileNavOpen(false)}
            onCreateOrganization={handleCreateOrganization}
          />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-border/50 bg-background/75 backdrop-blur-md">
          <div className="flex h-13 items-center gap-2 px-3 sm:gap-3 sm:px-4 lg:px-6" style={{ height: "3.25rem" }}>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="shrink-0 lg:hidden"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Άνοιγμα μενού"
            >
              <Menu className="h-4 w-4" />
            </Button>
            <div className="min-w-0 flex-1">
              <div className="hidden text-[11px] text-muted-foreground sm:block">
                Χώρος εργασίας
              </div>
              <h1 className="truncate text-sm font-semibold tracking-tight">
                {titleForPath(location.pathname)}
              </h1>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="hidden gap-2 text-muted-foreground md:inline-flex"
              onClick={() =>
                window.dispatchEvent(
                  new KeyboardEvent("keydown", { key: "k", metaKey: true }),
                )
              }
            >
              <Search className="h-3.5 w-3.5" />
              Αναζήτηση
              <kbd className="rounded border border-border/60 bg-muted/50 px-1.5 font-mono text-[10px]">
                ⌘K
              </kbd>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0 md:hidden"
              onClick={() =>
                window.dispatchEvent(
                  new KeyboardEvent("keydown", { key: "k", metaKey: true }),
                )
              }
              aria-label="Αναζήτηση"
            >
              <Search className="h-3.5 w-3.5" />
            </Button>
            <NotificationBell />
          </div>
        </header>

        <main className="min-w-0 flex-1 overflow-x-auto px-3 py-5 sm:px-5 sm:py-6 lg:px-8 lg:py-8">
          <EmailVerificationBanner />
          <TrialBanner />
          {/* Nested Suspense keeps the shell visible while lazy route chunks load. */}
          <Suspense fallback={<PageLoading label="Φόρτωση…" />}>
            <Outlet />
          </Suspense>
        </main>
      </div>

      <CommandPalette />
      <CreateOrganizationDialog
        open={createOrgOpen}
        onOpenChange={setCreateOrgOpen}
      />
      <Separator className="hidden" />
    </div>
    </TenderNavProvider>
  );
};
