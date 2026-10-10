import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  claimSaasJobs,
  enqueueSaasJob,
  markSaasJobSucceeded,
  SAAS_JOB_TYPES,
} from "../src/saas/jobs/outbox.js";
import {
  getSaasTestPrisma,
  resetSaasDatabase,
  signUpAndGetCookie,
  createSaasTestApp,
  authedJson,
} from "./helpers/saas-test.js";

const prisma = getSaasTestPrisma();

describe("saas job outbox", () => {
  beforeEach(async () => {
    await resetSaasDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("enforces unique deliveryKey and atomic claim", async () => {
    const { app } = createSaasTestApp(prisma);
    const user = await signUpAndGetCookie(app, {
      name: "Outbox User",
      email: `outbox-${Date.now()}@example.com`,
      password: "password123",
    });
    const org = await authedJson<{ organization: { id: string } }>(
      app,
      "/api/saas/organizations",
      { cookie: user.cookie, body: { name: "Outbox Org" } },
    );
    const organizationId = org.json.organization.id;

    const first = await enqueueSaasJob(prisma, {
      type: SAAS_JOB_TYPES.weeklyDigest,
      deliveryKey: `WEEKLY_DIGEST:${organizationId}:2026-W41`,
      organizationId,
      payload: { cycleId: "2026-W41" },
    });
    expect(first.created).toBe(true);

    const second = await enqueueSaasJob(prisma, {
      type: SAAS_JOB_TYPES.weeklyDigest,
      deliveryKey: `WEEKLY_DIGEST:${organizationId}:2026-W41`,
      organizationId,
    });
    expect(second.created).toBe(false);
    expect(second.job.id).toBe(first.job.id);

    const claimed = await claimSaasJobs(prisma, { limit: 5 });
    expect(claimed.some((j) => j.id === first.job.id)).toBe(true);

    const claimedAgain = await claimSaasJobs(prisma, { limit: 5 });
    expect(claimedAgain.some((j) => j.id === first.job.id)).toBe(false);

    await markSaasJobSucceeded(prisma, first.job.id);
    const done = await prisma.saasJob.findUniqueOrThrow({
      where: { id: first.job.id },
    });
    expect(done.status).toBe("SUCCEEDED");
  });
});
