import { createHash } from "node:crypto";

/**
 * Tender deadlines are stored as DateTime without a separate timezone column.
 * Policy for v1:
 * - If the UTC clock is midnight (00:00:00.000Z), treat as date-only → all-day event.
 * - Otherwise treat as an exact instant (dateTime with timeZone UTC).
 * Never invent 23:59.
 */

export type DeadlineKind = "all_day" | "timed";

export type ParsedDeadline = {
  kind: DeadlineKind;
  /** YYYY-MM-DD for all-day start (inclusive). */
  date?: string;
  /** Exclusive end date for all-day (Google Calendar). */
  endDateExclusive?: string;
  /** RFC3339 for timed start/end. */
  dateTime?: string;
  endDateTime?: string;
  timeZone?: string;
};

const pad = (n: number) => String(n).padStart(2, "0");

export const formatUtcDateOnly = (d: Date): string =>
  `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

export const addUtcDays = (d: Date, days: number): Date => {
  const next = new Date(d.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
};

export const isUtcMidnight = (d: Date): boolean =>
  d.getUTCHours() === 0 &&
  d.getUTCMinutes() === 0 &&
  d.getUTCSeconds() === 0 &&
  d.getUTCMilliseconds() === 0;

export const parseTenderDeadline = (
  finalSubmissionDate: Date | null | undefined,
): ParsedDeadline | null => {
  if (!finalSubmissionDate) return null;
  const d = new Date(finalSubmissionDate);
  if (Number.isNaN(d.getTime())) return null;
  if (isUtcMidnight(d)) {
    const date = formatUtcDateOnly(d);
    return {
      kind: "all_day",
      date,
      endDateExclusive: formatUtcDateOnly(addUtcDays(d, 1)),
    };
  }
  const end = new Date(d.getTime() + 60 * 60 * 1000);
  return {
    kind: "timed",
    dateTime: d.toISOString(),
    endDateTime: end.toISOString(),
    timeZone: "UTC",
  };
};

export const isFutureOrTodayDeadline = (
  finalSubmissionDate: Date,
  now = new Date(),
): boolean => {
  const parsed = parseTenderDeadline(finalSubmissionDate);
  if (!parsed) return false;
  if (parsed.kind === "all_day" && parsed.date) {
    const today = formatUtcDateOnly(now);
    return parsed.date >= today;
  }
  return finalSubmissionDate.getTime() >= now.getTime();
};

export type CalendarEventDate =
  | { date: string }
  | { dateTime: string; timeZone: string };

export type CalendarEventContent = {
  summary: string;
  description: string;
  start: CalendarEventDate;
  end: CalendarEventDate;
  source?: { title: string; url: string };
};

export const buildDeadlineEventContent = (input: {
  title: string;
  authority: string | null | undefined;
  source: string | null | undefined;
  reference: string | null | undefined;
  arcUrl: string;
  deadline: ParsedDeadline;
}): CalendarEventContent => {
  const lines = [
    "Προθεσμία υποβολής — ARC Tenders",
    input.authority ? `Αναθέτουσα αρχή: ${input.authority}` : null,
    input.source ? `Πηγή: ${input.source}` : null,
    input.reference ? `Αναγνωριστικό: ${input.reference}` : null,
    `Σύνδεσμος ARC: ${input.arcUrl}`,
    "",
    "Το ARC ενημερώνει τα συμβάντα αυτού του ημερολογίου. Οι αλλαγές που κάνετε στο Google Calendar δεν μεταφέρονται στο ARC και μπορεί να αντικατασταθούν στον επόμενο συγχρονισμό.",
  ].filter(Boolean) as string[];

  const start =
    input.deadline.kind === "all_day"
      ? { date: input.deadline.date! }
      : {
          dateTime: input.deadline.dateTime!,
          timeZone: input.deadline.timeZone ?? "UTC",
        };
  const end =
    input.deadline.kind === "all_day"
      ? { date: input.deadline.endDateExclusive! }
      : {
          dateTime: input.deadline.endDateTime!,
          timeZone: input.deadline.timeZone ?? "UTC",
        };

  return {
    summary: input.title,
    description: lines.join("\n"),
    start,
    end,
    source: { title: "ARC Tenders", url: input.arcUrl },
  };
};

export const deadlineFingerprint = (input: {
  title: string;
  deadline: ParsedDeadline;
  arcUrl: string;
}): string => {
  const payload = JSON.stringify({
    title: input.title,
    deadline: input.deadline,
    arcUrl: input.arcUrl,
  });
  return createHash("sha256").update(payload).digest("hex").slice(0, 32);
};
