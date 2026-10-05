import type { PrismaClient } from "@prisma/client";
import { badRequest } from "../errors.js";
import { CURRENT_LEGAL_VERSIONS } from "../legal/versions.js";

export const recordLegalAcceptance = async (
  prisma: PrismaClient,
  input: {
    userId: string;
    termsVersion: string;
    privacyVersion: string;
    ipAddress?: string | null;
    userAgent?: string | null;
    source?: "signup" | "reaccept";
  },
) => {
  const termsVersion = input.termsVersion.trim();
  const privacyVersion = input.privacyVersion.trim();
  if (!termsVersion || !privacyVersion) {
    throw badRequest("legal_versions_required");
  }
  if (
    termsVersion !== CURRENT_LEGAL_VERSIONS.terms ||
    privacyVersion !== CURRENT_LEGAL_VERSIONS.privacy
  ) {
    throw badRequest("legal_versions_outdated");
  }

  return prisma.legalAcceptance.upsert({
    where: { userId: input.userId },
    create: {
      userId: input.userId,
      termsVersion,
      privacyVersion,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      source: input.source ?? "signup",
      acceptedAt: new Date(),
    },
    update: {
      termsVersion,
      privacyVersion,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      source: input.source ?? "signup",
      acceptedAt: new Date(),
    },
  });
};

export const getLegalAcceptance = (prisma: PrismaClient, userId: string) =>
  prisma.legalAcceptance.findUnique({ where: { userId } });
