import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import type { PrismaClient } from "@prisma/client";
import type { SaasConfig } from "../config.js";

export const createSaasAuth = (prisma: PrismaClient, config: SaasConfig) =>
  betterAuth({
    database: prismaAdapter(prisma, {
      provider: "postgresql",
    }),
    secret: config.BETTER_AUTH_SECRET,
    baseURL: config.BETTER_AUTH_URL,
    trustedOrigins: config.SAAS_TRUSTED_ORIGINS,
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 14,
      updateAge: 60 * 60 * 24,
    },
    user: {
      additionalFields: {},
    },
  });

export type SaasAuth = ReturnType<typeof createSaasAuth>;
