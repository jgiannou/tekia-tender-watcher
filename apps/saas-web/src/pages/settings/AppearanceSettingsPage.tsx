import { Check, Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "@/theme/ThemeProvider";
import type { ThemePreference } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const options: Array<{
  value: ThemePreference;
  label: string;
  description: string;
  icon: typeof Moon;
  previewClass: string;
}> = [
  {
    value: "DARK",
    label: "Σκούρο",
    description: "Προεπιλογή ARC Tenders",
    icon: Moon,
    previewClass: "bg-[#0a0a0a] text-[#f5f5f5] border-[#00f3ff]/40",
  },
  {
    value: "LIGHT",
    label: "Φωτεινό",
    description: "Καθαρό φόντο εργασίας",
    icon: Sun,
    previewClass: "bg-[#f4f7f8] text-[#0f1416] border-[#008b96]/30",
  },
  {
    value: "SYSTEM",
    label: "Σύστημα",
    description: "Ακολουθεί τις ρυθμίσεις συσκευής",
    icon: Monitor,
    previewClass: "bg-gradient-to-br from-[#0a0a0a] via-[#1a1a1a] to-[#f4f7f8] text-white border-border",
  },
];

export const AppearanceSettingsPage = () => {
  const { theme, setTheme } = useTheme();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Εμφάνιση</CardTitle>
        <CardDescription>
          Η προτίμηση θέματος αποθηκεύεται στο προφίλ σας. Προεπιλογή: Σκούρο.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 md:grid-cols-3">
          {options.map((option) => {
            const selected = theme === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => void setTheme(option.value)}
                aria-label={`Θέμα ${option.label}`}
                aria-pressed={selected}
                className={cn(
                  "rounded-lg border p-3 text-left transition-all hover:border-primary/50",
                  selected && "border-primary ring-2 ring-primary/30",
                )}
              >
                <div
                  className={cn(
                    "mb-3 flex h-20 items-end justify-between rounded-md border p-3",
                    option.previewClass,
                  )}
                >
                  <option.icon className="h-4 w-4 opacity-80" />
                  {selected ? <Check className="h-4 w-4 text-primary" /> : null}
                </div>
                <div className="text-sm font-medium">{option.label}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {option.description}
                </div>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};
