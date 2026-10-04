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
        note: "User started following tender",
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
