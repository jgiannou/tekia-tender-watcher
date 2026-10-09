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
  // Stripe Checkout line_items[].price must be a Price ID (price_…), never a Product ID (prod_…).
  if (id.startsWith("prod_")) {
    throw new Error(
      `${key} is a Product ID (${id}); set the Price ID (price_…) from Stripe → Product → Pricing`,
    );
  }
  if (!id.startsWith("price_")) {
    throw new Error(
      `${key} must be a Stripe Price ID starting with price_ (got ${id.slice(0, 12)}…)`,
    );
  }
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

export const stripeErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** Map Stripe Checkout / Tax failures to stable API message codes. */
export const classifyStripeCheckoutError = (
  error: unknown,
): {
  message:
    | "stripe_tax_not_enabled"
    | "stripe_price_mismatch"
    | "stripe_customer_stale"
    | "stripe_price_tax_behavior"
    | "checkout_failed";
  detail: string;
  retryWithNewCustomer: boolean;
} => {
  const detail = stripeErrorMessage(error);
  if (/no such price|is a Product ID|must be a Stripe Price ID/i.test(detail)) {
    return {
      message: "stripe_price_mismatch",
      detail,
      retryWithNewCustomer: false,
    };
  }
  if (/no such customer/i.test(detail)) {
    return {
      message: "stripe_customer_stale",
      detail,
      retryWithNewCustomer: true,
    };
  }
  if (/tax_behavior|tax behavior/i.test(detail)) {
    return {
      message: "stripe_price_tax_behavior",
      detail,
      retryWithNewCustomer: false,
    };
  }
  if (/tax has not been activated/i.test(detail)) {
    return {
      message: "stripe_tax_not_enabled",
      detail,
      retryWithNewCustomer: false,
    };
  }
  return { message: "checkout_failed", detail, retryWithNewCustomer: false };
};
