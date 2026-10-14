import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { GREEK_NUTS2_REGIONS } from "@/lib/regions";

type RegionPickerProps = {
  id?: string;
  regions: string[];
  includeUnclassified: boolean;
  onChange: (next: { regions: string[]; includeUnclassified: boolean }) => void;
};

const buildTriggerLabel = (regions: string[]): string => {
  if (regions.length === 0) return "Όλη η Ελλάδα";
  if (regions.length === 1) {
    return (
      GREEK_NUTS2_REGIONS.find((region) => region.code === regions[0])?.label ??
      regions[0]!
    );
  }
  return `${regions.length} περιφέρειες`;
};

/** Compact multi-select for NUTS-2 regions (empty selection = whole country). */
export const RegionPicker = ({
  id,
  regions,
  includeUnclassified,
  onChange,
}: RegionPickerProps) => {
  const handleToggleRegion = (code: string) => {
    const next = regions.includes(code)
      ? regions.filter((current) => current !== code)
      : [...regions, code];
    onChange({
      regions: next,
      includeUnclassified: next.length === 0 ? false : includeUnclassified,
    });
  };

  const handleClear = () => onChange({ regions: [], includeUnclassified: false });

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          aria-label="Περιοχή"
          className="h-9 w-full justify-between px-3 font-normal"
        >
          <span className="truncate">{buildTriggerLabel(regions)}</span>
          <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72">
        <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
          <p className="text-xs text-muted-foreground">
            Καμία επιλογή = όλη η Ελλάδα
          </p>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 px-2"
            disabled={regions.length === 0}
            onClick={handleClear}
          >
            Καθαρισμός
          </Button>
        </div>
        <div className="max-h-64 space-y-1 overflow-y-auto px-3 py-2">
          {GREEK_NUTS2_REGIONS.map((region) => (
            <label
              key={region.code}
              className="flex cursor-pointer items-center gap-2 py-0.5 text-sm"
            >
              <input
                type="checkbox"
                className="h-3.5 w-3.5 accent-[var(--arc-primary)]"
                checked={regions.includes(region.code)}
                onChange={() => handleToggleRegion(region.code)}
                aria-label={region.label}
              />
              <span>{region.label}</span>
            </label>
          ))}
        </div>
        {regions.length > 0 ? (
          <label className="flex cursor-pointer items-start gap-2 border-t border-border/60 px-3 py-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              className="mt-0.5 h-3.5 w-3.5 accent-[var(--arc-primary)]"
              checked={includeUnclassified}
              onChange={(e) =>
                onChange({ regions, includeUnclassified: e.target.checked })
              }
              aria-label="Συμπερίληψη χωρίς δηλωμένη περιοχή"
            />
            Συμπερίληψη δημοσιεύσεων χωρίς δηλωμένη περιοχή
          </label>
        ) : null}
      </PopoverContent>
    </Popover>
  );
};
