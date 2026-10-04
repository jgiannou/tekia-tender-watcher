import type { MemberRole, PrismaClient } from "@prisma/client";
import { badRequest, forbidden, notFound } from "../errors.js";
import { requireOrgMembership } from "../auth/org-context.js";

const slugify = (name: string): string =>
  name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || `org-${Date.now()}`;

export const createOrganization = async (
  prisma: PrismaClient,
  input: { userId: string; name: string; slug?: string },
) => {
  const name = input.name.trim();
  if (!name) throw badRequest("organization_name_required");

  let slug = (input.slug?.trim() || slugify(name)).toLowerCase();
  const existing = await prisma.organization.findUnique({ where: { slug } });
  if (existing) slug = `${slug}-${Date.now().toString(36)}`;

  return prisma.$transaction(async (tx) => {
    const organization = await tx.organization.create({
      data: { name, slug },
    });
    await tx.organizationMember.create({
      data: {
        organizationId: organization.id,
        userId: input.userId,
        role: "OWNER",
      },
    });
    await tx.organizationSettings.create({
      data: {
        organizationId: organization.id,
        company: {
          legalName: name,
          distinctiveTitle: name,
          afm: null,
          gemiNumber: null,
          source: "MANUAL",
          lastSyncedAt: null,
        },
        activities: [],
        notifications: {
          emailEnabled: true,
          recipients: [],
          events: {
            newOpportunity: true,
            relatedActOnFollowed: true,
            postSubmissionUpdate: true,
          },
        },
        onboardingStatus: "NOT_STARTED",
      },
    });
    return organization;
  });
};

export const listUserOrganizations = (prisma: PrismaClient, userId: string) =>
  prisma.organizationMember.findMany({
    where: { userId },
    include: { organization: true },
    orderBy: { createdAt: "asc" },
  });

export const setActiveOrganization = async (
  prisma: PrismaClient,
  input: { userId: string; sessionToken: string; organizationId: string },
) => {
  await requireOrgMembership(prisma, input.userId, input.organizationId);
  await prisma.session.update({
    where: { token: input.sessionToken },
    data: { activeOrganizationId: input.organizationId },
  });
  return { organizationId: input.organizationId };
};

export const addOrganizationMember = async (
  prisma: PrismaClient,
  input: {
    actorUserId: string;
    organizationId: string;
    userId: string;
    role?: MemberRole;
  },
) => {
  const actor = await requireOrgMembership(
    prisma,
    input.actorUserId,
    input.organizationId,
  );
  if (actor.membership.role !== "OWNER" && actor.membership.role !== "ADMIN") {
    throw forbidden("insufficient_role");
  }
  const user = await prisma.user.findUnique({ where: { id: input.userId } });
  if (!user) throw notFound("user_not_found");

  return prisma.organizationMember.upsert({
    where: {
      organizationId_userId: {
        organizationId: input.organizationId,
        userId: input.userId,
      },
    },
    create: {
      organizationId: input.organizationId,
      userId: input.userId,
      role: input.role ?? "MEMBER",
    },
    update: {
      role: input.role ?? "MEMBER",
    },
  });
};
