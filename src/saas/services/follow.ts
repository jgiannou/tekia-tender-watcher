import type { PrismaClient } from "@prisma/client";
import { requireOrgMembership } from "../auth/org-context.js";
import { notFound } from "../errors.js";

export const followTender = async (
  prisma: PrismaClient,
  input: {
    userId: string;
    organizationId: string;
    tenderId: string;
  },
) => {
  await requireOrgMembership(prisma, input.userId, input.organizationId);

  const tender = await prisma.tender.findUnique({
    where: { id: input.tenderId },
  });
  if (!tender) throw notFound("tender_not_found");

  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const row = await tx.organizationTender.upsert({
      where: {
        organizationId_tenderId: {
          organizationId: input.organizationId,
          tenderId: input.tenderId,
        },
      },
      create: {
        organizationId: input.organizationId,
        tenderId: input.tenderId,
        following: true,
        followedAt: now,
        followedByUserId: input.userId,
        monitoringActive: true,
        monitoringReason: "USER_FOLLOWING",
        monitoringStartedAt: now,
        pipelineStage: "NEW",
        operationalStatus: "NEW",
      },
      update: {
        following: true,
        followedAt: now,
        followedByUserId: input.userId,
        monitoringActive: true,
        monitoringReason: "USER_FOLLOWING",
        monitoringStartedAt: now,
        monitoringStoppedAt: null,
        // pipelineStage intentionally unchanged — FOLLOWING is not a pipeline stage
      },
    });

    await tx.tenderEvent.create({
      data: {
        organizationId: input.organizationId,
        organizationTenderId: row.id,
        eventType: "FOLLOWED",
        note: "Ξεκίνησε παρακολούθηση",
      },
    });

    return row;
  });
};

export const unfollowTender = async (
  prisma: PrismaClient,
  input: {
    userId: string;
    organizationId: string;
    tenderId: string;
  },
) => {
  await requireOrgMembership(prisma, input.userId, input.organizationId);

  const existing = await prisma.organizationTender.findUnique({
    where: {
      organizationId_tenderId: {
        organizationId: input.organizationId,
        tenderId: input.tenderId,
      },
    },
  });
  if (!existing) throw notFound("organization_tender_not_found");

  const now = new Date();
  return prisma.organizationTender.update({
    where: { id: existing.id },
    data: {
      following: false,
      monitoringActive: false,
      monitoringStoppedAt: now,
    },
  });
};

/**
 * Hide an opportunity/tender from the org app surface (esp. expired requests).
 * Keeps the row for history but excludes it from Opportunities and stops monitoring.
 */
export const dismissTender = async (
  prisma: PrismaClient,
  input: {
    userId: string;
    organizationId: string;
    tenderId: string;
    reason?: "EXPIRED" | "NOT_INTERESTED";
  },
) => {
  await requireOrgMembership(prisma, input.userId, input.organizationId);

  const tender = await prisma.tender.findUnique({ where: { id: input.tenderId } });
  if (!tender) throw notFound("tender_not_found");

  const reason = input.reason ?? "EXPIRED";
  const now = new Date();
  const ignoreReason =
    reason === "EXPIRED" ? "user_marked_expired" : "user_dismissed";

  return prisma.$transaction(async (tx) => {
    const row = await tx.organizationTender.upsert({
      where: {
        organizationId_tenderId: {
          organizationId: input.organizationId,
          tenderId: input.tenderId,
        },
      },
      create: {
        organizationId: input.organizationId,
        tenderId: input.tenderId,
        following: false,
        monitoringActive: false,
        monitoringStoppedAt: now,
        relevanceStatus: reason === "EXPIRED" ? "EXPIRED" : "IRRELEVANT",
        ignoreReason,
        pipelineStage: "DISMISSED",
        operationalStatus: "LOST",
      },
      update: {
        following: false,
        monitoringActive: false,
        monitoringStoppedAt: now,
        relevanceStatus: reason === "EXPIRED" ? "EXPIRED" : "IRRELEVANT",
        ignoreReason,
        pipelineStage: "DISMISSED",
      },
    });

    await tx.tenderEvent.create({
      data: {
        organizationId: input.organizationId,
        organizationTenderId: row.id,
        eventType: "DISMISSED",
        note:
          reason === "EXPIRED"
            ? "Σήμανση ως ληγμένο — απόκρυψη από τις ευκαιρίες"
            : "Απόκρυψη από τις ευκαιρίες",
      },
    });

    return row;
  });
};

export const getOrganizationTenderForOrg = async (
  prisma: PrismaClient,
  input: { userId: string; organizationId: string; tenderId: string },
) => {
  await requireOrgMembership(prisma, input.userId, input.organizationId);
  return prisma.organizationTender.findUnique({
    where: {
      organizationId_tenderId: {
        organizationId: input.organizationId,
        tenderId: input.tenderId,
      },
    },
    include: {
      tender: true,
      submissions: true,
      outreachLedger: true,
    },
  });
};
