import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { KimdisClient } from "../src/kimdis/client.js";
import type {
  KimdisPage,
  KimdisRequestRecord,
} from "../src/kimdis/types.js";
import { monitorFollowedThreads } from "../src/saas/jobs/monitor-followed-threads.js";
import {
  authedJson,
  createSaasTestApp,
  getSaasTestPrisma,
  resetSaasDatabase,
  signUpAndGetCookie,
} from "./helpers/saas-test.js";

const prisma = getSaasTestPrisma();

const REQ_ADAM = "26REQ777000111";
const PROC_ADAM = "26PROC777000222";
const AWRD_ADAM = "26AWRD777000333";

const requestRecord = (): KimdisRequestRecord => ({
  referenceNumber: REQ_ADAM,
  title: "Ανάπτυξη νέας ιστοσελίδας",
  organization: { value: "Δήμος Δοκιμής" },
  totalCostWithoutVAT: 24000,
  totalCostWithVAT: 29760,
  objectDetails: [{ cpvs: [{ key: "72413000-8" }] }],
  cancelled: false,
  contractTypes: [{ contractType: { key: "9", value: "Υπηρεσίες" } }],
});

const page = <T>(content: T[]): KimdisPage<T> => ({
  content,
  last: true,
  totalElements: content.length,
  totalPages: 1,
  number: 0,
});

const mockKimdis = (): KimdisClient => ({
  searchRequestsPage: async () => page([requestRecord()]),
  searchNoticesPage: async () => page<KimdisRequestRecord>([]),
  searchRequests: async () => [],
  searchNotices: async () => [],
  downloadAttachment: async () => null,
  publicUrl: (adam) => `https://kimdis.test/public/${adam}`,
  pdfUrl: (_recordType, adam) => `https://kimdis.test/pdf/${adam}`,
});

/** Walks the complete product story on the real HTTP routes. */
describe("SaaS procurement workflow end to end", () => {
  beforeEach(async () => {
    await resetSaasDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("REQ discovery → follow → outreach with vault doc → PROC → preparation → submission → award", async () => {
    const { app } = createSaasTestApp(prisma, { kimdis: mockKimdis() });
    const { cookie } = await signUpAndGetCookie(app, {
      name: "E2E User",
      email: `e2e-${Date.now()}@example.com`,
      password: "password12345",
    });
    const orgRes = await authedJson<{ organization: { id: string } }>(
      app,
      "/api/saas/organizations",
      { cookie, body: { name: "E2E Co" } },
    );
    const organizationId = orgRes.json.organization.id;

    // 1 — find the REQ through KIMDIS search
    const search = await authedJson<{ items: Array<{ adam: string }> }>(
      app,
      "/api/saas/kimdis/search",
      {
        cookie,
        organizationId,
        body: { recordFamily: "REQ", title: "ιστοσελίδα" },
      },
    );
    expect(search.status).toBe(200);
    expect(search.json.items[0]?.adam).toBe(REQ_ADAM);

    // 2 — follow it
    const follow = await authedJson<{ tender: { id: string } }>(
      app,
      "/api/saas/kimdis/follow",
      { cookie, organizationId, body: search.json.items[0] },
    );
    expect(follow.status).toBe(201);
    const tenderId = follow.json.tender.id;

    // 3 — it shows up in Monitoring under «Παρακολουθούνται»
    const monitoring = await authedJson<{
      organizationTenders: Array<{
        tenderId: string;
        filterBucket: string;
        nextAction: { code: string };
      }>;
    }>(app, "/api/saas/monitoring/state", { cookie, organizationId });
    expect(monitoring.json.organizationTenders).toHaveLength(1);
    expect(monitoring.json.organizationTenders[0]?.filterBucket).toBe("FOLLOWING");
    expect(monitoring.json.organizationTenders[0]?.nextAction.code).toBe(
      "RECORD_OUTREACH",
    );

    // 4 + 5 + 6 — record outreach referencing an existing vault document
    const folder = await prisma.vaultFolder.create({
      data: { organizationId, name: "Εταιρικά", slug: "company" },
    });
    const vaultDoc = await prisma.vaultDocument.create({
      data: {
        organizationId,
        folderId: folder.id,
        name: "Company Profile.pdf",
        status: "NO_EXPIRY",
      },
    });
    await prisma.vaultDocumentVersion.create({
      data: {
        organizationId,
        documentId: vaultDoc.id,
        version: 1,
        storageKey: `vault/${vaultDoc.id}/v1`,
      },
    });

    const outreach = await authedJson(app, `/api/saas/tenders/${tenderId}/outreach`, {
      cookie,
      organizationId,
      body: {
        method: "EMAIL",
        recipient: "promithies@dimos.gov.gr",
        documentIds: [vaultDoc.id],
      },
    });
    expect(outreach.status).toBe(200);

    // 7 + 8 — timeline shows the real outreach event and we wait for the PROC
    type WorkflowResponse = {
      workflow: {
        timeline: Array<{ kind: string; title: string; at: string | null }>;
        nextAction: { code: string };
        expectedDevelopment: { code: string } | null;
        outreach: { documents: Array<{ name: string }> } | null;
      };
    };
    const afterOutreach = await authedJson<WorkflowResponse>(
      app,
      `/api/saas/tenders/${tenderId}/workflow`,
      { cookie, organizationId },
    );
    expect(
      afterOutreach.json.workflow.timeline.map((entry) => entry.title),
    ).toContain("Καταγράφηκε Εκδήλωση Ενδιαφέροντος");
    expect(afterOutreach.json.workflow.timeline.every((e) => e.at != null)).toBe(true);
    expect(afterOutreach.json.workflow.outreach?.documents[0]?.name).toBe(
      "Company Profile.pdf",
    );
    expect(afterOutreach.json.workflow.nextAction.code).toBe("WAIT_PROC");
    expect(afterOutreach.json.workflow.expectedDevelopment?.code).toBe("PROC");

    // 9 + 10 — a related PROC arrives through the real relation machinery
    const discovery = await monitorFollowedThreads(prisma, {
      discoveries: [
        {
          sourceTenderId: tenderId,
          target: {
            referenceNumber: PROC_ADAM,
            recordType: "PROC",
            title: "Επίσημη πρόσκληση ιστοσελίδας",
          },
          relationType: "REQ_TO_PROC",
          confidence: "CONFIRMED",
          detectionMethod: "official_reference",
        },
      ],
    });
    expect(discovery.attentionEventsCreated).toBe(1);

    const attention = await authedJson<{
      events: Array<{ type: string; readAt: string | null }>;
    }>(app, "/api/saas/attention", { cookie, organizationId });
    expect(attention.json.events.map((e) => e.type)).toContain(
      "RELATED_PROC_DISCOVERED",
    );

    // 11 + 12 + 13 — start preparation, which opens the tender workspace
    const prepare = await authedJson(app, `/api/saas/tenders/${tenderId}/prepare`, {
      cookie,
      organizationId,
      body: {},
    });
    expect(prepare.status).toBe(200);

    type WorkspaceResponse = {
      workspace: { id: string } | null;
      documentCount: number;
      sections: Array<{ id: string; documents: Array<{ name: string }> }>;
    };
    const workspace = await authedJson<WorkspaceResponse>(
      app,
      `/api/saas/tenders/${tenderId}/workspace`,
      { cookie, organizationId },
    );
    expect(workspace.json.workspace).not.toBeNull();
    expect(workspace.json.sections).toHaveLength(8);

    // 14 — reuse the same company document without re-uploading
    const linked = await authedJson<WorkspaceResponse>(
      app,
      `/api/saas/tenders/${tenderId}/workspace/documents`,
      {
        cookie,
        organizationId,
        body: { documentIds: [vaultDoc.id], section: "02" },
      },
    );
    expect(linked.json.documentCount).toBe(1);
    expect(
      linked.json.sections.find((s) => s.id === "02")?.documents[0]?.name,
    ).toBe("Company Profile.pdf");

    // 15 + 16 — record the formal submission; monitoring must stay active
    const submission = await authedJson<{
      organizationTender: { pipelineStage: string; monitoringActive: boolean };
    }>(app, `/api/saas/tenders/${tenderId}/submissions`, {
      cookie,
      organizationId,
      body: { submissionMethod: "PORTAL", documentIds: [vaultDoc.id] },
    });
    expect(submission.status).toBe(201);
    expect(submission.json.organizationTender.pipelineStage).toBe("SUBMITTED");
    expect(submission.json.organizationTender.monitoringActive).toBe(true);

    // 17 + 18 — a related award updates the thread without declaring WON/LOST
    await monitorFollowedThreads(prisma, {
      discoveries: [
        {
          sourceTenderId: tenderId,
          target: {
            referenceNumber: AWRD_ADAM,
            recordType: "AWRD",
            title: "Απόφαση ανάθεσης",
          },
          relationType: "PROC_TO_AWRD",
          confidence: "CONFIRMED",
          detectionMethod: "official_reference",
        },
      ],
    });

    const finalWorkflow = await authedJson<WorkflowResponse>(
      app,
      `/api/saas/tenders/${tenderId}/workflow`,
      { cookie, organizationId },
    );
    expect(finalWorkflow.json.workflow.nextAction.code).toBe("REVIEW_AWARD");
    expect(
      finalWorkflow.json.workflow.timeline.filter((e) => e.kind === "official")
        .length,
    ).toBeGreaterThanOrEqual(3);

    const finalRow = await prisma.organizationTender.findFirstOrThrow({
      where: { organizationId, tenderId },
    });
    expect(finalRow.monitoringActive).toBe(true);
    expect(finalRow.pipelineStage).toBe("SUBMITTED");

    const finalMonitoring = await authedJson<{
      organizationTenders: Array<{ filterBucket: string }>;
    }>(app, "/api/saas/monitoring/state", { cookie, organizationId });
    expect(finalMonitoring.json.organizationTenders[0]?.filterBucket).toBe(
      "NEW_DEVELOPMENT",
    );
  });
});
