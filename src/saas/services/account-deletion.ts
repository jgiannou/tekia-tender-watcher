import type { PrismaClient } from "@prisma/client";
import { verifyPassword } from "better-auth/crypto";
import { SaasError } from "../errors.js";
import { getStripe, isStripeConfigured } from "../billing/stripe.js";

const accountDeletionError = (status: number, code: string) =>
  new SaasError(status, code, code);

export type DeleteAccountResult = {
  ok: true;
  userId: string;
  email: string;
  orgsDeleted: number;
  organizationIds: string[];
};

const cancelStripeForOrganizations = async (
  prisma: PrismaClient,
  organizationIds: string[],
): Promise<void> => {
  if (organizationIds.length === 0 || !isStripeConfigured()) return;

  const subscriptions = await prisma.subscription.findMany({
    where: {
      organizationId: { in: organizationIds },
      stripeSubscriptionId: { not: null },
    },
    select: { stripeSubscriptionId: true, organizationId: true },
  });

  if (subscriptions.length === 0) return;

  try {
    const stripe = getStripe();
    for (const sub of subscriptions) {
      if (!sub.stripeSubscriptionId) continue;
      try {
        await stripe.subscriptions.cancel(sub.stripeSubscriptionId);
      } catch (error) {
        console.warn("account_deletion_stripe_cancel_failed", {
          organizationId: sub.organizationId,
          stripeSubscriptionId: sub.stripeSubscriptionId,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  } catch (error) {
    console.warn("account_deletion_stripe_unavailable", {
      message: error instanceof Error ? error.message : String(error),
    });
  }
};

export const deleteUserAccount = async (
  prisma: PrismaClient,
  input: {
    userId: string;
    confirm: "DELETE";
    password?: string;
    /** When true (self-serve), require password for credential accounts. */
    requirePasswordIfCredential?: boolean;
  },
): Promise<DeleteAccountResult> => {
  if (input.confirm !== "DELETE") {
    throw accountDeletionError(400, "confirm_required");
  }

  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    include: {
      members: { include: { organization: true } },
      accounts: {
        where: { providerId: "credential" },
        select: { id: true, password: true },
      },
    },
  });
  if (!user) throw accountDeletionError(404, "user_not_found");

  const credential = user.accounts.find((a) => Boolean(a.password));
  if (input.requirePasswordIfCredential && credential?.password) {
    const password = String(input.password || "");
    if (!password) throw accountDeletionError(400, "password_required");
    const valid = await verifyPassword({
      hash: credential.password,
      password,
    });
    if (!valid) throw accountDeletionError(400, "invalid_password");
  }

  const orgsToDelete: string[] = [];
  for (const membership of user.members) {
    if (membership.role !== "OWNER") continue;
    const others = await prisma.organizationMember.count({
      where: {
        organizationId: membership.organizationId,
        userId: { not: user.id },
      },
    });
    if (others > 0) {
      throw accountDeletionError(
        400,
        "cannot_delete_while_owning_org_with_members",
      );
    }
    orgsToDelete.push(membership.organizationId);
  }

  await cancelStripeForOrganizations(prisma, orgsToDelete);

  await prisma.$transaction(async (tx) => {
    if (orgsToDelete.length > 0) {
      await tx.organization.deleteMany({
        where: { id: { in: orgsToDelete } },
      });
    }
    // Drop outstanding email verifications for this address.
    await tx.verification.deleteMany({
      where: { identifier: user.email },
    });
    await tx.user.delete({ where: { id: user.id } });
  });

  return {
    ok: true,
    userId: user.id,
    email: user.email,
    orgsDeleted: orgsToDelete.length,
    organizationIds: orgsToDelete,
  };
};
