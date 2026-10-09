import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  FREE_PLAN,
  PLAN_KEYS,
  publicPlans,
} from "../src/saas/plans/catalog.js";
import { GREEK_NUTS2_REGIONS } from "../src/saas/geo/nuts.js";
import {
  authedJson,
  createSaasTestApp,
  getSaasTestPrisma,
  resetSaasDatabase,
  setOrgPlan,
  signUpAndGetCookie,
} from "./helpers/saas-test.js";

const prisma = getSaasTestPrisma();

const seedTender = (
  data: Omit<
    Parameters<typeof prisma.tender.create>[0]["data"],
    "firstSeenAt" | "lastSeenAt"
  > &
    Partial<Pick<Parameters<typeof prisma.tender.create>[0]["data"], "firstSeenAt" | "lastSeenAt">>,
) => {
  const now = new Date();
  return prisma.tender.create({
    data: {
      firstSeenAt: now,
      lastSeenAt: now,
      ...data,
    },
  });
};

const seedOrg = async (label: string) => {
  const { app } = createSaasTestApp(prisma);
  const { cookie } = await signUpAndGetCookie(app, {
    name: `${label} User`,
    email: `${label}-${Date.now()}@example.com`,
    password: "password12345",
  });
  const org = await authedJson<{ organization: { id: string } }>(
    app,
    "/api/saas/organizations",
    { cookie, body: { name: `${label} Org` } },
  );
  expect(org.status).toBe(201);
  return { app, cookie, organizationId: org.json.organization.id };
};

describe("competition SaaS API + Free gates", () => {
  beforeEach(async () => {
    await resetSaasDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("starts new organizations on Free with Free entitlements", async () => {
    const { cookie, organizationId, app } = await seedOrg("free-start");
    const sub = await prisma.subscription.findUniqueOrThrow({
      where: { organizationId },
    });
    expect(sub.planKey).toBe(PLAN_KEYS.free);
    expect(sub.status).toBe("ACTIVE");
    expect(sub.trialEndsAt).toBeNull();

    const entitlements = await authedJson<{
      entitlements: {
        companyVault: boolean;
        participationChecklist: boolean;
        expiringContractList: boolean;
        priceMemory: boolean;
        maxActiveWatchProfiles: number;
        maxActiveFollowedTenders: number;
      };
      scanAccess: { planKey: string; status: string };
    }>(app, "/api/saas/entitlements", { cookie, organizationId });
    expect(entitlements.status).toBe(200);
    expect(entitlements.json.scanAccess.planKey).toBe(PLAN_KEYS.free);
    expect(entitlements.json.entitlements.companyVault).toBe(false);
    expect(entitlements.json.entitlements.participationChecklist).toBe(false);
    expect(entitlements.json.entitlements.expiringContractList).toBe(false);
    expect(entitlements.json.entitlements.priceMemory).toBe(false);
    expect(entitlements.json.entitlements.maxActiveWatchProfiles).toBe(
      FREE_PLAN.maxActiveWatchProfiles,
    );
    expect(entitlements.json.entitlements.maxActiveFollowedTenders).toBe(5);
  });

  it("billing catalog exposes Free + Basic + Pro with competition flags", async () => {
    const { app } = createSaasTestApp(prisma);
    const response = await app.request("/api/saas/billing/catalog");
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      plans: Array<{
        key: string;
        monthlyEur: number | null;
        participationChecklist?: boolean;
        expiringContractList?: boolean;
        priceMemory?: boolean;
      }>;
    };
    expect(body.plans.map((p) => p.key)).toEqual(
      publicPlans().map((p) => p.planKey),
    );
    const free = body.plans.find((p) => p.key === "free");
    const basic = body.plans.find((p) => p.key === "basic");
    expect(free?.monthlyEur).toBe(0);
    expect(free?.participationChecklist).toBe(false);
    expect(basic?.participationChecklist).toBe(true);
    expect(basic?.priceMemory).toBe(true);
  });

  it("exposes Greek NUTS2 regions and ingest status", async () => {
    const { app, cookie, organizationId } = await seedOrg("regions");
    const regions = await authedJson<{
      regions: Array<{ code: string; label: string }>;
    }>(app, "/api/saas/regions", { cookie, organizationId });
    expect(regions.status).toBe(200);
    expect(regions.json.regions).toHaveLength(GREEK_NUTS2_REGIONS.length);
    expect(regions.json.regions.map((r) => r.code)).toContain("EL30");

    const ingest = await authedJson<{
      lastSuccessAt: string | null;
      fresh: boolean;
      labelEl: string;
    }>(app, "/api/saas/ingest/status", { cookie, organizationId });
    expect(ingest.status).toBe(200);
    expect(typeof ingest.json.fresh).toBe("boolean");
    expect(ingest.json.labelEl.length).toBeGreaterThan(5);
  });

  it("Free blocks vault / checklist / price memory and only counts expiring contracts", async () => {
    const { app, cookie, organizationId } = await seedOrg("free-gates");
    const tender = await seedTender({
      referenceNumber: `26REQ-FREE-${Date.now()}`,
      recordType: "REQ",
      title: "Δοκιμή",
      cpvs: ["72000000-5"],
      nutsCode: "EL30",
    });

    const vault = await authedJson(app, "/api/saas/vault/folders", {
      cookie,
      organizationId,
    });
    expect(vault.status).toBe(403);

    const checklist = await authedJson(
      app,
      `/api/saas/tenders/${tender.id}/participation-checklist`,
      { cookie, organizationId },
    );
    expect(checklist.status).toBe(403);

    const price = await authedJson(
      app,
      `/api/saas/tenders/${tender.id}/price-memory`,
      { cookie, organizationId },
    );
    expect(price.status).toBe(403);

    const ends = new Date(Date.now() + 120 * 24 * 60 * 60 * 1000);
    await seedTender({
      referenceNumber: `26CONTRACT-FREE-${Date.now()}`,
      recordType: "CONTRACT",
      title: "Λήγουσα σύμβαση",
      cpvs: ["72000000-5"],
      nutsCode: "EL30",
      contractEndsAt: ends,
    });
    await prisma.organizationSettings.update({
      where: { organizationId },
      data: {
        activities: [{ code: "62.01", description: "Computer programming" }],
      },
    });

    const expiring = await authedJson<{
      count: number;
      items: unknown[];
      listAvailable: boolean;
    }>(app, "/api/saas/expiring-contracts", { cookie, organizationId });
    expect(expiring.status).toBe(200);
    expect(expiring.json.listAvailable).toBe(false);
    expect(expiring.json.items).toEqual([]);
    expect(expiring.json.count).toBeGreaterThanOrEqual(0);
  });

  it("Basic unlocks checklist, price memory, and expiring list", async () => {
    const { app, cookie, organizationId } = await seedOrg("basic-unlock");
    await setOrgPlan(prisma, organizationId, PLAN_KEYS.basic);

    const tender = await seedTender({
      referenceNumber: `26REQ-BASIC-${Date.now()}`,
      recordType: "REQ",
      title: "Υπηρεσίες πληροφορικής Αττικής",
      cpvs: ["72000000-5"],
      nutsCode: "EL301",
      budgetWithoutVat: 10000,
    });
    await seedTender({
      referenceNumber: `26AWRD-BASIC-${Date.now()}`,
      recordType: "AWRD",
      title: "Κατακύρωση",
      cpvs: ["72000000-5"],
      nutsCode: "EL30",
      winnerName: "Demo AE",
      awardAmount: 9000,
      budgetWithoutVat: 10000,
      signedDate: new Date("2026-01-15"),
    });

    const checklist = await authedJson<{
      checklist: { readable: boolean };
    }>(app, `/api/saas/tenders/${tender.id}/participation-checklist`, {
      cookie,
      organizationId,
    });
    expect(checklist.status).toBe(200);
    expect(checklist.json.checklist).toBeTruthy();

    const memory = await authedJson<{
      memory: { thin: boolean; note: string | null; samples: unknown[] };
    }>(app, `/api/saas/tenders/${tender.id}/price-memory`, {
      cookie,
      organizationId,
    });
    expect(memory.status).toBe(200);
    expect(memory.json.memory.thin).toBe(true);
    expect(memory.json.memory.note).toBe("λίγες κατακυρώσεις");

    const ends = new Date(Date.now() + 150 * 24 * 60 * 60 * 1000);
    await seedTender({
      referenceNumber: `26CONTRACT-BASIC-${Date.now()}`,
      recordType: "CONTRACT",
      title: "Σύμβαση IT",
      cpvs: ["72000000-5"],
      nutsCode: "EL30",
      contractEndsAt: ends,
      contractingAuthority: "Δήμος",
    });
    // Empty KAD list → no CPV filter (all contracts in the 3–9 month window match).
    await prisma.organizationSettings.update({
      where: { organizationId },
      data: { activities: [] },
    });

    const expiring = await authedJson<{
      count: number;
      items: Array<{ referenceNumber: string }>;
      listAvailable: boolean;
    }>(app, "/api/saas/expiring-contracts", { cookie, organizationId });
    expect(expiring.status).toBe(200);
    expect(expiring.json.listAvailable).toBe(true);
    expect(expiring.json.count).toBeGreaterThanOrEqual(1);
    expect(expiring.json.items.length).toBeGreaterThanOrEqual(1);
  });

  it("persists watch-profile region filters and Free enforces one active search", async () => {
    const { app, cookie, organizationId } = await seedOrg("regions-profile");
    const first = await authedJson<{
      profile: {
        id: string;
        regions?: string[];
        includeUnclassifiedRegion?: boolean;
      };
    }>(app, "/api/saas/watch-profiles", {
      cookie,
      organizationId,
      body: {
        name: "Αττική IT",
        keywords: ["ιστοσελίδα"],
        regions: ["EL301", "EL30"],
        includeUnclassifiedRegion: false,
      },
    });
    expect(first.status).toBe(201);
    expect(first.json.profile.regions).toEqual(["EL30"]);

    const second = await authedJson(app, "/api/saas/watch-profiles", {
      cookie,
      organizationId,
      body: {
        name: "Δεύτερη",
        keywords: ["λογισμικό"],
      },
    });
    expect(second.status).toBe(409);
  });

  it("starts a separate Pro trial once from Free and blocks a second start", async () => {
    const { app, cookie, organizationId } = await seedOrg("pro-trial");
    const statusBefore = await authedJson<{
      planKey: string;
      canStartProTrial?: boolean;
    }>(app, "/api/saas/billing/status", { cookie, organizationId });
    expect(statusBefore.json.planKey).toBe(PLAN_KEYS.free);
    expect(statusBefore.json.canStartProTrial).toBe(true);

    const started = await authedJson<{
      ok: true;
      already: boolean;
      planKey: string;
      trialEndsAt: string | null;
    }>(app, "/api/saas/billing/start-pro-trial", {
      method: "POST",
      cookie,
      organizationId,
    });
    expect(started.status).toBe(200);
    expect(started.json.already).toBe(false);
    expect(started.json.planKey).toBe(PLAN_KEYS.trial);
    expect(started.json.trialEndsAt).toBeTruthy();

    const entitlements = await authedJson<{
      entitlements: { companyVault: boolean; participationChecklist: boolean };
      scanAccess: { status: string; planKey: string };
    }>(app, "/api/saas/entitlements", { cookie, organizationId });
    expect(entitlements.json.scanAccess.status).toBe("trial");
    expect(entitlements.json.entitlements.companyVault).toBe(true);
    expect(entitlements.json.entitlements.participationChecklist).toBe(true);

    // Expire the trial, then ensure a second start is rejected.
    await prisma.subscription.update({
      where: { organizationId },
      data: {
        status: "ACTIVE",
        planKey: PLAN_KEYS.free,
        trialEndsAt: new Date(Date.now() - 60_000),
      },
    });
    const again = await authedJson<{ error?: string; message?: string }>(
      app,
      "/api/saas/billing/start-pro-trial",
      { method: "POST", cookie, organizationId },
    );
    expect(again.status).toBe(400);
  });

  it("Diavgeia endpoint returns null when no ADA is linked", async () => {
    const { app, cookie, organizationId } = await seedOrg("diavgeia");
    const tender = await seedTender({
      referenceNumber: `26PROC-DIA-${Date.now()}`,
      recordType: "PROC",
      title: "Πρόσκληση",
    });
    const res = await authedJson<{ diavgeia: unknown }>(
      app,
      `/api/saas/tenders/${tender.id}/diavgeia`,
      { cookie, organizationId },
    );
    expect(res.status).toBe(200);
    expect(res.json.diavgeia).toBeNull();
  });
});
