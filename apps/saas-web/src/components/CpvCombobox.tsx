import { useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  COMMON_CPV_OPTIONS,
  mergeCpvOptions,
  type CpvOption,
} from "@/lib/cpv-options";
import { cn } from "@/lib/utils";

type CpvComboboxProps = {
  value: string;
  onChange: (code: string) => void;
  /** Org-suggested CPVs (from ΚΑΔ) shown first. */
  suggestions?: CpvOption[];
  id?: string;
  placeholder?: string;
  disabled?: boolean;
  "aria-label"?: string;
};

export const CpvCombobox = ({
  value,
  onChange,
  suggestions = [],
  id,
  placeholder = "########-#",
  disabled,
  "aria-label": ariaLabel = "CPV",
}: CpvComboboxProps) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const suggested = useMemo(
    () => mergeCpvOptions(suggestions),
    [suggestions],
  );
  const catalog = useMemo(
    () => mergeCpvOptions(COMMON_CPV_OPTIONS),
    [],
  );

  const selectedLabel =
    suggested.find((row) => row.code === value)?.label ??
    catalog.find((row) => row.code === value)?.label ??
    null;

  const filterRows = (rows: CpvOption[]) => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter(
      (row) =>
        row.code.toLowerCase().includes(needle) ||
        row.label.toLowerCase().includes(needle),
    );
  };

  const filteredSuggested = filterRows(suggested);
  const suggestedCodes = new Set(suggested.map((row) => row.code));
  const filteredCatalog = filterRows(catalog).filter(
    (row) => !suggestedCodes.has(row.code),
  );

  const handlePick = (code: string) => {
    onChange(code);
    setQuery("");
    setOpen(false);
  };

  const handleUseTyped = () => {
    const typed = query.trim();
    if (!typed) return;
    onChange(typed);
    setQuery("");
    setOpen(false);
  };

  return (
    <div className="space-y-1">
      <div className="relative">
        <Input
          id={id}
          value={value}
          disabled={disabled}
          placeholder={placeholder}
          aria-label={ariaLabel}
          autoComplete="off"
          className="pr-9 font-mono"
          onChange={(event) => onChange(event.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setOpen(true);
            }
          }}
        />
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              disabled={disabled}
              aria-label="Εμφάνιση επιλογών CPV"
              aria-expanded={open}
              className="absolute inset-y-0 right-0 z-10 flex w-9 items-center justify-center rounded-r-md text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ChevronsUpDown className="h-4 w-4" aria-hidden="true" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            className="w-[min(calc(100vw-2rem),24rem)] p-0"
            onOpenAutoFocus={(event) => event.preventDefault()}
          >
            <Command shouldFilter={false}>
              <CommandInput
                value={query}
                onValueChange={setQuery}
                placeholder="Αναζήτηση κωδικού ή περιγραφής…"
              />
              <CommandList>
                <CommandEmpty>
                  {query.trim() ? (
                    <button
                      type="button"
                      className="w-full px-3 py-2 text-left text-sm hover:bg-muted"
                      onClick={handleUseTyped}
                    >
                      Χρήση «{query.trim()}»
                    </button>
                  ) : (
                    "Δεν βρέθηκαν CPV"
                  )}
                </CommandEmpty>
                {filteredSuggested.length > 0 ? (
                  <CommandGroup heading="Προτάσεις για την εταιρεία σας">
                    {filteredSuggested.map((row) => (
                      <CommandItem
                        key={`s-${row.code}`}
                        value={`${row.code} ${row.label}`}
                        onSelect={() => handlePick(row.code)}
                      >
                        <Check
                          className={cn(
                            "h-4 w-4 shrink-0",
                            value === row.code ? "opacity-100" : "opacity-0",
                          )}
                        />
                        <span className="min-w-0">
                          <span className="font-mono text-xs">{row.code}</span>
                          <span className="mt-0.5 block truncate text-muted-foreground">
                            {row.label}
                          </span>
                        </span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ) : null}
                {filteredCatalog.length > 0 ? (
                  <CommandGroup heading="Συχνά CPV">
                    {filteredCatalog.map((row) => (
                      <CommandItem
                        key={`c-${row.code}`}
                        value={`${row.code} ${row.label}`}
                        onSelect={() => handlePick(row.code)}
                      >
                        <Check
                          className={cn(
                            "h-4 w-4 shrink-0",
                            value === row.code ? "opacity-100" : "opacity-0",
                          )}
                        />
                        <span className="min-w-0">
                          <span className="font-mono text-xs">{row.code}</span>
                          <span className="mt-0.5 block truncate text-muted-foreground">
                            {row.label}
                          </span>
                        </span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ) : null}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
      {selectedLabel ? (
        <p className="truncate text-xs text-muted-foreground">{selectedLabel}</p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Επιλέξτε από τη λίστα ή πληκτρολογήστε κωδικό CPV.
        </p>
      )}
    </div>
  );
};
