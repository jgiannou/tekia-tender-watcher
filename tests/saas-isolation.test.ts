import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { followTender } from "../src/saas/services/follow.js";
import { recordOutreachSent } from "../src/saas/services/outreach.js";
import { recordFormalSubmission } from "../src/saas/services/submission.js";
import {
  listAttentionEvents,
  markAttentionEventRead,
} from "../src/saas/services/attention.js";
import { createOrganization } from "../src/saas/services/organizations.js";
import { upsertCanonicalTender } from "../src/saas/services/tenders.js";
import { monitorFollowedThreads } from "../src/saas/jobs/monitor-followed-threads.js";
import { forbidden } from "../src/saas/errors.js";
import {
  createSaasTestApp,
  getSaasTestPrisma,
  resetSaasDatabase,
  signUpAndGetCookie,
  authedJson,
} from "./helpers/saas-test.js";

const prisma = getSaasTestPrisma();

describe("SaaS cross-tenant isolation", () => {
  beforeEach(async () => {
    await resetSaasDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("Organization A cannot mutate or read Organization B SaaS state", async () => {
    const { app } = createSaasTestApp(prisma);

    const a = await signUpAndGetCookie(app, {
      name: "User A",
      email: `a-${Date.now()}@example.com`,
      password: "password123",
    });
    const b = await signUpAndGetCookie(app, {
      name: "User B",
      email: `b-${Date.now()}@example.com`,
      password: "password123",
    });

    const orgA = await authedJson<{ organization: { id: string } }>(
      app,
      "/api/saas/organizations",
      { cookie: a.cookie, body: { name: "Org A" } },
    );
    const orgB = await authedJson<{ organization: { id: string } }>(
      app,
      "/api/saas/organizations",
      { cookie: b.cookie, body: { name: "Org B" } },
    );
    expect(orgA.status).toBe(201);
    expect(orgB.status).toBe(201);

    const tender = await upsertCanonicalTender(prisma, {
      referenceNumber: `26REQ-ISO-${Date.now()}`,
      recordType: "REQ",
      title: "Isolation tender",
    });

    // B follows their own tender thread
    const followB = await authedJson(app, `/api/saas/tenders/${tender.id}/follow`, {
      cookie: b.cookie,
      organizationId: orgB.json.organization.id,
      body: {},
    });
    expect(followB.status).toBe(200);

    await monitorFollowedThreads(prisma, {
      discoveries: [
        {
          sourceTenderId: tender.id,
          target: {
            referenceNumber: `26PROC-ISO-${Date.now()}`,
            recordType: "PROC",
            parentTenderId: tender.id,
          },
          relationType: "REQ_TO_PROC",
          confidence: "CONFIRMED",
          detectionMethod: "official_reference",
        },
      ],
    });

    const bEvents = await listAttentionEvents(prisma, {
      userId: (
        await prisma.user.findFirstOrThrow({
          where: { email: { contains: "@example.com" }, name: "User B" },
        })
      ).id,
      organizationId: orgB.json.organization.id,
    });
    expect(bEvents.length).toBeGreaterThan(0);

    // A must not follow using B's organization id
    await expect(
      followTender(prisma, {
        userId: (
          await prisma.user.findFirstOrThrow({ where: { name: "User A" } })
        ).id,
        organizationId: orgB.json.organization.id,
        tenderId: tender.id,
      }),
    ).rejects.toMatchObject({ code: "forbidden", status: 403 });

    // HTTP: A cannot unfollow B's tender via B org header
    const unfollow = await authedJson(
      app,
      `/api/saas/tenders/${tender.id}/unfollow`,
      {
        cookie: a.cookie,
        organizationId: orgB.json.organization.id,
        body: {},
      },
    );
    expect(unfollow.status).toBe(403);

    // A cannot read B attention
    const attention = await authedJson(app, "/api/saas/attention", {
      cookie: a.cookie,
      organizationId: orgB.json.organization.id,
    });
    expect(attention.status).toBe(403);

    // A cannot mark B event read
    await expect(
      markAttentionEventRead(prisma, {
        userId: (
          await prisma.user.findFirstOrThrow({ where: { name: "User A" } })
        ).id,
        organizationId: orgB.json.organization.id,
        eventId: bEvents[0]!.id,
      }),
    ).rejects.toMatchObject({ code: "forbidden" });

    // A cannot record outreach/submission for B
    const userA = await prisma.user.findFirstOrThrow({
      where: { name: "User A" },
    });
    await expect(
      recordOutreachSent(prisma, {
        userId: userA.id,
        organizationId: orgB.json.organization.id,
        tenderId: tender.id,
      }),
    ).rejects.toBeInstanceOf(Object);

    await expect(
      recordFormalSubmission(prisma, {
        userId: userA.id,
        organizationId: orgB.json.organization.id,
        tenderId: tender.id,
        submissionMethod: "EMAIL",
      }),
    ).rejects.toMatchObject({ code: "forbidden" });

    // Monitoring state for B is forbidden to A
    const monitoring = await authedJson(app, "/api/saas/monitoring/state", {
      cookie: a.cookie,
      organizationId: orgB.json.organization.id,
    });
    expect(monitoring.status).toBe(403);

    // Sanity: forbidden helper shape
    expect(forbidden().status).toBe(403);
  });

  it("service-level membership is required even without HTTP", async () => {
    const userA = await prisma.user.create({
      data: { name: "Svc A", email: "svc-a@example.com", emailVerified: true },
    });
    const userB = await prisma.user.create({
      data: { name: "Svc B", email: "svc-b@example.com", emailVerified: true },
    });
    const orgB = await createOrganization(prisma, {
      userId: userB.id,
      name: "Svc Org B",
    });
    const tender = await upsertCanonicalTender(prisma, {
      referenceNumber: "26REQ-SVC-1",
      recordType: "REQ",
    });
    await followTender(prisma, {
      userId: userB.id,
      organizationId: orgB.id,
      tenderId: tender.id,
    });

    await expect(
      followTender(prisma, {
        userId: userA.id,
        organizationId: orgB.id,
        tenderId: tender.id,
      }),
    ).rejects.toMatchObject({ code: "forbidden" });
  });
});
