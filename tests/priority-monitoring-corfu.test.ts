/**
 * Regression: Corfu-style same-day REQ → Outreach → targeted PROC.
 * Pro Priority Monitoring must detect related PROC without marking SUBMITTED/LOST,
 * with a single RELATED_PROC_DISCOVERED attention event.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { monitorFollowedThreads } from "../src/saas/jobs/monitor-followed-threads.js";
import { PLAN_KEYS } from "../src/saas/plans/catalog.js";
import { resolveNotificationUrgency } from "../src/saas/services/notification-urgency.js";
import { createOrganization } from "../src/saas/services/organizations.js";
import { recordOutreachSent } from "../src/saas/services/outreach.js";
import { upsertCanonicalTender } from "../src/saas/services/tenders.js";
import {
  getSaasTestPrisma,
  resetSaasDatabase,
  setOrgPlan,
} from "./helpers/saas-test.js";

const prisma = getSaasTestPrisma();

describe("Corfu Priority Monitoring regression", () => {
  beforeEach(async () => {
    await resetSaasDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const seedUserOrg = async (email: string, orgName: string) => {
    const user = await prisma.user.create({
      data: { name: orgName, email, emailVerified: true },
    });
    const organization = await createOrganization(prisma, {
      userId: user.id,
      name: orgName,
    });
    return { user, organization };
  };

  it("Outreach on Pro enables Priority; related PROC notifies once without SUBMITTED/LOST", async () => {
    const { user, organization } = await seedUserOrg(
      "corfu-priority@example.com",
      "Corfu Pro",
    );
    await setOrgPlan(prisma, organization.id, PLAN_KEYS.pro);

    const req = await upsertCanonicalTender(prisma, {
      referenceNumber: `26REQ-CORFU-${Date.now()}`,
      recordType: "REQ",
      title:
        "Υπηρεσίες συντήρησης, τεχνικής υποστήριξης και φιλοξενίας ιστοσελίδας",
      contractingAuthority:
        "ΣΥΝΔΕΣΜΟΣ ΚΟΙΝΩΝΙΚΗΣ ΠΡΟΣΤΑΣΙΑΣ ΚΑΙ ΑΛΛΗΛΕΓΓΥΗΣ ΚΕΡΚΥΡΑΣ",
    });

    const created = await recordOutreachSent(prisma, {
      userId: user.id,
      organizationId: organization.id,
      tenderId: req.id,
      sentAt: new Date("2026-10-13T13:42:00.000Z"),
      method: "EMAIL",
    });

    const orgTender = await prisma.organizationTender.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(orgTender.pipelineStage).toBe("OUTREACH_SENT");
    expect(orgTender.monitoringActive).toBe(true);
    expect(orgTender.monitoringPriority).toBe("PRIORITY");
    expect(orgTender.priorityMonitoringReason).toBe("OUTREACH");

    const proc = await upsertCanonicalTender(prisma, {
      referenceNumber: `26PROC-CORFU-${Date.now()}`,
      recordType: "PROC",
      title: "Στοχευμένη πρόσκληση — OKPPDK",
      contractingAuthority: req.contractingAuthority,
      parentTenderId: req.id,
    });

    const first = await monitorFollowedThreads(prisma, {
      enableLocalDiscovery: false,
      enablePublicUiDiscovery: false,
      sourceTenderIds: [req.id],
      discoveries: [
        {
          sourceTenderId: req.id,
          relationType: "REQ_TO_PROC",
          confidence: "CONFIRMED",
          detectionMethod: "PUBLIC_RELATED_ACTS",
          target: {
            referenceNumber: proc.referenceNumber,
            recordType: "PROC",
            title: proc.title,
            contractingAuthority: proc.contractingAuthority,
            parentTenderId: req.id,
          },
        },
      ],
    });

    expect(first.attentionEventsCreated).toBe(1);

    const events = await prisma.organizationAttentionEvent.findMany({
      where: { organizationId: organization.id, type: "RELATED_PROC_DISCOVERED" },
    });
    expect(events).toHaveLength(1);
    const meta = events[0]!.metadata as Record<string, unknown>;
    expect(meta.priorityMonitoring).toBe(true);
    expect(meta.priority).toBe("URGENT");
    expect(
      resolveNotificationUrgency({
        type: "RELATED_PROC_DISCOVERED",
        priorityMonitoring: true,
      }),
    ).toBe("URGENT");

    const second = await monitorFollowedThreads(prisma, {
      enableLocalDiscovery: false,
      enablePublicUiDiscovery: false,
      sourceTenderIds: [req.id],
      discoveries: [
        {
          sourceTenderId: req.id,
          relationType: "REQ_TO_PROC",
          confidence: "CONFIRMED",
          detectionMethod: "PUBLIC_RELATED_ACTS",
          target: {
            referenceNumber: proc.referenceNumber,
            recordType: "PROC",
            title: proc.title,
            contractingAuthority: proc.contractingAuthority,
            parentTenderId: req.id,
          },
        },
      ],
    });
    expect(second.attentionEventsCreated).toBe(0);

    const refreshed = await prisma.organizationTender.findUniqueOrThrow({
      where: { id: orgTender.id },
    });
    expect(refreshed.pipelineStage).toBe("OUTREACH_SENT");
    expect(refreshed.pipelineStage).not.toBe("SUBMITTED");
    expect(refreshed.pipelineStage).not.toBe("LOST");
    expect(refreshed.monitoringPriority).toBe("PRIORITY");
  });

  it("Basic outreach does not enable Priority Monitoring", async () => {
    const { user, organization } = await seedUserOrg(
      "corfu-basic@example.com",
      "Corfu Basic",
    );
    await setOrgPlan(prisma, organization.id, PLAN_KEYS.basic);

    const req = await upsertCanonicalTender(prisma, {
      referenceNumber: `26REQ-BASIC-${Date.now()}`,
      recordType: "REQ",
      title: "Basic follow",
    });

    const created = await recordOutreachSent(prisma, {
      userId: user.id,
      organizationId: organization.id,
      tenderId: req.id,
      method: "EMAIL",
    });

    const orgTender = await prisma.organizationTender.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(orgTender.monitoringActive).toBe(true);
    expect(orgTender.monitoringPriority).toBe("NORMAL");
  });
});
