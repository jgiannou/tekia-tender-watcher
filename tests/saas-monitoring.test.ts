import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { monitorFollowedThreads } from "../src/saas/jobs/monitor-followed-threads.js";
import { followTender } from "../src/saas/services/follow.js";
import { recordOutreachSent } from "../src/saas/services/outreach.js";
import { recordFormalSubmission } from "../src/saas/services/submission.js";
import { upsertCanonicalTender } from "../src/saas/services/tenders.js";
import { createOrganization } from "../src/saas/services/organizations.js";
import {
  getSaasTestPrisma,
  resetSaasDatabase,
} from "./helpers/saas-test.js";

const prisma = getSaasTestPrisma();

describe("SaaS monitoring lifecycle", () => {
  beforeEach(async () => {
    await resetSaasDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const seedUserOrg = async (email: string, orgName: string) => {
    const user = await prisma.user.create({
      data: {
        name: orgName,
        email,
        emailVerified: true,
      },
    });
    const organization = await createOrganization(prisma, {
      userId: user.id,
      name: orgName,
    });
    return { user, organization };
  };

  it("Follow sets following+monitoring and does not create Submission", async () => {
    const { user, organization } = await seedUserOrg(
      "follow@example.com",
      "Follow Co",
    );
    const tender = await upsertCanonicalTender(prisma, {
      referenceNumber: "26REQ000001",
      recordType: "REQ",
      title: "Ανάπτυξη ιστοσελίδας",
    });

    const row = await followTender(prisma, {
      userId: user.id,
      organizationId: organization.id,
      tenderId: tender.id,
    });

    expect(row.following).toBe(true);
    expect(row.monitoringActive).toBe(true);
    expect(row.monitoringReason).toBe("USER_FOLLOWING");
    expect(row.pipelineStage).toBe("NEW");
    expect(row.operationalStatus).toBe("NEW");

    const submissions = await prisma.submission.count({
      where: { organizationId: organization.id },
    });
    expect(submissions).toBe(0);
  });

  it("Outreach preserves monitoring and does not create formal Submission", async () => {
    const { user, organization } = await seedUserOrg(
      "outreach@example.com",
      "Outreach Co",
    );
    const tender = await upsertCanonicalTender(prisma, {
      referenceNumber: "26REQ000002",
      recordType: "REQ",
      title: "Portal",
    });
    await followTender(prisma, {
      userId: user.id,
      organizationId: organization.id,
      tenderId: tender.id,
    });

    const row = await recordOutreachSent(prisma, {
      userId: user.id,
      organizationId: organization.id,
      tenderId: tender.id,
      recipient: "authority@example.gov",
      subject: "Εκδήλωση Ενδιαφέροντος",
    });

    expect(row.following).toBe(true);
    expect(row.monitoringActive).toBe(true);
    expect(row.monitoringReason).toBe("OUTREACH_SENT");
    expect(row.pipelineStage).toBe("OUTREACH_SENT");
    expect(row.operationalStatus).not.toBe("SUBMITTED");

    expect(
      await prisma.submission.count({
        where: { organizationId: organization.id },
      }),
    ).toBe(0);
    expect(
      await prisma.outreachLedger.count({
        where: { organizationId: organization.id, status: "SENT" },
      }),
    ).toBe(1);
  });

  it("REQ→PROC creates one RelatedActLink and attention only for affected org", async () => {
    const tekia = await seedUserOrg("tekia@example.com", "TEKIA");
    const other = await seedUserOrg("other@example.com", "Other Co");

    const req = await upsertCanonicalTender(prisma, {
      referenceNumber: "26REQ000010",
      recordType: "REQ",
      title: "Ανάπτυξη νέας ιστοσελίδας",
    });

    await followTender(prisma, {
      userId: tekia.user.id,
      organizationId: tekia.organization.id,
      tenderId: req.id,
    });
    await recordOutreachSent(prisma, {
      userId: tekia.user.id,
      organizationId: tekia.organization.id,
      tenderId: req.id,
    });

    // Other org exists but does not follow this REQ
    expect(other.organization.id).not.toBe(tekia.organization.id);

    const first = await monitorFollowedThreads(prisma, {
      discoveries: [
        {
          sourceTenderId: req.id,
          target: {
            referenceNumber: "26PROC000010",
            recordType: "PROC",
            title: "Επίσημη πρόσκληση ιστοσελίδας",
            parentTenderId: req.id,
          },
          relationType: "REQ_TO_PROC",
          confidence: "CONFIRMED",
          detectionMethod: "official_reference",
        },
      ],
    });

    expect(first.upstreamOperations).toBe(1);
    expect(first.attentionEventsCreated).toBe(1);

    const links = await prisma.relatedActLink.findMany();
    expect(links).toHaveLength(1);
    expect(links[0]?.sourceTenderId).toBe(req.id);

    const tekiaEvents = await prisma.organizationAttentionEvent.findMany({
      where: { organizationId: tekia.organization.id },
      orderBy: { createdAt: "asc" },
    });
    const otherEvents = await prisma.organizationAttentionEvent.findMany({
      where: { organizationId: other.organization.id },
    });
    expect(tekiaEvents.map((e) => e.type)).toEqual([
      "OUTREACH_RECORDED",
      "RELATED_PROC_DISCOVERED",
    ]);
    expect(otherEvents).toHaveLength(0);

    // Idempotency: 10 more runs do not duplicate
    for (let i = 0; i < 10; i += 1) {
      await monitorFollowedThreads(prisma, {
        discoveries: [
          {
            sourceTenderId: req.id,
            target: {
              referenceNumber: "26PROC000010",
              recordType: "PROC",
              title: "Επίσημη πρόσκληση ιστοσελίδας",
              parentTenderId: req.id,
            },
            relationType: "REQ_TO_PROC",
            confidence: "CONFIRMED",
            detectionMethod: "official_reference",
          },
        ],
      });
    }

    expect(await prisma.relatedActLink.count()).toBe(1);
    expect(await prisma.organizationAttentionEvent.count()).toBe(2);
  });

  it("dedupes canonical upstream work across many orgs following same REQ", async () => {
    const req = await upsertCanonicalTender(prisma, {
      referenceNumber: "26REQ000099",
      recordType: "REQ",
      title: "Shared REQ",
    });

    for (let i = 0; i < 5; i += 1) {
      const seeded = await seedUserOrg(`org${i}@example.com`, `Org ${i}`);
      await followTender(prisma, {
        userId: seeded.user.id,
        organizationId: seeded.organization.id,
        tenderId: req.id,
      });
    }

    const result = await monitorFollowedThreads(prisma, {
      discoveries: [
        {
          sourceTenderId: req.id,
          target: {
            referenceNumber: "26PROC000099",
            recordType: "PROC",
            parentTenderId: req.id,
          },
          relationType: "REQ_TO_PROC",
          confidence: "CONFIRMED",
          detectionMethod: "official_reference",
        },
      ],
    });

    expect(result.activeOrganizationTenders).toBe(5);
    expect(result.canonicalSourcesChecked).toBe(1);
    expect(result.upstreamOperations).toBe(1);
    expect(await prisma.relatedActLink.count()).toBe(1);
    expect(await prisma.organizationAttentionEvent.count()).toBe(5);
  });

  it("Formal submission keeps monitoring active and award creates attention without WON/LOST", async () => {
    const { user, organization } = await seedUserOrg(
      "submit@example.com",
      "Submit Co",
    );
    const proc = await upsertCanonicalTender(prisma, {
      referenceNumber: "26PROC000200",
      recordType: "PROC",
      title: "Invitation",
    });

    await followTender(prisma, {
      userId: user.id,
      organizationId: organization.id,
      tenderId: proc.id,
    });

    const { organizationTender, submission } = await recordFormalSubmission(
      prisma,
      {
        userId: user.id,
        organizationId: organization.id,
        tenderId: proc.id,
        submissionMethod: "ESIDIS",
        amountWithoutVat: 12000,
      },
    );

    expect(submission.result).toBe("PENDING");
    expect(organizationTender.pipelineStage).toBe("SUBMITTED");
    expect(organizationTender.monitoringActive).toBe(true);
    expect(organizationTender.monitoringReason).toBe("SUBMISSION_RECORDED");
    expect(organizationTender.operationalStatus).toBe("SUBMITTED");
    expect(organizationTender.operationalStatus).not.toBe("WON");
    expect(organizationTender.operationalStatus).not.toBe("LOST");

    await monitorFollowedThreads(prisma, {
      discoveries: [
        {
          sourceTenderId: proc.id,
          target: {
            referenceNumber: "26AWRD000200",
            recordType: "AWRD",
            title: "Award decision",
            parentTenderId: proc.id,
          },
          relationType: "PROC_TO_AWRD",
          confidence: "CONFIRMED",
          detectionMethod: "official_reference",
        },
      ],
    });

    const events = await prisma.organizationAttentionEvent.findMany({
      where: { organizationId: organization.id },
    });
    expect(events.some((e) => e.type === "RELATED_AWARD_DISCOVERED")).toBe(
      true,
    );

    const after = await prisma.organizationTender.findUniqueOrThrow({
      where: { id: organizationTender.id },
    });
    expect(after.operationalStatus).toBe("SUBMITTED");
    expect(after.pipelineStage).toBe("SUBMITTED");
    expect(after.monitoringActive).toBe(true);
  });

  it("public UI related acts link followed REQ to PROC Open Data still omits", async () => {
    const { user, organization } = await seedUserOrg(
      "publicui@example.com",
      "Public UI Co",
    );
    const req = await upsertCanonicalTender(prisma, {
      referenceNumber: "26REQ019966687",
      recordType: "REQ",
      title:
        "Παροχή υπηρεσιών τεχνικής υποστήριξης της επίσημης ιστοσελίδας του Δήμου για δύο (2) έτη.",
      contractingAuthority: "ΔΗΜΟΣ ΚΑΤΩ ΝΕΥΡΟΚΟΠΙΟΥ",
    });
    await followTender(prisma, {
      userId: user.id,
      organizationId: organization.id,
      tenderId: req.id,
    });
    await recordOutreachSent(prisma, {
      userId: user.id,
      organizationId: organization.id,
      tenderId: req.id,
    });

    const result = await monitorFollowedThreads(prisma, {
      enableLocalDiscovery: false,
      enablePublicUiDiscovery: true,
      discoverFromPublicUi: async () => [
        {
          sourceTenderId: req.id,
          target: {
            referenceNumber: "26PROC019972045",
            recordType: "PROC",
            title:
              "Παροχή υπηρεσιών τεχνικής υποστήριξης της επίσημης ιστοσελίδας του Δήμου για δύο (2) έτη.",
            contractingAuthority: "ΔΗΜΟΣ ΚΑΤΩ ΝΕΥΡΟΚΟΠΙΟΥ",
            parentTenderId: req.id,
          },
          relationType: "REQ_TO_PROC",
          confidence: "CONFIRMED",
          detectionMethod: "public_ui_related_acts",
        },
      ],
    });

    expect(result.relatedLinksUpserted).toBe(1);
    expect(result.attentionEventsCreated).toBe(1);

    const link = await prisma.relatedActLink.findFirst({
      where: { sourceTenderId: req.id },
      include: { targetTender: true },
    });
    expect(link?.confidence).toBe("CONFIRMED");
    expect(link?.detectionMethod).toBe("public_ui_related_acts");
    expect(link?.targetTender.referenceNumber).toBe("26PROC019972045");
    expect(link?.targetTender.parentTenderId).toBe(req.id);

    const events = await prisma.organizationAttentionEvent.findMany({
      where: { organizationId: organization.id },
    });
    expect(events.some((e) => e.type === "RELATED_PROC_DISCOVERED")).toBe(true);
  });

  it("supports following=true with pipeline OUTREACH_SENT and no submission", async () => {
    const { user, organization } = await seedUserOrg(
      "state@example.com",
      "State Co",
    );
    const tender = await upsertCanonicalTender(prisma, {
      referenceNumber: "26REQ000777",
      recordType: "REQ",
    });
    await followTender(prisma, {
      userId: user.id,
      organizationId: organization.id,
      tenderId: tender.id,
    });
    const row = await recordOutreachSent(prisma, {
      userId: user.id,
      organizationId: organization.id,
      tenderId: tender.id,
    });

    expect(row.following).toBe(true);
    expect(row.pipelineStage).toBe("OUTREACH_SENT");
    expect(row.monitoringActive).toBe(true);
    expect(
      await prisma.submission.count({
        where: { organizationTenderId: row.id },
      }),
    ).toBe(0);
  });
});
