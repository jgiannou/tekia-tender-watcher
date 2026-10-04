import { z } from "zod";

const saasEnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(16),
  BETTER_AUTH_URL: z.string().url().default("http://127.0.0.1:3000"),
  SAAS_TRUSTED_ORIGINS: z
    .string()
    .optional()
    .transform((raw) => {
      const value = (
        raw ??
        "http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174"
      ).trim();
      return value
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean);
    }),
  /** Server-only GEMI OpenData key — never sent to saas-web. */
  GEMI_API_KEY: z.string().optional().default(""),
  GEMI_API_BASE_URL: z
    .string()
    .optional()
    .default("https://opendata-api.businessportal.gr/api/opendata/v1"),
});

export type SaasConfig = z.infer<typeof saasEnvSchema>;

export const loadSaasConfig = (
  env: NodeJS.ProcessEnv = process.env,
): SaasConfig => {
  const parsed = saasEnvSchema.safeParse(env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid SaaS environment configuration:\n${details}`);
  }
  return parsed.data;
};

export const isSaasEnabled = (env: NodeJS.ProcessEnv = process.env): boolean =>
  env.SAAS_ENABLED === "1" || env.SAAS_ENABLED === "true";
