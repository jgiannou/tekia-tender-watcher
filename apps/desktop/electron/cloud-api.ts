import {
  getConnectionPublic,
  getDecryptedToken,
  type ConnectionStatus,
} from "./secure-store.js";

export type CloudRequestInit = {
  method?: string;
  body?: string | null;
  headers?: Record<string, string>;
};

export class CloudApiError extends Error {
  status: number;
  code: ConnectionStatus | "error";
  body: unknown;

  constructor(
    status: number,
    code: ConnectionStatus | "error",
    message: string,
    body?: unknown,
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.body = body ?? null;
  }
}

export const requestCloudApi = async <T = unknown>(
  path: string,
  init: CloudRequestInit = {},
  overrides?: { apiUrl?: string; token?: string },
): Promise<T> => {
  const publicConn = getConnectionPublic();
  const apiUrl = (overrides?.apiUrl ?? publicConn.apiUrl).replace(/\/$/, "");
  const token = overrides?.token ?? getDecryptedToken();

  if (!apiUrl || !token) {
    throw new CloudApiError(
      0,
      "not_configured",
      "Watcher API URL and Operator API Token are required",
    );
  }

  const url = `${apiUrl}${path.startsWith("/") ? path : `/${path}`}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: init.method ?? "GET",
      headers: {
        "Content-Type": "application/json",
        // Send multiple auth headers: some reverse proxies strip/overwrite
        // X-Operator-Token while X-Admin-Token passes through.
        "X-Operator-Token": token,
        "X-Admin-Token": token,
        Authorization: `Bearer ${token}`,
        ...(init.headers ?? {}),
      },
      body: init.body ?? undefined,
    });
  } catch (error) {
    throw new CloudApiError(
      0,
      "unreachable",
      error instanceof Error ? error.message : "Watcher API unreachable",
    );
  }

  const body = await response.json().catch(() => ({}));

  if (response.status === 401 || response.status === 403) {
    throw new CloudApiError(
      response.status,
      "invalid_token",
      "Operator authentication failed",
      body,
    );
  }

  if (!response.ok) {
    const messageFromBody =
      typeof body === "object" && body && "error" in body
        ? String((body as { error: string }).error)
        : typeof body === "object" && body && "message" in body
          ? String((body as { message: string }).message)
          : null;
    const message =
      messageFromBody && messageFromBody !== "undefined"
        ? messageFromBody
        : `HTTP ${response.status} ${init.method ?? "GET"} ${path}`;
    throw new CloudApiError(response.status, "error", message, body);
  }

  return body as T;
};

export const testConnection = async (input?: {
  apiUrl?: string;
  token?: string;
}): Promise<{
  status: ConnectionStatus;
  message: string;
}> => {
  try {
    await requestCloudApi(
      "/api/operator/config",
      { method: "GET" },
      {
        apiUrl: input?.apiUrl,
        token: input?.token,
      },
    );
    return { status: "connected", message: "Connected to Watcher API" };
  } catch (error) {
    if (error instanceof CloudApiError) {
      return {
        status:
          error.code === "error" ? "unreachable" : (error.code as ConnectionStatus),
        message: error.message,
      };
    }
    return {
      status: "unreachable",
      message: error instanceof Error ? error.message : "API unreachable",
    };
  }
};
