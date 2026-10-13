import { Prisma, type PrismaClient } from "@prisma/client";
import {
  ARC_PRO_LAUNCH_30_KEY,
  loadArcProLaunchConfig,
} from "../promotions/arc-pro-launch.js";
import { badRequest, conflict } from "../errors.js";

export type PromotionCapacitySnapshot = {
  promotionKey: string;
  capacity: number;
  consumedSlots: number;
  remainingSlots: number;
  capacityCeiling: number;
};

/** Count slots that currently consume capacity (not restorations). */
type DbClient = PrismaClient | Prisma.TransactionClient;

export const countConsumedPromotionSlots = (
  prisma: DbClient,
  promotionKey: string = ARC_PRO_LAUNCH_30_KEY,
) =>
  prisma.organizationPromotionRedemption.count({
    where: { promotionKey, slotConsumed: true },
  });

/**
 * Ensure a PromotionCampaignConfig row exists and return capacity.
 * Seeds from env seedCapacity (default 25) on first access.
 */
export const ensurePromotionCapacity = async (
  prisma: DbClient,
  promotionKey: string = ARC_PRO_LAUNCH_30_KEY,
  env: NodeJS.ProcessEnv = process.env,
): Promise<number> => {
  const config = loadArcProLaunchConfig(env);
  const existing = await prisma.promotionCampaignConfig.findUnique({
    where: { promotionKey },
  });
  if (existing) return existing.capacity;

  const created = await prisma.promotionCampaignConfig.create({
    data: {
      promotionKey,
      capacity: config.seedCapacity,
      updatedBy: "system:seed",
      note: "Auto-seeded from env/default",
    },
  });
  return created.capacity;
};

export const getPromotionCapacitySnapshot = async (
  prisma: PrismaClient,
  promotionKey: string = ARC_PRO_LAUNCH_30_KEY,
  env: NodeJS.ProcessEnv = process.env,
): Promise<PromotionCapacitySnapshot> => {
  const cfg = loadArcProLaunchConfig(env);
  const capacity = await ensurePromotionCapacity(prisma, promotionKey, env);
  const consumedSlots = await countConsumedPromotionSlots(prisma, promotionKey);
  return {
    promotionKey,
    capacity,
    consumedSlots,
    remainingSlots: Math.max(0, capacity - consumedSlots),
    capacityCeiling: cfg.capacityCeiling,
  };
};

export const assertCapacityAvailable = async (
  tx: Prisma.TransactionClient,
  promotionKey: string,
  env: NodeJS.ProcessEnv = process.env,
) => {
  const capacity = await ensurePromotionCapacity(tx, promotionKey, env);
  const consumed = await countConsumedPromotionSlots(tx, promotionKey);
  if (consumed >= capacity) {
    throw conflict("promo_cap_reached");
  }
  return { capacity, consumed, remaining: capacity - consumed };
};

/**
 * Idempotent ops alerts when remaining slots hit 5 or 0.
 * Uses audit ledger idempotency keys — no duplicate Slack/log spam.
 */
export const maybeEmitPromotionSlotThresholdAlerts = async (
  prisma: PrismaClient,
  promotionKey: string = ARC_PRO_LAUNCH_30_KEY,
) => {
  const snap = await getPromotionCapacitySnapshot(prisma, promotionKey);
  const thresholds: Array<0 | 5> = [];
  if (snap.remainingSlots === 5) thresholds.push(5);
  if (snap.remainingSlots === 0) thresholds.push(0);

  for (const remaining of thresholds) {
    const idempotencyKey = `slot_alert:${promotionKey}:rem${remaining}:cap${snap.capacity}`;
    try {
      await prisma.promotionAuditEvent.create({
        data: {
          promotionKey,
          actionType:
            remaining === 0 ? "SLOT_ALERT_EXHAUSTED" : "SLOT_ALERT_LOW",
          previousCapacity: snap.capacity,
          newCapacity: snap.capacity,
          reason:
            remaining === 0
              ? "Promotion capacity exhausted (0 slots remaining)"
              : "Promotion capacity low (5 slots remaining)",
          performedBy: "system:slot_alert",
          idempotencyKey,
          metadata: {
            remainingSlots: snap.remainingSlots,
            consumedSlots: snap.consumedSlots,
          },
        },
      });
      const { opsLogger } = await import("../ops/logger.js");
      opsLogger.warn(
        remaining === 0 ? "promo_slots_exhausted" : "promo_slots_low",
        {
          promotionKey,
          remainingSlots: snap.remainingSlots,
          capacity: snap.capacity,
          consumedSlots: snap.consumedSlots,
        },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        continue;
      }
      throw error;
    }
  }
};

export const setPromotionCapacity = async (
  prisma: PrismaClient,
  input: {
    promotionKey?: string;
    capacity: number;
    reason: string;
    performedBy: string;
    idempotencyKey?: string | null;
    env?: NodeJS.ProcessEnv;
  },
) => {
  const promotionKey = input.promotionKey ?? ARC_PRO_LAUNCH_30_KEY;
  const env = input.env ?? process.env;
  const cfg = loadArcProLaunchConfig(env);
  const next = Math.floor(input.capacity);
  if (!Number.isFinite(next) || next < 1) {
    throw badRequest("invalid_capacity");
  }
  if (next > cfg.capacityCeiling) {
    throw badRequest("capacity_above_ceiling");
  }

  if (input.idempotencyKey) {
    const existing = await prisma.promotionAuditEvent.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) {
      const snap = await getPromotionCapacitySnapshot(prisma, promotionKey, env);
      return { ...snap, replayed: true as const, auditId: existing.id };
    }
  }

  return prisma.$transaction(
    async (tx) => {
      const previous = await ensurePromotionCapacity(tx, promotionKey, env);
      const consumed = await countConsumedPromotionSlots(tx, promotionKey);
      if (next < consumed) {
        throw badRequest("capacity_below_consumed");
      }
      await tx.promotionCampaignConfig.update({
        where: { promotionKey },
        data: {
          capacity: next,
          updatedBy: input.performedBy,
          note: input.reason.slice(0, 500),
        },
      });
      const actionType =
        next > previous ? "CAPACITY_INCREASE" : "CAPACITY_DECREASE";
      const audit = await tx.promotionAuditEvent.create({
        data: {
          promotionKey,
          actionType,
          previousCapacity: previous,
          newCapacity: next,
          reason: input.reason.slice(0, 1000),
          performedBy: input.performedBy,
          idempotencyKey: input.idempotencyKey ?? null,
          metadata: { consumedSlots: consumed },
        },
      });
      return {
        promotionKey,
        capacity: next,
        consumedSlots: consumed,
        remainingSlots: Math.max(0, next - consumed),
        capacityCeiling: cfg.capacityCeiling,
        replayed: false as const,
        auditId: audit.id,
        previousCapacity: previous,
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
};
