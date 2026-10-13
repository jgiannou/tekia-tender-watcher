import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createOrganization } from "../src/saas/services/organizations.js";
import {
  activateArcProLaunch,
  expirePromotionIfNeeded,
  getArcProLaunchAvailability,
} from "../src/saas/services/promotions.js";
import {
  adminGrantPromotion,
  adminRestoreSlot,
  adminRevokePromotion,
  getPromotionAdminSummary,
  listPromotionAuditEvents,
  listPromotionRedemptions,
} from "../src/saas/services/promotion-admin.js";
import {
  ensurePromotionCapacity,
  setPromotionCapacity,
} from "../src/saas/services/promotion-capacity.js";
import { resolveOrganizationScanAccess } from "../src/saas/services/scan-access.js";
import { applyStripeSubscription } from "../src/saas/billing/sync.js";
import { ARC_PRO_LAUNCH_30_DURATION_MS } from "../src/saas/promotions/arc-pro-launch.js";
import { PLAN_KEYS } from "../src/saas/plans/catalog.js";
import { getSaasTestPrisma, resetSaasDatabase } from "./helpers/saas-test.js";

const prisma = getSaasTestPrisma();

describe("ARC_PRO_LAUNCH_30 Ops admin + capacity", () => {
  beforeEach(async () => {
    await resetSaasDatabase(prisma);
    process.env.ARC_PRO_LAUNCH_30_ENABLED = "true";
    delete process.env.ARC_PRO_LAUNCH_30_REDEEM_BY;
    delete process.env.ARC_PRO_LAUNCH_30_MAX_REDEMPTIONS;
    delete process.env.ARC_PRO_LAUNCH_30_CAPACITY_CEILING;
    await ensurePromotionCapacity(prisma);
  });

  afterAll(async () => {
    delete process.env.ARC_PRO_LAUNCH_30_ENABLED;
    delete process.env.ARC_PRO_LAUNCH_30_MAX_REDEMPTIONS;
    delete process.env.ARC_PRO_LAUNCH_30_CAPACITY_CEILING;
    await prisma.$disconnect();
  });

  const seedFreeOrg = async (email: string, orgName: string) => {
    const user = await prisma.user.create({
      data: { name: orgName, email, emailVerified: true },
    });
    const organization = await createOrganization(prisma, {
      userId: user.id,
      name: orgName,
    });
    return { user, organization };
  };

  it("admin summary starts at capacity 25 with zero consumption", async () => {
    const summary = await getPromotionAdminSummary(prisma);
    expect(summary.capacity).toBe(25);
    expect(summary.consumedSlots).toBe(0);
    expect(summary.remainingSlots).toBe(25);
    expect(summary.historicalActivations).toBe(0);
    expect(summary.exhausted).toBe(false);
  });

  it("manual grant consumes one slot and grants Pro entitlement", async () => {
    const { organization, user } = await seedFreeOrg(
      "admin-grant@example.com",
      "Admin Grant Co",
    );
    const now = new Date("2026-10-13T12:00:00.000Z");
    const result = await adminGrantPromotion(prisma, {
      organizationId: organization.id,
      performedBy: "ops:test",
      reason: "QA grant",
      now,
    });
    expect(result.ok).toBe(true);
    expect(result.replayed).toBe(false);
    expect(result.redemption.slotConsumed).toBe(true);
    expect(result.redemption.source).toBe("ADMIN");

    const access = await resolveOrganizationScanAccess(prisma, {
      userId: user.id,
      organizationId: organization.id,
      now,
    });
    expect(access.status).toBe("promo");

    const summary = await getPromotionAdminSummary(prisma);
    expect(summary.consumedSlots).toBe(1);
    expect(summary.remainingSlots).toBe(24);
    expect(summary.activeCount).toBe(1);
  });

  it("rejects admin grant when public promo disabled unless force", async () => {
    process.env.ARC_PRO_LAUNCH_30_ENABLED = "false";
    const { organization } = await seedFreeOrg(
      "force-grant@example.com",
      "Force Grant Co",
    );
    await expect(
      adminGrantPromotion(prisma, {
        organizationId: organization.id,
        performedBy: "ops:test",
        reason: "should fail",
      }),
    ).rejects.toMatchObject({ message: "promo_disabled_use_force" });

    const forced = await adminGrantPromotion(prisma, {
      organizationId: organization.id,
      performedBy: "ops:test",
      reason: "ops override while disabled",
      forceWhenDisabled: true,
    });
    expect(forced.ok).toBe(true);
  });

  it("protects paid customers from admin grant", async () => {
    const { organization } = await seedFreeOrg(
      "paid-protect@example.com",
      "Paid Protect",
    );
    const now = new Date("2026-10-13T12:00:00.000Z");
    await applyStripeSubscription(prisma, {
      organizationId: organization.id,
      customerId: "cus_admin_protect",
      subscriptionId: "sub_admin_protect",
      status: "active",
      planMeta: "pro",
      currentPeriodEnd: Math.floor(now.getTime() / 1000) + 30 * 86400,
    });
    await expect(
      adminGrantPromotion(prisma, {
        organizationId: organization.id,
        performedBy: "ops:test",
        reason: "should not override paid",
        now,
      }),
    ).rejects.toMatchObject({ message: "paid_plan_active" });
  });

  it("revokes without restoring slot by default", async () => {
    const { organization, user } = await seedFreeOrg(
      "revoke-a@example.com",
      "Revoke A",
    );
    const now = new Date("2026-10-13T12:00:00.000Z");
    await adminGrantPromotion(prisma, {
      organizationId: organization.id,
      performedBy: "ops:test",
      reason: "grant then revoke",
      now,
    });
    await adminRevokePromotion(prisma, {
      organizationId: organization.id,
      performedBy: "ops:test",
      reason: "revoke only",
      restoreSlot: false,
      now,
    });
    const access = await resolveOrganizationScanAccess(prisma, {
      userId: user.id,
      organizationId: organization.id,
      now,
    });
    expect(access.planKey).toBe(PLAN_KEYS.free);
    expect((await getPromotionAdminSummary(prisma)).consumedSlots).toBe(1);
    expect((await getPromotionAdminSummary(prisma)).revokedCount).toBe(1);
  });

  it("revokes with slot restoration and blocks double restore", async () => {
    const { organization } = await seedFreeOrg(
      "revoke-b@example.com",
      "Revoke B",
    );
    await adminGrantPromotion(prisma, {
      organizationId: organization.id,
      performedBy: "ops:test",
      reason: "grant",
    });
    await adminRevokePromotion(prisma, {
      organizationId: organization.id,
      performedBy: "ops:test",
      reason: "revoke and restore",
      restoreSlot: true,
    });
    expect((await getPromotionAdminSummary(prisma)).consumedSlots).toBe(0);
    expect((await getPromotionAdminSummary(prisma)).remainingSlots).toBe(25);

    await expect(
      adminRestoreSlot(prisma, {
        organizationId: organization.id,
        performedBy: "ops:test",
        reason: "second restore",
      }),
    ).rejects.toMatchObject({ message: "slot_not_consumed" });
  });

  it("capacity increase and decrease; refuses below consumed", async () => {
    const a = await seedFreeOrg("cap-a@example.com", "Cap A");
    await activateArcProLaunch(prisma, {
      userId: a.user.id,
      organizationId: a.organization.id,
    });
    const up = await setPromotionCapacity(prisma, {
      capacity: 30,
      reason: "add 5 slots",
      performedBy: "ops:test",
    });
    expect(up.capacity).toBe(30);
    expect(up.remainingSlots).toBe(29);

    const down = await setPromotionCapacity(prisma, {
      capacity: 27,
      reason: "remove 3 slots",
      performedBy: "ops:test",
    });
    expect(down.capacity).toBe(27);
    expect(down.remainingSlots).toBe(26);

    await expect(
      setPromotionCapacity(prisma, {
        capacity: 0,
        reason: "too low",
        performedBy: "ops:test",
      }),
    ).rejects.toMatchObject({ message: "invalid_capacity" });

    // consumedSlots === 1 → capacity must be >= 1; 0 already invalid.
    // Activate a second org so consumed=2, then refuse capacity=1.
    const b = await seedFreeOrg("cap-b@example.com", "Cap B");
    await activateArcProLaunch(prisma, {
      userId: b.user.id,
      organizationId: b.organization.id,
    });
    await expect(
      setPromotionCapacity(prisma, {
        capacity: 1,
        reason: "below consumed",
        performedBy: "ops:test",
      }),
    ).rejects.toMatchObject({ message: "capacity_below_consumed" });
  });

  it("idempotent admin grant via idempotency key", async () => {
    const { organization } = await seedFreeOrg(
      "idem-admin@example.com",
      "Idem Admin",
    );
    const first = await adminGrantPromotion(prisma, {
      organizationId: organization.id,
      performedBy: "ops:test",
      reason: "first",
      idempotencyKey: "idem-grant-1",
    });
    const second = await adminGrantPromotion(prisma, {
      organizationId: organization.id,
      performedBy: "ops:test",
      reason: "replay",
      idempotencyKey: "idem-grant-1",
    });
    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    expect((await getPromotionAdminSummary(prisma)).consumedSlots).toBe(1);
  });

  it("lists redemptions with filters and audit history", async () => {
    const { organization } = await seedFreeOrg(
      "list-admin@example.com",
      "List Admin Co",
    );
    await adminGrantPromotion(prisma, {
      organizationId: organization.id,
      performedBy: "ops:test",
      reason: "list grant",
    });
    const all = await listPromotionRedemptions(prisma, { status: "ACTIVE" });
    expect(all.total).toBe(1);
    expect(all.items[0]?.organizationName).toContain("List Admin");

    const byQ = await listPromotionRedemptions(prisma, {
      q: organization.id.slice(0, 8),
    });
    expect(byQ.total).toBe(1);

    const audit = await listPromotionAuditEvents(prisma, { limit: 10 });
    expect(audit.items.some((e) => e.actionType === "ADMIN_GRANT")).toBe(true);
  });

  it("expiration returns Free while keeping slot consumed", async () => {
    const { organization, user } = await seedFreeOrg(
      "admin-exp@example.com",
      "Admin Exp",
    );
    const activatedAt = new Date("2026-10-01T00:00:00.000Z");
    await adminGrantPromotion(prisma, {
      organizationId: organization.id,
      performedBy: "ops:test",
      reason: "expire path",
      now: activatedAt,
    });
    const after = new Date(
      activatedAt.getTime() + ARC_PRO_LAUNCH_30_DURATION_MS + 1000,
    );
    await expirePromotionIfNeeded(prisma, organization.id, after);
    const access = await resolveOrganizationScanAccess(prisma, {
      userId: user.id,
      organizationId: organization.id,
      now: after,
    });
    expect(access.planKey).toBe(PLAN_KEYS.free);
    expect((await getArcProLaunchAvailability(prisma)).redeemedSlots).toBe(1);
  });

  it("concurrent grants respect capacity with Serializable isolation", async () => {
    await setPromotionCapacity(prisma, {
      capacity: 2,
      reason: "concurrency cap",
      performedBy: "ops:test",
    });
    const orgs = await Promise.all([
      seedFreeOrg("cg1@example.com", "CG1"),
      seedFreeOrg("cg2@example.com", "CG2"),
      seedFreeOrg("cg3@example.com", "CG3"),
    ]);
    const results = await Promise.allSettled(
      orgs.map((o) =>
        adminGrantPromotion(prisma, {
          organizationId: o.organization.id,
          performedBy: "ops:test",
          reason: "concurrent grant",
        }),
      ),
    );
    const ok = results.filter((r) => r.status === "fulfilled");
    expect(ok.length).toBe(2);
    expect((await getPromotionAdminSummary(prisma)).consumedSlots).toBe(2);
  });

  it("public remaining slots stay consistent with admin capacity changes", async () => {
    await setPromotionCapacity(prisma, {
      capacity: 30,
      reason: "marketing sync",
      performedBy: "ops:test",
    });
    const pub = await getArcProLaunchAvailability(prisma);
    expect(pub.totalSlots).toBe(30);
    expect(pub.remainingSlots).toBe(30);
  });
});
