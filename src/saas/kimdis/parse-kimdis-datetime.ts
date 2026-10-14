/**
 * Centralized KIMDIS datetime parsing.
 *
 * KIMDIS Open Data often returns offset-less local datetimes that already
 * represent Europe/Athens wall time. Parsing with `new Date(raw)` treats them
 * as the host timezone (often UTC in production), which shifts display by
 * +2/+3 hours when formatted as Europe/Athens.
 *
 * Rules:
 * - Offset-aware (`Z`, `+03:00`, …) → respect the provided offset → UTC Date
 * - Date-only (`YYYY-MM-DD`) → noon UTC that calendar day (date semantics only)
 * - Offset-less local datetime → interpret as Europe/Athens, then UTC
 */

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const LOCAL_DATETIME =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/;
const HAS_EXPLICIT_OFFSET = /(?:Z|[+-]\d{2}:?\d{2})$/i;

/** Parts of a wall-clock instant in a named IANA zone → UTC Date. */
const zonedPartsToUtc = (
  parts: {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second: number;
    ms: number;
  },
  timeZone: string,
): Date | null => {
  // Guess UTC, then correct by the zone offset at that instant (handles DST).
  const guess = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    parts.ms,
  );
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const asParts = (ms: number) => {
    const map = Object.fromEntries(
      formatter.formatToParts(new Date(ms)).map((p) => [p.type, p.value]),
    );
    return {
      year: Number(map.year),
      month: Number(map.month),
      day: Number(map.day),
      hour: Number(map.hour),
      minute: Number(map.minute),
      second: Number(map.second),
    };
  };
  const g = asParts(guess);
  const asUtcGuess = Date.UTC(
    g.year,
    g.month - 1,
    g.day,
    g.hour,
    g.minute,
    g.second,
    parts.ms,
  );
  const offset = asUtcGuess - guess;
  const corrected = guess - offset;
  // One more pass for DST boundary ambiguity.
  const c = asParts(corrected);
  const asUtcCorrected = Date.UTC(
    c.year,
    c.month - 1,
    c.day,
    c.hour,
    c.minute,
    c.second,
    parts.ms,
  );
  const offset2 = asUtcCorrected - corrected;
  const finalMs = corrected - (offset2 - offset);
  const date = new Date(finalMs);
  return Number.isNaN(date.getTime()) ? null : date;
};

export type ParseKimdisDateTimeResult = {
  date: Date | null;
  kind: "offset_aware" | "date_only" | "athens_local" | "invalid" | "empty";
};

/**
 * Parse a KIMDIS source datetime string into a UTC Date.
 * Never use `new Date(offsetLessLocal)` for product timestamps.
 */
export const parseKimdisDateTime = (
  raw: string | null | undefined,
  options?: { timeZone?: string },
): ParseKimdisDateTimeResult => {
  if (raw == null) return { date: null, kind: "empty" };
  const value = String(raw).trim();
  if (!value) return { date: null, kind: "empty" };

  const timeZone = options?.timeZone ?? "Europe/Athens";

  const dateOnly = value.match(DATE_ONLY);
  if (dateOnly) {
    const year = Number(dateOnly[1]);
    const month = Number(dateOnly[2]);
    const day = Number(dateOnly[3]);
    // Date-only: noon UTC so the calendar day is stable across zones.
    const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));
    return Number.isNaN(date.getTime())
      ? { date: null, kind: "invalid" }
      : { date, kind: "date_only" };
  }

  if (HAS_EXPLICIT_OFFSET.test(value)) {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? { date: null, kind: "invalid" }
      : { date, kind: "offset_aware" };
  }

  const local = value.match(LOCAL_DATETIME);
  if (local) {
    const date = zonedPartsToUtc(
      {
        year: Number(local[1]),
        month: Number(local[2]),
        day: Number(local[3]),
        hour: Number(local[4]),
        minute: Number(local[5]),
        second: Number(local[6] ?? 0),
        ms: Number((local[7] ?? "0").padEnd(3, "0")),
      },
      timeZone,
    );
    return date
      ? { date, kind: "athens_local" }
      : { date: null, kind: "invalid" };
  }

  // Last resort: native parse (may be ambiguous).
  const fallback = new Date(value);
  return Number.isNaN(fallback.getTime())
    ? { date: null, kind: "invalid" }
    : { date: fallback, kind: "offset_aware" };
};

/** Convenience: Date or null. */
export const kimdisDateOrNull = (
  raw: string | null | undefined,
): Date | null => parseKimdisDateTime(raw).date;
