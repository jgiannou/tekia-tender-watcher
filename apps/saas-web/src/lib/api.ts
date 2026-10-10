export type SaasOrganization = {
  id: string;
  name: string;
  slug: string;
  role: "OWNER" | "ADMIN" | "MEMBER";
};

export type ThemePreference = "DARK" | "LIGHT" | "SYSTEM";

export type OnboardingStatus =
  | "NOT_STARTED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "DISMISSED";

export type SaasUser = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  emailVerified?: boolean;
};

export type ScanAccessStatus =
  | "unverified"
  | "trial"
  | "trial_expired"
  | "active"
  | "inactive";

export type ScanAccess = {
  emailVerified: boolean;
  status: ScanAccessStatus;
  planKey: string;
  plan?: string;
  trialEndsAt: string | null;
  limits: {
    maxActiveWatchProfiles: number;
    maxActiveFollowedTenders?: number;
    storageBytes?: number;
    periodicScansPerDay: number;
    manualProfileScansPerDay: number;
    includedSeats?: number;
    maxSeatsSelfService?: number;
    advancedWatchProfileFilters?: boolean;
    emailMode?: "DIGEST" | "IMMEDIATE";
  };
  usage: { day: string; periodic: number; manual: number };
  seats?: {
    includedSeats: number;
    extraSeats: number;
    seatLimit: number;
    selfServiceCap: number;
  };
  canManualKimdisSearch: boolean;
  canRunManualProfileScan: boolean;
  canRunPeriodicScan: boolean;
  blockCode: string | null;
};

export type CompanyProfile = {
  legalName: string;
  distinctiveTitle: string | null;
  afm: string | null;
  gemiNumber: string | null;
  status: string | null;
  gemiService: string | null;
  legalType: string | null;
  website: string | null;
  email: string | null;
  phone: string | null;
  incorporationDate: string | null;
  address: {
    street: string | null;
    streetNumber: string | null;
    zipCode: string | null;
    city: string | null;
    municipality: string | null;
    prefecture: string | null;
  };
  source: "GEMI" | "MANUAL" | null;
  lastSyncedAt: string | null;
};

export type OrganizationActivity = {
  code: string;
  description: string;
  isPrimary: boolean;
  source?: "GEMI" | "MANUAL";
};

export type NotificationPreferences = {
  emailEnabled: boolean;
  recipients: string[];
  /** Europe/Athens HH:00 slots; capped by plan maxDigestHoursPerDay (empty on Free). */
  digestHours: string[];
  emailDeliveryMode?: "DIGEST" | "IMMEDIATE";
  weeklyEmailEnabled?: boolean;
  weeklyRecipient?: string | null;
  weeklyDigestWeekday?: number;
  weeklyDigestHour?: string;
  weeklyLastSentAt?: string | null;
  events: {
    newOpportunity: boolean;
    relatedActOnFollowed: boolean;
    postSubmissionUpdate: boolean;
    /** Pro-only. */
    deadlineRadar: boolean;
  };
};

export type OrgSettings = {
  company: CompanyProfile;
  activities: OrganizationActivity[];
  notifications: NotificationPreferences;
  onboardingStatus: OnboardingStatus;
  onboardingMeta: Record<string, unknown> | null;
};

export type CompanyRegistryRecord = {
  gemiNumber: string;
  afm: string;
  legalName: string;
  distinctiveTitle: string | null;
  status: string | null;
  gemiService: string | null;
  legalType: string | null;
  website: string | null;
  email: string | null;
  incorporationDate: string | null;
  address: CompanyProfile["address"];
  activities: Array<{
    code: string;
    description: string;
    isPrimary: boolean;
    kadVersion?: string | null;
  }>;
  source: "GEMI";
};

export type WatchSuggestion = {
  cpvs: Array<{ code: string; label: string }>;
  keywords: string[];
  categories: string[];
};

export type MatchingMode = "STRICT" | "BALANCED" | "BROAD";
export type NotificationOverride = "INHERIT" | "DISABLED" | "IMMEDIATE";
export type ScanState = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";

export type WatchProfile = {
  id: string;
  name: string;
  enabled: boolean;
  keywords: unknown;
  negativeKeywords?: unknown;
  cpvs: unknown;
  minBudget?: number | null;
  maxBudget?: number | null;
  recordTypes?: unknown;
  matchingMode?: MatchingMode | string;
  notificationOverride?: NotificationOverride | string;
  scanState?: ScanState | string;
  lastScannedAt?: string | null;
  initialScanCompletedAt?: string | null;
  lastMatchAt?: string | null;
  matchCount?: number;
  source?: "MANUAL" | "SAVED_FROM_SEARCH" | "SETUP_RECOMMENDATION" | string;
  scanError?: string | null;
  scanPartial?: boolean;
  scanNewCount?: number | null;
  scanEvaluatedCount?: number | null;
  authority?: string | null;
  contractType?: string | null;
  procedureType?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  regions?: unknown;
  includeUnclassifiedRegion?: boolean;
  unclassifiedRegionCount?: number;
  dataSources?: Array<"kimdis" | "ted" | "diavgeia">;
  lastSourceFetchedAt?: string | null;
  createdAt: string;
  updatedAt?: string;
};

export type WatchProfileInput = {
  name: string;
  keywords?: string[];
  negativeKeywords?: string[];
  cpvs?: string[];
  minBudget?: number | null;
  maxBudget?: number | null;
  enabled?: boolean;
  recordTypes?: string[];
  matchingMode?: MatchingMode;
  notificationOverride?: NotificationOverride;
  authority?: string | null;
  contractType?: string | null;
  procedureType?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  regions?: string[];
  includeUnclassifiedRegion?: boolean;
  source?: "MANUAL" | "SAVED_FROM_SEARCH" | "SETUP_RECOMMENDATION";
  skipSimilarCheck?: boolean;
  dataSources?: Array<"kimdis" | "ted" | "diavgeia">;
};

export type ParticipationChecklist = {
  readable: boolean;
  unreadMessage: string | null;
  officialPdfUrl: string | null;
  fields: Array<{
    key: string;
    label: string;
    status: "found" | "not_found";
    value: string | null;
  }>;
  documents: Array<{
    key: string;
    label: string;
    status: "in_vault" | "missing" | "not_required";
  }>;
};

export type PriceMemory = {
  cpv: string | null;
  regionCode: string | null;
  samples: Array<{
    referenceNumber: string;
    title: string | null;
    winnerName: string | null;
    awardAmount: number | null;
    budgetWithoutVat: number | null;
    ratio: number | null;
    signedDate: string | null;
    publicKimdisUrl: string | null;
  }>;
  thin: boolean;
  note: string | null;
  coverage?: {
    source: string;
    complete: boolean;
    descriptionEl: string;
  };
};

export type ExpiringContractRow = {
  tenderId: string;
  referenceNumber: string;
  title: string | null;
  authority: string | null;
  cpv: string | null;
  endsAt: string;
  publicKimdisUrl: string | null;
};

export type DiavgeiaLink = {
  ada: string;
  url: string;
  subject?: string | null;
};

export type IngestStatus = {
  lastSuccessAt: string | null;
  lastError: string | null;
  lastStartedAt: string | null;
  fresh: boolean;
  labelEl: string;
};

export type OpportunityMatchMeta = {
  matchedProfiles: Array<{
    id: string;
    name: string;
    score: number;
    reasons: string[];
  }>;
  highestScore: number;
};

export type Opportunity = {
  id: string;
  score: number | null;
  scoreReasons: unknown;
  matchMeta: OpportunityMatchMeta | null;
  following: boolean;
  /** Unread NEW_OPPORTUNITY attention from a saved-search scan. */
  isNew?: boolean;
  attentionEventId?: string | null;
  watchProfileId: string | null;
  watchProfile?: { id: string; name: string } | null;
  tender: {
    id: string;
    referenceNumber: string;
    recordType: string;
    title: string | null;
    contractingAuthority: string | null;
    budgetWithoutVat: number | null;
    submissionDate: string | null;
    finalSubmissionDate: string | null;
    cpvs: unknown;
    publicKimdisUrl: string | null;
    officialPdfUrl: string | null;
  };
};

export type LegalAcceptance = {
  termsVersion: string;
  privacyVersion: string;
  acceptedAt: string;
  source: string;
};

export type SaasMeResponse = {
  userId: string;
  user: SaasUser | null;
  theme: ThemePreference;
  gemiConfigured: boolean;
  emailEnabled?: boolean;
  activeOrganizationId: string | null;
  organizations: SaasOrganization[];
  legalAcceptance?: LegalAcceptance | null;
  currentLegalVersions?: { terms: string; privacy: string };
};

export type AttentionEvent = {
  id: string;
  type: string;
  title: string;
  createdAt: string;
  readAt: string | null;
  organizationTenderId?: string | null;
  metadata?: unknown;
  relatedTender?: {
    id: string;
    referenceNumber: string;
    title: string | null;
    recordType?: string;
    contractingAuthority?: string | null;
  } | null;
  organizationTender?: {
    id: string;
    tender?: {
      id: string;
      referenceNumber: string;
      title: string | null;
      recordType?: string;
      contractingAuthority?: string | null;
    } | null;
  } | null;
};

export type BillingInterval = "monthly" | "annual";

export type BillingCatalogPlan = {
  key: string;
  code: string;
  label: string;
  labelEl: string;
  positioning: string;
  positioningEl?: string;
  monthlyEur: number | null;
  annualEur: number | null;
  includedSeats: number;
  maxSeatsSelfService: number;
  extraSeatMonthlyEur: number | null;
  extraSeatAnnualEur: number | null;
  maxActiveWatchProfiles: number;
  maxActiveFollowedTenders: number;
  periodicScansPerDay: number;
  maxDigestHoursPerDay?: number;
  storageBytes: number;
  emailMode: "DIGEST" | "IMMEDIATE";
  emailCadence?: "WEEKLY" | "DIGEST_HOURS";
  advancedWatchProfileFilters: boolean;
  participationChecklist?: boolean;
  expiringContractList?: boolean;
  priceMemory?: boolean;
  featuresEl?: string[];
  footnoteEl?: string | null;
  ctaEl?: string;
  includesLabelEl?: string | null;
};

export type BillingCatalogResponse = {
  configured: boolean;
  notes?: {
    vatExcluded?: boolean;
    annualTwoMonthsFree?: boolean;
    contactForMoreSeatsMessage?: string;
    proSelfServiceSeatCap?: number;
  };
  plans: BillingCatalogPlan[];
  trial?: { days: number; periodicScansPerDay: number; noteEl: string };
};

export type BillingStatusResponse = {
  configured: boolean;
  canManageBilling: boolean;
  planKey: string;
  status: string;
  extraSeats: number;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  hasStripeSubscription?: boolean;
  canStartProTrial?: boolean;
};

export type SaasEntitlementsResponse = {
  entitlements: {
    maxActiveWatchProfiles: number;
    maxActiveFollowedTenders: number;
    storageBytes: number;
    periodicScansPerDay: number;
    maxDigestHoursPerDay?: number;
    manualProfileScansPerDay: number;
    includedSeats: number;
    maxSeatsSelfService: number;
    advancedWatchProfileFilters: boolean;
    emailMode: "DIGEST" | "IMMEDIATE";
    emailCadence?: "WEEKLY" | "DIGEST_HOURS";
    deadlineRadar: boolean;
    participationChecklist?: boolean;
    expiringContractList?: boolean;
    priceMemory?: boolean;
    companyVault?: boolean;
    outreachWorkflow?: boolean;
    submissionWorkflow?: boolean;
    tenderWorkspace?: boolean;
  };
  usage: {
    activeWatchProfiles: number;
    totalWatchProfiles: number;
    activeFollowedTenders: number;
    members: number;
  };
  scanAccess: ScanAccess;
  plan?: {
    key: string;
    code: string;
    label: string;
    labelEl: string;
    positioning: string;
    priceMonthlyEur: number | null;
    priceYearlyEur: number | null;
    extraSeatPriceMonthlyEur: number | null;
    features?: {
      advancedWatchProfileFilters?: boolean;
      prioritySupport?: boolean;
      emailMode?: "DIGEST" | "IMMEDIATE";
      emailCadence?: "WEEKLY" | "DIGEST_HOURS";
      deadlineRadar?: boolean;
      opportunityMatching?: boolean;
      matchScore?: boolean;
      matchReasons?: boolean;
      kimdisSearch?: boolean;
      procurementMonitoring?: boolean;
      relatedActMonitoring?: boolean;
      outreachWorkflow?: boolean;
      submissionWorkflow?: boolean;
      companyVault?: boolean;
      tenderWorkspace?: boolean;
      documentVersioning?: boolean;
      inAppNotifications?: boolean;
    };
  };
  catalog?: Array<{
    key: string;
    code: string;
    label: string;
    priceMonthlyEur: number | null;
    includedSeats: number;
    maxSeatsSelfService: number;
    maxActiveWatchProfiles: number;
    periodicScansPerDay: number;
  }>;
  contactForMoreSeatsMessage?: string;
};

export type SaasOverviewMetrics = {
  newOpportunities: number;
  monitoringActive: number;
  deadlinesSoon: number;
  submissionsActive: number;
};

export type SaasOverviewDeadline = {
  tenderId: string;
  referenceNumber: string;
  title: string | null;
  finalSubmissionDate: string;
  daysRemaining: number;
};

export type SaasOverviewMonitoringItem = {
  id: string;
  following: boolean;
  monitoringActive: boolean;
  pipelineStage: string;
  stageLabel?: string;
  nextActionLabel?: string;
  latestActivityAt?: string | null;
  waitingFor?: string | null;
  tender: {
    id: string;
    referenceNumber: string;
    title: string | null;
    recordType?: string;
    contractingAuthority?: string | null;
    finalSubmissionDate?: string | null;
  };
};

export type SaasOverviewDocumentAttention = {
  id: string;
  name: string;
  expiryDate: string | null;
  status: string;
};

export type SaasOverviewWorkflowInsights = {
  waitingForProc: number;
  newRelatedProc: number;
  submissionWithAward: number;
};

export type SaasOverviewNextAction = {
  id: string;
  tenderId: string;
  referenceNumber: string;
  recordType: string;
  title: string | null;
  actionCode: string;
  actionLabel: string;
};

export type SaasOverview = {
  greetingName: string | null;
  metrics: SaasOverviewMetrics;
  entitlements: { maxActiveWatchProfiles: number };
  watchUsage: { active: number; total: number };
  scanningProfiles: number;
  failedScanCount?: number;
  lastSystemScanAt: string | null;
  latestMatchAt: string | null;
  attention: AttentionEvent[];
  opportunities: Opportunity[];
  monitoring: SaasOverviewMonitoringItem[];
  deadlines: SaasOverviewDeadline[];
  documentsAttention: SaasOverviewDocumentAttention[];
  workflowInsights: SaasOverviewWorkflowInsights;
  nextActions: SaasOverviewNextAction[];
};

export type WorkflowNextAction = {
  code: string;
  label: string;
  description: string;
};

export type WorkflowTimelineItem = {
  kind: "official" | "organization";
  key: string;
  title: string;
  subtitle?: string | null;
  adam?: string | null;
  at: string | null;
  isNew?: boolean;
};

export type WorkflowExpectedDevelopment = {
  code: string;
  label: string;
  description: string;
} | null;

export type WorkflowOutreachDocument = {
  documentId: string;
  name: string;
  version: number | null;
};

export type WorkflowOutreach = {
  sentAt: string | null;
  method: string | null;
  recipient: string | null;
  notes: string | null;
  externalReference: string | null;
  documents: WorkflowOutreachDocument[];
};

export type TenderWorkspaceDocument = {
  id: string;
  documentId: string;
  name: string;
  status: VaultDocument["status"];
  expiryDate: string | null;
  version: number | null;
  purpose: string | null;
};

export type TenderWorkspaceSection = {
  id: string;
  label: string;
  documents: TenderWorkspaceDocument[];
};

export type TenderWorkspaceResponse = {
  workspace: { id: string; name: string; createdAt: string } | null;
  sections: TenderWorkspaceSection[];
  documentCount: number;
};

export type TenderWorkflow = {
  organizationTender: {
    id: string;
    following: boolean;
    monitoringActive: boolean;
    pipelineStage: string;
    followedAt?: string | null;
  } | null;
  tender: {
    id: string;
    referenceNumber: string;
    recordType: string;
    title: string | null;
    contractingAuthority: string | null;
    finalSubmissionDate: string | null;
  };
  relatedActs: Array<{
    id: string;
    relationType: string;
    confidence: string;
    detectionMethod?: string | null;
    targetTender: {
      id: string;
      referenceNumber: string;
      recordType: string;
      title: string | null;
    };
  }>;
  timeline: WorkflowTimelineItem[];
  nextAction: WorkflowNextAction;
  expectedDevelopment: WorkflowExpectedDevelopment;
  outreach: WorkflowOutreach | null;
  latestSubmission: {
    id: string;
    submittedAt: string;
    submissionMethod: string;
    externalReference: string | null;
    amountWithoutVat: number | null;
    notes: string | null;
    submittedByUserId: string | null;
    result?: string | null;
  } | null;
  workspaceDocumentCount: number;
  stageLabel: string;
};

export type FormalSubmissionRow = {
  id: string;
  submittedAt: string;
  submissionMethod: string;
  recipient: string | null;
  amountWithoutVat: number | null;
  amountWithVat: number | null;
  externalReference: string | null;
  notes: string | null;
  result: string;
  submittedByUserId: string | null;
  submittedBy: { id: string; name: string; email: string } | null;
  monitoringActive: boolean;
  tender: {
    id: string;
    referenceNumber: string;
    recordType: string;
    title: string | null;
    contractingAuthority: string | null;
  };
};

export type MonitoringPipelineRow = {
  id: string;
  tenderId: string;
  following: boolean;
  monitoringActive: boolean;
  monitoringReason?: string | null;
  pipelineStage: string;
  stageLabel: string;
  operationalStatus: string;
  filterBucket: string;
  nextAction: WorkflowNextAction;
  latestDevelopment: string | null;
  hasOutreach: boolean;
  hasSubmission: boolean;
  relatedProcCount: number;
  relatedAwardCount: number;
  unreadAttentionCount: number;
  latestRelatedActAt?: string | null;
  updatedAt?: string | null;
  tender: {
    id: string;
    referenceNumber: string;
    title: string | null;
    recordType: string;
    contractingAuthority: string | null;
    finalSubmissionDate: string | null;
  };
};

export class SaasRequestError extends Error {
  code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.name = "SaasRequestError";
    this.code = code;
  }
}

export const WATCH_PROFILE_ACTIVE_LIMIT_CODE = "watch_profile_active_limit_reached";

export const isSaasRequestError = (err: unknown): err is SaasRequestError =>
  err instanceof SaasRequestError;

const DEFAULT_MAX_ACTIVE_WATCH_PROFILES = 20;

const sortAttentionEvents = (events: AttentionEvent[]) =>
  [...events].sort((a, b) => {
    const aUnread = a.readAt ? 0 : 1;
    const bUnread = b.readAt ? 0 : 1;
    if (aUnread !== bUnread) return bUnread - aUnread;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

const daysUntil = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return Math.ceil((date.getTime() - Date.now()) / 86_400_000);
};

const maxIso = (values: Array<string | null | undefined>) => {
  let best: string | null = null;
  let bestTime = -Infinity;
  for (const value of values) {
    if (!value) continue;
    const time = new Date(value).getTime();
    if (!Number.isNaN(time) && time > bestTime) {
      bestTime = time;
      best = value;
    }
  }
  return best;
};

const composeOverviewFromEndpoints = async (
  organizationId: string,
  greetingName?: string | null,
): Promise<SaasOverview> => {
  const [
    attentionRes,
    monitoringRes,
    opportunitiesRes,
    profilesRes,
    entitlementsRes,
    documentsRes,
  ] = await Promise.all([
    saasApi
      .attention(organizationId, { limit: 12, light: true })
      .catch(() => ({ events: [] as AttentionEvent[] })),
    saasApi.monitoringState(organizationId),
    // Overview only needs a page of rows + aggregate counts — not the full inbox.
    saasApi.listOpportunities(organizationId, { limit: 30 }),
    saasApi.listWatchProfiles(organizationId),
    saasApi.getEntitlements(organizationId).catch(() => null),
    saasApi.vaultDocuments(organizationId).catch(() => ({ documents: [] as VaultDocument[] })),
  ]);

  const profiles = profilesRes.profiles;
  const activeProfiles = profiles.filter((p) => p.enabled);
  const scanningProfiles = profiles.filter(
    (p) => p.enabled && (p.scanState ?? "").toUpperCase() === "RUNNING",
  ).length;
  const failedScanCount = profiles.filter(
    (p) => p.enabled && (p.scanState ?? "").toUpperCase() === "FAILED",
  ).length;

  const entitlements = entitlementsRes?.entitlements ?? {
    maxActiveWatchProfiles: DEFAULT_MAX_ACTIVE_WATCH_PROFILES,
  };
  const watchUsage = entitlementsRes?.usage
    ? {
        active: entitlementsRes.usage.activeWatchProfiles,
        total: entitlementsRes.usage.totalWatchProfiles,
      }
    : {
        active: activeProfiles.length,
        total: profiles.length,
      };

  const organizationTenders = monitoringRes.organizationTenders;
  const monitoringActive = organizationTenders.filter((row) => row.monitoringActive).length;
  const submissionsActive = organizationTenders.filter((row) => {
    const stage = (row.pipelineStage ?? "").toUpperCase();
    return stage === "SUBMITTED" || stage.includes("SUBMISSION");
  }).length;

  const deadlines: SaasOverviewDeadline[] = organizationTenders
    .map((row) => {
      const finalDate = row.tender?.finalSubmissionDate;
      if (!finalDate) return null;
      const remaining = daysUntil(finalDate);
      if (remaining == null || remaining < 0 || remaining > 7) return null;
      if (!row.following && !row.monitoringActive) return null;
      return {
        tenderId: row.tenderId,
        referenceNumber: row.tender?.referenceNumber ?? row.tenderId,
        title: row.tender?.title ?? null,
        finalSubmissionDate: finalDate,
        daysRemaining: remaining,
      };
    })
    .filter((row): row is SaasOverviewDeadline => row != null)
    .sort((a, b) => a.daysRemaining - b.daysRemaining)
    .slice(0, 8);

  const monitoring: SaasOverviewMonitoringItem[] = organizationTenders
    .filter((row) => row.following || row.monitoringActive)
    .slice(0, 5)
    .map((row) => {
      const waitingFor =
        row.nextAction.code === "WAIT_PROC"
          ? "Επίσημη πρόσκληση"
          : row.nextAction.code === "WAIT_RESULT"
            ? "Απόφαση / αποτέλεσμα"
            : row.nextAction.code === "MONITOR"
              ? row.nextAction.label
              : null;
      return {
        id: row.id,
        following: row.following,
        monitoringActive: row.monitoringActive,
        pipelineStage: row.pipelineStage,
        stageLabel: row.stageLabel,
        nextActionLabel: row.nextAction.label,
        latestActivityAt: row.latestRelatedActAt ?? row.updatedAt ?? null,
        waitingFor,
        tender: {
          id: row.tender?.id ?? row.tenderId,
          referenceNumber: row.tender?.referenceNumber ?? "—",
          title: row.tender?.title ?? null,
          recordType: row.tender?.recordType,
          contractingAuthority: row.tender?.contractingAuthority ?? null,
          finalSubmissionDate: row.tender?.finalSubmissionDate ?? null,
        },
      };
    });

  // Prefer server aggregate when the list is truncated for speed.
  const unfollowedOpportunities =
    opportunitiesRes.unfollowed ??
    opportunitiesRes.opportunities.filter((opportunity) => !opportunity.following)
      .length;

  const documentsAttention: SaasOverviewDocumentAttention[] = documentsRes.documents
    .filter(
      (doc) => doc.status === "EXPIRING_SOON" || doc.status === "EXPIRED",
    )
    .slice(0, 6)
    .map((doc) => ({
      id: doc.id,
      name: doc.name,
      expiryDate: doc.expiryDate,
      status: doc.status,
    }));

  const waitingForProc = organizationTenders.filter(
    (row) =>
      row.filterBucket === "WAITING_PROC" ||
      (row.hasOutreach && row.relatedProcCount === 0 && !row.hasSubmission),
  ).length;
  const newRelatedProc = organizationTenders.filter(
    (row) =>
      row.relatedProcCount > 0 ||
      row.filterBucket === "NEW_DEVELOPMENT" ||
      attentionRes.events.some(
        (event) =>
          !event.readAt &&
          event.type === "RELATED_PROC_DISCOVERED" &&
          event.relatedTender?.referenceNumber === row.tender.referenceNumber,
      ),
  ).length;
  const submissionWithAward = organizationTenders.filter(
    (row) => row.hasSubmission && row.relatedAwardCount > 0,
  ).length;

  const ACTIONABLE_CODES = [
    "REVIEW_AWARD",
    "START_PREPARATION",
    "RECORD_SUBMISSION",
    "RECORD_OUTREACH",
  ];
  const nextActions: SaasOverviewNextAction[] = organizationTenders
    .filter((row) => ACTIONABLE_CODES.includes(row.nextAction.code))
    .sort(
      (a, b) =>
        ACTIONABLE_CODES.indexOf(a.nextAction.code) -
        ACTIONABLE_CODES.indexOf(b.nextAction.code),
    )
    .slice(0, 6)
    .map((row) => ({
      id: row.id,
      tenderId: row.tenderId,
      referenceNumber: row.tender?.referenceNumber ?? row.tenderId,
      recordType: row.tender?.recordType ?? "REQ",
      title: row.tender?.title ?? null,
      actionCode: row.nextAction.code,
      actionLabel: row.nextAction.label,
    }));

  return {
    greetingName: greetingName ?? null,
    metrics: {
      newOpportunities: unfollowedOpportunities,
      monitoringActive,
      deadlinesSoon: deadlines.length,
      submissionsActive,
    },
    entitlements,
    watchUsage,
    scanningProfiles,
    failedScanCount,
    lastSystemScanAt: maxIso(profiles.map((p) => p.lastScannedAt)),
    latestMatchAt: maxIso(profiles.map((p) => p.lastMatchAt)),
    attention: sortAttentionEvents(attentionRes.events).slice(0, 8),
    // Keep enough rows for Overview «Νέες ευκαιρίες» client pagination (3/page).
    opportunities: opportunitiesRes.opportunities.slice(0, 30),
    monitoring,
    deadlines,
    documentsAttention,
    workflowInsights: {
      waitingForProc,
      newRelatedProc,
      submissionWithAward,
    },
    nextActions,
  };
};

export type KimdisSearchItem = {
  adam: string;
  recordType: "REQ" | "PROC";
  title: string;
  contractingAuthority: string;
  description?: string;
  cpvs: string[];
  budgetWithoutVat: number | null;
  budgetWithVat: number | null;
  submissionDate: string | null;
  signedDate: string | null;
  finalSubmissionDate: string | null;
  procedureType: string | null;
  contractTypeLabel: string | null;
  cancelled: boolean;
  publicKimdisUrl: string;
  officialPdfUrl: string;
  openState: "OPEN" | "CLOSED" | "CANCELLED" | "UNKNOWN";
  /** Official KIMDIS NUTS code (often NUTS 3); may be null when unclassified. */
  nutsCode?: string | null;
};

export type KimdisSearchFilters = {
  recordFamily: "REQ" | "PROC";
  page?: number;
  pageSize?: number;
  sort?: "date_desc" | "date_asc";
  title?: string;
  referenceNumber?: string;
  cpv?: string;
  organization?: string;
  contractType?: string;
  dateFrom?: string;
  dateTo?: string;
  searchAllHistory?: boolean;
  totalCostFrom?: number;
  totalCostTo?: number;
  requestKind?: "initial" | "approved" | "approval";
  procedureType?: string;
  finalSubmissionDateFrom?: string;
  finalSubmissionDateTo?: string;
  cancelDateFrom?: string;
  cancelDateTo?: string;
  signer?: string;
};

export type VaultFolder = {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  sortOrder: number;
  isSystem: boolean;
};

export type VaultDocumentStatus =
  | "VALID"
  | "EXPIRING_SOON"
  | "EXPIRED"
  | "NO_EXPIRY";

export type VaultDocument = {
  id: string;
  folderId: string;
  name: string;
  originalFilename?: string | null;
  documentType?: string | null;
  mimeType: string | null;
  fileSize?: number | null;
  status: VaultDocumentStatus;
  version: number;
  notes: string | null;
  source: "USER_UPLOAD" | "GEMI" | "GENERATED" | "IMPORTED";
  issueDate: string | null;
  expiryDate: string | null;
  noExpiry?: boolean;
  updatedAt?: string;
  createdAt: string;
  folder?: { id: string; name: string } | null;
};

export type OutreachDraft = {
  subject: string;
  body: string;
  documentTitle: string;
  unresolvedKeys: string[];
  manualEdited: boolean;
  status: "DRAFT" | "READY" | "SENT";
  contacts: {
    name: string | null;
    department: string | null;
    email: string | null;
    phone: string | null;
  };
  suggestedContacts: {
    email: string | null;
    phone: string | null;
    source: "stored" | "extracted" | "none";
  };
  company: {
    legalName: string | null;
    brandName: string | null;
    email: string | null;
    phone: string | null;
    contactName: string | null;
  };
};

export const DOCUMENT_TYPE_OPTIONS = [
  "Πιστοποιητικό ΓΕΜΗ",
  "Πιστοποιητικό Εκπροσώπησης",
  "Φορολογική Ενημερότητα",
  "Ασφαλιστική Ενημερότητα",
  "Υπεύθυνη Δήλωση",
  "ISO",
  "Άδεια",
  "Εταιρικό Προφίλ",
  "Βεβαίωση Εμπειρίας",
  "Άλλο",
] as const;

const parseResponseJson = (text: string): unknown => {
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    // Hono unmatched routes return plain text like "404 Not Found", which
    // JSON.parse misreads as the number 404 + trailing junk.
    return null;
  }
};

const errorMessageFromPayload = (data: unknown, status: number): string => {
  if (
    typeof data === "object" &&
    data &&
    "message" in data &&
    typeof (data as { message: unknown }).message === "string"
  ) {
    return (data as { message: string }).message;
  }
  if (status === 401 || status === 403) return "Δεν έχετε δικαίωμα πρόσβασης.";
  if (status === 404) return "Δεν βρέθηκε.";
  if (status === 429) return "Πάρα πολλά αιτήματα. Δοκιμάστε ξανά σε λίγο.";
  if (status >= 500) return "Προσωρινό σφάλμα διακομιστή. Δοκιμάστε ξανά.";
  return `Σφάλμα αιτήματος (${status})`;
};

const errorCodeFromPayload = (data: unknown): string | undefined => {
  if (
    typeof data === "object" &&
    data &&
    "code" in data &&
    typeof (data as { code: unknown }).code === "string"
  ) {
    return (data as { code: string }).code;
  }
  if (
    typeof data === "object" &&
    data &&
    "error" in data &&
    typeof (data as { error: unknown }).error === "string"
  ) {
    return (data as { error: string }).error;
  }
  return undefined;
};

const request = async <T>(
  path: string,
  init?: RequestInit & { organizationId?: string | null },
): Promise<T> => {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (init?.organizationId) {
    headers.set("X-Organization-Id", init.organizationId);
  }

  const response = await fetch(path, {
    ...init,
    headers,
    credentials: "include",
  });

  const text = await response.text();
  const data = parseResponseJson(text);

  if (!response.ok) {
    throw new SaasRequestError(
      errorMessageFromPayload(data, response.status),
      errorCodeFromPayload(data),
    );
  }

  return data as T;
};

export const saasApi = {
  me: () => request<SaasMeResponse>("/api/saas/me"),
  updateProfile: (name: string) =>
    request<{ user: SaasUser }>("/api/saas/me/profile", {
      method: "PATCH",
      body: JSON.stringify({ name }),
    }),
  deleteAccount: (input: { confirm: "DELETE"; password: string }) =>
    request<{
      data: {
        ok: true;
        userId: string;
        email: string;
        orgsDeleted: number;
        organizationIds: string[];
      };
    }>("/api/saas/me", {
      method: "DELETE",
      body: JSON.stringify(input),
    }),
  setTheme: (theme: ThemePreference) =>
    request<{ theme: ThemePreference }>("/api/saas/me/preferences", {
      method: "PUT",
      body: JSON.stringify({ theme }),
    }),
  acceptLegal: (input: {
    termsVersion: string;
    privacyVersion: string;
    source?: "signup" | "reaccept";
  }) =>
    request<{ legalAcceptance: LegalAcceptance }>("/api/saas/me/legal-acceptance", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  createOrganization: (name: string) =>
    request<{ organization: { id: string; name: string; slug: string } }>(
      "/api/saas/organizations",
      { method: "POST", body: JSON.stringify({ name }) },
    ),
  setActiveOrganization: (organizationId: string) =>
    request<{ organizationId: string }>("/api/saas/organizations/active", {
      method: "POST",
      body: JSON.stringify({ organizationId }),
    }),
  getTeam: (organizationId: string) =>
    request<{
      organization: { id: string; name: string; slug: string };
      role: "OWNER" | "ADMIN" | "MEMBER";
      seats: {
        includedSeats: number;
        extraSeats: number;
        seatLimit: number;
        selfServiceCap: number;
      };
      members: Array<{
        id: string;
        userId: string;
        role: "OWNER" | "ADMIN" | "MEMBER";
        createdAt: string;
        user: {
          id: string;
          name: string;
          email: string;
          image: string | null;
        };
      }>;
      invitations: Array<{
        id: string;
        email: string;
        role: "OWNER" | "ADMIN" | "MEMBER";
        status: string;
        expiresAt: string;
        createdAt: string;
      }>;
    }>("/api/saas/organizations/members", { organizationId }),
  inviteMember: (
    organizationId: string,
    body: { email: string; role?: "MEMBER" | "ADMIN" },
  ) =>
    request<{
      invitation: {
        id: string;
        email: string;
        role: string;
        status: string;
        expiresAt: string;
        createdAt: string;
      };
      emailSent: boolean;
      acceptUrl?: string;
    }>("/api/saas/organizations/invitations", {
      method: "POST",
      organizationId,
      body: JSON.stringify(body),
    }),
  cancelInvitation: (organizationId: string, invitationId: string) =>
    request<{ ok: true }>(
      `/api/saas/organizations/invitations/${encodeURIComponent(invitationId)}`,
      { method: "DELETE", organizationId },
    ),
  peekInvitation: (token: string) =>
    request<{
      invitation: {
        email: string;
        role: string;
        expiresAt: string;
        organization: { id: string; name: string; slug: string };
      };
    }>(
      `/api/saas/organizations/invitations/peek?token=${encodeURIComponent(token)}`,
    ),
  acceptInvitation: (token: string) =>
    request<{
      organization: { id: string; name: string; slug: string };
      role: string;
    }>("/api/saas/organizations/invitations/accept", {
      method: "POST",
      body: JSON.stringify({ token }),
    }),
  removeMember: (organizationId: string, memberUserId: string) =>
    request<{ ok: true }>(
      `/api/saas/organizations/members/${encodeURIComponent(memberUserId)}`,
      { method: "DELETE", organizationId },
    ),
  updateMemberRole: (
    organizationId: string,
    memberUserId: string,
    role: "MEMBER" | "ADMIN",
  ) =>
    request<{ member: { id: string; userId: string; role: string } }>(
      `/api/saas/organizations/members/${encodeURIComponent(memberUserId)}`,
      {
        method: "PATCH",
        organizationId,
        body: JSON.stringify({ role }),
      },
    ),
  attention: (
    organizationId: string,
    opts?: { limit?: number; unreadOnly?: boolean; light?: boolean },
  ) => {
    const params = new URLSearchParams();
    if (opts?.limit != null) params.set("limit", String(opts.limit));
    if (opts?.unreadOnly) params.set("unread", "1");
    if (opts?.light) params.set("light", "1");
    const qs = params.toString();
    return request<{ events: AttentionEvent[] }>(
      `/api/saas/attention${qs ? `?${qs}` : ""}`,
      { organizationId },
    );
  },
  billingCatalog: () =>
    request<BillingCatalogResponse>("/api/saas/billing/catalog"),
  billingStatus: (organizationId: string) =>
    request<BillingStatusResponse>("/api/saas/billing/status", {
      organizationId,
    }),
  billingCheckout: (
    organizationId: string,
    body: { plan: "basic" | "pro"; interval: BillingInterval; extraSeats?: number },
  ) =>
    request<{ url: string | null; mode: string; extraSeats?: number }>(
      "/api/saas/billing/checkout",
      {
        method: "POST",
        organizationId,
        body: JSON.stringify(body),
      },
    ),
  startProTrial: (organizationId: string) =>
    request<{
      ok: true;
      already: boolean;
      trialEndsAt: string | null;
      planKey: string;
    }>("/api/saas/billing/start-pro-trial", {
      method: "POST",
      organizationId,
    }),
  billingPortal: (organizationId: string, flow?: "cancel") =>
    request<{ url: string | null; alreadyCanceling?: boolean }>(
      "/api/saas/billing/portal",
      {
        method: "POST",
        organizationId,
        body: JSON.stringify(flow ? { flow } : {}),
      },
    ),
  getEntitlements: async (organizationId: string) => {
    try {
      return await request<SaasEntitlementsResponse>("/api/saas/entitlements", {
        organizationId,
      });
    } catch (err) {
      if (
        err instanceof SaasRequestError &&
        (err.message.startsWith("HTTP 404") ||
          err.message === "Δεν βρέθηκε." ||
          err.code === "not_found")
      ) {
        const { profiles } = await saasApi.listWatchProfiles(organizationId);
        return {
          entitlements: {
            maxActiveWatchProfiles: DEFAULT_MAX_ACTIVE_WATCH_PROFILES,
            maxActiveFollowedTenders: 20,
            storageBytes: 250_000_000,
            periodicScansPerDay: 1,
            manualProfileScansPerDay: 10,
            includedSeats: 1,
            maxSeatsSelfService: 1,
            advancedWatchProfileFilters: false,
            emailMode: "DIGEST" as const,
            deadlineRadar: false,
          },
          usage: {
            activeWatchProfiles: profiles.filter((p) => p.enabled).length,
            totalWatchProfiles: profiles.length,
            activeFollowedTenders: 0,
            members: 1,
          },
          scanAccess: {
            emailVerified: true,
            status: "trial" as const,
            planKey: "trial",
            plan: "TRIAL",
            trialEndsAt: null,
            limits: {
              maxActiveWatchProfiles: DEFAULT_MAX_ACTIVE_WATCH_PROFILES,
              maxActiveFollowedTenders: 20,
              storageBytes: 250_000_000,
              periodicScansPerDay: 1,
              manualProfileScansPerDay: 10,
              includedSeats: 1,
              maxSeatsSelfService: 1,
              advancedWatchProfileFilters: false,
              emailMode: "DIGEST" as const,
            },
            usage: { day: new Date().toISOString().slice(0, 10), periodic: 0, manual: 0 },
            seats: {
              includedSeats: 1,
              extraSeats: 0,
              seatLimit: 1,
              selfServiceCap: 1,
            },
            canManualKimdisSearch: true,
            canRunManualProfileScan: true,
            canRunPeriodicScan: true,
            blockCode: null,
          },
        } satisfies SaasEntitlementsResponse;
      }
      throw err;
    }
  },
  loadOverview: (organizationId: string, greetingName?: string | null) =>
    composeOverviewFromEndpoints(organizationId, greetingName),
  monitoringState: (organizationId: string) =>
    request<{ organizationTenders: MonitoringPipelineRow[] }>(
      "/api/saas/monitoring/state",
      { organizationId },
    ),
  getSettings: (organizationId: string) =>
    request<{ settings: OrgSettings; gemiConfigured: boolean }>(
      "/api/saas/settings",
      { organizationId },
    ),
  updateCompany: (organizationId: string, company: Partial<CompanyProfile>) =>
    request<{ settings: OrgSettings }>("/api/saas/settings/company", {
      method: "PATCH",
      organizationId,
      body: JSON.stringify(company),
    }),
  updateActivities: (
    organizationId: string,
    activities: OrganizationActivity[],
  ) =>
    request<{ settings: OrgSettings; watchSuggestions: WatchSuggestion }>(
      "/api/saas/settings/activities",
      {
        method: "PUT",
        organizationId,
        body: JSON.stringify({ activities }),
      },
    ),
  updateNotifications: (
    organizationId: string,
    notifications: NotificationPreferences,
  ) =>
    request<{ settings: OrgSettings }>("/api/saas/settings/notifications", {
      method: "PUT",
      organizationId,
      body: JSON.stringify(notifications),
    }),
  updateOnboarding: (
    organizationId: string,
    status: OnboardingStatus,
    step?: string,
  ) =>
    request<{ settings: OrgSettings }>("/api/saas/settings/onboarding", {
      method: "PUT",
      organizationId,
      body: JSON.stringify({ status, step }),
    }),
  gemiLookup: (
    organizationId: string,
    query: { afm?: string; gemiNumber?: string },
  ) =>
    request<
      | { status: "not_configured" }
      | { status: "unavailable"; message: string }
      | { status: "not_found" }
      | { status: "found"; companies: CompanyRegistryRecord[] }
    >("/api/saas/gemi/lookup", {
      method: "POST",
      organizationId,
      body: JSON.stringify(query),
    }),
  gemiConfirm: (organizationId: string, company: CompanyRegistryRecord) =>
    request<{ settings: OrgSettings; watchSuggestions: WatchSuggestion }>(
      "/api/saas/gemi/confirm",
      {
        method: "POST",
        organizationId,
        body: JSON.stringify({ company }),
      },
    ),
  searchKadCatalog: (organizationId: string, q: string) =>
    request<{
      activities: Array<{ code: string; description: string }>;
    }>(`/api/saas/gemi/activities?q=${encodeURIComponent(q)}`, {
      organizationId,
    }),
  watchSuggestions: (organizationId: string) =>
    request<{ suggestions: WatchSuggestion }>(
      "/api/saas/recommendations/watch",
      { organizationId },
    ),
  listWatchProfiles: (organizationId: string) =>
    request<{ profiles: WatchProfile[] }>("/api/saas/watch-profiles", {
      organizationId,
    }),
  getWatchProfile: (organizationId: string, profileId: string) =>
    request<{ profile: WatchProfile }>(`/api/saas/watch-profiles/${profileId}`, {
      organizationId,
    }),
  createWatchProfile: (organizationId: string, input: WatchProfileInput) =>
    request<{ profile: WatchProfile }>("/api/saas/watch-profiles", {
      method: "POST",
      organizationId,
      body: JSON.stringify(input),
    }),
  updateWatchProfile: (
    organizationId: string,
    profileId: string,
    input: WatchProfileInput,
  ) =>
    request<{ profile: WatchProfile }>(`/api/saas/watch-profiles/${profileId}`, {
      method: "PATCH",
      organizationId,
      body: JSON.stringify(input),
    }),
  setWatchProfileEnabled: (
    organizationId: string,
    profileId: string,
    enabled: boolean,
  ) =>
    request<{ profile: WatchProfile }>(
      `/api/saas/watch-profiles/${profileId}/enabled`,
      {
        method: "PATCH",
        organizationId,
        body: JSON.stringify({ enabled }),
      },
    ),
  deleteWatchProfile: (organizationId: string, profileId: string) =>
    request<{ deleted: boolean; id: string }>(
      `/api/saas/watch-profiles/${profileId}`,
      {
        method: "DELETE",
        organizationId,
      },
    ),
  scanWatchProfile: (
    organizationId: string,
    profileId: string,
    opts?: { force?: boolean },
  ) =>
    request<{ profile: WatchProfile }>(
      `/api/saas/watch-profiles/${profileId}/scan${opts?.force ? "?force=1" : ""}`,
      { method: "POST", organizationId },
    ),
  checkSimilarWatchProfiles: (
    organizationId: string,
    input: Partial<WatchProfileInput>,
  ) =>
    request<{ similar: WatchProfile[]; hasSimilar: boolean }>(
      "/api/saas/watch-profiles/check-similar",
      {
        method: "POST",
        organizationId,
        body: JSON.stringify(input),
      },
    ),
  listOpportunities: (
    organizationId: string,
    opts?: {
      limit?: number;
      tenderId?: string;
      sort?: "newest" | "oldest" | "score" | "deadline";
    },
  ) => {
    const params = new URLSearchParams();
    if (opts?.limit != null) params.set("limit", String(opts.limit));
    if (opts?.tenderId) params.set("tenderId", opts.tenderId);
    if (opts?.sort) params.set("sort", opts.sort);
    const qs = params.toString();
    return request<{
      opportunities: Opportunity[];
      total?: number;
      unfollowed?: number;
      unreadNewCount?: number;
      sort?: "newest" | "oldest" | "score" | "deadline";
    }>(`/api/saas/opportunities${qs ? `?${qs}` : ""}`, {
      organizationId,
    });
  },
  markOpportunitySeen: (organizationId: string, opportunityId: string) =>
    request<{ ok: true; updated: number }>(
      `/api/saas/opportunities/${opportunityId}/seen`,
      { method: "POST", organizationId },
    ),
  kimdisMeta: (organizationId: string) =>
    request<{
      contractTypes: Record<string, string>;
      procedureTypes: Record<string, string>;
      requestKinds: Array<{ id: string; label: string }>;
    }>("/api/saas/kimdis/meta", { organizationId }),
  kimdisSearch: (organizationId: string, filters: KimdisSearchFilters) =>
    request<{
      items: KimdisSearchItem[];
      page: number;
      totalElements: number;
      totalPages: number;
      last: boolean;
    }>("/api/saas/kimdis/search", {
      method: "POST",
      organizationId,
      body: JSON.stringify(filters),
    }),
  getKimdisRecord: (
    organizationId: string,
    recordType: "REQ" | "PROC",
    adam: string,
  ) =>
    request<{
      item: KimdisSearchItem;
      tender: { id: string; referenceNumber: string };
    }>(
      `/api/saas/kimdis/records/${recordType}/${encodeURIComponent(adam)}`,
      { organizationId },
    ),
  markAttentionRead: (organizationId: string, eventId: string) =>
    request<{ event: AttentionEvent }>(`/api/saas/attention/${eventId}/read`, {
      method: "POST",
      organizationId,
    }),
  markAllAttentionRead: (organizationId: string) =>
    request<{ updated: number }>("/api/saas/attention/read-all", {
      method: "POST",
      organizationId,
    }),
  followTender: (organizationId: string, tenderId: string) =>
    request<{ organizationTender: unknown }>(
      `/api/saas/tenders/${tenderId}/follow`,
      { method: "POST", organizationId },
    ),
  unfollowTender: (organizationId: string, tenderId: string) =>
    request<{ organizationTender: unknown }>(
      `/api/saas/tenders/${tenderId}/unfollow`,
      { method: "POST", organizationId },
    ),
  dismissTender: (
    organizationId: string,
    tenderId: string,
    reason: "EXPIRED" | "NOT_INTERESTED" = "EXPIRED",
  ) =>
    request<{ organizationTender: unknown }>(
      `/api/saas/tenders/${tenderId}/dismiss`,
      {
        method: "POST",
        organizationId,
        body: JSON.stringify({ reason }),
      },
    ),
  followKimdisItem: (organizationId: string, item: KimdisSearchItem) =>
    request<{ tender: { id: string; referenceNumber: string } }>(
      "/api/saas/kimdis/follow",
      {
        method: "POST",
        organizationId,
        body: JSON.stringify(item),
      },
    ),
  getTenderWorkflow: (organizationId: string, tenderId: string) =>
    request<{ workflow: TenderWorkflow }>(
      `/api/saas/tenders/${tenderId}/workflow`,
      { organizationId },
    ),
  getParticipationChecklist: (organizationId: string, tenderId: string) =>
    request<{ checklist: ParticipationChecklist }>(
      `/api/saas/tenders/${tenderId}/participation-checklist`,
      { organizationId },
    ),
  getPriceMemory: (organizationId: string, tenderId: string) =>
    request<{ memory: PriceMemory }>(
      `/api/saas/tenders/${tenderId}/price-memory`,
      { organizationId },
    ),
  getDiavgeiaLink: (organizationId: string, tenderId: string) =>
    request<{ diavgeia: DiavgeiaLink | null }>(
      `/api/saas/tenders/${tenderId}/diavgeia`,
      { organizationId },
    ),
  getSourcesStatus: (organizationId: string) =>
    request<{
      ted: { enabled: boolean; blocker: string | null; authRequired: boolean };
      diavgeia: {
        enabled: boolean;
        blocker: string | null;
        authRequired: boolean;
        notes: string[];
      };
    }>("/api/saas/sources/status", { organizationId }),
  searchTedNotices: (
    organizationId: string,
    params?: {
      q?: string;
      cpv?: string;
      authority?: string;
      dateFrom?: string;
      dateTo?: string;
      page?: number;
      limit?: number;
    },
  ) => {
    const query = new URLSearchParams();
    if (params?.q) query.set("q", params.q);
    if (params?.cpv) query.set("cpv", params.cpv);
    if (params?.authority) query.set("authority", params.authority);
    if (params?.dateFrom) query.set("dateFrom", params.dateFrom);
    if (params?.dateTo) query.set("dateTo", params.dateTo);
    if (params?.page != null) query.set("page", String(params.page));
    if (params?.limit != null) query.set("limit", String(params.limit));
    const suffix = query.toString() ? `?${query}` : "";
    return request<{
      notices: Array<{
        publicationNumber: string;
        title: string | null;
        buyerName: string | null;
        publicationDate: string | null;
        noticeType?: string | null;
        cpvs?: string[];
        deadline?: string | null;
        url: string;
        pdfUrl?: string | null;
        provenance: "ted";
      }>;
      totalNoticeCount: number | null;
      blocker: string | null;
    }>(`/api/saas/sources/ted/search${suffix}`, { organizationId });
  },
  followTedNotice: (
    organizationId: string,
    notice: {
      publicationNumber: string;
      title?: string | null;
      buyerName?: string | null;
      publicationDate?: string | null;
      noticeType?: string | null;
      cpvs?: string[];
      deadline?: string | null;
      url: string;
      pdfUrl?: string | null;
    },
  ) =>
    request<{
      tender: { id: string; referenceNumber: string };
      organizationTender: { id: string };
    }>("/api/saas/sources/ted/follow", {
      method: "POST",
      organizationId,
      body: JSON.stringify({ notice }),
    }),
  searchDiavgeiaDecisions: (
    organizationId: string,
    params: { term: string; page?: number; size?: number },
  ) => {
    const query = new URLSearchParams({ term: params.term });
    if (params.page != null) query.set("page", String(params.page));
    if (params.size != null) query.set("size", String(params.size));
    return request<{
      decisions: Array<{
        ada: string;
        subject: string | null;
        url: string;
        provenance: "diavgeia";
      }>;
      blocker: string | null;
    }>(`/api/saas/sources/diavgeia/search?${query}`, { organizationId });
  },

  listExpiringContracts: (organizationId: string) =>
    request<{
      count: number;
      items: ExpiringContractRow[];
      listAvailable: boolean;
    }>("/api/saas/expiring-contracts", { organizationId }),
  getIngestStatus: (organizationId: string) =>
    request<IngestStatus>("/api/saas/ingest/status", { organizationId }),
  confirmRelatedAct: (organizationId: string, linkId: string) =>
    request<{ relatedActLink: { id: string; confidence: string } }>(
      `/api/saas/related-acts/${linkId}/confirm`,
      { method: "POST", organizationId },
    ),
  dismissRelatedAct: (organizationId: string, linkId: string) =>
    request<{ relatedActLink: { id: string; confidence: string } }>(
      `/api/saas/related-acts/${linkId}/dismiss`,
      { method: "POST", organizationId },
    ),
  recordOutreach: (
    organizationId: string,
    tenderId: string,
    input: {
      sentAt?: string;
      method?: string | null;
      recipient?: string | null;
      subject?: string | null;
      body?: string | null;
      notes?: string | null;
      externalReference?: string | null;
      documentIds?: string[];
    },
  ) =>
    request<{ organizationTender: unknown }>(
      `/api/saas/tenders/${tenderId}/outreach`,
      {
        method: "POST",
        organizationId,
        body: JSON.stringify(input),
      },
    ),
  getOutreachDraft: (organizationId: string, tenderId: string) =>
    request<{ draft: OutreachDraft }>(
      `/api/saas/tenders/${tenderId}/outreach-draft`,
      { organizationId },
    ),
  saveOutreachDraft: (
    organizationId: string,
    tenderId: string,
    input: {
      subject?: string | null;
      body?: string | null;
      manualEdited?: boolean;
      regenerate?: boolean;
      contacts?: {
        name?: string | null;
        department?: string | null;
        email?: string | null;
        phone?: string | null;
      };
    },
  ) =>
    request<{ draft: OutreachDraft }>(
      `/api/saas/tenders/${tenderId}/outreach-draft`,
      {
        method: "PUT",
        organizationId,
        body: JSON.stringify(input),
      },
    ),
  generateCompanyProfile: (organizationId: string) =>
    request<{
      document: VaultDocument;
      created: boolean;
      name: string;
    }>("/api/saas/vault/company-profile/generate", {
      method: "POST",
      organizationId,
      body: JSON.stringify({}),
    }),
  startPreparation: (organizationId: string, tenderId: string) =>
    request<{ organizationTender: unknown }>(
      `/api/saas/tenders/${tenderId}/prepare`,
      { method: "POST", organizationId },
    ),
  listSubmissions: (organizationId: string) =>
    request<{ submissions: FormalSubmissionRow[] }>("/api/saas/submissions", {
      organizationId,
    }),
  recordSubmission: (
    organizationId: string,
    tenderId: string,
    input: {
      submittedAt?: string;
      submissionMethod: string;
      recipient?: string | null;
      subject?: string | null;
      amountWithoutVat?: number | null;
      amountWithVat?: number | null;
      externalReference?: string | null;
      notes?: string | null;
      documentIds?: string[];
    },
  ) =>
    request<{ submission: unknown; organizationTender: unknown }>(
      `/api/saas/tenders/${tenderId}/submissions`,
      {
        method: "POST",
        organizationId,
        body: JSON.stringify(input),
      },
    ),
  confirmSubmissionResult: (
    organizationId: string,
    submissionId: string,
    input: { result: "WON" | "LOST"; notes?: string | null },
  ) =>
    request<{ submission: FormalSubmissionRow; organizationTender: unknown }>(
      `/api/saas/submissions/${submissionId}/result`,
      {
        method: "PATCH",
        organizationId,
        body: JSON.stringify(input),
      },
    ),
  tenderWorkspace: (
    organizationId: string,
    tenderId: string,
    opts?: { create?: boolean },
  ) =>
    request<TenderWorkspaceResponse>(
      `/api/saas/tenders/${tenderId}/workspace${opts?.create ? "?create=1" : ""}`,
      { organizationId },
    ),
  addWorkspaceDocuments: (
    organizationId: string,
    tenderId: string,
    input: { documentIds: string[]; section?: string | null },
  ) =>
    request<TenderWorkspaceResponse>(
      `/api/saas/tenders/${tenderId}/workspace/documents`,
      {
        method: "POST",
        organizationId,
        body: JSON.stringify(input),
      },
    ),
  removeWorkspaceDocument: (
    organizationId: string,
    tenderId: string,
    refId: string,
  ) =>
    request<TenderWorkspaceResponse>(
      `/api/saas/tenders/${tenderId}/workspace/documents/${refId}`,
      { method: "DELETE", organizationId },
    ),
  vaultFolders: (organizationId: string) =>
    request<{ folders: VaultFolder[] }>("/api/saas/vault/folders", {
      organizationId,
    }),
  createVaultFolder: (
    organizationId: string,
    input: { name: string; parentId?: string | null },
  ) =>
    request<{ folder: VaultFolder }>("/api/saas/vault/folders", {
      method: "POST",
      organizationId,
      body: JSON.stringify(input),
    }),
  vaultDocuments: (
    organizationId: string,
    opts?: { folderId?: string; q?: string },
  ) => {
    const params = new URLSearchParams();
    if (opts?.folderId) params.set("folderId", opts.folderId);
    if (opts?.q) params.set("q", opts.q);
    const qs = params.toString();
    return request<{ documents: VaultDocument[] }>(
      `/api/saas/vault/documents${qs ? `?${qs}` : ""}`,
      { organizationId },
    );
  },
  uploadVaultDocument: async (
    organizationId: string,
    input: {
      file: File;
      folderId: string;
      name: string;
      documentType?: string;
      notes?: string;
      issueDate?: string;
      expiryDate?: string;
      noExpiry?: boolean;
    },
  ) => {
    const form = new FormData();
    form.set("file", input.file);
    form.set("folderId", input.folderId);
    form.set("name", input.name);
    if (input.documentType) form.set("documentType", input.documentType);
    if (input.notes) form.set("notes", input.notes);
    if (input.issueDate) form.set("issueDate", input.issueDate);
    if (input.expiryDate) form.set("expiryDate", input.expiryDate);
    form.set("noExpiry", input.noExpiry === false ? "false" : "true");

    const response = await fetch("/api/saas/vault/documents/upload", {
      method: "POST",
      headers: { "X-Organization-Id": organizationId },
      credentials: "include",
      body: form,
    });
    const data = (await response.json()) as {
      document?: VaultDocument;
      message?: string;
    };
    if (!response.ok) {
      throw new Error(
        data.message ||
          (response.status >= 500
            ? "Προσωρινό σφάλμα διακομιστή. Δοκιμάστε ξανά."
            : "Αποτυχία μεταφόρτωσης."),
      );
    }
    return data as { document: VaultDocument };
  },
  uploadVaultDocumentVersion: async (
    organizationId: string,
    documentId: string,
    file: File,
  ) => {
    const form = new FormData();
    form.set("file", file);
    const response = await fetch(
      `/api/saas/vault/documents/${documentId}/versions`,
      {
        method: "POST",
        headers: { "X-Organization-Id": organizationId },
        credentials: "include",
        body: form,
      },
    );
    const data = (await response.json()) as {
      document?: VaultDocument;
      message?: string;
    };
    if (!response.ok) {
      throw new Error(
        data.message ||
          (response.status >= 500
            ? "Προσωρινό σφάλμα διακομιστή. Δοκιμάστε ξανά."
            : "Αποτυχία νέας έκδοσης."),
      );
    }
    return data as { document: VaultDocument };
  },
  updateVaultDocument: (
    organizationId: string,
    documentId: string,
    input: {
      name?: string;
      folderId?: string;
      documentType?: string | null;
      notes?: string | null;
      issueDate?: string | null;
      expiryDate?: string | null;
      noExpiry?: boolean;
    },
  ) =>
    request<{ document: VaultDocument }>(
      `/api/saas/vault/documents/${documentId}`,
      {
        method: "PATCH",
        organizationId,
        body: JSON.stringify(input),
      },
    ),
  deleteVaultDocument: (organizationId: string, documentId: string) =>
    request<{ deleted: boolean }>(`/api/saas/vault/documents/${documentId}`, {
      method: "DELETE",
      organizationId,
    }),
  downloadVaultDocumentUrl: (documentId: string, opts?: { inline?: boolean }) =>
    `/api/saas/vault/documents/${documentId}/download${opts?.inline ? "?inline=1" : ""}`,
};
