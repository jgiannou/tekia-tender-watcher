import type { MemberRole, OrganizationMember, PrismaClient } from "@prisma/client";
import { forbidden, unauthorized } from "../errors.js";

export type OrgContext = {
  userId: string;
  organizationId: string;
  membership: OrganizationMember;
};

/**
 * Active organization MUST be validated against membership server-side.
 * Never trust a bare organizationId from the browser without this check.
 */
export const requireOrgMembership = async (
  prisma: PrismaClient,
  userId: string | null | undefined,
  organizationId: string | null | undefined,
): Promise<OrgContext> => {
  if (!userId) throw unauthorized();
  if (!organizationId) throw badOrg();

  const membership = await prisma.organizationMember.findUnique({
    where: {
      organizationId_userId: {
        organizationId,
        userId,
      },
    },
  });

  if (!membership) throw forbidden("not_a_member");

  return { userId, organizationId, membership };
};

export const requireOrgRole = (
  ctx: OrgContext,
  roles: MemberRole[],
): OrgContext => {
  if (!roles.includes(ctx.membership.role)) {
    throw forbidden("insufficient_role");
  }
  return ctx;
};

const badOrg = () => forbidden("organization_required");
