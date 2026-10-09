/**
 * Locked commercial catalog for ARC Tenders SaaS.
 * Public plans: Free + Basic + Pro. No Business/Enterprise yet.
 * Pro extra seats are a recurring add-on, not a fourth plan.
 *
 * Discovery speed is the shared KIMDIS ingest (same for every plan).
 * periodicScansPerDay caps digest email hours / legacy per-org waves.
 * Free: 1 digest/day. Basic: DIGEST at chosen hours. Pro: IMMEDIATE + Deadline Radar.
 */

export const PLAN_KEYS = {
  trial: "trial",
  free: "free",
  basic: "basic",
  pro: "pro",
} as const;

export type PublicPlanKey =
  | typeof PLAN_KEYS.free
  | typeof PLAN_KEYS.basic
  | typeof PLAN_KEYS.pro;
export type PlanKey = (typeof PLAN_KEYS)[keyof typeof PLAN_KEYS] | string;

export type EmailMode = "DIGEST" | "IMMEDIATE";

export type PlanEntitlements = {
  plan: "TRIAL" | "FREE" | "BASIC" | "PRO";
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
  /** Pro-only: approaching-deadline radar emails. */
  deadlineRadar: boolean;
  advancedWatchProfileFilters: boolean;
  prioritySupport: boolean;
  participationChecklist: boolean;
  expiringContractList: boolean;
  priceMemory: boolean;
  positioningEl: string;
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
  deadlineRadar: false,
  advancedWatchProfileFilters: false,
  prioritySupport: false,
  participationChecklist: true,
  expiringContractList: true,
  priceMemory: true,
  positioningEl:
    "Για επαγγελματίες και μικρές επιχειρήσεις που θέλουν να βρίσκουν και να παρακολουθούν επιλεγμένες δημόσιες ευκαιρίες.",
};

export const FREE_PLAN: PlanEntitlements = {
  ...BASIC_PLAN,
  plan: "FREE",
  planKey: PLAN_KEYS.free,
  label: "Free",
  labelEl: "Δωρεάν",
  positioning:
    "Discover and follow a few Greek public tenders, with the same ingest speed as paid plans.",
  positioningEl:
    "Βρίσκεις και παρακολουθείς λίγους διαγωνισμούς, με την ίδια ταχύτητα εισαγωγής με τα επί πληρωμή πλάνα.",
  priceMonthlyEur: 0,
  priceYearlyEur: 0,
  maxActiveWatchProfiles: 1,
  maxActiveFollowedTenders: 5,
  storageBytes: 0,
  periodicScansPerDay: 1,
  manualProfileScansPerDay: 5,
  outreachWorkflow: false,
  submissionWorkflow: false,
  companyVault: false,
  tenderWorkspace: false,
  documentVersioning: false,
  participationChecklist: false,
  expiringContractList: false,
  priceMemory: false,
  emailMode: "DIGEST",
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
  deadlineRadar: true,
  advancedWatchProfileFilters: true,
  prioritySupport: true,
  participationChecklist: true,
  expiringContractList: true,
  priceMemory: true,
  positioningEl:
    "Για επιχειρήσεις που παρακολουθούν συστηματικά δημόσιες συμβάσεις και χρειάζονται μεγαλύτερη κάλυψη και ομάδα.",
};

/** 7-day Pro preview. Does not replace the non-expiring Free plan. */
export const TRIAL_PLAN: PlanEntitlements = {
  ...PRO_PLAN,
  plan: "TRIAL",
  planKey: PLAN_KEYS.trial,
  label: "Trial",
  labelEl: "Δοκιμή Pro",
  positioning: "7-day Pro preview. Does not replace the free plan.",
  positioningEl: "7 ημέρες Pro. Δεν αντικαθιστά το δωρεάν πλάνο.",
  priceMonthlyEur: null,
  priceYearlyEur: null,
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
  if (raw === PLAN_KEYS.free || raw === "free") return PLAN_KEYS.free;
  if (raw === PLAN_KEYS.basic || raw === "basic_499") return PLAN_KEYS.basic;
  if (raw === PLAN_KEYS.pro || raw === "pro_999") return PLAN_KEYS.pro;
  if (raw === PLAN_KEYS.trial) return PLAN_KEYS.trial;
  return raw;
};

export const entitlementsForPlanKey = (planKey: string): PlanEntitlements => {
  const key = normalizePlanKey(planKey);
  if (key === PLAN_KEYS.pro) return { ...PRO_PLAN };
  if (key === PLAN_KEYS.free) return { ...FREE_PLAN };
  if (key === PLAN_KEYS.basic) return { ...BASIC_PLAN };
  if (key === PLAN_KEYS.trial) return { ...TRIAL_PLAN };
  // Unknown paid keys default to Basic (safer / lower entitlements).
  return { ...BASIC_PLAN, planKey: key };
};

export const publicPlans = (): PlanEntitlements[] => [
  { ...FREE_PLAN },
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
