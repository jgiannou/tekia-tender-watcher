import { PrismaClient } from "@prisma/client";
import type { KimdisClient } from "../../src/kimdis/client.js";
import { createSaasApp } from "../../src/saas/app.js";
import { waitForWatchProfileScans } from "../../src/saas/services/watch-profiles.js";
import type { SaasConfig } from "../../src/saas/config.js";

/**
 * NEVER default to the shared/dev DATABASE_URL from .env.
 * SaaS tests call resetSaasDatabase() which deletes all users — using the
 * developer Postgres DB is why jgiann94 kept disappearing after test runs.
 */
const databaseUrl =
  process.env.SAAS_TEST_DATABASE_URL ??
  "postgresql://tekia:tekia@127.0.0.1:5432/tekia_tender_watcher_test?schema=public";

export const saasTestConfig = (): SaasConfig => ({
  DATABASE_URL: databaseUrl,
  BETTER_AUTH_SECRET: "test-better-auth-secret-32chars!!",
  BETTER_AUTH_URL: "http://127.0.0.1:3000",
  SAAS_TRUSTED_ORIGINS: ["http://127.0.0.1:5173", "http://localhost:5173"],
  GEMI_API_KEY: "",
  GEMI_API_BASE_URL: "https://opendata-api.businessportal.gr/api/opendata/v1",
});

let prismaSingleton: PrismaClient | null = null;

export const getSaasTestPrisma = (): PrismaClient => {
  if (!prismaSingleton) {
    prismaSingleton = new PrismaClient({
      datasources: { db: { url: databaseUrl } },
      log: ["error"],
    });
  }
  return prismaSingleton;
};

export const resetSaasDatabase = async (prisma: PrismaClient) => {
  await waitForWatchProfileScans();
  await prisma.submissionDocumentSnapshot.deleteMany();
  await prisma.tenderWorkspaceDocumentRef.deleteMany();
  await prisma.vaultDocumentVersion.deleteMany();
  await prisma.vaultDocument.deleteMany();
  await prisma.vaultFolder.deleteMany();
  await prisma.tenderWorkspace.deleteMany();
  await prisma.notificationDelivery.deleteMany();
  await prisma.organizationAttentionEvent.deleteMany();
  await prisma.relatedActLink.deleteMany();
  await prisma.outreachLedger.deleteMany();
  await prisma.submission.deleteMany();
  await prisma.tenderEvent.deleteMany();
  await prisma.organizationTender.deleteMany();
  await prisma.watchProfile.deleteMany();
  await prisma.alertDestination.deleteMany();
  await prisma.organizationSettings.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.invitation.deleteMany();
  await prisma.organizationMember.deleteMany();
  await prisma.session.deleteMany();
  await prisma.account.deleteMany();
  await prisma.verification.deleteMany();
  await prisma.userPreference.deleteMany();
  await prisma.organization.deleteMany();
  await prisma.user.deleteMany();
  await prisma.tender.deleteMany();
  await prisma.pollRun.deleteMany();
  await prisma.ingestionMeta.deleteMany();
  await prisma.stripeWebhookEvent.deleteMany();
};

export const createSaasTestApp = (
  prisma = getSaasTestPrisma(),
  extras?: { kimdis?: KimdisClient },
) => {
  process.env.DATABASE_URL = databaseUrl;
  process.env.BETTER_AUTH_SECRET = saasTestConfig().BETTER_AUTH_SECRET;
  process.env.BETTER_AUTH_URL = saasTestConfig().BETTER_AUTH_URL;
  return createSaasApp({
    prisma,
    config: saasTestConfig(),
    ...extras,
  });
};

export const signUpAndGetCookie = async (
  app: ReturnType<typeof createSaasTestApp>["app"],
  input: { name: string; email: string; password: string },
) => {
  const response = await app.request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const setCookie = response.headers.getSetCookie?.() ?? [];
  const cookieHeader =
    setCookie.length > 0
      ? setCookie.map((part) => part.split(";")[0]).join("; ")
      : response.headers.get("set-cookie")?.split(",").map((p) => p.split(";")[0].trim()).join("; ") ??
        "";
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`sign-up failed ${response.status}: ${body}`);
  }
  return { response, cookie: cookieHeader };
};

export const authedJson = async <T>(
  app: ReturnType<typeof createSaasTestApp>["app"],
  path: string,
  init: {
    method?: string;
    cookie: string;
    organizationId?: string;
    body?: unknown;
  },
): Promise<{ status: number; json: T }> => {
  const headers: Record<string, string> = {
    cookie: init.cookie,
  };
  if (init.organizationId) headers["X-Organization-Id"] = init.organizationId;
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  const response = await app.request(path, {
    method: init.method ?? (init.body !== undefined ? "POST" : "GET"),
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const json = (await response.json()) as T;
  return { status: response.status, json };
};
