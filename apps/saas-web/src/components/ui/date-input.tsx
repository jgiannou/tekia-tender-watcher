import * as React from "react";
import { Calendar } from "lucide-react";
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
 * Text date field with Greek day/month/year display, plus a calendar button
 * that opens the native OS date picker.
 */
export const DateInput = React.forwardRef<HTMLInputElement, DateInputProps>(
  (
    {
      value,
      onChange,
      className,
      onBlur,
      disabled,
      id,
      "aria-label": ariaLabel,
      ...props
    },
    ref,
  ) => {
    const [text, setText] = React.useState(() => isoToGreekDate(value));
    const [invalid, setInvalid] = React.useState(false);
    const nativeRef = React.useRef<HTMLInputElement>(null);

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

    const handleOpenPicker = () => {
      if (disabled) return;
      const native = nativeRef.current;
      if (!native) return;
      try {
        if (typeof native.showPicker === "function") {
          native.showPicker();
          return;
        }
      } catch {
        // Some browsers restrict showPicker outside trusted gestures.
      }
      native.focus();
      native.click();
    };

    const handleNativeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      const iso = event.target.value;
      setInvalid(false);
      setText(isoToGreekDate(iso));
      onChange(iso);
    };

    const pickerLabel =
      typeof ariaLabel === "string" && ariaLabel.trim()
        ? `Ημερολόγιο: ${ariaLabel}`
        : "Άνοιγμα ημερολογίου";

    return (
      <div className="relative">
        <Input
          ref={ref}
          id={id}
          type="text"
          inputMode="numeric"
          placeholder="ηη/μμ/εεεε"
          autoComplete="off"
          disabled={disabled}
          value={text}
          onChange={handleChange}
          onBlur={handleBlur}
          aria-invalid={invalid || undefined}
          aria-label={ariaLabel}
          className={cn(
            "pr-9",
            invalid && "border-destructive focus-visible:ring-destructive",
            className,
          )}
          {...props}
        />
        <input
          ref={nativeRef}
          type="date"
          tabIndex={-1}
          disabled={disabled}
          value={value || ""}
          onChange={handleNativeChange}
          aria-hidden="true"
          className="pointer-events-none absolute h-px w-px opacity-0"
        />
        <button
          type="button"
          disabled={disabled}
          onClick={handleOpenPicker}
          aria-label={pickerLabel}
          title="Επιλογή από ημερολόγιο"
          className="absolute inset-y-0 right-0 z-10 flex w-9 items-center justify-center rounded-r-md text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Calendar className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    );
  },
);
DateInput.displayName = "DateInput";
