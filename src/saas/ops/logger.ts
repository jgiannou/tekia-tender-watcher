type LogLevel = "info" | "warn" | "error" | "debug";

export type LogEntry = {
  id: string;
  ts: string;
  level: LogLevel;
  message: string;
  meta?: Record<string, unknown>;
};

export type RequestLogEntry = {
  id: string;
  ts: string;
  requestId: string;
  method: string;
  path: string;
  status: number;
  ms: number;
  userId?: string;
  organizationId?: string;
  errorCode?: string;
  responseBody?: string;
  contentType?: string;
};

const LOG_BUFFER_MAX = 500;
const REQUEST_BUFFER_MAX = 200;

const logBuffer: LogEntry[] = [];
const requestBuffer: RequestLogEntry[] = [];

const pushCapped = <T>(buf: T[], item: T, max: number) => {
  buf.push(item);
  if (buf.length > max) buf.splice(0, buf.length - max);
};

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const configuredLogLevel = (): LogLevel => {
  const raw = String(process.env.LOG_LEVEL || "info").trim().toLowerCase();
  if (raw === "debug" || raw === "info" || raw === "warn" || raw === "error") {
    return raw;
  }
  return "info";
};

const write = (
  level: LogLevel,
  message: string,
  meta?: Record<string, unknown>,
) => {
  const ts = new Date().toISOString();
  const line = JSON.stringify({
    ts,
    level,
    service: "arc-tenders-api",
    message,
    ...(meta || {}),
  });

  if (message !== "request" && level !== "debug") {
    pushCapped(
      logBuffer,
      {
        id: crypto.randomUUID(),
        ts,
        level,
        message,
        ...(meta ? { meta } : {}),
      },
      LOG_BUFFER_MAX,
    );
  }

  if (LEVEL_RANK[level] < LEVEL_RANK[configuredLogLevel()]) return;

  if (level === "error") {
    console.error(line);
    return;
  }
  if (level === "warn") {
    console.warn(line);
    return;
  }
  console.log(line);
};

export const opsLogger = {
  info: (message: string, meta?: Record<string, unknown>) =>
    write("info", message, meta),
  warn: (message: string, meta?: Record<string, unknown>) =>
    write("warn", message, meta),
  error: (message: string, meta?: Record<string, unknown>) =>
    write("error", message, meta),
  debug: (message: string, meta?: Record<string, unknown>) =>
    write("debug", message, meta),
};

export const recordRequestLog = (
  entry: Omit<RequestLogEntry, "id" | "ts">,
) => {
  pushCapped(
    requestBuffer,
    {
      id: crypto.randomUUID(),
      ts: new Date().toISOString(),
      ...entry,
    },
    REQUEST_BUFFER_MAX,
  );
};

export const getRecentLogs = (opts?: {
  level?: LogLevel | "error_warn";
  limit?: number;
  q?: string;
}) => {
  const limit = Math.min(Math.max(opts?.limit ?? 100, 1), LOG_BUFFER_MAX);
  let rows = logBuffer.slice();
  if (opts?.level === "error_warn") {
    rows = rows.filter((r) => r.level === "error" || r.level === "warn");
  } else if (opts?.level) {
    rows = rows.filter((r) => r.level === opts.level);
  }
  if (opts?.q?.trim()) {
    const q = opts.q.trim().toLowerCase();
    rows = rows.filter(
      (r) =>
        r.message.toLowerCase().includes(q) ||
        JSON.stringify(r.meta || {}).toLowerCase().includes(q),
    );
  }
  return rows.slice(-limit).reverse();
};

export const getRecentRequests = (opts?: {
  limit?: number;
  minStatus?: number;
}) => {
  const limit = Math.min(Math.max(opts?.limit ?? 100, 1), REQUEST_BUFFER_MAX);
  let rows = requestBuffer.slice();
  if (typeof opts?.minStatus === "number") {
    rows = rows.filter((r) => r.status >= opts.minStatus!);
  }
  return rows.slice(-limit).reverse();
};

export const getLogStats = () => {
  const errors = logBuffer.filter((r) => r.level === "error").length;
  const warns = logBuffer.filter((r) => r.level === "warn").length;
  const http5xx = requestBuffer.filter((r) => r.status >= 500).length;
  const http4xx = requestBuffer.filter(
    (r) => r.status >= 400 && r.status < 500,
  ).length;
  return {
    bufferedLogs: logBuffer.length,
    bufferedRequests: requestBuffer.length,
    errorsInBuffer: errors,
    warnsInBuffer: warns,
    http5xxInBuffer: http5xx,
    http4xxInBuffer: http4xx,
  };
};
