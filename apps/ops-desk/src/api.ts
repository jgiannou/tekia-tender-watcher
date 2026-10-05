export type ConnectionConfig = {
  apiUrl: string;
  token: string;
  pollSeconds: number;
};

export type EnvId = "prod" | "local";

export const ENV_PRESETS: Array<{
  id: EnvId;
  label: string;
  apiUrl: string;
  appUrl: string;
}> = [
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

export type OpsStats = {
  generatedAt: string;
  users: number;
  organizations: number;
  memberships: number;
  byPlan: { trial: number; basic: number; pro: number };
  byBillingStatus: {
    trialing: number;
    active: number;
    past_due: number;
    canceled: number;
    incomplete: number;
  };
  payingOrgs: number;
  logs: {
    bufferedLogs: number;
    bufferedRequests: number;
    errorsInBuffer: number;
    warnsInBuffer: number;
    http5xxInBuffer: number;
    http4xxInBuffer: number;
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
};

const STORAGE_KEY = "arc-tenders-ops.connections.v2";
const ACTIVE_KEY = "arc-tenders-ops.active-env";

type Store = Record<EnvId, ConnectionConfig>;

const defaultConfig = (env: EnvId): ConnectionConfig => {
  const preset = ENV_PRESETS.find((p) => p.id === env)!;
  return { apiUrl: preset.apiUrl, token: "", pollSeconds: 15 };
};

export const loadActiveEnv = (): EnvId => {
  const raw = localStorage.getItem(ACTIVE_KEY);
  return raw === "local" ? "local" : "prod";
};

export const loadConfig = (env: EnvId = loadActiveEnv()): ConnectionConfig => {
  try {
    const store = JSON.parse(
      localStorage.getItem(STORAGE_KEY) || "{}",
    ) as Partial<Store>;
    return { ...defaultConfig(env), ...(store[env] || {}) };
  } catch {
    return defaultConfig(env);
  }
};

export const saveConfig = (config: ConnectionConfig, env: EnvId) => {
  let store: Partial<Store> = {};
  try {
    store = JSON.parse(
      localStorage.getItem(STORAGE_KEY) || "{}",
    ) as Partial<Store>;
  } catch {
    store = {};
  }
  store[env] = config;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  localStorage.setItem(ACTIVE_KEY, env);
};

export const switchEnv = (env: EnvId): ConnectionConfig => {
  localStorage.setItem(ACTIVE_KEY, env);
  const next = loadConfig(env);
  next.apiUrl = ENV_PRESETS.find((p) => p.id === env)!.apiUrl;
  return next;
};

const opsFetch = async (
  config: ConnectionConfig,
  path: string,
  init?: RequestInit,
): Promise<Response> => {
  const url = `${config.apiUrl.replace(/\/$/, "")}${path}`;
  const headers = new Headers(init?.headers || {});
  const token = config.token.trim();
  headers.set("X-Admin-Token", token);
  headers.set("Authorization", `Bearer ${token}`);
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (window.arcTendersOps?.fetch) {
    const result = await window.arcTendersOps.fetch({
      url,
      method: init?.method || "GET",
      headers: Object.fromEntries(headers.entries()),
      body: typeof init?.body === "string" ? init.body : undefined,
    });
    return new Response(result.body, {
      status: result.status,
      headers: result.headers,
    });
  }

  return fetch(url, { ...init, headers });
};

const readJson = async <T>(res: Response): Promise<T> => {
  const text = await res.text();
  let json: unknown = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`${res.status}: ${text.slice(0, 200)}`);
  }
  if (!res.ok) {
    const err = json as { error?: string; hint?: string };
    throw new Error(
      [err.error || `HTTP ${res.status}`, err.hint].filter(Boolean).join(" — "),
    );
  }
  return json as T;
};

export const fetchStats = async (config: ConnectionConfig) => {
  const res = await opsFetch(config, "/admin/ops/stats");
  const json = await readJson<{ data: OpsStats }>(res);
  return json.data;
};

export const fetchLogs = async (
  config: ConnectionConfig,
  opts: { level: string; limit?: number; q?: string },
) => {
  const params = new URLSearchParams({
    level: opts.level,
    limit: String(opts.limit ?? 100),
  });
  if (opts.q?.trim()) params.set("q", opts.q.trim());
  const res = await opsFetch(config, `/admin/ops/logs?${params}`);
  const json = await readJson<{ data: LogEntry[] }>(res);
  return json.data;
};

export const fetchRequests = async (
  config: ConnectionConfig,
  opts: { errors: boolean; limit?: number },
) => {
  const params = new URLSearchParams({
    limit: String(opts.limit ?? 100),
  });
  if (opts.errors) params.set("errors", "1");
  const res = await opsFetch(config, `/admin/ops/requests?${params}`);
  const json = await readJson<{ data: RequestEntry[] }>(res);
  return json.data;
};

export const fetchHealthOps = async (config: ConnectionConfig) => {
  const res = await opsFetch(config, "/admin/ops/health");
  const json = await readJson<{ data: HealthOps }>(res);
  return json.data;
};

export const notifySlackStats = async (config: ConnectionConfig) => {
  const res = await opsFetch(config, "/admin/ops/stats/notify", {
    method: "POST",
    body: "{}",
  });
  return readJson<{ ok: boolean; slackSent: boolean; text?: string }>(res);
};

export const grantPlan = async (
  config: ConnectionConfig,
  input: {
    email: string;
    planKey: "trial" | "basic" | "pro";
    organizationId?: string;
    password?: string;
  },
) => {
  const res = await opsFetch(config, "/admin/grant-plan", {
    method: "POST",
    body: JSON.stringify({
      email: input.email.trim(),
      planKey: input.planKey,
      organizationId: input.organizationId?.trim() || undefined,
      verifyEmail: true,
      password: input.password?.trim() || undefined,
    }),
  });
  return readJson<Record<string, unknown>>(res);
};
