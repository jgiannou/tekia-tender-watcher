/**
 * Locked commercial catalog for ARC Tenders SaaS.
 * Public plans: Free + Basic + Pro. No Business/Enterprise yet.
 * Pro extra seats are a recurring add-on, not a fourth plan.
 *
 * Discovery speed is the shared KIMDIS ingest (same for every plan).
 * Email cadence is explicit (WEEKLY / DIGEST_HOURS) — do not overload
 * periodicScansPerDay as a weekly limit. That field is a legacy alias of
 * maxDigestHoursPerDay for older clients.
 *
 * No AI capabilities in any plan.
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

/** Legacy transport hint; prefer emailCadence + immediate* flags. */
export type EmailMode = "DIGEST" | "IMMEDIATE";

export type EmailCadence = "WEEKLY" | "DIGEST_HOURS";

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
  /**
   * Max Europe/Athens digest hour slots per day.
   * Free weekly cadence uses 0 (not "1 email/day").
   */
  maxDigestHoursPerDay: number;
  /**
   * @deprecated Legacy alias of maxDigestHoursPerDay for older API clients.
   * Free is 0 — never interpret as weekly email quota.
   */
  periodicScansPerDay: number;
  manualProfileScansPerDay: number;
  emailCadence: EmailCadence;
  /** Optional immediate email for developments on followed tenders. */
  immediateFollowedDevelopments: boolean;
  /** Optional immediate email for high-match new opportunities (Pro). */
  immediateNewOpportunity: boolean;
  /**
   * Pro-only: Παρακολούθηση Προτεραιότητας (Hot Watch) for outreach / manual priority follows.
   * Does NOT change shared KIMDIS ingest cadence — intensifies related-act checks only.
   */
  priorityMonitoring: boolean;
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
  /** Legacy; derived from cadence for older clients. */
  emailMode: EmailMode;
  /** Pro-only: approaching-deadline radar emails. */
  deadlineRadar: boolean;
  advancedWatchProfileFilters: boolean;
  prioritySupport: boolean;
  participationChecklist: boolean;
  /** Full expiring-contract list (Basic/Pro). Free gets count-only via UI. */
  expiringContractList: boolean;
  /** Free: count only in UI; Basic/Pro: documented award history. */
  awardHistory: boolean;
  priceMemory: boolean;
  /**
   * Slack incoming-webhook notifications (1 channel / org).
   * Free: false. Basic + Pro + Pro trial: true.
   * Runtime also requires SAAS_SLACK_NOTIFICATIONS_ENABLED + OAuth secrets.
   */
  slackNotifications: boolean;
  /**
   * Google Calendar deadline sync (personal per user+org).
   * Free: false. Basic + Pro + Pro trial: true.
   * Runtime requires SAAS_GOOGLE_CALENDAR_ENABLED + OAuth secrets.
   */
  googleCalendar: boolean;
  /**
   * Google Drive import + tender folders.
   * Free: false. Basic + Pro + Pro trial: true.
   * Runtime requires SAAS_GOOGLE_DRIVE_ENABLED + OAuth secrets.
   */
  googleDrive: boolean;
  /**
   * Google Sheets watched-tenders list.
   * Free: false. Basic + Pro + Pro trial: true.
   * Runtime requires SAAS_GOOGLE_SHEETS_ENABLED + OAuth secrets.
   */
  googleSheets: boolean;
  positioningEl: string;
  /** Greek marketing / subscription bullets (single source of truth). */
  featuresEl: string[];
  footnoteEl: string | null;
  ctaEl: string;
  includesLabelEl: string | null;
};

/** Operational safeguard for Pro self-service seat purchases. */
export const PRO_SELF_SERVICE_SEAT_CAP = 20;
export const CONTACT_FOR_MORE_SEATS_EL =
  "Χρειάζεστε περισσότερους από 20 χρήστες; Επικοινωνήστε μαζί μας.";

export const PRICING_VAT_FOOTNOTE_EL = "Οι τιμές δεν περιλαμβάνουν ΦΠΑ.";

/** Shared Greek copy for Slack entitlement (catalog + marketing). */
export const SLACK_NOTIFICATIONS_FEATURE_EL =
  "Ειδοποιήσεις Slack σε 1 κανάλι της ομάδας σας";

export const GOOGLE_CALENDAR_FEATURE_EL =
  "Προθεσμίες στο Google Calendar με αυτόματη ενημέρωση";
export const GOOGLE_DRIVE_IMPORT_FEATURE_EL =
  "Εισαγωγή εγγράφων από Google Drive";
export const GOOGLE_DRIVE_FOLDER_FEATURE_EL =
  "Δημιουργία φακέλου διαγωνισμού στο Google Drive";
export const GOOGLE_SHEETS_FEATURE_EL =
  "Ενημερούμενη λίστα διαγωνισμών στο Google Sheets";

export type IntegrationLiveFlags = {
  slack?: boolean;
  googleCalendar?: boolean;
  googleDrive?: boolean;
  googleSheets?: boolean;
};

/**
 * Public/marketing feature lists hide integrations until configured.
 * Pass boolean for Slack-only legacy callers, or IntegrationLiveFlags.
 */
export const featuresElForDisplay = (
  plan: PlanEntitlements,
  live: boolean | IntegrationLiveFlags,
): string[] => {
  const flags: IntegrationLiveFlags =
    typeof live === "boolean" ? { slack: live } : live;
  return plan.featuresEl.filter((line) => {
    if (line === SLACK_NOTIFICATIONS_FEATURE_EL && !flags.slack) return false;
    if (line === GOOGLE_CALENDAR_FEATURE_EL && !flags.googleCalendar) {
      return false;
    }
    if (
      (line === GOOGLE_DRIVE_IMPORT_FEATURE_EL ||
        line === GOOGLE_DRIVE_FOLDER_FEATURE_EL) &&
      !flags.googleDrive
    ) {
      return false;
    }
    if (line === GOOGLE_SHEETS_FEATURE_EL && !flags.googleSheets) return false;
    return true;
  });
};

export const BASIC_PLAN: PlanEntitlements = {
  plan: "BASIC",
  planKey: PLAN_KEYS.basic,
  label: "Basic",
  labelEl: "Basic",
  positioning: "Monitor tenders and organize your participation.",
  priceMonthlyEur: 4.99,
  priceYearlyEur: 49,
  includedSeats: 1,
  maxSeatsSelfService: 1,
  extraSeatPriceMonthlyEur: null,
  extraSeatPriceYearlyEur: null,
  maxActiveWatchProfiles: 5,
  maxActiveFollowedTenders: 30,
  storageBytes: 250_000_000,
  maxDigestHoursPerDay: 2,
  periodicScansPerDay: 2,
  manualProfileScansPerDay: 10,
  emailCadence: "DIGEST_HOURS",
  immediateFollowedDevelopments: true,
  immediateNewOpportunity: false,
  priorityMonitoring: false,
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
  awardHistory: true,
  priceMemory: true,
  slackNotifications: true,
  googleCalendar: true,
  googleDrive: true,
  googleSheets: true,
  positioningEl:
    "Παρακολουθήστε διαγωνισμούς και οργανώστε τη συμμετοχή σας.",
  featuresEl: [
    "1 χρήστης",
    "Έως 5 ενεργές αποθηκευμένες αναζητήσεις",
    "Έως 30 διαγωνισμοί σε παρακολούθηση",
    "250 MB χώρου για εταιρικά έγγραφα",
    "Συγκεντρωτικά email έως 2 φορές την ημέρα",
    "Επιλογή άμεσων email για σημαντικές εξελίξεις στους διαγωνισμούς που παρακολουθείτε",
    "Ειδοποιήσεις Slack σε 1 κανάλι της ομάδας σας",
    GOOGLE_CALENDAR_FEATURE_EL,
    GOOGLE_DRIVE_IMPORT_FEATURE_EL,
    GOOGLE_DRIVE_FOLDER_FEATURE_EL,
    GOOGLE_SHEETS_FEATURE_EL,
    "Λίστα δικαιολογητικών και έλεγχος με τα έγγραφά σας",
    "Οργάνωση προετοιμασίας και καταγραφή υποβολής προσφοράς",
    "Καταγραφή εκδήλωσης ενδιαφέροντος προς τον φορέα",
    "Συμβάσεις που λήγουν και ιστορικό αποτελεσμάτων",
  ],
  footnoteEl: PRICING_VAT_FOOTNOTE_EL,
  ctaEl: "Επιλέξτε Basic",
  includesLabelEl: null,
};

export const FREE_PLAN: PlanEntitlements = {
  ...BASIC_PLAN,
  plan: "FREE",
  planKey: PLAN_KEYS.free,
  label: "Free",
  labelEl: "Δωρεάν",
  positioning:
    "Find public opportunities that match your business.",
  positioningEl:
    "Βρείτε δημόσιες ευκαιρίες που ταιριάζουν στην επιχείρησή σας.",
  priceMonthlyEur: 0,
  priceYearlyEur: 0,
  maxActiveWatchProfiles: 1,
  maxActiveFollowedTenders: 5,
  storageBytes: 0,
  maxDigestHoursPerDay: 0,
  periodicScansPerDay: 0,
  manualProfileScansPerDay: 5,
  emailCadence: "WEEKLY",
  immediateFollowedDevelopments: false,
  immediateNewOpportunity: false,
  priorityMonitoring: false,
  outreachWorkflow: false,
  submissionWorkflow: false,
  companyVault: false,
  tenderWorkspace: false,
  documentVersioning: false,
  participationChecklist: false,
  expiringContractList: false,
  awardHistory: false,
  priceMemory: false,
  slackNotifications: false,
  googleCalendar: false,
  googleDrive: false,
  googleSheets: false,
  emailMode: "DIGEST",
  featuresEl: [
    "1 χρήστης",
    "1 ενεργή αποθηκευμένη αναζήτηση",
    "Έως 5 διαγωνισμοί σε παρακολούθηση",
    "Αναζήτηση στο ΚΗΜΔΗΣ με λέξεις-κλειδιά, CPV και περιοχή",
    "Βαθμός συνάφειας με εξήγηση των αποτελεσμάτων",
    "Ειδοποιήσεις μέσα στην εφαρμογή και προαιρετικές ειδοποιήσεις push",
    "Έως 1 εβδομαδιαία σύνοψη email, όταν υπάρχουν νέα",
    "Προβολή πορείας διαγωνισμού και υπενθυμίσεις προθεσμιών στην εφαρμογή",
  ],
  footnoteEl:
    "Χωρίς κάρτα και χωρίς χρονικό περιορισμό. Η εβδομαδιαία σύνοψη αποστέλλεται σε έναν παραλήπτη ανά εταιρεία.",
  ctaEl: "Ξεκινήστε δωρεάν",
  includesLabelEl: null,
};

export const PRO_PLAN: PlanEntitlements = {
  plan: "PRO",
  planKey: PLAN_KEYS.pro,
  label: "Pro",
  labelEl: "Pro",
  positioning:
    "Do not miss a critical procurement development.",
  priceMonthlyEur: 9.99,
  priceYearlyEur: 99,
  includedSeats: 3,
  maxSeatsSelfService: PRO_SELF_SERVICE_SEAT_CAP,
  extraSeatPriceMonthlyEur: 2.49,
  extraSeatPriceYearlyEur: 24.9,
  maxActiveWatchProfiles: 15,
  maxActiveFollowedTenders: 100,
  storageBytes: 2_000_000_000,
  maxDigestHoursPerDay: 6,
  periodicScansPerDay: 6,
  manualProfileScansPerDay: 20,
  emailCadence: "DIGEST_HOURS",
  immediateFollowedDevelopments: true,
  immediateNewOpportunity: true,
  priorityMonitoring: true,
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
  deadlineRadar: true,
  advancedWatchProfileFilters: true,
  prioritySupport: true,
  participationChecklist: true,
  expiringContractList: true,
  awardHistory: true,
  priceMemory: true,
  slackNotifications: true,
  googleCalendar: true,
  googleDrive: true,
  googleSheets: true,
  positioningEl: "Μη χάσετε κρίσιμη εξέλιξη.",
  featuresEl: [
    "3 χρήστες",
    "Έως 15 ενεργές αποθηκευμένες αναζητήσεις",
    "Έως 100 διαγωνισμοί σε παρακολούθηση",
    "2 GB χώρου για εταιρικά έγγραφα",
    "Συγκεντρωτικά email έως 6 φορές την ημέρα",
    "Παρακολούθηση προτεραιότητας σε διαγωνισμούς που σας ενδιαφέρουν",
    "Άμεση ειδοποίηση για σχετικές προσκλήσεις και κρίσιμες εξελίξεις",
    "Άμεσες ειδοποιήσεις για νέες ευκαιρίες υψηλής συνάφειας",
    "Ειδοποιήσεις Slack σε 1 κανάλι της ομάδας σας",
    GOOGLE_CALENDAR_FEATURE_EL,
    GOOGLE_DRIVE_IMPORT_FEATURE_EL,
    GOOGLE_DRIVE_FOLDER_FEATURE_EL,
    GOOGLE_SHEETS_FEATURE_EL,
    "Συγκεντρωτική προβολή επερχόμενων προθεσμιών",
    "Προηγμένα φίλτρα αναζήτησης",
    "Εξυπηρέτηση κατά προτεραιότητα",
  ],
  footnoteEl: PRICING_VAT_FOOTNOTE_EL,
  ctaEl: "Δοκιμάστε το Pro για 7 ημέρες",
  includesLabelEl: "Όλες οι δυνατότητες του Basic, με:",
};

/** 7-day Pro preview. Does not replace the non-expiring Free plan. */
export const TRIAL_PLAN: PlanEntitlements = {
  ...PRO_PLAN,
  plan: "TRIAL",
  planKey: PLAN_KEYS.trial,
  label: "Trial",
  labelEl: "Δοκιμή Pro",
  positioning: "7-day Pro preview. Does not replace the free plan.",
  positioningEl: "7 ημέρες Pro. Δεν αντικαθιστά το δωρεάν πακέτο.",
  priceMonthlyEur: null,
  priceYearlyEur: null,
  ctaEl: "Δοκιμάστε το Pro για 7 ημέρες",
};

export const TRIAL_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

/** High-match threshold for Pro optional immediate new-opportunity email. */
export const HIGH_MATCH_SCORE_THRESHOLD = 70;

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
}): {
  includedSeats: number;
  extraSeats: number;
  seatLimit: number;
  selfServiceCap: number;
} => {
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
