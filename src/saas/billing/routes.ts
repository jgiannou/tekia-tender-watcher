import type { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { requireOrgMembership } from "../auth/org-context.js";
import { badRequest, forbidden, serviceUnavailable } from "../errors.js";
import {
  BASIC_PLAN,
  CONTACT_FOR_MORE_SEATS_EL,
  PLAN_KEYS,
  PRO_PLAN,
  PRO_SELF_SERVICE_SEAT_CAP,
  publicPlans,
} from "../plans/catalog.js";
import {
  checkoutCancelUrl,
  checkoutSuccessUrl,
  classifyStripeCheckoutError,
  getStripe,
  isStripeConfigured,
  portalReturnUrl,
  priceIdFor,
  resolvePlanFromPriceId,
  stripeErrorMessage,
  type BillingInterval,
} from "./stripe.js";
import {
  applyStripeSubscription,
  stripeSubscriptionPeriodEnd,
  syncSubscriptionFromStripe,
} from "./sync.js";
import { trackProductEventSafe } from "../ops/product-events.js";

type BillingVariables = {
  userId: string;
  sessionToken: string;
  activeOrganizationId: string | null;
};

type RegisterBillingRoutesInput = {
  app: Hono<{ Variables: BillingVariables }>;
  prisma: PrismaClient;
  requireSession: MiddlewareHandler<{ Variables: BillingVariables }>;
  resolveOrgId: (c: {
    req: { header: (name: string) => string | undefined };
    get: (key: keyof BillingVariables) => string | null;
  }) => string | null;
};

const checkoutBodySchema = z.object({
  plan: z.enum(["basic", "pro"]),
  interval: z.enum(["monthly", "annual"]).default("monthly"),
  extraSeats: z.number().int().min(0).max(PRO_SELF_SERVICE_SEAT_CAP - 3).optional(),
});

export const registerBillingRoutes = (input: RegisterBillingRoutesInput) => {
  const { app, prisma, requireSession, resolveOrgId } = input;

  app.get("/api/saas/billing/catalog", async (c) => {
    return c.json({
      configured: isStripeConfigured(),
      notes: {
        vatExcluded: true,
        annualTwoMonthsFree: true,
        contactForMoreSeatsMessage: CONTACT_FOR_MORE_SEATS_EL,
        proSelfServiceSeatCap: PRO_SELF_SERVICE_SEAT_CAP,
      },
      plans: publicPlans().map((plan) => ({
        key: plan.planKey,
        code: plan.plan,
        label: plan.label,
        labelEl: plan.labelEl,
        positioning: plan.positioning,
        positioningEl: plan.positioningEl,
        monthlyEur: plan.priceMonthlyEur,
        annualEur: plan.priceYearlyEur,
        includedSeats: plan.includedSeats,
        maxSeatsSelfService: plan.maxSeatsSelfService,
        extraSeatMonthlyEur: plan.extraSeatPriceMonthlyEur,
        extraSeatAnnualEur: plan.extraSeatPriceYearlyEur,
        maxActiveWatchProfiles: plan.maxActiveWatchProfiles,
        maxActiveFollowedTenders: plan.maxActiveFollowedTenders,
        periodicScansPerDay: plan.periodicScansPerDay,
        storageBytes: plan.storageBytes,
        emailMode: plan.emailMode,
        advancedWatchProfileFilters: plan.advancedWatchProfileFilters,
        participationChecklist: plan.participationChecklist,
        expiringContractList: plan.expiringContractList,
        priceMemory: plan.priceMemory,
        featuresEl:
          plan.planKey === PLAN_KEYS.free
            ? [
                "1 χρήστης",
                "1 αποθηκευμένη αναζήτηση",
                "5 παρακολουθήσεις",
                "Ίδια ταχύτητα εισαγωγής ΚΗΜΔΗΣ (εντός 5 λεπτών)",
                "1 ομαδικό email / ημέρα",
                "Push και in-app ειδοποιήσεις",
                "Φίλτρο περιφέρειας",
                "Οθόνη νήματος διαγωνισμού",
              ]
            : plan.planKey === PLAN_KEYS.basic
              ? [
                  "1 χρήστης",
                  "έως 3 ενεργές αποθηκευμένες αναζητήσεις",
                  "έως 20 παρακολουθούμενοι διαγωνισμοί",
                  "Ίδια ταχύτητα εισαγωγής ΚΗΜΔΗΣ",
                  "250 MB αρχεία",
                  "Digest email — επιλέγετε ώρες",
                  "Φάκελος συμμετοχής από PDF",
                  "Λήγουσες συμβάσεις + μνήμη τιμής",
                  "Vault, καταγραφή ενδιαφέροντος & υποβολής",
                ]
              : [
                  "3 χρήστες συμπεριλαμβάνονται",
                  "έξτρα θέσεις €2,49 / χρήστη / μήνα",
                  "έως 15 ενεργές αποθηκευμένες αναζητήσεις",
                  "έως 100 παρακολουθούμενοι διαγωνισμοί",
                  "Ίδια ταχύτητα εισαγωγής ΚΗΜΔΗΣ",
                  "2 GB αρχεία",
                  "Άμεσα email για νέες εξελίξεις",
                  "Deadline radar — επερχόμενες προθεσμίες",
                  "Προχωρημένα φίλτρα αναζήτησης",
                  "Προτεραιότητα υποστήριξης",
                ],
      })),
      trial: {
        days: 7,
        noteEl:
          "Η εγγραφή ξεκινά στο δωρεάν πλάνο. Μπορείτε να δοκιμάσετε το Pro για 7 ημέρες χωριστά — δεν αντικαθιστά το Free.",
      },
      reference: {
        freeMonthlyEur: 0,
        basicMonthlyEur: BASIC_PLAN.priceMonthlyEur,
        proMonthlyEur: PRO_PLAN.priceMonthlyEur,
      },
    });
  });

  app.get("/api/saas/billing/status", requireSession, async (c) => {
    const userId = c.get("userId");
    const organizationId = resolveOrgId(c);
    const { organizationId: orgId, membership } = await requireOrgMembership(
      prisma,
      userId,
      organizationId,
    );
    const canManage =
      membership.role === "OWNER" || membership.role === "ADMIN";

    let subscription = await prisma.subscription.findUnique({
      where: { organizationId: orgId },
    });
    if (canManage && subscription?.stripeSubscriptionId && isStripeConfigured()) {
      subscription =
        (await syncSubscriptionFromStripe(prisma, orgId)) ?? subscription;
    }

    return c.json({
      configured: isStripeConfigured(),
      canManageBilling: canManage,
      planKey: subscription?.planKey ?? PLAN_KEYS.trial,
      status: subscription?.status ?? "INCOMPLETE",
      extraSeats: subscription?.extraSeats ?? 0,
      trialEndsAt: subscription?.trialEndsAt?.toISOString() ?? null,
      currentPeriodEnd: subscription?.currentPeriodEnd?.toISOString() ?? null,
      cancelAtPeriodEnd: Boolean(subscription?.cancelAtPeriodEnd),
      stripeCustomerId: subscription?.stripeCustomerId ?? null,
      stripeSubscriptionId: subscription?.stripeSubscriptionId ?? null,
      hasStripeSubscription: Boolean(subscription?.stripeSubscriptionId),
    });
  });

  app.post("/api/saas/billing/checkout", requireSession, async (c) => {
    if (!isStripeConfigured()) {
      throw serviceUnavailable("billing_not_configured");
    }
    const userId = c.get("userId");
    const organizationId = resolveOrgId(c);
    const { organizationId: orgId, membership } = await requireOrgMembership(
      prisma,
      userId,
      organizationId,
    );
    if (membership.role !== "OWNER" && membership.role !== "ADMIN") {
      throw forbidden("insufficient_role");
    }

    const body = checkoutBodySchema.parse(await c.req.json());
    const interval = body.interval as BillingInterval;
    const extraSeats =
      body.plan === "pro" ? Math.max(0, body.extraSeats ?? 0) : 0;
    if (body.plan === "pro" && 3 + extraSeats > PRO_SELF_SERVICE_SEAT_CAP) {
      throw badRequest("seat_limit_contact_sales");
    }

    const memberCount = await prisma.organizationMember.count({
      where: { organizationId: orgId },
    });
    const seatLimit =
      body.plan === "basic" ? 1 : Math.min(3 + extraSeats, PRO_SELF_SERVICE_SEAT_CAP);
    if (memberCount > seatLimit) {
      throw badRequest("too_many_members_for_plan");
    }

    const stripe = getStripe();
    let subscription = await prisma.subscription.findUnique({
      where: { organizationId: orgId },
    });

    // Already on this paid plan + seat count with an active Stripe sub → no-op.
    if (
      subscription?.stripeSubscriptionId &&
      subscription.status === "ACTIVE" &&
      subscription.planKey === body.plan &&
      (subscription.extraSeats ?? 0) === extraSeats
    ) {
      return c.json({ url: null, mode: "same" });
    }

    const createBillingCustomer = async (): Promise<string> => {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      const org = await prisma.organization.findUnique({ where: { id: orgId } });
      const customer = await stripe.customers.create({
        email: user?.email || undefined,
        name: org?.name,
        metadata: { organizationId: orgId, product: "arc_tenders" },
      });
      subscription = await prisma.subscription.upsert({
        where: { organizationId: orgId },
        create: {
          organizationId: orgId,
          stripeCustomerId: customer.id,
          status: "INCOMPLETE",
          planKey: PLAN_KEYS.trial,
        },
        update: {
          stripeCustomerId: customer.id,
          // Drop IDs from the other Stripe mode (test↔live) if any.
          stripeSubscriptionId: null,
        },
      });
      return customer.id;
    };

    const ensureBillingCustomer = async (): Promise<string> => {
      let customerId = subscription?.stripeCustomerId ?? null;
      if (customerId) {
        try {
          const existing = await stripe.customers.retrieve(customerId);
          if (!("deleted" in existing && existing.deleted)) {
            return customerId;
          }
        } catch (error) {
          const msg = stripeErrorMessage(error);
          if (!/no such customer/i.test(msg)) throw error;
          console.warn(
            "stale stripe customer (test/live mismatch?); recreating:",
            customerId,
          );
        }
        await prisma.subscription.update({
          where: { organizationId: orgId },
          data: { stripeCustomerId: null, stripeSubscriptionId: null },
        });
        if (subscription) {
          subscription = {
            ...subscription,
            stripeCustomerId: null,
            stripeSubscriptionId: null,
          };
        }
      }
      return createBillingCustomer();
    };

    let customerId = await ensureBillingCustomer();

    let basePrice: string;
    let seatPrice: string | null;
    try {
      basePrice = priceIdFor(body.plan, interval, "base");
      seatPrice =
        body.plan === "pro" ? priceIdFor("pro", interval, "extra_seat") : null;
    } catch (error) {
      const classified = classifyStripeCheckoutError(error);
      console.error("stripe price env invalid:", classified.detail);
      throw serviceUnavailable(
        classified.message === "checkout_failed"
          ? "stripe_price_not_configured"
          : classified.message,
        classified.detail,
      );
    }

    // In-place seat/plan update when a live Stripe subscription already exists.
    if (subscription?.stripeSubscriptionId) {
      try {
        const sub = await stripe.subscriptions.retrieve(
          subscription.stripeSubscriptionId,
        );
        if (sub.status !== "canceled" && sub.status !== "incomplete_expired") {
          let baseItemId: string | null = null;
          let seatItemId: string | null = null;
          for (const item of sub.items.data) {
            const priceId =
              typeof item.price === "string" ? item.price : item.price?.id;
            const resolved = resolvePlanFromPriceId(priceId);
            if (!resolved) continue;
            if (resolved.planKey === "extra_seat") seatItemId = item.id;
            else baseItemId = item.id;
          }

          const items: Array<{
            id?: string;
            price?: string;
            quantity?: number;
            deleted?: boolean;
          }> = [];
          if (baseItemId) {
            items.push({ id: baseItemId, price: basePrice, quantity: 1 });
          } else {
            items.push({ price: basePrice, quantity: 1 });
          }
          if (body.plan === "pro" && seatPrice && extraSeats > 0) {
            if (seatItemId) {
              items.push({
                id: seatItemId,
                price: seatPrice,
                quantity: extraSeats,
              });
            } else {
              items.push({ price: seatPrice, quantity: extraSeats });
            }
          } else if (seatItemId) {
            items.push({ id: seatItemId, deleted: true });
          }

          const updated = await stripe.subscriptions.update(sub.id, {
            items,
            proration_behavior: "always_invoice",
            automatic_tax: { enabled: true },
            metadata: {
              organizationId: orgId,
              plan: body.plan,
              extraSeats: String(extraSeats),
              interval,
              product: "arc_tenders",
            },
          });
          await applyStripeSubscription(prisma, {
            organizationId: orgId,
            customerId:
              typeof updated.customer === "string"
                ? updated.customer
                : customerId,
            subscriptionId: updated.id,
            status: updated.status,
            cancelAtPeriodEnd: updated.cancel_at_period_end,
            currentPeriodEnd: stripeSubscriptionPeriodEnd(updated),
            items: (updated.items?.data ?? []).map((item) => ({
              priceId:
                typeof item.price === "string" ? item.price : item.price?.id,
              quantity: item.quantity ?? 1,
            })),
            planMeta: body.plan,
            extraSeatsMeta: String(extraSeats),
          });
          return c.json({ url: null, mode: "updated", extraSeats });
        }
      } catch (error) {
        const msg = stripeErrorMessage(error);
        console.error("stripe subscription update failed:", msg);
        // Fall through to Checkout when update cannot complete (e.g. tax address).
      }
    }

    const lineItems: Array<{ price: string; quantity: number }> = [
      { price: basePrice, quantity: 1 },
    ];
    if (body.plan === "pro" && seatPrice && extraSeats > 0) {
      lineItems.push({ price: seatPrice, quantity: extraSeats });
    }

    const createCheckoutSession = async (stripeCustomerId: string) =>
      stripe.checkout.sessions.create({
        mode: "subscription",
        customer: stripeCustomerId,
        line_items: lineItems,
        success_url: checkoutSuccessUrl(),
        cancel_url: checkoutCancelUrl(),
        client_reference_id: orgId,
        automatic_tax: { enabled: true },
        billing_address_collection: "required",
        tax_id_collection: { enabled: true },
        customer_update: { address: "auto", name: "auto" },
        allow_promotion_codes: true,
        metadata: {
          organizationId: orgId,
          plan: body.plan,
          extraSeats: String(extraSeats),
          interval,
          product: "arc_tenders",
        },
        subscription_data: {
          metadata: {
            organizationId: orgId,
            plan: body.plan,
            extraSeats: String(extraSeats),
            interval,
            product: "arc_tenders",
          },
        },
      });

    try {
      let session;
      try {
        session = await createCheckoutSession(customerId);
      } catch (error) {
        const classified = classifyStripeCheckoutError(error);
        if (!classified.retryWithNewCustomer) throw error;
        console.warn(
          "stripe checkout stale customer; recreating and retrying:",
          classified.detail,
        );
        await prisma.subscription.update({
          where: { organizationId: orgId },
          data: { stripeCustomerId: null, stripeSubscriptionId: null },
        });
        customerId = await createBillingCustomer();
        session = await createCheckoutSession(customerId);
      }
      trackProductEventSafe(prisma, {
        type: "checkout_started",
        userId,
        organizationId: orgId,
        metadata: {
          plan: body.plan,
          interval,
          extraSeats,
        },
      });
      return c.json({ url: session.url, mode: "checkout" });
    } catch (error) {
      const classified = classifyStripeCheckoutError(error);
      console.error("stripe checkout failed:", classified.detail);
      throw serviceUnavailable(classified.message, classified.detail);
    }
  });

  app.post("/api/saas/billing/portal", requireSession, async (c) => {
    if (!isStripeConfigured()) {
      throw serviceUnavailable("billing_not_configured");
    }
    const userId = c.get("userId");
    const organizationId = resolveOrgId(c);
    const { organizationId: orgId, membership } = await requireOrgMembership(
      prisma,
      userId,
      organizationId,
    );
    if (membership.role !== "OWNER" && membership.role !== "ADMIN") {
      throw forbidden("insufficient_role");
    }
    const subscription = await prisma.subscription.findUnique({
      where: { organizationId: orgId },
    });
    if (!subscription?.stripeCustomerId) {
      throw badRequest("no_billing_customer");
    }

    const body = z
      .object({ flow: z.enum(["cancel"]).optional() })
      .parse(await c.req.json().catch(() => ({})));

    const stripe = getStripe();
    const returnUrl = portalReturnUrl();
    const cancelDoneUrl = `${returnUrl}?billing=canceled`;

    if (body.flow === "cancel") {
      if (!subscription.stripeSubscriptionId) {
        throw badRequest("no_active_subscription");
      }
      if (subscription.cancelAtPeriodEnd) {
        return c.json({ url: null, alreadyCanceling: true });
      }
      const session = await stripe.billingPortal.sessions.create({
        customer: subscription.stripeCustomerId,
        return_url: returnUrl,
        flow_data: {
          type: "subscription_cancel",
          subscription_cancel: {
            subscription: subscription.stripeSubscriptionId,
          },
          after_completion: {
            type: "redirect",
            redirect: { return_url: cancelDoneUrl },
          },
        },
      });
      return c.json({ url: session.url });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: subscription.stripeCustomerId,
      return_url: returnUrl,
    });
    return c.json({ url: session.url });
  });

  // Webhook — raw body required for signature verification.
  app.post("/api/saas/billing/webhook", async (c) => {
    if (!isStripeConfigured()) {
      return c.json({ error: "stripe_not_configured" }, 503);
    }
    const signature = c.req.header("stripe-signature");
    const secret = String(process.env.STRIPE_WEBHOOK_SECRET || "").trim();
    if (!signature || !secret) {
      return c.json({ error: "webhook_misconfigured" }, 400);
    }

    const rawBody = await c.req.text();
    const stripe = getStripe();
    let event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, secret);
    } catch (error) {
      console.error(
        "stripe webhook signature failed:",
        error instanceof Error ? error.message : error,
      );
      return c.json({ error: "invalid_signature" }, 400);
    }

    const existing = await prisma.stripeWebhookEvent.findUnique({
      where: { eventId: event.id },
    });
    if (existing) return c.json({ received: true, duplicate: true });

    try {
      if (event.type === "checkout.session.completed") {
        const session = event.data.object as {
          mode?: string;
          subscription?: string | null;
          customer?: string | null;
          metadata?: Record<string, string>;
          client_reference_id?: string | null;
        };
        const organizationId =
          session.metadata?.organizationId || session.client_reference_id;
        if (organizationId && session.subscription) {
          const sub = await stripe.subscriptions.retrieve(
            String(session.subscription),
          );
          await applyStripeSubscription(prisma, {
            organizationId,
            customerId:
              typeof session.customer === "string"
                ? session.customer
                : sub.customer && typeof sub.customer === "string"
                  ? sub.customer
                  : null,
            subscriptionId: sub.id,
            status: sub.status,
            cancelAtPeriodEnd: sub.cancel_at_period_end,
            currentPeriodEnd: stripeSubscriptionPeriodEnd(sub),
            items: (sub.items?.data ?? []).map((item) => ({
              priceId:
                typeof item.price === "string" ? item.price : item.price?.id,
              quantity: item.quantity ?? 1,
            })),
            planMeta: session.metadata?.plan ?? sub.metadata?.plan ?? null,
            extraSeatsMeta:
              session.metadata?.extraSeats ?? sub.metadata?.extraSeats ?? null,
          });
          trackProductEventSafe(prisma, {
            type: "subscription_started",
            organizationId,
            metadata: {
              plan: session.metadata?.plan ?? sub.metadata?.plan ?? null,
              interval: session.metadata?.interval ?? null,
              stripeSubscriptionId: sub.id,
            },
          });
        }
      }

      if (
        event.type === "customer.subscription.updated" ||
        event.type === "customer.subscription.deleted"
      ) {
        const sub = event.data.object as {
          id: string;
          status: string;
          customer?: string | null;
          cancel_at?: number | null;
          cancel_at_period_end?: boolean;
          current_period_end?: number;
          metadata?: Record<string, string>;
          items?: {
            data?: Array<{
              quantity?: number;
              current_period_end?: number;
              price?: { id?: string } | string;
            }>;
          };
        };
        const organizationId = sub.metadata?.organizationId;
        if (organizationId) {
          await applyStripeSubscription(prisma, {
            organizationId,
            customerId: typeof sub.customer === "string" ? sub.customer : null,
            subscriptionId: sub.id,
            status:
              event.type === "customer.subscription.deleted"
                ? "canceled"
                : sub.status,
            cancelAtPeriodEnd: sub.cancel_at_period_end,
            currentPeriodEnd: stripeSubscriptionPeriodEnd(sub),
            items: (sub.items?.data ?? []).map((item) => ({
              priceId:
                typeof item.price === "string" ? item.price : item.price?.id ?? null,
              quantity: item.quantity ?? 1,
            })),
            planMeta: sub.metadata?.plan ?? null,
            extraSeatsMeta: sub.metadata?.extraSeats ?? null,
          });
        }
      }

      await prisma.stripeWebhookEvent.create({
        data: {
          eventId: event.id,
          type: event.type,
          payload: event as object,
        },
      });
    } catch (error) {
      console.error(
        "stripe webhook handler failed:",
        error instanceof Error ? error.message : error,
      );
      return c.json({ error: "handler_failed" }, 500);
    }

    return c.json({ received: true });
  });
};
