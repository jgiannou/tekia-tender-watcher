export type ConnectionConfig = {
  apiUrl: string;
  token: string;
  pollSeconds: number;
};

export type PipelineHealthSummary = {
  outboxPending: number;
  outboxFailed: number;
  outboxLagMs: number | null;
  ingestFresh: boolean;
  ingestSuccessAgeMs: number | null;
  emailFailed24h: number;
  alertCount: number;
  alertLevels: { error: number; warn: number; info: number };
};

export type OpsStats = {
  generatedAt: string;
  users: number;
  organizations: number;
  memberships: number;
  usersLast7d?: number;
  usersLast24h?: number;
  orgsLast7d?: number;
  unverifiedUsers?: number;
  byPlan: {
    free?: number;
    trial: number;
    basic: number;
    pro: number;
  };
  byBillingStatus: {
    trialing: number;
    active: number;
    past_due: number;
    canceled: number;
    incomplete: number;
  };
  payingOrgs: number;
  payingUsers: number;
  logs: {
    bufferedLogs: number;
    bufferedRequests: number;
    errorsInBuffer: number;
    warnsInBuffer: number;
    http5xxInBuffer: number;
    http4xxInBuffer: number;
  };
  pipeline?: PipelineHealthSummary | null;
};

export type PipelineMetrics = {
  generatedAt: string;
  alerts: Array<{
    level: "info" | "warn" | "error";
    code: string;
    messageEl: string;
  }>;
  outbox: {
    process: {
      enqueued: number;
      claimed: number;
      succeeded: number;
      failed: number;
      retried: number;
      cancelled: number;
      lastLagMs: number | null;
    };
    byStatus: Record<string, number>;
    byType: Record<string, number>;
    pending: number;
    running: number;
    failed: number;
    succeeded: number;
    cancelled: number;
    oldestPendingAgeMs: number | null;
    stuckRunning: number;
    dueNow: number;
    recentFailed: Array<{
      id: string;
      type: string;
      attempts: number;
      lastError: string | null;
      updatedAt: string;
    }>;
  };
  ingest: {
    lastSuccessAt: string | null;
    lastError: string | null;
    lastStartedAt: string | null;
    fresh: boolean;
    successAgeMs: number | null;
    completeness: { pageBudgetExhausted: boolean; noteEl: string } | null;
  };
  email: {
    last24h: Record<string, number>;
    last7d: Record<string, number>;
    sent24h: number;
    failed24h: number;
    pending24h: number;
    skipped24h: number;
  };
  storage: {
    root: string;
    totalBytesUsed: number;
    documentCount: number;
    orgsWithVault: number;
    noteEl: string;
  };
  pdf: {
    process: {
      count: number;
      avgMs: number | null;
      maxMs: number | null;
      lastMs: number | null;
      byStatus: Record<string, number>;
    };
    tendersByPdfStatus: Record<string, number>;
  };
};

export type LogEntry = {
  id: string;
  ts: string;
  level: "info" | "warn" | "error" | "debug";
  message: string;
  meta?: Record<string, unknown>;
};

export type RequestEntry = {
  id: string;
  ts: string;
  requestId: string;
  method: string;
  path: string;
  status: number;
  ms: number;
  responseBody?: string;
  contentType?: string;
};

export type ProductEventEntry = {
  id: string;
  type: string;
  userId: string | null;
  userEmail: string | null;
  userName: string | null;
  organizationId: string | null;
  organizationName: string | null;
  sessionId: string | null;
  requestId: string | null;
  entityType: string | null;
  entityId: string | null;
  metadata: unknown;
  createdAt: string;
};

export type TrialActivityEntry = {
  timestamp: string;
  event: string;
  entityId?: string;
  entityType?: string;
  sessionId?: string;
  requestId?: string;
};

export type TrialActivityUser = {
  id: string;
  email: string | null;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  organizationId: string | null;
  organizationName: string | null;
  deleted?: boolean;
};

export type TrialActivityPage = {
  user: TrialActivityUser;
  events: TrialActivityEntry[];
};

export type HealthOps = {
  ok: boolean;
  service: string;
  db: boolean;
  slackConfigured: boolean;
  generatedAt: string;
  bufferedLogs: number;
  bufferedRequests: number;
  errorsInBuffer: number;
  warnsInBuffer: number;
  http5xxInBuffer: number;
  http4xxInBuffer: number;
  pipeline?: PipelineHealthSummary | null;
};

export type OpsUserListItem = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  accountType: string;
  contractorName: string | null;
  mustChangePassword: boolean;
  opsPassword: string;
  opsPasswordAt: string | null;
  createdAt: string;
  updatedAt: string;
  memberships: Array<{
    role: string;
    organization: {
      id: string;
      name: string;
      plan: string;
      billingStatus: string;
    };
  }>;
};

export type OpsOrgListItem = {
  id: string;
  name: string;
  plan: string;
  billingStatus: string;
  seatLimit: number | null;
  trialEndsAt: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripePriceId: string | null;
  createdAt: string;
  updatedAt: string;
  _count: {
    memberships: number;
    tenders: number;
    budgets: number;
    projects: number;
    contractors: number;
  };
  memberships: Array<{
    role: string;
    user: {
      id: string;
      email: string;
      firstName: string;
      lastName: string;
      accountType: string;
    };
  }>;
};

export type ListPage<T> = {
  items: T[];
  total: number;
  limit: number;
  offset: number;
};

export type UsersPage = ListPage<OpsUserListItem> & {
  opsPasswordEnabled?: boolean;
};

export type DeleteUserResult = {
  ok: true;
  userId: string;
  email: string;
  orgsDeleted: number;
};

const STORAGE_KEY = "arc-tenders-ops-desk-config-v2";

export type EnvId = "prod" | "local";

export type EnvPreset = {
  id: EnvId;
  label: string;
  apiUrl: string;
  appUrl: string;
};

export const ENV_PRESETS: EnvPreset[] = [
  {
    id: "prod",
    label: "Prod",
    apiUrl: "http://gfjv662rudc5mhwwyvj2zcvh.169.58.65.199.sslip.io",
    appUrl: "https://arc-tenders.tekia.gr",
  },
  {
    id: "local",
    label: "Local",
    apiUrl: "http://127.0.0.1:3000",
    appUrl: "http://127.0.0.1:5174",
  },
];

export const apiUrlForEnv = (env: EnvId): string =>
  (ENV_PRESETS.find((p) => p.id === env) ?? ENV_PRESETS[1]).apiUrl;

export type ProfilesStore = {
  version: 2;
  active: EnvId;
  profiles: Record<EnvId, ConnectionConfig>;
};

const clampPoll = (n: unknown) => Math.min(120, Math.max(5, Number(n) || 15));

const normalizeConfig = (env: EnvId, partial?: Partial<ConnectionConfig>): ConnectionConfig => ({
  apiUrl: apiUrlForEnv(env),
  token: String(partial?.token || ""),
  pollSeconds: clampPoll(partial?.pollSeconds),
});

export const defaultConfig = (env: EnvId = "local"): ConnectionConfig =>
  normalizeConfig(env, { token: "", pollSeconds: 15 });

const defaultProfiles = (): ProfilesStore => ({
  version: 2,
  active: "local",
  profiles: {
    prod: defaultConfig("prod"),
    local: defaultConfig("local"),
  },
});

const parseStore = (raw: unknown): ProfilesStore | null => {
  if (!raw || typeof raw !== "object") return null;
  const parsed = raw as Partial<ProfilesStore>;
  const active: EnvId = parsed.active === "prod" ? "prod" : "local";
  return {
    version: 2,
    active,
    profiles: {
      prod: normalizeConfig("prod", parsed.profiles?.prod),
      local: normalizeConfig("local", parsed.profiles?.local),
    },
  };
};

export const loadProfiles = (): ProfilesStore => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = parseStore(JSON.parse(raw) as unknown);
      if (parsed) return parsed;
    }
  } catch {
    /* fall through */
  }
  return defaultProfiles();
};

export const saveProfiles = (store: ProfilesStore) => {
  const next: ProfilesStore = {
    version: 2,
    active: store.active,
    profiles: {
      prod: normalizeConfig("prod", store.profiles.prod),
      local: normalizeConfig("local", store.profiles.local),
    },
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
};

export const loadConfig = (): ConnectionConfig => {
  const store = loadProfiles();
  return store.profiles[store.active];
};

export const loadActiveEnv = (): EnvId => loadProfiles().active;

export const saveConfig = (cfg: ConnectionConfig, env?: EnvId) => {
  const store = loadProfiles();
  const active = env ?? store.active;
  store.active = active;
  store.profiles[active] = normalizeConfig(active, cfg);
  saveProfiles(store);
};

export const switchEnv = (env: EnvId): ConnectionConfig => {
  const store = loadProfiles();
  store.active = env;
  store.profiles[env] = normalizeConfig(env, store.profiles[env]);
  saveProfiles(store);
  return store.profiles[env];
};

const authHeaders = (token: string) => ({
  Authorization: `Bearer ${token}`,
  "X-Admin-Token": token,
  Accept: "application/json",
});

declare global {
  interface Window {
    arcTendersOps?: {
      platform?: string;
      isElectron: boolean;
      fetch?: (payload: {
        url: string;
        method?: string;
        headers?: Record<string, string>;
        body?: string;
      }) => Promise<{ ok?: boolean; status: number; bodyText?: string; body?: string; error?: string | null }>;
      openExternal?: (url: string) => Promise<void | { ok: boolean; error?: string }>;
      writePulseCache?: (snapshot: {
        generatedAt: number;
        users: number;
        organizations: number;
        paying: number;
        errors: number;
        healthy: boolean;
        statusText: string;
        apiUrl?: string;
        adminToken?: string;
      }) => Promise<{ ok: boolean; path?: string; error?: string }>;
      syncPulseWidget?: (payload: {
        apiUrl: string;
        adminToken: string;
      }) => Promise<{ ok: boolean; error?: string }>;
    };
  }
}

type OpsResponse = {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
};

const parseBody = (bodyText: string): unknown => {
  if (!bodyText) return {};
  try {
    return JSON.parse(bodyText);
  } catch {
    return { error: bodyText };
  }
};

const opsRequest = async (
  cfg: ConnectionConfig,
  pathAndQuery: string,
  init?: { method?: string; body?: string },
): Promise<OpsResponse> => {
  const method = (init?.method || "GET").toUpperCase();
  const headers: Record<string, string> = {
    ...authHeaders(cfg.token),
    ...(init?.body ? { "Content-Type": "application/json" } : {}),
  };
  const absoluteUrl = `${cfg.apiUrl.replace(/\/$/, "")}${pathAndQuery.startsWith("/") ? "" : "/"}${pathAndQuery}`;

  if (window.arcTendersOps?.fetch) {
    const result = await window.arcTendersOps.fetch({
      url: absoluteUrl,
      method,
      headers,
      body: init?.body,
    });
    const bodyText = result.bodyText ?? result.body ?? "";
    if (result.error && result.status === 0) {
      throw new Error(result.error);
    }
    const json = parseBody(bodyText) as { error?: string };
    return {
      ok: result.ok ?? (result.status >= 200 && result.status < 300),
      status: result.status,
      json: async () => json,
    };
  }

  const res = await fetch(absoluteUrl, { method, headers, body: init?.body });
  return {
    ok: res.ok,
    status: res.status,
    json: async () => parseBody(await res.text()),
  };
};

const parseJson = async <T>(res: OpsResponse): Promise<T> => {
  const body = (await res.json()) as { error?: string; data?: T };
  if (!res.ok) {
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return body.data as T;
};

export const fetchStats = async (cfg: ConnectionConfig) => parseJson<OpsStats>(await opsRequest(cfg, "/admin/ops/stats"));

export const fetchLogs = async (
  cfg: ConnectionConfig,
  opts?: { level?: string; limit?: number; q?: string },
) => {
  const params = new URLSearchParams({
    level: opts?.level || "error_warn",
    limit: String(opts?.limit || 80),
  });
  if (opts?.q?.trim()) params.set("q", opts.q.trim());
  return parseJson<LogEntry[]>(await opsRequest(cfg, `/admin/ops/logs?${params}`));
};

export const fetchRequests = async (
  cfg: ConnectionConfig,
  opts?: { errors?: boolean; limit?: number },
) => {
  const params = new URLSearchParams({ limit: String(opts?.limit || 80) });
  if (opts?.errors) params.set("errors", "1");
  return parseJson<RequestEntry[]>(await opsRequest(cfg, `/admin/ops/requests?${params}`));
};

export const fetchHealthOps = async (cfg: ConnectionConfig) =>
  parseJson<HealthOps>(await opsRequest(cfg, "/admin/ops/health"));

export const fetchPipeline = async (cfg: ConnectionConfig) =>
  parseJson<PipelineMetrics>(await opsRequest(cfg, "/admin/ops/pipeline"));

export const notifySlackStats = async (cfg: ConnectionConfig) => {
  const res = await opsRequest(cfg, "/admin/ops/stats/notify", { method: "POST", body: "{}" });
  const body = (await res.json()) as OpsStats & { slackSent?: boolean; data?: OpsStats & { slackSent: boolean }; text?: string };
  if (!res.ok) throw new Error((body as { error?: string }).error || `HTTP ${res.status}`);
  if (body.data) return body.data;
  return body as OpsStats & { slackSent: boolean; text?: string };
};

export type ImpersonateResult = {
  openUrl: string;
  expiresIn?: string;
  credentials?: { email: string; password: string };
  note?: string;
};

export const impersonateUser = async (
  cfg: ConnectionConfig,
  body: { userId?: string; email?: string; rotatePassword?: boolean },
) => parseJson<ImpersonateResult>(await opsRequest(cfg, "/admin/ops/impersonate", { method: "POST", body: JSON.stringify(body) }));

export type IssuePasswordResult = {
  credentials: { email: string; password: string };
  opsPasswordEnabled: boolean;
  note?: string;
};

export const issueUserPassword = async (
  cfg: ConnectionConfig,
  userId: string,
  body?: { password?: string },
) =>
  parseJson<IssuePasswordResult>(
    await opsRequest(cfg, `/admin/ops/users/${userId}/password`, {
      method: "POST",
      body: JSON.stringify(body ?? {}),
    }),
  );

export const createSandbox = async (
  cfg: ConnectionConfig,
  body: {
    planKey?: "free" | "trial" | "basic" | "pro";
    role?: "owner" | "admin" | "member";
    orgName?: string;
  },
) => {
  const roleMap = { owner: "OWNER", admin: "ADMIN", member: "MEMBER" } as const;
  return parseJson<ImpersonateResult>(
    await opsRequest(cfg, "/admin/ops/sandbox", {
      method: "POST",
      body: JSON.stringify({
        planKey: body.planKey ?? "trial",
        role: body.role ? roleMap[body.role] : "OWNER",
        orgName: body.orgName,
      }),
    }),
  );
};

export const patchOrganizationPlan = async (
  cfg: ConnectionConfig,
  id: string,
  body: { planKey: "free" | "trial" | "basic" | "pro" },
) =>
  parseJson<Record<string, unknown>>(
    await opsRequest(cfg, `/admin/ops/organizations/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  );

export const fetchUsers = async (
  cfg: ConnectionConfig,
  opts?: { q?: string; limit?: number; offset?: number },
) => {
  const params = new URLSearchParams({
    limit: String(opts?.limit || 50),
    offset: String(opts?.offset || 0),
  });
  if (opts?.q?.trim()) params.set("q", opts.q.trim());
  return parseJson<UsersPage>(await opsRequest(cfg, `/admin/ops/users?${params}`));
};

export const fetchUserDetail = async (cfg: ConnectionConfig, id: string) =>
  parseJson<Record<string, unknown>>(await opsRequest(cfg, `/admin/ops/users/${id}`));

export const deleteUser = async (cfg: ConnectionConfig, id: string) =>
  parseJson<DeleteUserResult>(
    await opsRequest(cfg, `/admin/ops/users/${id}`, {
      method: "DELETE",
      body: JSON.stringify({ confirm: "DELETE" }),
    }),
  );

export const fetchOrganizations = async (
  cfg: ConnectionConfig,
  opts?: { q?: string; plan?: string; paying?: boolean; limit?: number; offset?: number },
) => {
  const params = new URLSearchParams({
    limit: String(opts?.limit || 50),
    offset: String(opts?.offset || 0),
  });
  if (opts?.q?.trim()) params.set("q", opts.q.trim());
  if (opts?.plan) params.set("plan", opts.plan);
  if (opts?.paying) params.set("paying", "1");
  return parseJson<ListPage<OpsOrgListItem>>(await opsRequest(cfg, `/admin/ops/organizations?${params}`));
};

export const fetchOrganizationDetail = async (cfg: ConnectionConfig, id: string) =>
  parseJson<Record<string, unknown>>(await opsRequest(cfg, `/admin/ops/organizations/${id}`));

export const fetchProductEvents = async (
  cfg: ConnectionConfig,
  opts?: { limit?: number; type?: string },
) => {
  const params = new URLSearchParams({ limit: String(opts?.limit || 100) });
  if (opts?.type?.trim()) params.set("type", opts.type.trim());
  return parseJson<ProductEventEntry[]>(await opsRequest(cfg, `/admin/ops/product-events?${params}`));
};

export const fetchTrialActivity = async (
  cfg: ConnectionConfig,
  userId: string,
  opts?: { limit?: number },
): Promise<TrialActivityPage> => {
  const params = new URLSearchParams({ limit: String(opts?.limit || 200) });
  const res = await opsRequest(cfg, `/admin/ops/trials/${encodeURIComponent(userId)}/activity?${params}`);
  const body = (await res.json()) as {
    error?: string;
    data?: TrialActivityEntry[] | TrialActivityPage;
    user?: TrialActivityUser;
  };
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  if (Array.isArray(body.data)) {
    return {
      user:
        body.user ?? {
          id: userId,
          email: null,
          name: null,
          firstName: null,
          lastName: null,
          organizationId: null,
          organizationName: null,
        },
      events: body.data,
    };
  }
  return {
    user: body.user ?? {
      id: userId,
      email: null,
      name: null,
      firstName: null,
      lastName: null,
      organizationId: null,
      organizationName: null,
    },
    events: [],
  };
};

export const grantPlan = async (
  cfg: ConnectionConfig,
  input: {
    email: string;
    planKey: "free" | "trial" | "basic" | "pro";
    organizationId?: string;
    password?: string;
  },
) => {
  const res = await opsRequest(cfg, "/admin/grant-plan", {
    method: "POST",
    body: JSON.stringify({
      email: input.email.trim(),
      planKey: input.planKey,
      organizationId: input.organizationId?.trim() || undefined,
      verifyEmail: true,
      password: input.password?.trim() || undefined,
    }),
  });
  const body = (await res.json()) as { error?: string; ok?: boolean };
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  return body;
};

// ---------------------------------------------------------------------------
// ARC_PRO_LAUNCH_30 promotions admin
// ---------------------------------------------------------------------------

export type PromoAdminSummary = {
  promotionKey: string;
  promotionEnabled: boolean;
  capacity: number;
  consumedSlots: number;
  remainingSlots: number;
  capacityCeiling: number;
  activeCount: number;
  expiredCount: number;
  revokedCount: number;
  supersededCount: number;
  historicalActivations: number;
  lowSlotsWarning: boolean;
  exhausted: boolean;
};

export type PromoRedemptionRow = {
  id: string;
  organizationId: string;
  organizationName: string;
  ownerEmail: string | null;
  ownerName: string | null;
  status: string;
  source: string;
  activatedAt: string;
  expiresAt: string;
  daysRemaining: number;
  slotConsumed: boolean;
  slotRestoredAt: string | null;
  revokedAt: string | null;
  planKey: string;
  hasPaidStripe: boolean;
};

export type PromoAuditRow = {
  id: string;
  actionType: string;
  organizationId: string | null;
  redemptionId: string | null;
  previousCapacity: number | null;
  newCapacity: number | null;
  previousStatus: string | null;
  newStatus: string | null;
  reason: string;
  performedBy: string;
  idempotencyKey: string | null;
  createdAt: string;
};

export const fetchPromoSummary = async (cfg: ConnectionConfig) => {
  const res = await opsRequest(
    cfg,
    "/admin/ops/promotions/arc-pro-launch-30/summary",
  );
  const body = (await res.json()) as {
    error?: string;
    data?: PromoAdminSummary;
    syncedAt?: string;
  };
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  return { summary: body.data as PromoAdminSummary, syncedAt: body.syncedAt ?? null };
};

export const fetchPromoRedemptions = async (
  cfg: ConnectionConfig,
  opts?: { status?: string; q?: string; limit?: number; offset?: number },
) => {
  const params = new URLSearchParams();
  if (opts?.status) params.set("status", opts.status);
  if (opts?.q) params.set("q", opts.q);
  if (opts?.limit) params.set("limit", String(opts.limit));
  if (opts?.offset) params.set("offset", String(opts.offset));
  const qs = params.toString();
  return parseJson<{
    total: number;
    limit: number;
    offset: number;
    items: PromoRedemptionRow[];
  }>(
    await opsRequest(
      cfg,
      `/admin/ops/promotions/arc-pro-launch-30/redemptions${qs ? `?${qs}` : ""}`,
    ),
  );
};

export const fetchPromoAudit = async (
  cfg: ConnectionConfig,
  opts?: { limit?: number; offset?: number },
) => {
  const params = new URLSearchParams();
  if (opts?.limit) params.set("limit", String(opts.limit));
  if (opts?.offset) params.set("offset", String(opts.offset));
  const qs = params.toString();
  return parseJson<{
    total: number;
    limit: number;
    offset: number;
    items: PromoAuditRow[];
  }>(
    await opsRequest(
      cfg,
      `/admin/ops/promotions/arc-pro-launch-30/audit${qs ? `?${qs}` : ""}`,
    ),
  );
};

export const grantPromo = async (
  cfg: ConnectionConfig,
  input: {
    organizationId: string;
    reason: string;
    forceWhenDisabled?: boolean;
    idempotencyKey?: string;
  },
) =>
  parseJson<{
    ok: boolean;
    replayed: boolean;
    summary: PromoAdminSummary;
  }>(
    await opsRequest(cfg, "/admin/ops/promotions/arc-pro-launch-30/grant", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  );

export const revokePromo = async (
  cfg: ConnectionConfig,
  input: {
    organizationId: string;
    reason: string;
    restoreSlot?: boolean;
    idempotencyKey?: string;
  },
) =>
  parseJson<{
    ok: boolean;
    replayed: boolean;
    summary: PromoAdminSummary;
  }>(
    await opsRequest(cfg, "/admin/ops/promotions/arc-pro-launch-30/revoke", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  );

export const restorePromoSlot = async (
  cfg: ConnectionConfig,
  input: {
    organizationId: string;
    reason: string;
    idempotencyKey?: string;
  },
) =>
  parseJson<{
    ok: boolean;
    replayed: boolean;
    summary: PromoAdminSummary;
  }>(
    await opsRequest(
      cfg,
      "/admin/ops/promotions/arc-pro-launch-30/restore-slot",
      {
        method: "POST",
        body: JSON.stringify(input),
      },
    ),
  );

export const patchPromoCapacity = async (
  cfg: ConnectionConfig,
  input: {
    capacity: number;
    reason: string;
    idempotencyKey?: string;
  },
) =>
  parseJson<{
    capacity: number;
    consumedSlots: number;
    remainingSlots: number;
    previousCapacity?: number;
    replayed: boolean;
    summary: PromoAdminSummary;
  }>(
    await opsRequest(cfg, "/admin/ops/promotions/arc-pro-launch-30/capacity", {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  );
