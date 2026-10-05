import { randomBytes } from "node:crypto";
import type { MemberRole, PrismaClient } from "@prisma/client";
import { requireOrgMembership, requireOrgRole } from "../auth/org-context.js";
import {
  badRequest,
  conflict,
  forbidden,
  notFound,
} from "../errors.js";
import {
  joinUrl,
  resolveSaasAppUrl,
  sendMail,
} from "../mail/mail.js";
import {
  assertCanAddOrganizationMember,
  getOrganizationEntitlements,
} from "./entitlements.js";
import { addOrganizationMember } from "./organizations.js";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const normalizeEmail = (email: string): string => email.trim().toLowerCase();

const inviteEmailCopy = (input: {
  organizationName: string;
  inviterName: string;
  acceptUrl: string;
  role: string;
}) => {
  const org = input.organizationName.trim() || "οργανισμό";
  const inviter = input.inviterName.trim() || "Ένα μέλος";
  return {
    subject: `Πρόσκληση στην ομάδα ${org} — ARC Tenders`,
    html: `<p>Γεια σου,</p><p>${inviter} σε προσκάλεσε στον οργανισμό <strong>${org}</strong> στο ARC Tenders (ρόλος: ${input.role}).</p><p><a href="${input.acceptUrl}">Αποδοχή πρόσκλησης</a></p><p>Ο σύνδεσμος ισχύει για 7 ημέρες. Αν δεν έχεις λογαριασμό, δημιούργησε έναν με το ίδιο email και άνοιξε ξανά τον σύνδεσμο.</p>`,
    text: `${inviter} σε προσκάλεσε στον οργανισμό ${org}. Αποδοχή: ${input.acceptUrl}`,
  };
};

const resolveInviteActorUserId = async (
  prisma: PrismaClient,
  organizationId: string,
  inviterId: string | null,
): Promise<string> => {
  if (inviterId) {
    const stillMember = await prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: { organizationId, userId: inviterId },
      },
    });
    if (stillMember) return inviterId;
  }
  const owner = await prisma.organizationMember.findFirst({
    where: { organizationId, role: "OWNER" },
  });
  if (!owner) throw notFound("organization_owner_missing");
  return owner.userId;
};

export const listOrganizationTeam = async (
  prisma: PrismaClient,
  input: { userId: string; organizationId: string | null },
) => {
  const ctx = await requireOrgMembership(
    prisma,
    input.userId,
    input.organizationId,
  );
  const [{ scanAccess }, members, invitations, organization] = await Promise.all([
    getOrganizationEntitlements(prisma, {
      userId: input.userId,
      organizationId: ctx.organizationId,
    }),
    prisma.organizationMember.findMany({
      where: { organizationId: ctx.organizationId },
      include: {
        user: { select: { id: true, name: true, email: true, image: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.invitation.findMany({
      where: {
        organizationId: ctx.organizationId,
        status: "pending",
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.organization.findUniqueOrThrow({
      where: { id: ctx.organizationId },
      select: { id: true, name: true, slug: true },
    }),
  ]);

  return {
    organization,
    role: ctx.membership.role,
    seats: scanAccess.seats,
    members: members.map((m) => ({
      id: m.id,
      userId: m.userId,
      role: m.role,
      createdAt: m.createdAt.toISOString(),
      user: m.user,
    })),
    invitations: invitations.map((inv) => ({
      id: inv.id,
      email: inv.email,
      role: inv.role,
      status: inv.status,
      expiresAt: inv.expiresAt.toISOString(),
      createdAt: inv.createdAt.toISOString(),
    })),
  };
};

export const createOrganizationInvitation = async (
  prisma: PrismaClient,
  input: {
    userId: string;
    organizationId: string | null;
    email: string;
    role?: MemberRole;
  },
) => {
  const ctx = requireOrgRole(
    await requireOrgMembership(prisma, input.userId, input.organizationId),
    ["OWNER", "ADMIN"],
  );

  const email = normalizeEmail(input.email);
  if (!email || !email.includes("@")) throw badRequest("invalid_email");

  const role: MemberRole =
    input.role === "ADMIN" || input.role === "MEMBER" ? input.role : "MEMBER";

  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    const alreadyMember = await prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId: ctx.organizationId,
          userId: existingUser.id,
        },
      },
    });
    if (alreadyMember) throw conflict("already_a_member");
  }

  const pending = await prisma.invitation.findFirst({
    where: {
      organizationId: ctx.organizationId,
      email,
      status: "pending",
      expiresAt: { gt: new Date() },
    },
  });
  if (pending) throw conflict("invite_already_pending");

  const [memberCount, pendingCount, { scanAccess }] = await Promise.all([
    prisma.organizationMember.count({
      where: { organizationId: ctx.organizationId },
    }),
    prisma.invitation.count({
      where: {
        organizationId: ctx.organizationId,
        status: "pending",
        expiresAt: { gt: new Date() },
      },
    }),
    getOrganizationEntitlements(prisma, {
      userId: input.userId,
      organizationId: ctx.organizationId,
    }),
  ]);

  if (memberCount + pendingCount >= scanAccess.seats.seatLimit) {
    if (memberCount + pendingCount >= scanAccess.seats.selfServiceCap) {
      throw forbidden("seat_limit_contact_sales");
    }
    throw conflict("seat_limit_reached");
  }

  const token = randomBytes(32).toString("hex");
  const invitation = await prisma.invitation.create({
    data: {
      organizationId: ctx.organizationId,
      email,
      role,
      status: "pending",
      token,
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      inviterId: input.userId,
    },
  });

  const [organization, inviter] = await Promise.all([
    prisma.organization.findUniqueOrThrow({
      where: { id: ctx.organizationId },
      select: { name: true },
    }),
    prisma.user.findUnique({
      where: { id: input.userId },
      select: { name: true, email: true },
    }),
  ]);

  const acceptUrl = joinUrl(
    resolveSaasAppUrl(),
    `/accept-invite?token=${encodeURIComponent(token)}`,
  );
  const copy = inviteEmailCopy({
    organizationName: organization.name,
    inviterName: inviter?.name || inviter?.email || "Ένα μέλος",
    acceptUrl,
    role,
  });
  const emailSent = await sendMail({
    to: email,
    subject: copy.subject,
    html: copy.html,
    text: copy.text,
  });

  return {
    invitation: {
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      status: invitation.status,
      expiresAt: invitation.expiresAt.toISOString(),
      createdAt: invitation.createdAt.toISOString(),
    },
    emailSent,
    acceptUrl: process.env.NODE_ENV === "development" ? acceptUrl : undefined,
  };
};

export const cancelOrganizationInvitation = async (
  prisma: PrismaClient,
  input: { userId: string; organizationId: string | null; invitationId: string },
) => {
  const ctx = requireOrgRole(
    await requireOrgMembership(prisma, input.userId, input.organizationId),
    ["OWNER", "ADMIN"],
  );
  const invitation = await prisma.invitation.findFirst({
    where: { id: input.invitationId, organizationId: ctx.organizationId },
  });
  if (!invitation) throw notFound("invitation_not_found");
  if (invitation.status !== "pending") throw conflict("invitation_not_pending");

  await prisma.invitation.update({
    where: { id: invitation.id },
    data: { status: "cancelled" },
  });
  return { ok: true as const };
};

export const acceptOrganizationInvitation = async (
  prisma: PrismaClient,
  input: { userId: string; token: string },
) => {
  const token = input.token.trim();
  if (!token) throw badRequest("token_required");

  const invitation = await prisma.invitation.findUnique({
    where: { token },
    include: { organization: { select: { id: true, name: true, slug: true } } },
  });
  if (!invitation || invitation.status !== "pending") {
    throw notFound("invitation_not_found");
  }
  if (invitation.expiresAt.getTime() < Date.now()) {
    await prisma.invitation.update({
      where: { id: invitation.id },
      data: { status: "expired" },
    });
    throw conflict("invitation_expired");
  }

  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { id: true, email: true },
  });
  if (!user?.email) throw forbidden("invite_email_mismatch");
  if (normalizeEmail(user.email) !== normalizeEmail(invitation.email)) {
    throw forbidden("invite_email_mismatch");
  }

  const existing = await prisma.organizationMember.findUnique({
    where: {
      organizationId_userId: {
        organizationId: invitation.organizationId,
        userId: input.userId,
      },
    },
  });
  if (existing) {
    await prisma.invitation.update({
      where: { id: invitation.id },
      data: { status: "accepted" },
    });
    return {
      organization: invitation.organization,
      role: existing.role,
    };
  }

  const actorUserId = await resolveInviteActorUserId(
    prisma,
    invitation.organizationId,
    invitation.inviterId,
  );
  await assertCanAddOrganizationMember(prisma, {
    userId: actorUserId,
    organizationId: invitation.organizationId,
  });
  await addOrganizationMember(prisma, {
    actorUserId,
    organizationId: invitation.organizationId,
    userId: input.userId,
    role: invitation.role === "ADMIN" ? "ADMIN" : "MEMBER",
  });

  await prisma.invitation.update({
    where: { id: invitation.id },
    data: { status: "accepted" },
  });

  return {
    organization: invitation.organization,
    role: invitation.role,
  };
};

export const removeOrganizationMember = async (
  prisma: PrismaClient,
  input: {
    userId: string;
    organizationId: string | null;
    memberUserId: string;
  },
) => {
  const ctx = requireOrgRole(
    await requireOrgMembership(prisma, input.userId, input.organizationId),
    ["OWNER", "ADMIN"],
  );

  if (input.memberUserId === ctx.userId) {
    throw badRequest("cannot_remove_self");
  }

  const target = await prisma.organizationMember.findUnique({
    where: {
      organizationId_userId: {
        organizationId: ctx.organizationId,
        userId: input.memberUserId,
      },
    },
  });
  if (!target) throw notFound("member_not_found");
  if (target.role === "OWNER") throw forbidden("cannot_remove_owner");
  if (ctx.membership.role === "ADMIN" && target.role === "ADMIN") {
    throw forbidden("insufficient_role");
  }

  await prisma.organizationMember.delete({ where: { id: target.id } });
  return { ok: true as const };
};

export const updateOrganizationMemberRole = async (
  prisma: PrismaClient,
  input: {
    userId: string;
    organizationId: string | null;
    memberUserId: string;
    role: MemberRole;
  },
) => {
  const ctx = requireOrgRole(
    await requireOrgMembership(prisma, input.userId, input.organizationId),
    ["OWNER"],
  );

  if (input.role !== "ADMIN" && input.role !== "MEMBER") {
    throw badRequest("invalid_role");
  }
  if (input.memberUserId === ctx.userId) {
    throw badRequest("cannot_change_own_role");
  }

  const target = await prisma.organizationMember.findUnique({
    where: {
      organizationId_userId: {
        organizationId: ctx.organizationId,
        userId: input.memberUserId,
      },
    },
  });
  if (!target) throw notFound("member_not_found");
  if (target.role === "OWNER") throw forbidden("cannot_change_owner_role");

  const updated = await prisma.organizationMember.update({
    where: { id: target.id },
    data: { role: input.role },
  });
  return {
    id: updated.id,
    userId: updated.userId,
    role: updated.role,
  };
};

export const peekInvitationByToken = async (
  prisma: PrismaClient,
  token: string,
) => {
  const invitation = await prisma.invitation.findUnique({
    where: { token: token.trim() },
    include: { organization: { select: { id: true, name: true, slug: true } } },
  });
  if (!invitation || invitation.status !== "pending") {
    throw notFound("invitation_not_found");
  }
  if (invitation.expiresAt.getTime() < Date.now()) {
    throw conflict("invitation_expired");
  }
  return {
    email: invitation.email,
    role: invitation.role,
    expiresAt: invitation.expiresAt.toISOString(),
    organization: invitation.organization,
  };
};
