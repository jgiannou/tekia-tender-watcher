import { expo } from "@better-auth/expo";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import type { PrismaClient } from "@prisma/client";
import type { SaasConfig } from "../config.js";
import {
  isEmailEnabled,
  resetPasswordEmailCopy,
  sendMail,
  verificationEmailCopy,
} from "../mail/mail.js";
import { trackProductEventSafe } from "../ops/product-events.js";

const mobileTrustedOrigins = [
  "arctenders://",
  "arctenders://*",
  ...(process.env.NODE_ENV === "development"
    ? ["exp://", "exp://**", "exp://192.168.*.*:*/**"]
    : []),
];

export const createSaasAuth = (prisma: PrismaClient, config: SaasConfig) =>
  betterAuth({
    database: prismaAdapter(prisma, {
      provider: "postgresql",
    }),
    secret: config.BETTER_AUTH_SECRET,
    baseURL: config.BETTER_AUTH_URL,
    trustedOrigins: [...config.SAAS_TRUSTED_ORIGINS, ...mobileTrustedOrigins],
    plugins: [expo()],
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      // Login stays open while unverified — product gates periodic scans instead.
      requireEmailVerification: false,
      sendResetPassword: async ({ user, url }) => {
        const copy = resetPasswordEmailCopy({
          name: user.name || "",
          resetUrl: url,
        });
        const sent = await sendMail({
          to: user.email,
          subject: copy.subject,
          html: copy.html,
          text: copy.text,
        });
        if (!sent && process.env.NODE_ENV !== "production") {
          console.info("[email] reset password URL (dev)", { userId: user.id, url });
        }
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        const copy = verificationEmailCopy({
          name: user.name || "",
          verifyUrl: url,
        });
        const sent = await sendMail({
          to: user.email,
          subject: copy.subject,
          html: copy.html,
          text: copy.text,
        });
        trackProductEventSafe(prisma, {
          type: "email_verification_sent",
          userId: user.id,
          metadata: { email: user.email },
        });
        if (!sent && process.env.NODE_ENV !== "production") {
          console.info("[email] verification URL (dev)", { userId: user.id, url });
        }
      },
    },
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            trackProductEventSafe(prisma, {
              type: "user_signed_up",
              userId: user.id,
              metadata: { email: user.email, name: user.name },
            });
            // Tests / local without SMTP: auto-verify so scan flows stay usable.
            if (!isEmailEnabled()) {
              await prisma.user.update({
                where: { id: user.id },
                data: { emailVerified: true },
              });
              trackProductEventSafe(prisma, {
                type: "email_verified",
                userId: user.id,
                metadata: { auto: true, reason: "email_disabled" },
              });
            }
          },
        },
        update: {
          after: async (user) => {
            if (!user.emailVerified) return;
            const existing = await prisma.productEvent.findFirst({
              where: { userId: user.id, type: "email_verified" },
              select: { id: true },
            });
            if (existing) return;
            trackProductEventSafe(prisma, {
              type: "email_verified",
              userId: user.id,
              metadata: { email: user.email },
            });
          },
        },
      },
      session: {
        create: {
          after: async (session) => {
            trackProductEventSafe(prisma, {
              type: "login_succeeded",
              userId: session.userId,
              sessionId: session.id,
            });
          },
        },
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 14,
      updateAge: 60 * 60 * 24,
    },
    user: {
      additionalFields: {},
    },
  }) as unknown as ReturnType<typeof betterAuth>;

export type SaasAuth = ReturnType<typeof betterAuth>;
