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
  events: {
    newOpportunity: boolean;
    relatedActOnFollowed: boolean;
    postSubmissionUpdate: boolean;
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
  source?: "MANUAL" | "SAVED_FROM_SEARCH" | "SETUP_RECOMMENDATION";
  skipSimilarCheck?: boolean;
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

export type SaasMeResponse = {
  userId: string;
  user: SaasUser | null;
  theme: ThemePreference;
  gemiConfigured: boolean;
  activeOrganizationId: string | null;
  organizations: SaasOrganization[];
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
  } | null;
  organizationTender?: {
    id: string;
    tender?: {
      id: string;
      referenceNumber: string;
      title: string | null;
      recordType?: string;
    } | null;
  } | null;
};

export type SaasEntitlementsResponse = {
  entitlements: { maxActiveWatchProfiles: number };
  usage: { activeWatchProfiles: number; totalWatchProfiles: number };
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
    saasApi.attention(organizationId),
    saasApi.monitoringState(organizationId),
    saasApi.listOpportunities(organizationId),
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

  const unreadNewOpportunity = attentionRes.events.filter(
    (event) =>
      !event.readAt &&
      (event.type === "NEW_OPPORTUNITY" || event.type === "OPPORTUNITY_DIGEST"),
  ).length;

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
      newOpportunities:
        unreadNewOpportunity > 0 ? unreadNewOpportunity : opportunitiesRes.opportunities.length,
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
    opportunities: opportunitiesRes.opportunities.slice(0, 5),
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
  return `HTTP ${status}`;
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
  setTheme: (theme: ThemePreference) =>
    request<{ theme: ThemePreference }>("/api/saas/me/preferences", {
      method: "PUT",
      body: JSON.stringify({ theme }),
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
  attention: (organizationId: string) =>
    request<{ events: AttentionEvent[] }>("/api/saas/attention", {
      organizationId,
    }),
  getEntitlements: async (organizationId: string) => {
    try {
      return await request<SaasEntitlementsResponse>("/api/saas/entitlements", {
        organizationId,
      });
    } catch (err) {
      if (err instanceof SaasRequestError && err.message.startsWith("HTTP 404")) {
        const { profiles } = await saasApi.listWatchProfiles(organizationId);
        return {
          entitlements: { maxActiveWatchProfiles: DEFAULT_MAX_ACTIVE_WATCH_PROFILES },
          usage: {
            activeWatchProfiles: profiles.filter((p) => p.enabled).length,
            totalWatchProfiles: profiles.length,
          },
        };
      }
      throw err;
    }
  },
  getOverview: async (organizationId: string) => {
    const headers = new Headers({ "X-Organization-Id": organizationId });
    const response = await fetch("/api/saas/overview", {
      headers,
      credentials: "include",
    });
    if (response.status === 404 || response.status === 501) {
      return null;
    }
    const text = await response.text();
    const data = parseResponseJson(text);
    if (!response.ok) {
      throw new SaasRequestError(
        errorMessageFromPayload(data, response.status),
        errorCodeFromPayload(data),
      );
    }
    return (data as { overview: SaasOverview }).overview;
  },
  loadOverview: async (organizationId: string, greetingName?: string | null) => {
    const fromApi = await saasApi.getOverview(organizationId);
    if (fromApi) {
      return {
        ...fromApi,
        workflowInsights: fromApi.workflowInsights ?? {
          waitingForProc: 0,
          newRelatedProc: 0,
          submissionWithAward: 0,
        },
        nextActions: fromApi.nextActions ?? [],
      };
    }
    return composeOverviewFromEndpoints(organizationId, greetingName);
  },
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
  scanWatchProfile: (organizationId: string, profileId: string) =>
    request<{ profile: WatchProfile }>(
      `/api/saas/watch-profiles/${profileId}/scan`,
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
  listOpportunities: (organizationId: string) =>
    request<{ opportunities: Opportunity[] }>("/api/saas/opportunities", {
      organizationId,
    }),
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
  recordOutreach: (
    organizationId: string,
    tenderId: string,
    input: {
      sentAt?: string;
      method?: string | null;
      recipient?: string | null;
      subject?: string | null;
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
      throw new Error(data.message || `HTTP ${response.status}`);
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
      throw new Error(data.message || `HTTP ${response.status}`);
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
