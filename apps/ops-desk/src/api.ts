export type ConnectionConfig = {
  apiUrl: string;
  token: string;
};

export type EnvId = "prod" | "local";

export const ENV_PRESETS: Array<{ id: EnvId; label: string; apiUrl: string; appUrl: string }> = [
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

const STORAGE_KEY = "arc-tenders-ops.connections.v1";
const ACTIVE_KEY = "arc-tenders-ops.active-env";

type Store = Record<EnvId, ConnectionConfig>;

const defaultConfig = (env: EnvId): ConnectionConfig => {
  const preset = ENV_PRESETS.find((p) => p.id === env)!;
  return { apiUrl: preset.apiUrl, token: "" };
};

export const loadActiveEnv = (): EnvId => {
  const raw = localStorage.getItem(ACTIVE_KEY);
  return raw === "local" ? "local" : "prod";
};

export const loadConfig = (env: EnvId = loadActiveEnv()): ConnectionConfig => {
  try {
    const store = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") as Partial<Store>;
    return { ...defaultConfig(env), ...(store[env] || {}) };
  } catch {
    return defaultConfig(env);
  }
};

export const saveConfig = (config: ConnectionConfig, env: EnvId) => {
  let store: Partial<Store> = {};
  try {
    store = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") as Partial<Store>;
  } catch {
    store = {};
  }
  store[env] = config;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  localStorage.setItem(ACTIVE_KEY, env);
};

const opsFetch = async (
  config: ConnectionConfig,
  path: string,
  init?: RequestInit,
): Promise<Response> => {
  const url = `${config.apiUrl.replace(/\/$/, "")}${path}`;
  const headers = new Headers(init?.headers || {});
  headers.set("X-Admin-Token", config.token.trim());
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

export const fetchHealth = async (config: ConnectionConfig) => {
  const res = await opsFetch(config, "/health");
  const text = await res.text();
  if (!res.ok) throw new Error(`health ${res.status}: ${text}`);
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { ok: true, raw: text };
  }
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
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(String(json.error || `grant failed ${res.status}`));
  }
  return json;
};
