/**
 * Locked commercial catalog for ARC Tenders SaaS.
 * Only TWO public plans: Basic + Pro. No Business/Enterprise yet.
 * Pro extra seats are a recurring add-on, not a third plan.
 *
 * Basic entitlements are locked (full procurement lifecycle, DIGEST email =
 * related-act updates once/day, advanced filters off). Pro differentiates on
 * volume/seats/speed/support (IMMEDIATE related-act email) — not by crippling
 * Basic workflow features.
 */

export const PLAN_KEYS = {
  trial: "trial",
  basic: "basic",
  pro: "pro",
} as const;

export type PublicPlanKey = typeof PLAN_KEYS.basic | typeof PLAN_KEYS.pro;
export type PlanKey = (typeof PLAN_KEYS)[keyof typeof PLAN_KEYS] | string;

export type EmailMode = "DIGEST" | "IMMEDIATE";

export type PlanEntitlements = {
  plan: "TRIAL" | "BASIC" | "PRO";
  planKey: PlanKey;
  label: string;
  labelEl: string;
  positioning: string;
  priceMonthlyEur: number | null;
  priceYearlyEur: number | null;
  /** Seats included in the base subscription. */
  includedSeats: number;
  /**
   * Self-service seat ceiling (included + paid add-ons).
   * Not a hard technical max — contact sales above this.
   */
  maxSeatsSelfService: number;
  /** € / extra seat / month (Pro only). */
  extraSeatPriceMonthlyEur: number | null;
  extraSeatPriceYearlyEur: number | null;
  maxActiveWatchProfiles: number;
  maxActiveFollowedTenders: number;
  storageBytes: number;
  periodicScansPerDay: number;
  manualProfileScansPerDay: number;
  opportunityMatching: boolean;
  matchScore: boolean;
  matchReasons: boolean;
  kimdisSearch: boolean;
  procurementMonitoring: boolean;
  relatedActMonitoring: boolean;
  outreachWorkflow: boolean;
  submissionWorkflow: boolean;
  companyVault: boolean;
  tenderWorkspace: boolean;
  documentVersioning: boolean;
  inAppNotifications: boolean;
  emailMode: EmailMode;
  advancedWatchProfileFilters: boolean;
  prioritySupport: boolean;
};

/** Operational safeguard for Pro self-service seat purchases. */
export const PRO_SELF_SERVICE_SEAT_CAP = 20;
export const CONTACT_FOR_MORE_SEATS_EL =
  "Χρειάζεστε περισσότερους από 20 χρήστες; Επικοινωνήστε μαζί μας.";

export const BASIC_PLAN: PlanEntitlements = {
  plan: "BASIC",
  planKey: PLAN_KEYS.basic,
  label: "Basic",
  labelEl: "Basic",
  positioning:
    "For professionals and small businesses that want to discover and monitor selected public procurement opportunities.",
  priceMonthlyEur: 4.99,
  priceYearlyEur: 49,
  includedSeats: 1,
  maxSeatsSelfService: 1,
  extraSeatPriceMonthlyEur: null,
  extraSeatPriceYearlyEur: null,
  maxActiveWatchProfiles: 3,
  maxActiveFollowedTenders: 20,
  storageBytes: 250_000_000,
  // Below Pro cadence — leave upgrade headroom (Pro ~6/day).
  periodicScansPerDay: 2,
  manualProfileScansPerDay: 10,
  opportunityMatching: true,
  matchScore: true,
  matchReasons: true,
  kimdisSearch: true,
  procurementMonitoring: true,
  relatedActMonitoring: true,
  outreachWorkflow: true,
  submissionWorkflow: true,
  companyVault: true,
  tenderWorkspace: true,
  documentVersioning: true,
  inAppNotifications: true,
  emailMode: "DIGEST",
  advancedWatchProfileFilters: false,
  prioritySupport: false,
};

/**
 * Provisional Pro matrix — seats/pricing locked; feature numbers pending
 * full Pro entitlement block from product.
 */
export const PRO_PLAN: PlanEntitlements = {
  plan: "PRO",
  planKey: PLAN_KEYS.pro,
  label: "Pro",
  labelEl: "Pro",
  positioning:
    "For businesses that systematically monitor public procurement opportunities and need more automation, coverage and team access.",
  priceMonthlyEur: 9.99,
  priceYearlyEur: 99,
  includedSeats: 3,
  maxSeatsSelfService: PRO_SELF_SERVICE_SEAT_CAP,
  extraSeatPriceMonthlyEur: 2.49,
  extraSeatPriceYearlyEur: 24.9,
  maxActiveWatchProfiles: 15,
  maxActiveFollowedTenders: 100,
  storageBytes: 2_000_000_000,
  periodicScansPerDay: 6,
  manualProfileScansPerDay: 20,
  opportunityMatching: true,
  matchScore: true,
  matchReasons: true,
  kimdisSearch: true,
  procurementMonitoring: true,
  relatedActMonitoring: true,
  outreachWorkflow: true,
  submissionWorkflow: true,
  companyVault: true,
  tenderWorkspace: true,
  documentVersioning: true,
  inAppNotifications: true,
  emailMode: "IMMEDIATE",
  advancedWatchProfileFilters: true,
  prioritySupport: true,
};

/** Trial mirrors Basic coverage with tighter periodic cadence (1/day, 7 days). */
export const TRIAL_PLAN: PlanEntitlements = {
  ...BASIC_PLAN,
  plan: "TRIAL",
  planKey: PLAN_KEYS.trial,
  label: "Trial",
  labelEl: "Δοκιμή",
  positioning: "7-day trial with Basic-level access and limited periodic scans.",
  priceMonthlyEur: null,
  priceYearlyEur: null,
  periodicScansPerDay: 1,
  manualProfileScansPerDay: 10,
};

export const TRIAL_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

const LEGACY_PLAN_KEY_MAP: Record<string, PlanKey> = {
  starter_499: PLAN_KEYS.basic,
  saas_standard: PLAN_KEYS.basic,
  pro_1000: PLAN_KEYS.pro,
};

export const normalizePlanKey = (planKey: string | null | undefined): PlanKey => {
  const raw = (planKey ?? PLAN_KEYS.trial).trim().toLowerCase();
  if (raw in LEGACY_PLAN_KEY_MAP) return LEGACY_PLAN_KEY_MAP[raw]!;
  if (raw === PLAN_KEYS.basic || raw === "basic_499") return PLAN_KEYS.basic;
  if (raw === PLAN_KEYS.pro || raw === "pro_999") return PLAN_KEYS.pro;
  if (raw === PLAN_KEYS.trial) return PLAN_KEYS.trial;
  return raw;
};

export const entitlementsForPlanKey = (planKey: string): PlanEntitlements => {
  const key = normalizePlanKey(planKey);
  if (key === PLAN_KEYS.pro) return { ...PRO_PLAN };
  if (key === PLAN_KEYS.basic) return { ...BASIC_PLAN };
  if (key === PLAN_KEYS.trial) return { ...TRIAL_PLAN };
  // Unknown paid keys default to Basic (safer / lower entitlements).
  return { ...BASIC_PLAN, planKey: key };
};

export const publicPlans = (): PlanEntitlements[] => [
  { ...BASIC_PLAN },
  { ...PRO_PLAN },
];

export const seatLimitForSubscription = (input: {
  planKey: string;
  extraSeats?: number | null;
}): { includedSeats: number; extraSeats: number; seatLimit: number; selfServiceCap: number } => {
  const plan = entitlementsForPlanKey(input.planKey);
  const extraSeats = Math.max(0, input.extraSeats ?? 0);
  const seatLimit = Math.min(
    plan.includedSeats + extraSeats,
    plan.maxSeatsSelfService,
  );
  return {
    includedSeats: plan.includedSeats,
    extraSeats,
    seatLimit,
    selfServiceCap: plan.maxSeatsSelfService,
  };
};
