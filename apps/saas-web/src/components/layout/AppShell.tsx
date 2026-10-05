import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  Binoculars,
  Bookmark,
  Building2,
  Check,
  ChevronsUpDown,
  FileSearch,
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
  CreditCard,
} from "lucide-react";
import { useSessionContext } from "@/auth/SessionProvider";
import { CreateOrganizationDialog } from "@/components/CreateOrganizationDialog";
import { EmailVerificationBanner } from "@/components/auth/EmailVerificationBanner";
import { CommandPalette } from "@/components/layout/CommandPalette";
import { NotificationBell } from "@/components/layout/NotificationBell";
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
    title: "Ανακάλυψη",
    items: [
      { to: "/app/search", label: "Αναζήτηση ΚΗΜΔΗΣ", icon: FileSearch },
      { to: "/app/opportunities", label: "Ευκαιρίες", icon: Radar },
      { to: "/app/monitoring", label: "Παρακολουθούμενα", icon: Binoculars },
    ],
  },
  {
    title: "Διαχείριση",
    items: [
      { to: "/app/submissions", label: "Υποβολές", icon: Send },
      { to: "/app/documents", label: "Έγγραφα", icon: FolderOpen },
    ],
  },
  {
    title: "Παρακολούθηση",
    items: [
      { to: "/app/saved-searches", label: "Αποθηκευμένες Αναζητήσεις", icon: Bookmark },
    ],
  },
  {
    title: "Λογαριασμός",
    items: [
      { to: "/app/subscription", label: "Συνδρομή", icon: CreditCard },
    ],
  },
];

const titleForPath = (pathname: string): string => {
  if (pathname.startsWith("/app/settings")) return "Ρυθμίσεις";
  if (pathname.startsWith("/app/setup")) return "Ρύθμιση επιχείρησης";
  if (pathname.startsWith("/app/search")) return "Αναζήτηση ΚΗΜΔΗΣ";
  if (pathname.startsWith("/app/tenders/")) return "Πράξη ΚΗΜΔΗΣ";
  if (pathname.startsWith("/app/opportunities")) return "Ευκαιρίες";
  if (pathname.startsWith("/app/monitoring")) return "Παρακολουθούμενα";
  if (pathname.startsWith("/app/submissions")) return "Υποβολές";
  if (pathname.startsWith("/app/documents")) return "Έγγραφα";
  if (pathname.startsWith("/app/saved-searches")) return "Αποθηκευμένες Αναζητήσεις";
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
        <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
          ARC
        </div>
        <div className="mt-1 text-sm font-semibold">ARC Tenders</div>
      </div>

      <div className="px-3 pb-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-md border border-sidebar-border bg-sidebar-accent px-3 py-2 text-left text-sm hover:opacity-95"
              aria-label="Εναλλαγή οργανισμού"
            >
              <Building2 className="h-4 w-4 shrink-0 text-sidebar-muted" />
              <span className="flex-1 truncate font-medium">
                {activeOrganization?.name ?? "Χωρίς οργανισμό"}
              </span>
              <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-sidebar-muted" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-60">
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
        className="flex flex-1 flex-col gap-4 overflow-y-auto px-2 pb-2"
        aria-label="Κύρια πλοήγηση"
      >
        {navSections.map((section) => (
          <div key={section.title}>
            <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-sidebar-muted">
              {section.title}
            </div>
            <div className="flex flex-col gap-0.5">
              {section.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  onClick={handleNav}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-2 rounded-md px-3 py-2 text-sm text-sidebar-muted transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground",
                      isActive &&
                        "bg-sidebar-accent font-medium text-sidebar-foreground",
                    )
                  }
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="mt-auto space-y-1 border-t border-sidebar-border p-3">
        <NavLink
          to="/app/settings"
          onClick={handleNav}
          className={({ isActive }) =>
            cn(
              "flex items-center gap-2 rounded-md px-3 py-2 text-sm text-sidebar-muted transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground",
              isActive && "bg-sidebar-accent font-medium text-sidebar-foreground",
            )
          }
        >
          <Settings className="h-4 w-4 shrink-0" />
          Ρυθμίσεις
        </NavLink>

        <DropdownMenu>
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
          <DropdownMenuContent align="start" className="w-56">
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
  const [createOrgOpen, setCreateOrgOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  const handleCreateOrganization = () => setCreateOrgOpen(true);

  return (
    <div className="flex min-h-screen overflow-x-clip">
      {/* Desktop sidebar — unchanged above lg */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-sidebar-border lg:flex">
        <SidebarPanel onCreateOrganization={handleCreateOrganization} />
      </aside>

      {/* Tablet / phone navigation drawer */}
      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent
          className="left-0 right-auto w-[min(100vw,18rem)] max-w-[18rem] border-l-0 border-r border-sidebar-border bg-sidebar p-0 text-sidebar-foreground [&>button]:text-sidebar-foreground"
          aria-describedby={undefined}
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
        <header className="sticky top-0 z-20 border-b border-border/80 bg-background/80 backdrop-blur">
          <div className="flex h-14 items-center gap-2 px-3 sm:gap-3 sm:px-4 lg:px-6">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0 lg:hidden"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Άνοιγμα μενού"
            >
              <Menu className="h-4 w-4" />
            </Button>
            <div className="min-w-0 flex-1">
              <div className="hidden text-xs text-muted-foreground sm:block">
                Χώρος εργασίας
              </div>
              <h1 className="truncate text-sm font-semibold tracking-tight">
                {titleForPath(location.pathname)}
              </h1>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="hidden gap-2 md:inline-flex"
              onClick={() =>
                window.dispatchEvent(
                  new KeyboardEvent("keydown", { key: "k", metaKey: true }),
                )
              }
            >
              <Search className="h-3.5 w-3.5" />
              Αναζήτηση
              <kbd className="rounded border border-border bg-muted px-1.5 font-mono text-[10px]">
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

        <main className="min-w-0 flex-1 overflow-x-clip px-3 py-4 sm:px-4 sm:py-5 lg:px-6 lg:py-6">
          <EmailVerificationBanner />
          <Outlet />
        </main>
      </div>

      <CommandPalette />
      <CreateOrganizationDialog
        open={createOrgOpen}
        onOpenChange={setCreateOrgOpen}
      />
      <Separator className="hidden" />
    </div>
  );
};
