import type { PrismaClient } from "@prisma/client";
import {
  generateRandomString,
  hashPassword,
  makeSignature,
} from "better-auth/crypto";

const OPS_ENTER_PREFIX = "ops-enter:";
const ENTER_TTL_MS = 5 * 60 * 1000;
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

export const resolveSaasAppUrl = (env: NodeJS.ProcessEnv = process.env): string =>
  String(env.SAAS_APP_URL || "https://arc-tenders.tekia.gr")
    .trim()
    .replace(/\/$/, "");

export const generateTempPassword = (): string => {
  const base = generateRandomString(12);
  return `${base}A1!`;
};

/**
 * Cookie name/flags must match better-auth's createCookieGetter(baseURL).
 * Do NOT derive from the inbound proxy request URL (often http://saas-api:3000).
 */
export const buildSessionCookie = async (
  sessionToken: string,
  secret: string,
  appUrl: string,
): Promise<{ name: string; value: string; header: string }> => {
  const secure = appUrl.startsWith("https://");
  const signature = await makeSignature(sessionToken, secret);
  const signed = `${sessionToken}.${signature}`;
  const name = secure
    ? "__Secure-better-auth.session_token"
    : "better-auth.session_token";
  const maxAgeSec = Math.floor(SESSION_TTL_MS / 1000);
  const parts = [
    `${name}=${encodeURIComponent(signed)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSec}`,
  ];
  if (secure) parts.push("Secure");
  return { name, value: signed, header: parts.join("; ") };
};

/** Mint session + one-time enter code; returns web URL on SAAS_APP_URL. */
export const issueOpsEnterLink = async (
  prisma: PrismaClient,
  userId: string,
  appUrl: string,
): Promise<{ openUrl: string; sessionToken: string; code: string } | null> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  if (!user) return null;

  const membership = await prisma.organizationMember.findFirst({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: { organizationId: true },
  });

  const sessionToken = generateRandomString(32);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.session.create({
    data: {
      token: sessionToken,
      userId,
      expiresAt,
      activeOrganizationId: membership?.organizationId ?? null,
    },
  });

  const code = generateRandomString(32);
  await prisma.verification.create({
    data: {
      identifier: `${OPS_ENTER_PREFIX}${code}`,
      value: sessionToken,
      expiresAt: new Date(Date.now() + ENTER_TTL_MS),
    },
  });

  const openUrl = `${appUrl.replace(/\/$/, "")}/api/saas/ops/enter?code=${encodeURIComponent(code)}`;
  return { openUrl, sessionToken, code };
};

export const rotateUserCredentialPassword = async (
  prisma: PrismaClient,
  userId: string,
  password: string,
): Promise<{ email: string; password: string } | null> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true },
  });
  if (!user) return null;

  const hashed = await hashPassword(password);
  const account = await prisma.account.findFirst({
    where: { userId, providerId: "credential" },
  });
  if (account) {
    await prisma.account.update({
      where: { id: account.id },
      data: { password: hashed },
    });
  } else {
    await prisma.account.create({
      data: {
        id: `cred_${user.id}`,
        accountId: user.id,
        providerId: "credential",
        userId: user.id,
        password: hashed,
      },
    });
  }

  if (!user.email) return null;
  return { email: user.email, password };
};

export const consumeOpsEnterCode = async (
  prisma: PrismaClient,
  code: string,
): Promise<{ sessionToken: string; userId: string } | null> => {
  const trimmed = code.trim();
  if (!trimmed) return null;

  const row = await prisma.verification.findFirst({
    where: {
      identifier: `${OPS_ENTER_PREFIX}${trimmed}`,
      expiresAt: { gt: new Date() },
    },
  });
  if (!row) return null;

  await prisma.verification.delete({ where: { id: row.id } });

  const session = await prisma.session.findUnique({
    where: { token: row.value },
    select: { token: true, userId: true, expiresAt: true },
  });
  if (!session || session.expiresAt <= new Date()) return null;

  return { sessionToken: session.token, userId: session.userId };
};
