import { createHash } from "node:crypto";

const WEEKDAY_EL = [
  "Κυριακή",
  "Δευτέρα",
  "Τρίτη",
  "Τετάρτη",
  "Πέμπτη",
  "Παρασκευή",
  "Σάββατο",
] as const;

/** Spread Free orgs across weekdays and daytime hours (Europe/Athens). */
const WEEKLY_HOUR_SLOTS = [
  "08:00",
  "09:00",
  "10:00",
  "11:00",
  "12:00",
  "13:00",
  "14:00",
  "15:00",
  "16:00",
  "17:00",
  "18:00",
] as const;

export const assignWeeklyDigestSlot = (
  organizationId: string,
): { weeklyDigestWeekday: number; weeklyDigestHour: string } => {
  const digest = createHash("sha256").update(organizationId).digest();
  const weekday = digest[0]! % 7;
  const hour = WEEKLY_HOUR_SLOTS[digest[1]! % WEEKLY_HOUR_SLOTS.length]!;
  return { weeklyDigestWeekday: weekday, weeklyDigestHour: hour };
};

export const weekdayLabelEl = (weekday: number): string =>
  WEEKDAY_EL[((weekday % 7) + 7) % 7]!;

/** Athens calendar parts for a Date. */
export const athensWallParts = (
  now = new Date(),
): { year: number; month: number; day: number; weekday: number; hour: number } => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Athens",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    weekday: weekdayMap[map.weekday ?? "Sun"] ?? 0,
    hour: Number(map.hour ?? "0"),
  };
};

export const weeklyCycleId = (now = new Date()): string => {
  // ISO week in Europe/Athens (approx via UTC Monday of Athens date).
  const { year, month, day } = athensWallParts(now);
  const utc = new Date(Date.UTC(year, month - 1, day));
  const dayNum = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((utc.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
};

export const isWeeklySlotDue = (input: {
  weeklyDigestWeekday: number;
  weeklyDigestHour: string;
  now?: Date;
}): boolean => {
  const wall = athensWallParts(input.now ?? new Date());
  const hourKey = `${String(wall.hour).padStart(2, "0")}:00`;
  return (
    wall.weekday === input.weeklyDigestWeekday &&
    hourKey === input.weeklyDigestHour
  );
};

/** Next scheduled send as ISO (approx, DST-safe via iterative search). */
export const nextWeeklySendAtIso = (input: {
  weeklyDigestWeekday: number;
  weeklyDigestHour: string;
  from?: Date;
}): string => {
  const from = input.from ?? new Date();
  const targetHour = Number(input.weeklyDigestHour.slice(0, 2));
  for (let offsetMin = 0; offsetMin < 60 * 24 * 8; offsetMin += 30) {
    const candidate = new Date(from.getTime() + offsetMin * 60_000);
    const wall = athensWallParts(candidate);
    if (
      wall.weekday === input.weeklyDigestWeekday &&
      wall.hour === targetHour &&
      candidate.getTime() > from.getTime()
    ) {
      return candidate.toISOString();
    }
  }
  return new Date(from.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
};

export const formatWeeklyScheduleEl = (input: {
  weeklyDigestWeekday: number;
  weeklyDigestHour: string;
}): string =>
  `Προγραμματισμένη αποστολή: κάθε ${weekdayLabelEl(input.weeklyDigestWeekday)}, στις ${input.weeklyDigestHour}, ώρα Ελλάδας.`;
