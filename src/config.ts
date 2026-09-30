import { z } from "zod";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const boolFromEnv = z
  .union([z.boolean(), z.string()])
  .transform((value) => {
    if (typeof value === "boolean") return value;
    const normalized = value.trim().toLowerCase();
    return normalized === "1" || normalized === "true" || normalized === "yes";
  });

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_PATH: z.string().min(1).default("./data/tenders.db"),
  POLL_INTERVAL_MINUTES: z.coerce.number().int().positive().default(5),
  LOOKBACK_HOURS: z.coerce.number().int().positive().default(24),
  MIN_BUDGET: z.coerce.number().nonnegative().default(1500),
  MAX_BUDGET: z.coerce.number().positive().default(30000),
  ALERT_SCORE_THRESHOLD: z.coerce.number().int().min(0).max(100).default(60),
  BOOTSTRAP_SEND_ALERTS: boolFromEnv.default(false),
  SLACK_WEBHOOK_URL: z.string().url().optional().or(z.literal("")).transform((v) => v || undefined),
  ADMIN_TOKEN: z.string().min(8, "ADMIN_TOKEN must be at least 8 characters"),
  KIMDIS_BASE_URL: z
    .string()
    .url()
    .default("https://cerpp.eprocurement.gov.gr"),
  HTTP_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  PDF_SCORE_THRESHOLD: z.coerce.number().int().min(0).max(100).default(45),
  TARGETED_ALERT_SCORE: z.coerce.number().int().min(0).max(100).default(85),
  OPERATOR_API_TOKEN: z
    .string()
    .optional()
    .or(z.literal(""))
    .transform((v) => {
      const trimmed = typeof v === "string" ? v.trim() : "";
      return trimmed.length > 0 ? trimmed : undefined;
    }),
  LOCAL_DASHBOARD_URL: z
    .string()
    .url()
    .optional()
    .or(z.literal(""))
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  LOCAL_DASHBOARD_ORIGINS: z
    .string()
    .optional()
    .or(z.literal(""))
    .transform((v) => {
      const raw = (v ?? "").trim();
      if (!raw) return ["http://localhost:5173"];
      return raw
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean);
    }),
});

export type Config = z.infer<typeof envSchema> & {
  databasePath: string;
};

const loadDotEnv = () => {
  try {
    // Optional local .env support without a hard dependency.
    // Node 22 supports --env-file; this is a tiny fallback for `pnpm dev`.
    const envPath = resolve(process.cwd(), ".env");
    // Dynamic import avoided; use sync read via process if already loaded.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    void envPath;
  } catch {
    // ignore
  }
};

loadDotEnv();

export const loadConfig = (): Config => {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${details}`);
  }

  const config = parsed.data;
  if (config.MIN_BUDGET > config.MAX_BUDGET) {
    throw new Error("MIN_BUDGET cannot be greater than MAX_BUDGET");
  }

  const databasePath = resolve(process.cwd(), config.DATABASE_PATH);
  mkdirSync(dirname(databasePath), { recursive: true });

  return {
    ...config,
    databasePath,
  };
};
