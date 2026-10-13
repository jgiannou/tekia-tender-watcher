import {
  Prisma,
  type OrganizationPromotionStatus,
  type PrismaClient,
} from "@prisma/client";
import {
  ARC_PRO_LAUNCH_30_DURATION_MS,
  ARC_PRO_LAUNCH_30_KEY,
  loadArcProLaunchConfig,
} from "../promotions/arc-pro-launch.js";
import { badRequest, conflict, notFound, SaasError } from "../errors.js";
import {
  assertCapacityAvailable,
  countConsumedPromotionSlots,
  ensurePromotionCapacity,
  getPromotionCapacitySnapshot,
} from "./promotion-capacity.js";
import {
  ensureOrganizationSubscription,
  isTrialingActiveSubscription,
} from "./scan-access.js";
import { daysRemainingUtc, hasPaidStripeOrPaidPlan } from "./promotions.js";

const isPrismaSerializationFailure = (error: unknown): boolean => {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2034"
  ) {
    return true;
  }
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return (
      msg.includes("could not serialize") ||
      msg.includes("write conflict") ||
      msg.includes("deadlock")
    );
  }
  return false;
};

export type PromotionAdminSummary = {
  promotionKey: string;
  promotionEnabled: boolean;
  capacity: number;
  consumedSlots: number;
  remainingSlots: number;
  capacityCeiling: number;
  activeCount: number;
  expiredCount: number;
  revokedCount: number;
  supersededCount: number;
  historicalActivations: number;
  lowSlotsWarning: boolean;
  exhausted: boolean;
};

const mapDisplayStatus = (
  status: OrganizationPromotionStatus,
): string => {
  if (status === "SUPERSEDED") return "SUPERSEDED_BY_PAID";
  return status;
};

export const getPromotionAdminSummary = async (
  prisma: PrismaClient,
): Promise<PromotionAdminSummary> => {
  const cfg = loadArcProLaunchConfig();
  const snap = await getPromotionCapacitySnapshot(prisma);
  const [activeCount, expiredCount, revokedCount, supersededCount, historical] =
    await Promise.all([
      prisma.organizationPromotionRedemption.count({
        where: { promotionKey: snap.promotionKey, status: "ACTIVE" },
      }),
      prisma.organizationPromotionRedemption.count({
        where: { promotionKey: snap.promotionKey, status: "EXPIRED" },
      }),
      prisma.organizationPromotionRedemption.count({
        where: { promotionKey: snap.promotionKey, status: "REVOKED" },
      }),
      prisma.organizationPromotionRedemption.count({
        where: { promotionKey: snap.promotionKey, status: "SUPERSEDED" },
      }),
      prisma.organizationPromotionRedemption.count({
        where: { promotionKey: snap.promotionKey },
      }),
    ]);

  return {
    promotionKey: snap.promotionKey,
    promotionEnabled: cfg.enabled,
    capacity: snap.capacity,
    consumedSlots: snap.consumedSlots,
    remainingSlots: snap.remainingSlots,
    capacityCeiling: snap.capacityCeiling,
    activeCount,
    expiredCount,
    revokedCount,
    supersededCount,
    historicalActivations: historical,
    lowSlotsWarning: snap.remainingSlots > 0 && snap.remainingSlots <= 5,
    exhausted: snap.remainingSlots <= 0,
  };
};

export const listPromotionRedemptions = async (
  prisma: PrismaClient,
  input: {
    status?: string | null;
    q?: string | null;
    limit?: number;
    offset?: number;
  },
) => {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
  const offset = Math.max(input.offset ?? 0, 0);
  const statusFilter = input.status?.trim().toUpperCase() || null;
  const q = input.q?.trim() || null;

  const where: Prisma.OrganizationPromotionRedemptionWhereInput = {
    promotionKey: ARC_PRO_LAUNCH_30_KEY,
  };

  if (statusFilter && statusFilter !== "ALL") {
    if (statusFilter === "SUPERSEDED_BY_PAID" || statusFilter === "PAID") {
      where.status = "SUPERSEDED";
    } else if (
      statusFilter === "ACTIVE" ||
      statusFilter === "EXPIRED" ||
      statusFilter === "REVOKED" ||
      statusFilter === "SUPERSEDED"
    ) {
      where.status = statusFilter;
    }
  }

  if (q) {
    where.OR = [
      { organizationId: { contains: q, mode: "insensitive" } },
      { organization: { name: { contains: q, mode: "insensitive" } } },
    ];
  }

  const [total, rows] = await Promise.all([
    prisma.organizationPromotionRedemption.count({ where }),
    prisma.organizationPromotionRedemption.findMany({
      where,
      orderBy: { activatedAt: "desc" },
      take: limit,
      skip: offset,
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            members: {
              where: { role: "OWNER" },
              take: 1,
              include: {
                user: { select: { email: true, name: true } },
              },
            },
            subscription: {
              select: {
                planKey: true,
                status: true,
                stripeSubscriptionId: true,
              },
            },
          },
        },
      },
    }),
  ]);

  const now = new Date();
  return {
    total,
    limit,
    offset,
    items: rows.map((row) => {
      const owner = row.organization.members[0]?.user ?? null;
      return {
        id: row.id,
        organizationId: row.organizationId,
        organizationName: row.organization.name,
        ownerEmail: owner?.email ?? null,
        ownerName: owner?.name ?? null,
        status: mapDisplayStatus(row.status),
        source: row.source,
        activatedAt: row.activatedAt.toISOString(),
        expiresAt: row.expiresAt.toISOString(),
        daysRemaining:
          row.status === "ACTIVE"
            ? daysRemainingUtc(row.expiresAt, now)
            : 0,
        slotConsumed: row.slotConsumed,
        slotRestoredAt: row.slotRestoredAt?.toISOString() ?? null,
        revokedAt: row.revokedAt?.toISOString() ?? null,
        planKey: row.organization.subscription?.planKey ?? "free",
        hasPaidStripe: Boolean(
          row.organization.subscription?.stripeSubscriptionId,
        ),
      };
    }),
  };
};

export const listPromotionAuditEvents = async (
  prisma: PrismaClient,
  input: { limit?: number; offset?: number },
) => {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
  const offset = Math.max(input.offset ?? 0, 0);
  const where = { promotionKey: ARC_PRO_LAUNCH_30_KEY };
  const [total, items] = await Promise.all([
    prisma.promotionAuditEvent.count({ where }),
    prisma.promotionAuditEvent.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
  ]);
  return {
    total,
    limit,
    offset,
    items: items.map((e) => ({
      id: e.id,
      actionType: e.actionType,
      organizationId: e.organizationId,
      redemptionId: e.redemptionId,
      previousCapacity: e.previousCapacity,
      newCapacity: e.newCapacity,
      previousStatus: e.previousStatus,
      newStatus: e.newStatus,
      reason: e.reason,
      performedBy: e.performedBy,
      idempotencyKey: e.idempotencyKey,
      createdAt: e.createdAt.toISOString(),
    })),
  };
};

export const adminGrantPromotion = async (
  prisma: PrismaClient,
  input: {
    organizationId: string;
    performedBy: string;
    reason: string;
    /** Required when public campaign flag is disabled. */
    forceWhenDisabled?: boolean;
    idempotencyKey?: string | null;
    now?: Date;
  },
) => {
  const now = input.now ?? new Date();
  const cfg = loadArcProLaunchConfig();
  if (!cfg.enabled && !input.forceWhenDisabled) {
    throw badRequest("promo_disabled_use_force");
  }
  if (!input.reason.trim()) throw badRequest("reason_required");

  if (input.idempotencyKey) {
    const replay = await prisma.promotionAuditEvent.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (replay?.redemptionId) {
      const existing = await prisma.organizationPromotionRedemption.findUnique({
        where: { id: replay.redemptionId },
      });
      if (existing) {
        return {
          ok: true as const,
          replayed: true as const,
          redemption: existing,
        };
      }
    }
  }

  const org = await prisma.organization.findUnique({
    where: { id: input.organizationId },
    include: {
      members: {
        where: { role: "OWNER" },
        take: 1,
        select: { userId: true },
      },
    },
  });
  if (!org) throw notFound("organization_not_found");

  const activatorId = org.members[0]?.userId;
  if (!activatorId) throw badRequest("organization_has_no_owner");

  const subscription = await ensureOrganizationSubscription(
    prisma,
    input.organizationId,
  );
  if (hasPaidStripeOrPaidPlan(subscription)) {
    throw conflict("paid_plan_active");
  }
  if (isTrialingActiveSubscription(subscription, now)) {
    throw conflict("active_pro_trial");
  }

  const existing = await prisma.organizationPromotionRedemption.findUnique({
    where: {
      organizationId_promotionKey: {
        organizationId: input.organizationId,
        promotionKey: ARC_PRO_LAUNCH_30_KEY,
      },
    },
  });
  if (existing?.status === "ACTIVE" && existing.expiresAt.getTime() > now.getTime()) {
    throw conflict("already_active");
  }
  if (existing && existing.slotConsumed) {
    throw conflict("already_redeemed_restore_first");
  }

  const expiresAt = new Date(now.getTime() + ARC_PRO_LAUNCH_30_DURATION_MS);

  const maxAttempts = 8;
  let created: Awaited<
    ReturnType<typeof prisma.organizationPromotionRedemption.create>
  > | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      created = await prisma.$transaction(
        async (tx) => {
          await assertCapacityAvailable(tx, ARC_PRO_LAUNCH_30_KEY);
          const redemption = existing
            ? await tx.organizationPromotionRedemption.update({
                where: { id: existing.id },
                data: {
                  status: "ACTIVE",
                  source: "ADMIN",
                  activatedByUserId: activatorId,
                  activatedAt: now,
                  expiresAt,
                  slotConsumed: true,
                  slotRestoredAt: null,
                  revokedAt: null,
                  revokedBy: null,
                  revokeReason: null,
                  activationEmailSentAt: null,
                  reminder7dSentAt: null,
                  reminder2dSentAt: null,
                  expiredNotifiedAt: null,
                  attribution: {
                    source: "admin_grant",
                    performedBy: input.performedBy,
                  },
                },
              })
            : await tx.organizationPromotionRedemption.create({
                data: {
                  organizationId: input.organizationId,
                  promotionKey: ARC_PRO_LAUNCH_30_KEY,
                  activatedByUserId: activatorId,
                  activatedAt: now,
                  expiresAt,
                  status: "ACTIVE",
                  source: "ADMIN",
                  slotConsumed: true,
                  attribution: {
                    source: "admin_grant",
                    performedBy: input.performedBy,
                  },
                },
              });

          await tx.promotionAuditEvent.create({
            data: {
              promotionKey: ARC_PRO_LAUNCH_30_KEY,
              actionType: "ADMIN_GRANT",
              organizationId: input.organizationId,
              redemptionId: redemption.id,
              previousStatus: existing?.status ?? null,
              newStatus: "ACTIVE",
              reason: input.reason.slice(0, 1000),
              performedBy: input.performedBy,
              idempotencyKey: input.idempotencyKey ?? null,
              metadata: {
                forceWhenDisabled: Boolean(input.forceWhenDisabled),
                publicEnabled: cfg.enabled,
              },
            },
          });
          return redemption;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      break;
    } catch (error) {
      if (error instanceof SaasError) throw error;
      if (isPrismaSerializationFailure(error) && attempt < maxAttempts - 1) {
        await new Promise((resolve) =>
          setTimeout(
            resolve,
            15 * (attempt + 1) + Math.floor(Math.random() * 20),
          ),
        );
        continue;
      }
      if (isPrismaSerializationFailure(error)) {
        const snap = await getPromotionCapacitySnapshot(prisma);
        if (snap.remainingSlots <= 0) throw conflict("promo_cap_reached");
        throw conflict("promo_activation_busy");
      }
      throw error;
    }
  }
  if (!created) throw conflict("promo_cap_reached");

  const { maybeEmitPromotionSlotThresholdAlerts } = await import(
    "./promotion-capacity.js"
  );
  void maybeEmitPromotionSlotThresholdAlerts(prisma, ARC_PRO_LAUNCH_30_KEY);

  const { trackProductEventSafe } = await import("../ops/product-events.js");
  trackProductEventSafe(prisma, {
    type: "pro_trial_started",
    userId: activatorId,
    organizationId: input.organizationId,
    metadata: {
      promotionKey: ARC_PRO_LAUNCH_30_KEY,
      activatedAt: created.activatedAt.toISOString(),
      expiresAt: created.expiresAt.toISOString(),
      source: "arc_pro_launch_30",
      activationSource: "ADMIN",
      performedBy: input.performedBy,
      // Explicit: not a paid acquisition / Ads conversion.
      notPaidPurchase: true,
    },
  });

  return { ok: true as const, replayed: false as const, redemption: created };
};

export const adminRevokePromotion = async (
  prisma: PrismaClient,
  input: {
    organizationId: string;
    performedBy: string;
    reason: string;
    restoreSlot: boolean;
    idempotencyKey?: string | null;
    now?: Date;
  },
) => {
  if (!input.reason.trim()) throw badRequest("reason_required");
  const now = input.now ?? new Date();

  if (input.idempotencyKey) {
    const replay = await prisma.promotionAuditEvent.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (replay) {
      return { ok: true as const, replayed: true as const, auditId: replay.id };
    }
  }

  const redemption = await prisma.organizationPromotionRedemption.findUnique({
    where: {
      organizationId_promotionKey: {
        organizationId: input.organizationId,
        promotionKey: ARC_PRO_LAUNCH_30_KEY,
      },
    },
  });
  if (!redemption) throw notFound("redemption_not_found");
  if (redemption.status === "REVOKED" && !input.restoreSlot) {
    throw conflict("already_revoked");
  }

  const subscription = await ensureOrganizationSubscription(
    prisma,
    input.organizationId,
  );
  // Never touch paid Stripe state — revoke only the promo row.
  void subscription;

  const updated = await prisma.$transaction(
    async (tx) => {
      const wasConsumed = redemption.slotConsumed;
      const restore =
        input.restoreSlot && wasConsumed && !redemption.slotRestoredAt;
      if (input.restoreSlot && redemption.slotRestoredAt) {
        throw conflict("slot_already_restored");
      }

      const next = await tx.organizationPromotionRedemption.update({
        where: { id: redemption.id },
        data: {
          status: "REVOKED",
          revokedAt: now,
          revokedBy: input.performedBy,
          revokeReason: input.reason.slice(0, 1000),
          ...(restore
            ? { slotConsumed: false, slotRestoredAt: now }
            : {}),
        },
      });

      await tx.promotionAuditEvent.create({
        data: {
          promotionKey: ARC_PRO_LAUNCH_30_KEY,
          actionType: restore ? "REVOKE_AND_RESTORE_SLOT" : "REVOKE",
          organizationId: input.organizationId,
          redemptionId: redemption.id,
          previousStatus: redemption.status,
          newStatus: "REVOKED",
          reason: input.reason.slice(0, 1000),
          performedBy: input.performedBy,
          idempotencyKey: input.idempotencyKey ?? null,
          metadata: {
            restoreSlot: input.restoreSlot,
            slotWasConsumed: wasConsumed,
            slotRestored: restore,
          },
        },
      });
      return next;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );

  return { ok: true as const, replayed: false as const, redemption: updated };
};

export const adminRestoreSlot = async (
  prisma: PrismaClient,
  input: {
    organizationId: string;
    performedBy: string;
    reason: string;
    idempotencyKey?: string | null;
  },
) => {
  if (!input.reason.trim()) throw badRequest("reason_required");

  if (input.idempotencyKey) {
    const replay = await prisma.promotionAuditEvent.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (replay) {
      return { ok: true as const, replayed: true as const, auditId: replay.id };
    }
  }

  const redemption = await prisma.organizationPromotionRedemption.findUnique({
    where: {
      organizationId_promotionKey: {
        organizationId: input.organizationId,
        promotionKey: ARC_PRO_LAUNCH_30_KEY,
      },
    },
  });
  if (!redemption) throw notFound("redemption_not_found");
  if (!redemption.slotConsumed) {
    throw conflict("slot_not_consumed");
  }
  if (redemption.slotRestoredAt) {
    throw conflict("slot_already_restored");
  }
  if (redemption.status === "ACTIVE") {
    throw conflict("revoke_before_restore");
  }

  const updated = await prisma.$transaction(
    async (tx) => {
      const next = await tx.organizationPromotionRedemption.update({
        where: { id: redemption.id },
        data: {
          slotConsumed: false,
          slotRestoredAt: new Date(),
        },
      });
      await tx.promotionAuditEvent.create({
        data: {
          promotionKey: ARC_PRO_LAUNCH_30_KEY,
          actionType: "SLOT_RESTORE",
          organizationId: input.organizationId,
          redemptionId: redemption.id,
          previousStatus: redemption.status,
          newStatus: redemption.status,
          reason: input.reason.slice(0, 1000),
          performedBy: input.performedBy,
          idempotencyKey: input.idempotencyKey ?? null,
        },
      });
      return next;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );

  return { ok: true as const, replayed: false as const, redemption: updated };
};

export { ensurePromotionCapacity, countConsumedPromotionSlots };
