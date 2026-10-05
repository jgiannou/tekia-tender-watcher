import type { Prisma, PrismaClient } from "@prisma/client";

/**
 * First-party product analytics for Ops Desk.
 * Failures must never break the primary user action.
 */

export const PRODUCT_EVENT_TYPES = [
  "user_signed_up",
  "email_verification_sent",
  "email_verified",
  "login_succeeded",
  "organization_created",
  "trial_started",
  "watch_profile_created",
  "tender_followed",
  "checkout_started",
  "subscription_started",
] as const;

export type ProductEventType = (typeof PRODUCT_EVENT_TYPES)[number] | string;

export type TrackProductEventInput = {
  type: ProductEventType;
  userId?: string | null;
  organizationId?: string | null;
  requestId?: string | null;
  sessionId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Record<string, unknown> | null;
};

const MAX_META_KEYS = 24;
const MAX_META_STRING = 500;

const truncate = (value: string, max: number): string =>
  value.length <= max ? value : `${value.slice(0, max - 1)}…`;

const sanitizeMetadata = (
  meta: Record<string, unknown> | null | undefined,
): Record<string, unknown> | undefined => {
  if (!meta) return undefined;
  const out: Record<string, unknown> = {};
  let count = 0;
  for (const [key, value] of Object.entries(meta)) {
    if (count >= MAX_META_KEYS) break;
    if (typeof value === "string") {
      out[key] = truncate(value, MAX_META_STRING);
    } else if (
      typeof value === "number" ||
      typeof value === "boolean" ||
      value === null
    ) {
      out[key] = value;
    } else if (Array.isArray(value)) {
      out[key] = value.slice(0, 20).map((v) =>
        typeof v === "string" ? truncate(v, 120) : v,
      );
    }
    count += 1;
  }
  return Object.keys(out).length ? out : undefined;
};

export const trackProductEvent = async (
  prisma: PrismaClient,
  input: TrackProductEventInput,
): Promise<{ id: string } | null> => {
  try {
    const type = truncate(String(input.type || "").trim(), 80);
    if (!type) return null;
    const row = await prisma.productEvent.create({
      data: {
        type,
        userId: input.userId || null,
        organizationId: input.organizationId || null,
        sessionId: input.sessionId
          ? truncate(input.sessionId, 64)
          : null,
        requestId: input.requestId
          ? truncate(input.requestId, 128)
          : null,
        entityType: input.entityType
          ? truncate(input.entityType, 64)
          : null,
        entityId: input.entityId ? truncate(input.entityId, 64) : null,
        metadata:
          (sanitizeMetadata(input.metadata) as
            | Prisma.InputJsonValue
            | undefined) ?? undefined,
      },
      select: { id: true },
    });
    return row;
  } catch (error) {
    console.error(
      "[product-events] track failed:",
      error instanceof Error ? error.message : error,
    );
    return null;
  }
};

/** Fire-and-forget. */
export const trackProductEventSafe = (
  prisma: PrismaClient,
  input: TrackProductEventInput,
): void => {
  void trackProductEvent(prisma, input);
};
