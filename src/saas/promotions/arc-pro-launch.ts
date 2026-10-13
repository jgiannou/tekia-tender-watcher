/**
 * ARC Tenders Pro — 30-day launch promotion (cardless).
 *
 * Disabled by default until explicitly enabled via env.
 * Capacity is DB-backed (PromotionCampaignConfig), seeded at 25.
 * Env ARC_PRO_LAUNCH_30_CAPACITY_CEILING is an operational safety upper bound.
 * Env ARC_PRO_LAUNCH_30_MAX_REDEMPTIONS may lower capacity for tests only when
 * no DB row exists yet (seed path).
 */

export const ARC_PRO_LAUNCH_30_KEY = "ARC_PRO_LAUNCH_30" as const;

export const ARC_PRO_LAUNCH_30_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

/** Default / seed capacity. Admin Ops may raise/lower within the ceiling. */
export const ARC_PRO_LAUNCH_30_DEFAULT_CAPACITY = 25;

/** Hard safety ceiling — admin cannot set capacity above this. */
export const ARC_PRO_LAUNCH_30_CAPACITY_CEILING_DEFAULT = 500;

export type ArcProLaunchConfig = {
  enabled: boolean;
  promotionKey: typeof ARC_PRO_LAUNCH_30_KEY;
  durationMs: number;
  /** Optional ISO UTC deadline after which new public redemptions are rejected. */
  redeemBy: Date | null;
  /** Safety ceiling for admin capacity changes. */
  capacityCeiling: number;
  /**
   * Optional test-only seed override when DB config is missing.
   * Never raises above capacityCeiling.
   */
  seedCapacity: number;
};

const parseBool = (raw: string | undefined, fallback = false): boolean => {
  if (raw == null || raw.trim() === "") return fallback;
  const v = raw.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
};

const parseOptionalDate = (raw: string | undefined): Date | null => {
  if (!raw?.trim()) return null;
  const date = new Date(raw.trim());
  return Number.isNaN(date.getTime()) ? null : date;
};

const parseOptionalPositiveInt = (raw: string | undefined): number | null => {
  if (!raw?.trim()) return null;
  const n = Number(raw.trim());
  if (!Number.isFinite(n) || n < 1) return null;
  return Math.floor(n);
};

export const loadArcProLaunchConfig = (
  env: NodeJS.ProcessEnv = process.env,
): ArcProLaunchConfig => {
  const ceiling =
    parseOptionalPositiveInt(env.ARC_PRO_LAUNCH_30_CAPACITY_CEILING) ??
    ARC_PRO_LAUNCH_30_CAPACITY_CEILING_DEFAULT;
  const seedRaw = parseOptionalPositiveInt(
    env.ARC_PRO_LAUNCH_30_MAX_REDEMPTIONS,
  );
  const seedCapacity = Math.min(
    seedRaw ?? ARC_PRO_LAUNCH_30_DEFAULT_CAPACITY,
    ceiling,
  );
  return {
    enabled: parseBool(env.ARC_PRO_LAUNCH_30_ENABLED, false),
    promotionKey: ARC_PRO_LAUNCH_30_KEY,
    durationMs: ARC_PRO_LAUNCH_30_DURATION_MS,
    redeemBy: parseOptionalDate(env.ARC_PRO_LAUNCH_30_REDEEM_BY),
    capacityCeiling: ceiling,
    seedCapacity,
  };
};

export const isArcProLaunchEnabled = (
  env: NodeJS.ProcessEnv = process.env,
): boolean => loadArcProLaunchConfig(env).enabled;

/** @deprecated Use ARC_PRO_LAUNCH_30_DEFAULT_CAPACITY — kept for older imports. */
export const ARC_PRO_LAUNCH_30_TOTAL_SLOTS = ARC_PRO_LAUNCH_30_DEFAULT_CAPACITY;
