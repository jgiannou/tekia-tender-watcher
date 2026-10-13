import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createOrganization } from "../src/saas/services/organizations.js";
import {
  activateArcProLaunch,
  expirePromotionIfNeeded,
  getArcProLaunchAvailability,
  supersedeActivePromotions,
} from "../src/saas/services/promotions.js";
import { startProTrial } from "../src/saas/services/pro-trial.js";
import { resolveOrganizationScanAccess } from "../src/saas/services/scan-access.js";
import { applyStripeSubscription } from "../src/saas/billing/sync.js";
import {
  ARC_PRO_LAUNCH_30_DURATION_MS,
  ARC_PRO_LAUNCH_30_TOTAL_SLOTS,
} from "../src/saas/promotions/arc-pro-launch.js";
import { PLAN_KEYS } from "../src/saas/plans/catalog.js";
import { getSaasTestPrisma, resetSaasDatabase } from "./helpers/saas-test.js";

const prisma = getSaasTestPrisma();

describe("ARC_PRO_LAUNCH_30 cardless promotion", () => {
  beforeEach(async () => {
    await resetSaasDatabase(prisma);
    process.env.ARC_PRO_LAUNCH_30_ENABLED = "true";
    delete process.env.ARC_PRO_LAUNCH_30_REDEEM_BY;
    delete process.env.ARC_PRO_LAUNCH_30_MAX_REDEMPTIONS;
  });

  afterAll(async () => {
    delete process.env.ARC_PRO_LAUNCH_30_ENABLED;
    delete process.env.ARC_PRO_LAUNCH_30_MAX_REDEMPTIONS;
    await prisma.$disconnect();
  });

  const seedFreeOrg = async (
    email: string,
    orgName: string,
    emailVerified = true,
  ) => {
    const user = await prisma.user.create({
      data: { name: orgName, email, emailVerified },
    });
    const organization = await createOrganization(prisma, {
      userId: user.id,
      name: orgName,
    });
    return { user, organization };
  };

  it("exposes public availability with 25 slots and zero redeemed by default", async () => {
    const availability = await getArcProLaunchAvailability(prisma);
    expect(availability.totalSlots).toBe(ARC_PRO_LAUNCH_30_TOTAL_SLOTS);
    expect(availability.redeemedSlots).toBe(0);
    expect(availability.remainingSlots).toBe(25);
    expect(availability.acceptingRedemptions).toBe(true);
    expect(availability.requiresCard).toBe(false);
    expect(availability.autoBilling).toBe(false);
  });

  it("activates 30-day Pro for a verified Free org without Stripe", async () => {
    const { user, organization } = await seedFreeOrg(
      "promo-new@example.com",
      "Promo New Co",
    );
    const now = new Date("2026-10-13T12:00:00.000Z");
    const result = await activateArcProLaunch(prisma, {
      userId: user.id,
      organizationId: organization.id,
      now,
    });
    expect(result.ok).toBe(true);
    expect(result.already).toBe(false);
    expect(result.daysRemaining).toBe(30);

    const access = await resolveOrganizationScanAccess(prisma, {
      userId: user.id,
      organizationId: organization.id,
      now,
    });
    expect(access.status).toBe("promo");
    expect(access.planKey).toBe(PLAN_KEYS.trial);

    const sub = await prisma.subscription.findUnique({
      where: { organizationId: organization.id },
    });
    expect(sub?.stripeSubscriptionId).toBeNull();
    expect(sub?.planKey).toBe(PLAN_KEYS.free);

    const availability = await getArcProLaunchAvailability(prisma);
    expect(availability.redeemedSlots).toBe(1);
    expect(availability.remainingSlots).toBe(24);
  });

  it("rejects unverified email before granting Pro", async () => {
    const { user, organization } = await seedFreeOrg(
      "promo-unverified@example.com",
      "Unverified Co",
      false,
    );
    await expect(
      activateArcProLaunch(prisma, {
        userId: user.id,
        organizationId: organization.id,
      }),
    ).rejects.toMatchObject({ message: "email_not_verified" });
    expect(await prisma.organizationPromotionRedemption.count()).toBe(0);
  });

  it("does not consume a slot on signup alone or failed activation", async () => {
    const { user, organization } = await seedFreeOrg(
      "promo-fail@example.com",
      "Fail Co",
      false,
    );
    // Org exists (signup) but activation fails → still 0 redemptions.
    await expect(
      activateArcProLaunch(prisma, {
        userId: user.id,
        organizationId: organization.id,
      }),
    ).rejects.toMatchObject({ message: "email_not_verified" });
    const availability = await getArcProLaunchAvailability(prisma);
    expect(availability.redeemedSlots).toBe(0);
    expect(availability.remainingSlots).toBe(25);
  });

  it("is idempotent on duplicate activation and does not double-count slots", async () => {
    const { user, organization } = await seedFreeOrg(
      "promo-idem@example.com",
      "Promo Idem",
    );
    const now = new Date("2026-10-13T12:00:00.000Z");
    const first = await activateArcProLaunch(prisma, {
      userId: user.id,
      organizationId: organization.id,
      now,
    });
    const second = await activateArcProLaunch(prisma, {
      userId: user.id,
      organizationId: organization.id,
      now: new Date(now.getTime() + 60_000),
    });
    expect(first.already).toBe(false);
    expect(second.already).toBe(true);
    expect(await prisma.organizationPromotionRedemption.count()).toBe(1);
    expect((await getArcProLaunchAvailability(prisma)).redeemedSlots).toBe(1);
  });

  it("multiple users in one org consume only one slot", async () => {
    const { user, organization } = await seedFreeOrg(
      "promo-owner2@example.com",
      "Multi User Co",
    );
    const member = await prisma.user.create({
      data: {
        name: "Admin Two",
        email: "promo-admin2@example.com",
        emailVerified: true,
      },
    });
    await prisma.organizationMember.create({
      data: {
        organizationId: organization.id,
        userId: member.id,
        role: "ADMIN",
      },
    });
    await activateArcProLaunch(prisma, {
      userId: user.id,
      organizationId: organization.id,
    });
    const again = await activateArcProLaunch(prisma, {
      userId: member.id,
      organizationId: organization.id,
    });
    expect(again.already).toBe(true);
    expect((await getArcProLaunchAvailability(prisma)).redeemedSlots).toBe(1);
  });

  it("rejects member role without consuming a slot", async () => {
    const { organization } = await seedFreeOrg(
      "promo-owner3@example.com",
      "Role Co",
    );
    const member = await prisma.user.create({
      data: {
        name: "Member",
        email: "promo-member3@example.com",
        emailVerified: true,
      },
    });
    await prisma.organizationMember.create({
      data: {
        organizationId: organization.id,
        userId: member.id,
        role: "MEMBER",
      },
    });
    await expect(
      activateArcProLaunch(prisma, {
        userId: member.id,
        organizationId: organization.id,
      }),
    ).rejects.toMatchObject({ message: "insufficient_role" });
    expect((await getArcProLaunchAvailability(prisma)).redeemedSlots).toBe(0);
  });

  it("fills exactly 25 slots and rejects the 26th organization", async () => {
    process.env.ARC_PRO_LAUNCH_30_MAX_REDEMPTIONS = "25";
    for (let i = 0; i < 25; i += 1) {
      const seeded = await seedFreeOrg(`promo-slot-${i}@example.com`, `Slot ${i}`);
      await activateArcProLaunch(prisma, {
        userId: seeded.user.id,
        organizationId: seeded.organization.id,
      });
    }
    const availability = await getArcProLaunchAvailability(prisma);
    expect(availability.redeemedSlots).toBe(25);
    expect(availability.remainingSlots).toBe(0);
    expect(availability.acceptingRedemptions).toBe(false);

    const overflow = await seedFreeOrg("promo-26@example.com", "Overflow Co");
    await expect(
      activateArcProLaunch(prisma, {
        userId: overflow.user.id,
        organizationId: overflow.organization.id,
      }),
    ).rejects.toMatchObject({ message: "promo_cap_reached" });
    expect(await prisma.organizationPromotionRedemption.count()).toBe(25);
  }, 60_000);

  it("rejects concurrent activations beyond the remaining capacity", async () => {
    process.env.ARC_PRO_LAUNCH_30_MAX_REDEMPTIONS = "2";
    // Seed capacity from env before any ensure() from other helpers.
    const { ensurePromotionCapacity } = await import(
      "../src/saas/services/promotion-capacity.js"
    );
    await ensurePromotionCapacity(prisma);
    const a = await seedFreeOrg("promo-c1@example.com", "Concurrent 1");
    const b = await seedFreeOrg("promo-c2@example.com", "Concurrent 2");
    const c = await seedFreeOrg("promo-c3@example.com", "Concurrent 3");

    const results = await Promise.allSettled([
      activateArcProLaunch(prisma, {
        userId: a.user.id,
        organizationId: a.organization.id,
      }),
      activateArcProLaunch(prisma, {
        userId: b.user.id,
        organizationId: b.organization.id,
      }),
      activateArcProLaunch(prisma, {
        userId: c.user.id,
        organizationId: c.organization.id,
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    // Hard invariant: never more than max redemptions, even under concurrency.
    expect(await prisma.organizationPromotionRedemption.count()).toBe(2);
    expect(fulfilled.length).toBe(2);
    expect(rejected.length).toBe(1);
    for (const result of rejected) {
      expect(result.status).toBe("rejected");
      if (result.status === "rejected") {
        expect(String(result.reason?.message ?? result.reason)).toMatch(
          /promo_cap_reached|promo_activation_busy/,
        );
      }
    }
  });

  it("does not reopen a slot when a trial expires", async () => {
    process.env.ARC_PRO_LAUNCH_30_MAX_REDEMPTIONS = "1";
    const { ensurePromotionCapacity } = await import(
      "../src/saas/services/promotion-capacity.js"
    );
    await ensurePromotionCapacity(prisma);
    const first = await seedFreeOrg("promo-exp1@example.com", "Expire 1");
    const activatedAt = new Date("2026-10-01T00:00:00.000Z");
    await activateArcProLaunch(prisma, {
      userId: first.user.id,
      organizationId: first.organization.id,
      now: activatedAt,
    });
    const after = new Date(
      activatedAt.getTime() + ARC_PRO_LAUNCH_30_DURATION_MS + 1000,
    );
    await expirePromotionIfNeeded(prisma, first.organization.id, after);
    expect((await getArcProLaunchAvailability(prisma)).redeemedSlots).toBe(1);
    expect((await getArcProLaunchAvailability(prisma)).remainingSlots).toBe(0);

    const second = await seedFreeOrg("promo-exp2@example.com", "Expire 2");
    await expect(
      activateArcProLaunch(prisma, {
        userId: second.user.id,
        organizationId: second.organization.id,
        now: after,
      }),
    ).rejects.toMatchObject({ message: "promo_cap_reached" });
  });

  it("does not stack on an active 7-day Pro trial", async () => {
    const { user, organization } = await seedFreeOrg(
      "promo-stack@example.com",
      "Promo Stack",
    );
    await startProTrial(prisma, {
      userId: user.id,
      organizationId: organization.id,
    });
    await expect(
      activateArcProLaunch(prisma, {
        userId: user.id,
        organizationId: organization.id,
      }),
    ).rejects.toMatchObject({ message: "active_pro_trial" });
    expect((await getArcProLaunchAvailability(prisma)).redeemedSlots).toBe(0);
  });

  it("allows launch promo after a completed 7-day trial", async () => {
    const { user, organization } = await seedFreeOrg(
      "promo-after7@example.com",
      "Promo After7",
    );
    await startProTrial(prisma, {
      userId: user.id,
      organizationId: organization.id,
    });
    await prisma.subscription.update({
      where: { organizationId: organization.id },
      data: {
        status: "ACTIVE",
        planKey: PLAN_KEYS.free,
        trialEndsAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    });
    const result = await activateArcProLaunch(prisma, {
      userId: user.id,
      organizationId: organization.id,
      now: new Date("2026-10-13T12:00:00.000Z"),
    });
    expect(result.ok).toBe(true);
  });

  it("expires after 30 days, returns Free, and keeps the slot consumed", async () => {
    const { user, organization } = await seedFreeOrg(
      "promo-exp@example.com",
      "Promo Exp",
    );
    const activatedAt = new Date("2026-10-01T00:00:00.000Z");
    await activateArcProLaunch(prisma, {
      userId: user.id,
      organizationId: organization.id,
      now: activatedAt,
    });
    const after = new Date(
      activatedAt.getTime() + ARC_PRO_LAUNCH_30_DURATION_MS + 1000,
    );
    const expired = await resolveOrganizationScanAccess(prisma, {
      userId: user.id,
      organizationId: organization.id,
      now: after,
    });
    expect(expired.status).toBe("active");
    expect(expired.planKey).toBe(PLAN_KEYS.free);
    expect((await getArcProLaunchAvailability(prisma)).redeemedSlots).toBe(1);
  });

  it("supersedes promo when Stripe paid Pro activates without freeing the slot", async () => {
    const { user, organization } = await seedFreeOrg(
      "promo-paid@example.com",
      "Promo Paid",
    );
    const now = new Date("2026-10-13T12:00:00.000Z");
    await activateArcProLaunch(prisma, {
      userId: user.id,
      organizationId: organization.id,
      now,
    });
    await applyStripeSubscription(prisma, {
      organizationId: organization.id,
      customerId: "cus_test_promo",
      subscriptionId: "sub_test_promo",
      status: "active",
      planMeta: "pro",
      currentPeriodEnd: Math.floor(now.getTime() / 1000) + 30 * 86400,
    });
    const row = await prisma.organizationPromotionRedemption.findFirst({
      where: { organizationId: organization.id },
    });
    expect(row?.status).toBe("SUPERSEDED");
    expect((await getArcProLaunchAvailability(prisma)).redeemedSlots).toBe(1);
    expect(await supersedeActivePromotions(prisma, organization.id)).toBe(0);
  });

  it("seeds default capacity of 25; env seed cannot exceed ceiling", async () => {
    const availability = await getArcProLaunchAvailability(prisma);
    expect(availability.totalSlots).toBe(25);
    expect(availability.remainingSlots).toBe(25);

    await prisma.promotionCampaignConfig.deleteMany();
    process.env.ARC_PRO_LAUNCH_30_MAX_REDEMPTIONS = "999";
    process.env.ARC_PRO_LAUNCH_30_CAPACITY_CEILING = "500";
    const seeded = await getArcProLaunchAvailability(prisma);
    expect(seeded.totalSlots).toBe(500);
  });
});
