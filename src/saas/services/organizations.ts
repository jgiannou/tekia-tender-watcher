import type { MemberRole, PrismaClient } from "@prisma/client";
import { badRequest, conflict, forbidden, notFound } from "../errors.js";
import { requireOrgMembership } from "../auth/org-context.js";
import { trackProductEventSafe } from "../ops/product-events.js";
import { PLAN_KEYS, TRIAL_DURATION_MS } from "../plans/catalog.js";
import { entitlementsForPlanKey } from "../plans/catalog.js";
import { assertCanAddOrganizationMember } from "./entitlements.js";
import { assignWeeklyDigestSlot } from "./weekly-digest-schedule.js";

/** Max organizations a single user may create/own (anti trial-spam). Invites do not count. */
export const MAX_OWNED_ORGANIZATIONS = 3;

const OWNED_ORG_LIMIT_MESSAGE =
  "Μπορείτε να δημιουργήσετε έως 3 οργανισμούς με τον ίδιο λογαριασμό.";

const slugify = (name: string): string =>
  name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || `org-${Date.now()}`;

export const countOwnedOrganizations = (prisma: PrismaClient, userId: string) =>
  prisma.organizationMember.count({
    where: { userId, role: "OWNER" },
  });

export const createOrganization = async (
  prisma: PrismaClient,
  input: { userId: string; name: string; slug?: string },
) => {
  const name = input.name.trim();
  if (!name) throw badRequest("organization_name_required");

  const ownedCount = await countOwnedOrganizations(prisma, input.userId);
  if (ownedCount >= MAX_OWNED_ORGANIZATIONS) {
    throw conflict(OWNED_ORG_LIMIT_MESSAGE);
  }

  let slug = (input.slug?.trim() || slugify(name)).toLowerCase();
  const existing = await prisma.organization.findUnique({ where: { slug } });
  if (existing) slug = `${slug}-${Date.now().toString(36)}`;

  return prisma.$transaction(async (tx) => {
    const ownedInTx = await tx.organizationMember.count({
      where: { userId: input.userId, role: "OWNER" },
    });
    if (ownedInTx >= MAX_OWNED_ORGANIZATIONS) {
      throw conflict(OWNED_ORG_LIMIT_MESSAGE);
    }

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
    const weekly = assignWeeklyDigestSlot(organization.id);
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
          digestHours: [],
          emailDeliveryMode: "DIGEST",
          weeklyEmailEnabled: true,
          weeklyRecipient: null,
          weeklyDigestWeekday: weekly.weeklyDigestWeekday,
          weeklyDigestHour: weekly.weeklyDigestHour,
          weeklyLastSentAt: null,
          events: {
            newOpportunity: true,
            relatedActOnFollowed: true,
            postSubmissionUpdate: true,
            deadlineRadar: false,
          },
        },
        onboardingStatus: "NOT_STARTED",
      },
    });
    await tx.subscription.create({
      data: {
        organizationId: organization.id,
        status: "ACTIVE",
        planKey: PLAN_KEYS.free,
        trialEndsAt: null,
        extraSeats: 0,
      },
    });
    return organization;
  }).then((organization) => {
    trackProductEventSafe(prisma, {
      type: "organization_created",
      userId: input.userId,
      organizationId: organization.id,
      entityType: "organization",
      entityId: organization.id,
      metadata: { name: organization.name, slug: organization.slug },
    });
    trackProductEventSafe(prisma, {
      type: "free_started",
      userId: input.userId,
      organizationId: organization.id,
      metadata: { planKey: PLAN_KEYS.free },
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

  const existing = await prisma.organizationMember.findUnique({
    where: {
      organizationId_userId: {
        organizationId: input.organizationId,
        userId: input.userId,
      },
    },
  });
  if (!existing) {
    await assertCanAddOrganizationMember(prisma, {
      userId: input.actorUserId,
      organizationId: input.organizationId,
    });
  }

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
