import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  MAX_ATTENTION_EVENTS_PER_ORG,
  pruneAttentionEventsForOrg,
} from "../src/saas/services/attention.js";
import { upsertCanonicalTender } from "../src/saas/services/tenders.js";
import { createOrganization } from "../src/saas/services/organizations.js";
import { followTender } from "../src/saas/services/follow.js";
import { getSaasTestPrisma, resetSaasDatabase } from "./helpers/saas-test.js";

describe("attention event retention", () => {
  const prisma = getSaasTestPrisma();

  beforeEach(async () => {
    await resetSaasDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it(`keeps only the newest ${MAX_ATTENTION_EVENTS_PER_ORG} events per org`, async () => {
    const user = await prisma.user.create({
      data: {
        name: "Prune User",
        email: `prune-${Date.now()}@example.com`,
        emailVerified: true,
      },
    });
    const organization = await createOrganization(prisma, {
      userId: user.id,
      name: "Prune Org",
    });
    const tender = await upsertCanonicalTender(prisma, {
      referenceNumber: "26REQPRUNE001",
      recordType: "REQ",
      title: "Prune test tender",
      submissionDate: new Date(),
    });
    const organizationTender = await followTender(prisma, {
      userId: user.id,
      organizationId: organization.id,
      tenderId: tender.id,
    });

    for (let i = 0; i < MAX_ATTENTION_EVENTS_PER_ORG + 10; i += 1) {
      await prisma.organizationAttentionEvent.create({
        data: {
          organizationId: organization.id,
          organizationTenderId: organizationTender.id,
          type: "OUTREACH_RECORDED",
          title: `Event ${i}`,
          dedupeKey: `PRUNE_TEST:${i}`,
          createdAt: new Date(Date.now() + i * 1000),
        },
      });
    }

    const deleted = await pruneAttentionEventsForOrg(prisma, organization.id);
    expect(deleted).toBe(10);
    const remaining = await prisma.organizationAttentionEvent.findMany({
      where: { organizationId: organization.id },
      orderBy: { createdAt: "desc" },
    });
    expect(remaining).toHaveLength(MAX_ATTENTION_EVENTS_PER_ORG);
    expect(remaining[0]?.title).toBe(`Event ${MAX_ATTENTION_EVENTS_PER_ORG + 9}`);
    expect(remaining.at(-1)?.title).toBe("Event 10");
  });
});
