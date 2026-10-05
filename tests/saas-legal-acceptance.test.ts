import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { CURRENT_LEGAL_VERSIONS } from "../src/saas/legal/versions.js";
import {
  createSaasTestApp,
  getSaasTestPrisma,
  resetSaasDatabase,
  signUpAndGetCookie,
  authedJson,
} from "./helpers/saas-test.js";

const prisma = getSaasTestPrisma();

describe("Legal acceptance", () => {
  beforeEach(async () => {
    await resetSaasDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("records terms+privacy acceptance with current versions", async () => {
    const { app } = createSaasTestApp(prisma);
    const user = await signUpAndGetCookie(app, {
      name: "Legal User",
      email: `legal-${Date.now()}@example.com`,
      password: "password123",
    });

    const saved = await authedJson<{
      legalAcceptance: {
        termsVersion: string;
        privacyVersion: string;
        acceptedAt: string;
      };
    }>(app, "/api/saas/me/legal-acceptance", {
      cookie: user.cookie,
      method: "POST",
      body: {
        termsVersion: CURRENT_LEGAL_VERSIONS.terms,
        privacyVersion: CURRENT_LEGAL_VERSIONS.privacy,
        source: "signup",
      },
    });
    expect(saved.status).toBe(201);
    expect(saved.json.legalAcceptance.termsVersion).toBe(CURRENT_LEGAL_VERSIONS.terms);

    const me = await authedJson<{
      legalAcceptance: { termsVersion: string } | null;
    }>(app, "/api/saas/me", { cookie: user.cookie });
    expect(me.status).toBe(200);
    expect(me.json.legalAcceptance?.termsVersion).toBe(CURRENT_LEGAL_VERSIONS.terms);

    const rejected = await authedJson<{ error?: string }>(
      app,
      "/api/saas/me/legal-acceptance",
      {
        cookie: user.cookie,
        method: "POST",
        body: {
          termsVersion: "1999-01-01",
          privacyVersion: CURRENT_LEGAL_VERSIONS.privacy,
        },
      },
    );
    expect(rejected.status).toBe(400);
  });
});
