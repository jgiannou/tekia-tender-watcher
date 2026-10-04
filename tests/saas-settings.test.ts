import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createSaasApp } from "../src/saas/app.js";
import { createCompanyRegistryProvider } from "../src/saas/company-registry/index.js";
import type { CompanyRegistryProvider } from "../src/saas/company-registry/types.js";
import {
  authedJson,
  createSaasTestApp,
  getSaasTestPrisma,
  resetSaasDatabase,
  saasTestConfig,
  signUpAndGetCookie,
} from "./helpers/saas-test.js";

describe("saas settings + optional onboarding", () => {
  const prisma = getSaasTestPrisma();

  beforeEach(async () => {
    await resetSaasDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("keeps setup optional and persists theme + company settings per tenant", async () => {
    const { app } = createSaasTestApp(prisma);
    const { cookie } = await signUpAndGetCookie(app, {
      name: "Alice",
      email: `alice-${Date.now()}@example.com`,
      password: "password12345",
    });

    const org = await authedJson<{ organization: { id: string } }>(
      app,
      "/api/saas/organizations",
      {
        method: "POST",
        cookie,
        body: { name: "Acme Soft" },
      },
    );
    expect(org.status).toBe(201);
    const organizationId = org.json.organization.id;

    const me = await authedJson<{
      theme: string;
      gemiConfigured: boolean;
      organizations: unknown[];
    }>(app, "/api/saas/me", { cookie });
    expect(me.status).toBe(200);
    expect(me.json.theme).toBe("DARK");
    expect(me.json.gemiConfigured).toBe(false);

    const theme = await authedJson<{ theme: string }>(
      app,
      "/api/saas/me/preferences",
      {
        method: "PUT",
        cookie,
        body: { theme: "LIGHT" },
      },
    );
    expect(theme.status).toBe(200);
    expect(theme.json.theme).toBe("LIGHT");

    const settings = await authedJson<{
      settings: { onboardingStatus: string; company: { legalName: string } };
    }>(app, "/api/saas/settings", { cookie, organizationId });
    expect(settings.status).toBe(200);
    expect(settings.json.settings.onboardingStatus).toBe("NOT_STARTED");

    const dismissed = await authedJson<{
      settings: { onboardingStatus: string };
    }>(app, "/api/saas/settings/onboarding", {
      method: "PUT",
      cookie,
      organizationId,
      body: { status: "DISMISSED" },
    });
    expect(dismissed.status).toBe(200);
    expect(dismissed.json.settings.onboardingStatus).toBe("DISMISSED");

    // App remains usable: monitoring state still works after dismiss.
    const monitoring = await authedJson(app, "/api/saas/monitoring/state", {
      cookie,
      organizationId,
    });
    expect(monitoring.status).toBe(200);

    const company = await authedJson<{
      settings: { company: { legalName: string; afm: string | null } };
    }>(app, "/api/saas/settings/company", {
      method: "PATCH",
      cookie,
      organizationId,
      body: { legalName: "Acme Soft AE", afm: "123456789", source: "MANUAL" },
    });
    expect(company.status).toBe(200);
    expect(company.json.settings.company.legalName).toBe("Acme Soft AE");

    const gemi = await authedJson<{ status: string }>(app, "/api/saas/gemi/lookup", {
      method: "POST",
      cookie,
      organizationId,
      body: { afm: "123456789" },
    });
    expect(gemi.status).toBe(200);
    expect(gemi.json.status).toBe("not_configured");

    const profile = await authedJson<{ profile: { name: string } }>(
      app,
      "/api/saas/watch-profiles",
      {
        method: "POST",
        cookie,
        organizationId,
        body: { name: "Ιστοσελίδες", keywords: ["ιστοσελίδα"] },
      },
    );
    expect(profile.status).toBe(201);
    expect(profile.json.profile.name).toBe("Ιστοσελίδες");
  });

  it("isolates organization settings across tenants", async () => {
    const { app } = createSaasTestApp(prisma);
    const a = await signUpAndGetCookie(app, {
      name: "A",
      email: `a-${Date.now()}@example.com`,
      password: "password12345",
    });
    const b = await signUpAndGetCookie(app, {
      name: "B",
      email: `b-${Date.now()}@example.com`,
      password: "password12345",
    });

    const orgA = await authedJson<{ organization: { id: string } }>(
      app,
      "/api/saas/organizations",
      { method: "POST", cookie: a.cookie, body: { name: "Org A" } },
    );
    const orgB = await authedJson<{ organization: { id: string } }>(
      app,
      "/api/saas/organizations",
      { method: "POST", cookie: b.cookie, body: { name: "Org B" } },
    );

    await authedJson(app, "/api/saas/settings/company", {
      method: "PATCH",
      cookie: a.cookie,
      organizationId: orgA.json.organization.id,
      body: { legalName: "Secret A", afm: "111111111" },
    });

    const leak = await authedJson<{ error?: string }>(app, "/api/saas/settings", {
      cookie: b.cookie,
      organizationId: orgA.json.organization.id,
    });
    expect(leak.status).toBe(403);

    const own = await authedJson<{
      settings: { company: { legalName: string } };
    }>(app, "/api/saas/settings", {
      cookie: b.cookie,
      organizationId: orgB.json.organization.id,
    });
    expect(own.status).toBe(200);
    expect(own.json.settings.company.legalName).not.toBe("Secret A");
  });

  it("uses injected company registry without guessing responses", async () => {
    const fakeRegistry: CompanyRegistryProvider = {
      isConfigured: () => true,
      lookupExact: async () => ({
        status: "found",
        companies: [
          {
            gemiNumber: "999",
            afm: "123456789",
            legalName: "Test AE",
            distinctiveTitle: "Test",
            status: "Ενεργή",
            gemiService: "Αθήνα",
            legalType: "ΑΕ",
            website: null,
            email: null,
            incorporationDate: null,
            address: {
              street: null,
              streetNumber: null,
              zipCode: null,
              city: null,
              municipality: null,
              prefecture: null,
            },
            activities: [
              {
                code: "62.01",
                description: "Λογισμικό",
                isPrimary: true,
              },
            ],
            source: "GEMI",
          },
        ],
      }),
      getByGemiNumber: async () => ({ status: "not_found" }),
    };

    const { app } = createSaasAppWithRegistry(prisma, fakeRegistry);
    const { cookie } = await signUpAndGetCookie(app, {
      name: "Gemi User",
      email: `gemi-${Date.now()}@example.com`,
      password: "password12345",
    });
    const org = await authedJson<{ organization: { id: string } }>(
      app,
      "/api/saas/organizations",
      { method: "POST", cookie, body: { name: "Gemi Org" } },
    );

    const lookup = await authedJson<{
      status: string;
      companies: Array<{ legalName: string }>;
    }>(app, "/api/saas/gemi/lookup", {
      method: "POST",
      cookie,
      organizationId: org.json.organization.id,
      body: { afm: "123456789" },
    });
    expect(lookup.status).toBe(200);
    expect(lookup.json.status).toBe("found");
    expect(lookup.json.companies[0]?.legalName).toBe("Test AE");

    // Default factory without key stays not_configured
    const empty = createCompanyRegistryProvider({ GEMI_API_KEY: "" });
    expect(empty.isConfigured()).toBe(false);

    const confirm = await authedJson<{
      settings: {
        company: { legalName: string; afm: string | null; source: string | null };
        activities: Array<{ code: string; isPrimary: boolean }>;
        onboardingStatus: string;
      };
      watchSuggestions: { cpvs: unknown[]; keywords: string[] };
    }>(app, "/api/saas/gemi/confirm", {
      method: "POST",
      cookie,
      organizationId: org.json.organization.id,
      body: {
        company: {
          gemiNumber: "999",
          afm: "123456789",
          legalName: "Test AE",
          distinctiveTitle: "Test",
          status: "Ενεργή",
          gemiService: "Αθήνα",
          legalType: "ΑΕ",
          website: null,
          email: null,
          incorporationDate: null,
          address: {
            street: null,
            streetNumber: null,
            zipCode: null,
            city: null,
            municipality: null,
            prefecture: null,
          },
          activities: [
            {
              code: "62.01",
              description: "Λογισμικό",
              isPrimary: true,
            },
          ],
          source: "GEMI",
        },
      },
    });
    expect(confirm.status).toBe(200);
    expect(confirm.json.settings.company.legalName).toBe("Test AE");
    expect(confirm.json.settings.company.afm).toBe("123456789");
    expect(confirm.json.settings.company.source).toBe("GEMI");
    expect(confirm.json.settings.activities).toEqual([
      expect.objectContaining({ code: "62.01", isPrimary: true }),
    ]);

    const after = await authedJson<{
      settings: { activities: Array<{ code: string }> };
    }>(app, "/api/saas/settings", {
      cookie,
      organizationId: org.json.organization.id,
    });
    expect(after.status).toBe(200);
    expect(after.json.settings.activities.map((a) => a.code)).toEqual(["62.01"]);
  });
});

const createSaasAppWithRegistry = (
  prisma: ReturnType<typeof getSaasTestPrisma>,
  companyRegistry: CompanyRegistryProvider,
) => {
  process.env.DATABASE_URL = saasTestConfig().DATABASE_URL;
  process.env.BETTER_AUTH_SECRET = saasTestConfig().BETTER_AUTH_SECRET;
  process.env.BETTER_AUTH_URL = saasTestConfig().BETTER_AUTH_URL;
  return createSaasApp({
    prisma,
    config: saasTestConfig(),
    companyRegistry,
  });
};
