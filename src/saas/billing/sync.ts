import type { PrismaClient, Subscription, SubscriptionStatus } from "@prisma/client";
import { PLAN_KEYS, type PublicPlanKey } from "../plans/catalog.js";
import { getStripe, resolvePlanFromPriceId } from "./stripe.js";

export const mapStripeStatus = (
  status: string | null | undefined,
): SubscriptionStatus => {
  if (status === "active") return "ACTIVE";
  if (status === "trialing") return "TRIALING";
  if (status === "past_due" || status === "unpaid") return "PAST_DUE";
  if (status === "canceled" || status === "incomplete_expired") return "CANCELED";
  return "INCOMPLETE";
};

type PeriodEndSource = {
  cancel_at?: number | null;
  current_period_end?: number | null;
  items?: { data?: Array<{ current_period_end?: number | null }> } | null;
};

/** Stripe SDK v23+: period end lives on subscription items, not the subscription. */
export const stripeSubscriptionPeriodEnd = (
  sub: PeriodEndSource,
): number | null => {
  const fromItems = (sub.items?.data ?? [])
    .map((item) => item.current_period_end)
    .filter((n): n is number => typeof n === "number" && Number.isFinite(n));
  if (fromItems.length > 0) return Math.max(...fromItems);
  if (
    typeof sub.current_period_end === "number" &&
    Number.isFinite(sub.current_period_end)
  ) {
    return sub.current_period_end;
  }
  if (typeof sub.cancel_at === "number" && Number.isFinite(sub.cancel_at)) {
    return sub.cancel_at;
  }
  return null;
};

export type ApplyStripeSubscriptionInput = {
  organizationId: string;
  customerId?: string | null;
  subscriptionId?: string | null;
  status?: string | null;
  cancelAtPeriodEnd?: boolean | null;
  currentPeriodEnd?: number | null;
  /** Stripe subscription items — base plan + optional extra seats. */
  items?: Array<{ priceId: string | null; quantity: number }>;
  planMeta?: string | null;
  extraSeatsMeta?: string | null;
};

export const applyStripeSubscription = async (
  prisma: PrismaClient,
  input: ApplyStripeSubscriptionInput,
): Promise<Subscription> => {
  let planKey: PublicPlanKey = PLAN_KEYS.basic;
  let extraSeats = 0;
  let stripePriceId: string | null = null;

  for (const item of input.items ?? []) {
    const resolved = resolvePlanFromPriceId(item.priceId);
    if (!resolved) continue;
    if (resolved.planKey === "extra_seat") {
      extraSeats = Math.max(0, item.quantity);
      continue;
    }
    planKey = resolved.planKey;
    stripePriceId = item.priceId;
  }

  if (!stripePriceId && input.planMeta === "pro") planKey = PLAN_KEYS.pro;
  if (!stripePriceId && input.planMeta === "basic") planKey = PLAN_KEYS.basic;
  if (input.extraSeatsMeta != null && input.extraSeatsMeta !== "") {
    const parsed = Number(input.extraSeatsMeta);
    if (Number.isFinite(parsed)) extraSeats = Math.max(0, parsed);
  }

  const billingStatus = mapStripeStatus(input.status);
  const periodEnd =
    input.currentPeriodEnd != null && Number.isFinite(input.currentPeriodEnd)
      ? new Date(input.currentPeriodEnd * 1000)
      : null;

  const activeLike =
    billingStatus === "ACTIVE" || billingStatus === "TRIALING";

  return prisma.subscription.upsert({
    where: { organizationId: input.organizationId },
    create: {
      organizationId: input.organizationId,
      stripeCustomerId: input.customerId ?? null,
      stripeSubscriptionId: input.subscriptionId ?? null,
      stripePriceId,
      status: activeLike ? "ACTIVE" : billingStatus,
      planKey: activeLike ? planKey : PLAN_KEYS.trial,
      extraSeats: activeLike ? extraSeats : 0,
      cancelAtPeriodEnd: Boolean(input.cancelAtPeriodEnd),
      currentPeriodEnd: activeLike ? periodEnd : null,
      trialEndsAt: activeLike ? null : new Date(),
    },
    update: {
      ...(input.customerId ? { stripeCustomerId: input.customerId } : {}),
      ...(input.subscriptionId
        ? { stripeSubscriptionId: input.subscriptionId }
        : {}),
      ...(stripePriceId ? { stripePriceId } : {}),
      status: activeLike
        ? "ACTIVE"
        : billingStatus === "CANCELED"
          ? "CANCELED"
          : billingStatus,
      planKey: activeLike ? planKey : PLAN_KEYS.trial,
      extraSeats: activeLike ? extraSeats : 0,
      cancelAtPeriodEnd:
        billingStatus === "CANCELED" ? false : Boolean(input.cancelAtPeriodEnd),
      currentPeriodEnd: billingStatus === "CANCELED" ? null : periodEnd,
      trialEndsAt: activeLike ? null : undefined,
    },
  });
};

export const syncSubscriptionFromStripe = async (
  prisma: PrismaClient,
  organizationId: string,
): Promise<Subscription | null> => {
  const existing = await prisma.subscription.findUnique({
    where: { organizationId },
  });
  if (!existing?.stripeSubscriptionId) return existing;
  try {
    const stripe = getStripe();
    const sub = await stripe.subscriptions.retrieve(existing.stripeSubscriptionId);
    return applyStripeSubscription(prisma, {
      organizationId,
      customerId:
        typeof sub.customer === "string" ? sub.customer : sub.customer?.id,
      subscriptionId: sub.id,
      status: sub.status,
      cancelAtPeriodEnd: sub.cancel_at_period_end,
      currentPeriodEnd: stripeSubscriptionPeriodEnd(sub),
      items: (sub.items?.data ?? []).map((item) => ({
        priceId: typeof item.price === "string" ? item.price : item.price?.id,
        quantity: item.quantity ?? 1,
      })),
      planMeta: sub.metadata?.plan ?? null,
      extraSeatsMeta: sub.metadata?.extraSeats ?? null,
    });
  } catch (error) {
    console.error(
      "stripe sync failed:",
      error instanceof Error ? error.message : error,
    );
    return existing;
  }
};
