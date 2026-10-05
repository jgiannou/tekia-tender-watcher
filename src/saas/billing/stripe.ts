import Stripe from "stripe";
import { PLAN_KEYS, type PublicPlanKey } from "../plans/catalog.js";

export type BillingInterval = "monthly" | "annual";

let stripeClient: Stripe | null = null;

export const isStripeConfigured = (
  env: NodeJS.ProcessEnv = process.env,
): boolean => {
  const secret = String(env.STRIPE_SECRET_KEY || "").trim();
  if (!secret) return false;
  return Boolean(
    String(env.STRIPE_PRICE_TENDERS_BASIC_MONTHLY || "").trim() ||
      String(env.STRIPE_PRICE_TENDERS_PRO_MONTHLY || "").trim(),
  );
};

export const getStripe = (env: NodeJS.ProcessEnv = process.env): Stripe => {
  const key = String(env.STRIPE_SECRET_KEY || "").trim();
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
  if (!stripeClient) {
    stripeClient = new Stripe(key);
  }
  return stripeClient;
};

const priceEnvKey = (
  plan: PublicPlanKey,
  interval: BillingInterval,
  kind: "base" | "extra_seat" = "base",
): string => {
  if (kind === "extra_seat") {
    return interval === "annual"
      ? "STRIPE_PRICE_TENDERS_EXTRA_SEAT_ANNUAL"
      : "STRIPE_PRICE_TENDERS_EXTRA_SEAT_MONTHLY";
  }
  if (plan === PLAN_KEYS.basic) {
    return interval === "annual"
      ? "STRIPE_PRICE_TENDERS_BASIC_ANNUAL"
      : "STRIPE_PRICE_TENDERS_BASIC_MONTHLY";
  }
  return interval === "annual"
    ? "STRIPE_PRICE_TENDERS_PRO_ANNUAL"
    : "STRIPE_PRICE_TENDERS_PRO_MONTHLY";
};

export const priceIdFor = (
  plan: PublicPlanKey,
  interval: BillingInterval,
  kind: "base" | "extra_seat" = "base",
  env: NodeJS.ProcessEnv = process.env,
): string => {
  const key = priceEnvKey(plan, interval, kind);
  const id = String(env[key] || "").trim();
  if (!id) throw new Error(`${key} is not configured`);
  return id;
};

export const resolvePlanFromPriceId = (
  priceId: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
): {
  planKey: PublicPlanKey | "extra_seat";
  interval: BillingInterval;
} | null => {
  if (!priceId) return null;
  const entries: Array<{
    planKey: PublicPlanKey | "extra_seat";
    interval: BillingInterval;
    envKey: string;
  }> = [
    {
      planKey: PLAN_KEYS.basic,
      interval: "monthly",
      envKey: "STRIPE_PRICE_TENDERS_BASIC_MONTHLY",
    },
    {
      planKey: PLAN_KEYS.basic,
      interval: "annual",
      envKey: "STRIPE_PRICE_TENDERS_BASIC_ANNUAL",
    },
    {
      planKey: PLAN_KEYS.pro,
      interval: "monthly",
      envKey: "STRIPE_PRICE_TENDERS_PRO_MONTHLY",
    },
    {
      planKey: PLAN_KEYS.pro,
      interval: "annual",
      envKey: "STRIPE_PRICE_TENDERS_PRO_ANNUAL",
    },
    {
      planKey: "extra_seat",
      interval: "monthly",
      envKey: "STRIPE_PRICE_TENDERS_EXTRA_SEAT_MONTHLY",
    },
    {
      planKey: "extra_seat",
      interval: "annual",
      envKey: "STRIPE_PRICE_TENDERS_EXTRA_SEAT_ANNUAL",
    },
  ];
  for (const entry of entries) {
    if (String(env[entry.envKey] || "").trim() === priceId) {
      return { planKey: entry.planKey, interval: entry.interval };
    }
  }
  return null;
};

export const checkoutSuccessUrl = (
  env: NodeJS.ProcessEnv = process.env,
): string => {
  const explicit = String(env.STRIPE_SUCCESS_URL || "").trim();
  if (explicit) return explicit;
  const app = String(env.SAAS_APP_URL || "http://127.0.0.1:5174").replace(
    /\/+$/,
    "",
  );
  return `${app}/app/subscription?checkout=success`;
};

export const checkoutCancelUrl = (
  env: NodeJS.ProcessEnv = process.env,
): string => {
  const explicit = String(env.STRIPE_CANCEL_URL || "").trim();
  if (explicit) return explicit;
  const app = String(env.SAAS_APP_URL || "http://127.0.0.1:5174").replace(
    /\/+$/,
    "",
  );
  return `${app}/app/subscription?checkout=cancel`;
};

export const portalReturnUrl = (
  env: NodeJS.ProcessEnv = process.env,
): string => {
  const app = String(env.SAAS_APP_URL || "http://127.0.0.1:5174").replace(
    /\/+$/,
    "",
  );
  return `${app}/app/subscription`;
};
