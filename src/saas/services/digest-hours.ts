import type { PlanKey } from "../plans/catalog.js";
import { PLAN_KEYS, entitlementsForPlanKey } from "../plans/catalog.js";

/** Selectable hour slots offered in settings (Europe/Athens wall clock). */
export const DIGEST_HOUR_OPTIONS = [
  "06:00",
  "07:00",
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
  "19:00",
  "20:00",
  "21:00",
  "22:00",
] as const;

export type DigestHour = (typeof DIGEST_HOUR_OPTIONS)[number];

const HOUR_RE = /^([01]\d|2[0-3]):00$/;

export const defaultDigestHoursForPlanKey = (planKey: string): string[] => {
  const plan = entitlementsForPlanKey(planKey);
  if (plan.planKey === PLAN_KEYS.pro) {
    return ["08:00", "10:00", "12:00", "14:00", "16:00", "18:00"];
  }
  if (plan.planKey === PLAN_KEYS.trial || plan.planKey === PLAN_KEYS.free) {
    return ["08:00"];
  }
  return ["08:00", "18:00"];
};

/** Keep unique sorted hours, capped by plan limit. */
export const normalizeDigestHours = (
  raw: unknown,
  maxSlots: number,
  fallbackPlanKey: PlanKey | string = PLAN_KEYS.basic,
): string[] => {
  const max = Math.max(0, Math.floor(maxSlots));
  const allowed = new Set<string>(DIGEST_HOUR_OPTIONS);
  const fromRaw = Array.isArray(raw)
    ? raw
        .filter((v): v is string => typeof v === "string")
        .map((v) => v.trim())
        .filter((v) => HOUR_RE.test(v) && allowed.has(v))
    : [];
  const unique = [...new Set(fromRaw)].sort();
  if (unique.length === 0) {
    return defaultDigestHoursForPlanKey(fallbackPlanKey).slice(0, max || 1);
  }
  return unique.slice(0, max || 1);
};

/** Current Europe/Athens hour as HH:00. */
export const athensHourKey = (now = new Date()): string => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Athens",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const hour = parts.find((p) => p.type === "hour")?.value ?? "00";
  return `${hour.padStart(2, "0")}:00`;
};

export const athensDateKey = (now = new Date()): string => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Athens",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const d = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${y}-${m}-${d}`;
};

export const orgIsDueAtHour = (input: {
  digestHours: string[];
  hourKey: string;
}): boolean => input.digestHours.includes(input.hourKey);
