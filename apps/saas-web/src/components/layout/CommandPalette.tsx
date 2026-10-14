import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Binoculars,
  Bookmark,
  FileSearch,
  FolderOpen,
  LayoutDashboard,
  Radar,
  Settings,
  Send,
  Sparkles,
} from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

const items = [
  { label: "Επισκόπηση", to: "/app", icon: LayoutDashboard },
  { label: "Αναζήτηση", to: "/app/search", icon: FileSearch },
  { label: "Ευκαιρίες", to: "/app/opportunities", icon: Radar },
  { label: "Παρακολουθούμενα", to: "/app/monitoring", icon: Binoculars },
  { label: "Υποβολές", to: "/app/submissions", icon: Send },
  { label: "Έγγραφα", to: "/app/documents", icon: FolderOpen },
  { label: "Αποθηκευμένες αναζητήσεις", to: "/app/saved-searches", icon: Bookmark },
  { label: "Ρύθμιση επιχείρησης", to: "/app/setup", icon: Sparkles },
  { label: "Ρυθμίσεις", to: "/app/settings/profile", icon: Settings },
] as const;

export const CommandPalette = () => {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Αναζήτηση εντολών και σελίδων…" />
      <CommandList>
        <CommandEmpty>Δεν βρέθηκαν αποτελέσματα.</CommandEmpty>
        <CommandGroup heading="Πλοήγηση">
          {items.map((item) => (
            <CommandItem
              key={item.to}
              value={item.label}
              onSelect={() => {
                setOpen(false);
                navigate(item.to);
              }}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
};
