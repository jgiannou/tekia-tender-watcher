import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** ISO date `YYYY-MM-DD` ↔ Greek display `DD/MM/YYYY`. */
export const isoToGreekDate = (iso: string): string => {
  const trimmed = iso.trim();
  if (!trimmed) return "";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) return trimmed;
  return `${match[3]}/${match[2]}/${match[1]}`;
};

export const greekDateToIso = (greek: string): string | null => {
  const trimmed = greek.trim();
  if (!trimmed) return "";
  const match = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(trimmed);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};

type DateInputProps = Omit<
  React.ComponentProps<"input">,
  "type" | "value" | "onChange"
> & {
  /** Controlled value in ISO `YYYY-MM-DD` (or empty). */
  value: string;
  onChange: (isoDate: string) => void;
};

/**
 * Text date field with Greek day/month/year display.
 * Native `type="date"` follows the OS locale (often MM/DD/YYYY on US machines).
 */
export const DateInput = React.forwardRef<HTMLInputElement, DateInputProps>(
  ({ value, onChange, className, onBlur, disabled, ...props }, ref) => {
    const [text, setText] = React.useState(() => isoToGreekDate(value));
    const [invalid, setInvalid] = React.useState(false);

    React.useEffect(() => {
      setText(isoToGreekDate(value));
      setInvalid(false);
    }, [value]);

    const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      const next = event.target.value;
      setText(next);
      if (!next.trim()) {
        setInvalid(false);
        onChange("");
        return;
      }
      const iso = greekDateToIso(next);
      if (iso) {
        setInvalid(false);
        onChange(iso);
      } else {
        setInvalid(true);
      }
    };

    const handleBlur = (event: React.FocusEvent<HTMLInputElement>) => {
      if (!text.trim()) {
        setInvalid(false);
        onChange("");
        onBlur?.(event);
        return;
      }
      const iso = greekDateToIso(text);
      if (iso) {
        setText(isoToGreekDate(iso));
        setInvalid(false);
        onChange(iso);
      } else {
        setInvalid(true);
        setText(isoToGreekDate(value));
      }
      onBlur?.(event);
    };

    return (
      <Input
        ref={ref}
        type="text"
        inputMode="numeric"
        placeholder="ηη/μμ/εεεε"
        autoComplete="off"
        disabled={disabled}
        value={text}
        onChange={handleChange}
        onBlur={handleBlur}
        aria-invalid={invalid || undefined}
        className={cn(invalid && "border-destructive focus-visible:ring-destructive", className)}
        {...props}
      />
    );
  },
);
DateInput.displayName = "DateInput";
