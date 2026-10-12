import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { matchSharedIngestActs } from "../src/saas/jobs/shared-ingest.js";
import { PLAN_KEYS } from "../src/saas/plans/catalog.js";
import { decideProductEmail } from "../src/saas/services/email-channel-policy.js";
import { FREE_PLAN } from "../src/saas/plans/catalog.js";
import { assertPlanFeature } from "../src/saas/services/entitlements.js";
import { followTender } from "../src/saas/services/follow.js";
import type { KimdisSearchItem } from "../src/saas/services/kimdis-search.js";
import type { NotificationPreferences } from "../src/saas/services/org-settings.js";
import { organizationHasVerifiedOperator } from "../src/saas/services/scan-access.js";
import { upsertTenderFromKimdisItem } from "../src/saas/services/upsert-tender.js";
import { SaasError } from "../src/saas/errors.js";
import {
  authedJson,
  createSaasTestApp,
  getSaasTestPrisma,
  markUserEmailVerified,
  resetSaasDatabase,
  setOrgPlan,
  signUpAndGetCookie,
} from "./helpers/saas-test.js";

const prisma = getSaasTestPrisma();

const fixtureAct = (suffix: string): KimdisSearchItem => ({
  adam: `26REQ-QA-${suffix}`,
  recordType: "REQ",
  title: `Ανάπτυξη ιστοσελίδας δήμου ${suffix}`,
  contractingAuthority: "Δήμος QA",
  description: "Κατασκευή ιστοσελίδας και portal",
  cpvs: ["72000000-5"],
  budgetWithoutVat: 12000,
  budgetWithVat: 14880,
  submissionDate: "2026-10-01",
  signedDate: null,
  finalSubmissionDate: "2026-11-01",
  procedureType: "1",
  contractTypeLabel: "Υπηρεσίες",
  cancelled: false,
  publicKimdisUrl: `https://example.test/${suffix}`,
  officialPdfUrl: `https://example.test/${suffix}.pdf`,
  openState: "OPEN",
  nutsCode: "EL30",
});

const freePrefs = (
  overrides: Partial<NotificationPreferences> = {},
): NotificationPreferences => ({
  emailEnabled: true,
  recipients: ["owner@example.com"],
  digestHours: [],
  emailDeliveryMode: "DIGEST",
  weeklyEmailEnabled: true,
  weeklyRecipient: "owner@example.com",
  weeklyDigestWeekday: 1,
  weeklyDigestHour: "08:00",
  weeklyLastSentAt: null,
  events: {
    newOpportunity: true,
    relatedActOnFollowed: true,
    postSubmissionUpdate: true,
    deadlineRadar: true,
  },
  ...overrides,
});

const seedFreeOrg = async (input: {
  label: string;
  verified: boolean;
  emailEnabled?: boolean;
}) => {
  const { app } = createSaasTestApp(prisma);
  const { cookie } = await signUpAndGetCookie(
    app,
    {
      name: `${input.label} User`,
      email: `${input.label}-${Date.now()}@example.com`,
      password: "password12345",
    },
    input.verified ? undefined : { leaveUnverified: true },
  );
  const me = await authedJson<{ userId: string }>(app, "/api/saas/me", {
    cookie,
  });
  const org = await authedJson<{ organization: { id: string } }>(
    app,
    "/api/saas/organizations",
    { cookie, body: { name: `${input.label} Org` } },
  );
  const organizationId = org.json.organization.id;
  await setOrgPlan(prisma, organizationId, PLAN_KEYS.free);
  if (input.verified) {
    await markUserEmailVerified(me.json.userId, true);
  }
  if (input.emailEnabled === false) {
    await prisma.organizationSettings.update({
      where: { organizationId },
      data: {
        notifications: {
          emailEnabled: false,
          recipients: [],
          digestHours: [],
          emailDeliveryMode: "DIGEST",
          weeklyEmailEnabled: false,
          weeklyRecipient: null,
          weeklyDigestWeekday: 1,
          weeklyDigestHour: "08:00",
          weeklyLastSentAt: null,
          events: {
            newOpportunity: true,
            relatedActOnFollowed: true,
            postSubmissionUpdate: true,
            deadlineRadar: true,
          },
        },
      },
    });
  }
  return { app, cookie, userId: me.json.userId, organizationId };
};

describe("Free shared-ingest matching + limit consumers", () => {
  beforeEach(async () => {
    await resetSaasDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("verified Free active search matches fixture; email off does not block; dedupes; Free stays weekly-only", async () => {
    const { organizationId, userId } = await seedFreeOrg({
      label: "free-match",
      verified: true,
      emailEnabled: false,
    });
    expect(await organizationHasVerifiedOperator(prisma, organizationId)).toBe(
      true,
    );

    const profile = await prisma.watchProfile.create({
      data: {
        organizationId,
        name: "Web Free",
        keywords: ["ιστοσελίδα"],
        negativeKeywords: [],
        cpvs: [],
        recordTypes: ["REQ", "PROC"],
        matchingMode: "BALANCED",
        enabled: true,
        customFilters: { dataSources: ["kimdis"] },
      },
    });

    const item = fixtureAct(`match-${Date.now()}`);
    await upsertTenderFromKimdisItem(prisma, item);
    await matchSharedIngestActs(prisma, [item]);

    const opportunities = await prisma.organizationTender.findMany({
      where: { organizationId },
    });
    expect(opportunities).toHaveLength(1);
    expect(opportunities[0]!.watchProfileId).toBe(profile.id);

    const attentions = await prisma.organizationAttentionEvent.findMany({
      where: { organizationId, type: "NEW_OPPORTUNITY" },
    });
    expect(attentions).toHaveLength(1);

    // Repeat same fixture — no duplicate opportunity or attention.
    await matchSharedIngestActs(prisma, [item]);
    expect(
      await prisma.organizationTender.count({ where: { organizationId } }),
    ).toBe(1);
    expect(
      await prisma.organizationAttentionEvent.count({
        where: { organizationId, type: "NEW_OPPORTUNITY" },
      }),
    ).toBe(1);

    // Product email policy for Free remains weekly-only (no daily/immediate).
    expect(
      decideProductEmail({
        plan: FREE_PLAN,
        prefs: freePrefs({ emailEnabled: false }),
        type: "NEW_OPPORTUNITY",
        matchScore: 99,
      }).reason,
    ).toBe("email_disabled");
    expect(
      decideProductEmail({
        plan: FREE_PLAN,
        prefs: freePrefs(),
        type: "OPPORTUNITY_DIGEST",
        hasNewItems: true,
      }).reason,
    ).toBe("deferred_to_weekly_digest");

    // Sanity: verified operator is still this user (owner).
    expect(userId).toBeTruthy();
  });

  it("unverified org and paused profile do not match", async () => {
    const unverified = await seedFreeOrg({
      label: "free-unver-match",
      verified: true,
    });
    // Force unverified operator after org create.
    await markUserEmailVerified(unverified.userId, false);
    expect(
      await organizationHasVerifiedOperator(prisma, unverified.organizationId),
    ).toBe(false);

    await prisma.watchProfile.create({
      data: {
        organizationId: unverified.organizationId,
        name: "Should not match",
        keywords: ["ιστοσελίδα"],
        negativeKeywords: [],
        cpvs: [],
        recordTypes: ["REQ", "PROC"],
        matchingMode: "BALANCED",
        enabled: true,
        customFilters: { dataSources: ["kimdis"] },
      },
    });

    const pausedOrg = await seedFreeOrg({
      label: "free-paused-match",
      verified: true,
    });
    await prisma.watchProfile.create({
      data: {
        organizationId: pausedOrg.organizationId,
        name: "Paused",
        keywords: ["ιστοσελίδα"],
        negativeKeywords: [],
        cpvs: [],
        recordTypes: ["REQ", "PROC"],
        matchingMode: "BALANCED",
        enabled: false,
        customFilters: { dataSources: ["kimdis"] },
      },
    });

    const item = fixtureAct(`skip-${Date.now()}`);
    await upsertTenderFromKimdisItem(prisma, item);
    await matchSharedIngestActs(prisma, [item]);

    expect(
      await prisma.organizationTender.count({
        where: { organizationId: unverified.organizationId },
      }),
    ).toBe(0);
    expect(
      await prisma.organizationTender.count({
        where: { organizationId: pausedOrg.organizationId },
      }),
    ).toBe(0);
  });

  it("verified operator requires OWNER/ADMIN — MEMBER alone does not unlock matching", async () => {
    const owner = await seedFreeOrg({ label: "owner-role", verified: true });
    const { app } = createSaasTestApp(prisma);
    const member = await signUpAndGetCookie(app, {
      name: "Member Only",
      email: `member-${Date.now()}@example.com`,
      password: "password12345",
    });
    const memberMe = await authedJson<{ userId: string }>(app, "/api/saas/me", {
      cookie: member.cookie,
    });

    // Demote owner verification off; attach verified member as MEMBER only.
    await markUserEmailVerified(owner.userId, false);
    await markUserEmailVerified(memberMe.json.userId, true);
    await prisma.organizationMember.create({
      data: {
        organizationId: owner.organizationId,
        userId: memberMe.json.userId,
        role: "MEMBER",
      },
    });

    expect(
      await organizationHasVerifiedOperator(prisma, owner.organizationId),
    ).toBe(false);

    await prisma.watchProfile.create({
      data: {
        organizationId: owner.organizationId,
        name: "Member does not unlock",
        keywords: ["ιστοσελίδα"],
        negativeKeywords: [],
        cpvs: [],
        recordTypes: ["REQ", "PROC"],
        matchingMode: "BALANCED",
        enabled: true,
        customFilters: { dataSources: ["kimdis"] },
      },
    });
    const item = fixtureAct(`member-${Date.now()}`);
    await upsertTenderFromKimdisItem(prisma, item);
    await matchSharedIngestActs(prisma, [item]);
    expect(
      await prisma.organizationTender.count({
        where: { organizationId: owner.organizationId },
      }),
    ).toBe(0);

    // Documented policy: elevating member to ADMIN restores matching.
    await prisma.organizationMember.update({
      where: {
        organizationId_userId: {
          organizationId: owner.organizationId,
          userId: memberMe.json.userId,
        },
      },
      data: { role: "ADMIN" },
    });
    expect(
      await organizationHasVerifiedOperator(prisma, owner.organizationId),
    ).toBe(true);
  });

  it("unverified Free keeps plan follow limit but vault stays plan-locked; concurrent activate caps at 1", async () => {
    const { app, cookie, userId, organizationId } = await seedFreeOrg({
      label: "consumers",
      verified: false,
    });

    // Vault was previously blocked by storageBytes=0 via INACTIVE_LIMITS;
    // Free still has storageBytes=0 + companyVault=false — explicit plan lock.
    await expect(
      assertPlanFeature(
        prisma,
        { userId, organizationId },
        "companyVault",
      ),
    ).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof SaasError && err.message === "plan_feature_locked",
    );

    // Follow uses Free maxActiveFollowedTenders=5 (not a zeroed unverified gate).
    const tender = await upsertTenderFromKimdisItem(
      prisma,
      fixtureAct(`follow-${Date.now()}`),
    );
    await followTender(prisma, {
      userId,
      organizationId,
      tenderId: tender.id,
    });
    expect(
      await prisma.organizationTender.count({
        where: { organizationId, following: true },
      }),
    ).toBe(1);

    await markUserEmailVerified(userId, true);
    const a = await prisma.watchProfile.create({
      data: {
        organizationId,
        name: "Race A",
        keywords: ["portal"],
        negativeKeywords: [],
        cpvs: [],
        recordTypes: ["REQ", "PROC"],
        matchingMode: "BALANCED",
        enabled: false,
        customFilters: { dataSources: ["kimdis"] },
      },
    });
    const b = await prisma.watchProfile.create({
      data: {
        organizationId,
        name: "Race B",
        keywords: ["cms"],
        negativeKeywords: [],
        cpvs: [],
        recordTypes: ["REQ", "PROC"],
        matchingMode: "BALANCED",
        enabled: false,
        customFilters: { dataSources: ["kimdis"] },
      },
    });

    const [ra, rb] = await Promise.all([
      authedJson(app, `/api/saas/watch-profiles/${a.id}/enabled`, {
        cookie,
        method: "PATCH",
        organizationId,
        body: { enabled: true },
      }),
      authedJson(app, `/api/saas/watch-profiles/${b.id}/enabled`, {
        cookie,
        method: "PATCH",
        organizationId,
        body: { enabled: true },
      }),
    ]);
    const ok = [ra.status, rb.status].filter((s) => s === 200).length;
    const blocked = [ra.status, rb.status].filter(
      (s) => s === 409 || s === 403,
    ).length;
    expect(ok).toBe(1);
    expect(blocked).toBe(1);
    expect(
      await prisma.watchProfile.count({
        where: { organizationId, enabled: true },
      }),
    ).toBe(1);
  });
});
