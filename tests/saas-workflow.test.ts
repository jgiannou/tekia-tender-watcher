import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { followTender } from "../src/saas/services/follow.js";
import { createOrganization } from "../src/saas/services/organizations.js";
import { recordOutreachSent } from "../src/saas/services/outreach.js";
import { recordFormalSubmission } from "../src/saas/services/submission.js";
import { upsertCanonicalTender } from "../src/saas/services/tenders.js";
import { runWatchProfileScan } from "../src/saas/services/watch-profiles.js";
import {
  getOrganizationTenderWorkflow,
  startPreparation,
} from "../src/saas/services/workflow.js";
import {
  addWorkspaceDocuments,
  getTenderWorkspace,
} from "../src/saas/services/workspace.js";
import { getSaasTestPrisma, resetSaasDatabase } from "./helpers/saas-test.js";

const prisma = getSaasTestPrisma();

describe("SaaS request → outreach → submission workflow", () => {
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

  const seedVaultDocument = async (organizationId: string, name: string) => {
    const folder = await prisma.vaultFolder.create({
      data: { organizationId, name: "Δικαιολογητικά", slug: "docs" },
    });
    const document = await prisma.vaultDocument.create({
      data: {
        organizationId,
        folderId: folder.id,
        name,
        status: "NO_EXPIRY",
      },
    });
    const version = await prisma.vaultDocumentVersion.create({
      data: {
        organizationId,
        documentId: document.id,
        version: 1,
        storageKey: `vault/${document.id}/v1`,
      },
    });
    return { document, version };
  };

  it("timeline only contains events that happened and names the expected official act", async () => {
    const { user, organization } = await seedUserOrg("wf@example.com", "WF Co");
    const req = await upsertCanonicalTender(prisma, {
      referenceNumber: "26REQ100001",
      recordType: "REQ",
      title: "Ανάπτυξη νέας ιστοσελίδας",
    });

    await followTender(prisma, {
      userId: user.id,
      organizationId: organization.id,
      tenderId: req.id,
    });

    const afterFollow = await getOrganizationTenderWorkflow(prisma, {
      userId: user.id,
      organizationId: organization.id,
      tenderId: req.id,
    });

    expect(afterFollow.timeline.map((entry) => entry.title)).toEqual([
      "Δημοσίευση πρωτογενούς αιτήματος",
      "Ξεκίνησε παρακολούθηση",
    ]);
    expect(afterFollow.timeline.every((entry) => entry.at != null)).toBe(true);
    expect(afterFollow.nextAction.code).toBe("RECORD_OUTREACH");
    expect(afterFollow.expectedDevelopment?.code).toBe("PROC");

    const { document } = await seedVaultDocument(
      organization.id,
      "Εκδήλωση Ενδιαφέροντος.pdf",
    );
    await recordOutreachSent(prisma, {
      userId: user.id,
      organizationId: organization.id,
      tenderId: req.id,
      method: "EMAIL",
      recipient: "promithies@dimos.gov.gr",
      externalReference: "MSG-1",
      documentIds: [document.id],
    });

    const afterOutreach = await getOrganizationTenderWorkflow(prisma, {
      userId: user.id,
      organizationId: organization.id,
      tenderId: req.id,
    });

    expect(afterOutreach.timeline.map((entry) => entry.title)).toContain(
      "Καταγράφηκε Εκδήλωση Ενδιαφέροντος",
    );
    expect(
      afterOutreach.timeline.some((entry) => entry.title.includes("Τυπική υποβολή")),
    ).toBe(false);
    expect(afterOutreach.outreach?.method).toBe("EMAIL");
    expect(afterOutreach.outreach?.externalReference).toBe("MSG-1");
    expect(afterOutreach.outreach?.documents).toEqual([
      expect.objectContaining({ name: "Εκδήλωση Ενδιαφέροντος.pdf", version: 1 }),
    ]);
    expect(afterOutreach.nextAction.code).toBe("WAIT_PROC");
  });

  it("directly followed PROC offers Start preparation as next action", async () => {
    const { user, organization } = await seedUserOrg("proc@example.com", "PROC Co");
    const proc = await upsertCanonicalTender(prisma, {
      referenceNumber: "26PROC100099",
      recordType: "PROC",
      title: "Ενεργή πρόσκληση ιστοσελίδας",
    });
    await followTender(prisma, {
      userId: user.id,
      organizationId: organization.id,
      tenderId: proc.id,
    });

    const afterFollow = await getOrganizationTenderWorkflow(prisma, {
      userId: user.id,
      organizationId: organization.id,
      tenderId: proc.id,
    });
    expect(afterFollow.nextAction.code).toBe("START_PREPARATION");
    expect(afterFollow.nextAction.label).toBe("Προετοιμασία προσφοράς");

    await startPreparation(prisma, {
      userId: user.id,
      organizationId: organization.id,
      tenderId: proc.id,
    });
    // Idempotent workspace / preparation event.
    await startPreparation(prisma, {
      userId: user.id,
      organizationId: organization.id,
      tenderId: proc.id,
    });

    const afterPrepare = await getOrganizationTenderWorkflow(prisma, {
      userId: user.id,
      organizationId: organization.id,
      tenderId: proc.id,
    });
    expect(afterPrepare.nextAction.code).toBe("RECORD_SUBMISSION");
    expect(
      afterPrepare.timeline.filter((entry) => entry.title === "Ξεκίνησε η προετοιμασία"),
    ).toHaveLength(1);
  });

  it("preparation creates the tender workspace and reuses vault documents", async () => {
    const { user, organization } = await seedUserOrg("ws@example.com", "WS Co");
    const proc = await upsertCanonicalTender(prisma, {
      referenceNumber: "26PROC100002",
      recordType: "PROC",
      title: "Επίσημη πρόσκληση ιστοσελίδας",
    });
    await followTender(prisma, {
      userId: user.id,
      organizationId: organization.id,
      tenderId: proc.id,
    });

    await startPreparation(prisma, {
      userId: user.id,
      organizationId: organization.id,
      tenderId: proc.id,
    });

    const empty = await getTenderWorkspace(prisma, {
      userId: user.id,
      organizationId: organization.id,
      tenderId: proc.id,
    });
    expect(empty.workspace).not.toBeNull();
    expect(empty.sections).toHaveLength(8);
    expect(empty.documentCount).toBe(0);

    const { document } = await seedVaultDocument(
      organization.id,
      "Φορολογική ενημερότητα.pdf",
    );
    const linked = await addWorkspaceDocuments(prisma, {
      userId: user.id,
      organizationId: organization.id,
      tenderId: proc.id,
      documentIds: [document.id],
      section: "02",
    });
    expect(linked.documentCount).toBe(1);
    expect(
      linked.sections.find((section) => section.id === "02")?.documents[0]?.name,
    ).toBe("Φορολογική ενημερότητα.pdf");

    // Re-linking the same document moves it instead of duplicating it.
    const moved = await addWorkspaceDocuments(prisma, {
      userId: user.id,
      organizationId: organization.id,
      tenderId: proc.id,
      documentIds: [document.id],
      section: "07",
    });
    expect(moved.documentCount).toBe(1);
    expect(moved.sections.find((s) => s.id === "02")?.documents).toHaveLength(0);
    expect(moved.sections.find((s) => s.id === "07")?.documents).toHaveLength(1);
  });

  it("submission snapshots the exact vault document versions and keeps monitoring", async () => {
    const { user, organization } = await seedUserOrg("sub@example.com", "Sub Co");
    const proc = await upsertCanonicalTender(prisma, {
      referenceNumber: "26PROC100003",
      recordType: "PROC",
      title: "Πρόσκληση υποβολής",
    });
    await followTender(prisma, {
      userId: user.id,
      organizationId: organization.id,
      tenderId: proc.id,
    });
    const { document, version } = await seedVaultDocument(
      organization.id,
      "Οικονομική προσφορά.pdf",
    );

    const { submission, organizationTender } = await recordFormalSubmission(prisma, {
      userId: user.id,
      organizationId: organization.id,
      tenderId: proc.id,
      submissionMethod: "PORTAL",
      documentIds: [document.id],
    });

    expect(organizationTender.pipelineStage).toBe("SUBMITTED");
    expect(organizationTender.monitoringActive).toBe(true);
    expect(submission.submittedByUserId).toBe(user.id);

    const snapshots = await prisma.submissionDocumentSnapshot.findMany({
      where: { submissionId: submission.id },
    });
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]?.documentVersionId).toBe(version.id);
    expect(snapshots[0]?.nameSnapshot).toBe("Οικονομική προσφορά.pdf");

    const workflow = await getOrganizationTenderWorkflow(prisma, {
      userId: user.id,
      organizationId: organization.id,
      tenderId: proc.id,
    });
    expect(workflow.expectedDevelopment?.code).toBe("AWRD");
  });

  it("scan finds opportunities from canonical tenders without KIMDIS", async () => {
    const { user, organization } = await seedUserOrg("scan@example.com", "Scan Co");
    const publishedAt = new Date();
    await upsertCanonicalTender(prisma, {
      referenceNumber: "26REQ100004",
      recordType: "REQ",
      title: "Ανάπτυξη ιστοσελίδας και portal",
      submissionDate: publishedAt,
    });
    await upsertCanonicalTender(prisma, {
      referenceNumber: "26REQ100005",
      recordType: "REQ",
      title: "Προμήθεια καυσίμων",
      submissionDate: publishedAt,
    });

    const profile = await prisma.watchProfile.create({
      data: {
        organizationId: organization.id,
        name: "Websites & Portals",
        keywords: ["ιστοσελίδα"],
        cpvs: [],
        recordTypes: ["REQ", "PROC"],
        matchingMode: "BALANCED",
        scanState: "PENDING",
      },
    });

    const scanned = await runWatchProfileScan(prisma, undefined, profile.id);
    expect(scanned.scanState).toBe("COMPLETED");
    expect(scanned.lastScannedAt).not.toBeNull();
    expect(scanned.matchCount).toBe(1);

    const opportunities = await prisma.organizationTender.findMany({
      where: { organizationId: organization.id },
      include: { tender: true },
    });
    expect(opportunities).toHaveLength(1);
    expect(opportunities[0]?.tender.referenceNumber).toBe("26REQ100004");
    expect(opportunities[0]?.following).toBe(false);

    // A second saved search matching the same tender must not duplicate it.
    const second = await prisma.watchProfile.create({
      data: {
        organizationId: organization.id,
        name: "Portals",
        keywords: ["portal"],
        cpvs: [],
        recordTypes: ["REQ"],
        matchingMode: "BALANCED",
        scanState: "PENDING",
      },
    });
    await runWatchProfileScan(prisma, undefined, second.id);

    const afterSecond = await prisma.organizationTender.findMany({
      where: { organizationId: organization.id },
    });
    expect(afterSecond).toHaveLength(1);
    expect(
      await prisma.organizationAttentionEvent.count({
        where: { organizationId: organization.id, type: "NEW_OPPORTUNITY" },
      }),
    ).toBe(0);
    expect(
      await prisma.organizationAttentionEvent.count({
        where: { organizationId: organization.id, type: "OPPORTUNITY_DIGEST" },
      }),
    ).toBe(2);
  });
});
