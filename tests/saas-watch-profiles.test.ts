import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { KimdisClient } from "../src/kimdis/client.js";
import type {
  KimdisPage,
  KimdisRequestRecord,
  NoticeSearchBody,
  RequestSearchBody,
} from "../src/kimdis/types.js";
import { followTender } from "../src/saas/services/follow.js";
import { runWatchProfileScan } from "../src/saas/services/watch-profiles.js";
import {
  authedJson,
  createSaasTestApp,
  getSaasTestPrisma,
  resetSaasDatabase,
  signUpAndGetCookie,
} from "./helpers/saas-test.js";

const emptyPage = <T>(): KimdisPage<T> => ({
  content: [],
  last: true,
  totalElements: 0,
  totalPages: 0,
  number: 0,
});

const matchingRequest = (): KimdisRequestRecord => ({
  referenceNumber: "26REQ888777666",
  title: "Ανάπτυξη ιστοσελίδας δήμου",
  organization: { value: "Demo Municipality" },
  totalCostWithoutVAT: 25000,
  totalCostWithVAT: 31000,
  objectDetails: [{ cpvs: [{ key: "72000000-5" }] }],
  cancelled: false,
  contractTypes: [{ contractType: { key: "9", value: "Υπηρεσίες" } }],
});

const cpvOnlyRequest = (): KimdisRequestRecord => ({
  ...matchingRequest(),
  referenceNumber: "26REQ888777666",
  title: "Ανάπτυξη ιστοσελίδας δήμου",
});

const createMockKimdis = (handlers: {
  searchRequestsPage?: (
    body: RequestSearchBody,
    page: number,
  ) => Promise<KimdisPage<KimdisRequestRecord>>;
  searchNoticesPage?: (
    body: NoticeSearchBody,
    page: number,
  ) => Promise<KimdisPage<KimdisRequestRecord>>;
  downloadAttachment?: (recordType: string, adam: string) => Promise<Buffer | null>;
}): KimdisClient => ({
  searchRequestsPage:
    handlers.searchRequestsPage ??
    (async () => emptyPage<KimdisRequestRecord>()),
  searchNoticesPage:
    handlers.searchNoticesPage ??
    (async () => emptyPage<KimdisRequestRecord>()),
  searchRequests: async () => [],
  searchNotices: async () => [],
  downloadAttachment:
    handlers.downloadAttachment ?? (async () => null),
  publicUrl: (adam) => `https://kimdis.test/public/${adam}`,
  pdfUrl: (_recordType, adam) => `https://kimdis.test/pdf/${adam}`,
});

describe("saas watch profiles", () => {
  const prisma = getSaasTestPrisma();

  beforeEach(async () => {
    await resetSaasDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const signInWithKimdis = async (kimdis: KimdisClient) => {
    const { app } = createSaasTestApp(prisma, { kimdis });
    const { cookie } = await signUpAndGetCookie(app, {
      name: "Watch User",
      email: `watch-${Date.now()}@example.com`,
      password: "password12345",
    });
    const org = await authedJson<{ organization: { id: string } }>(
      app,
      "/api/saas/organizations",
      { method: "POST", cookie, body: { name: "Watch Org" } },
    );
    return { app, cookie, organizationId: org.json.organization.id };
  };

  it("create triggers scan and creates opportunity from mock KIMDIS results", async () => {
    const searchRequestsPage = vi.fn(async () => ({
      content: [matchingRequest()],
      last: true,
      totalElements: 1,
      totalPages: 1,
      number: 0,
    }));
    const { app, cookie, organizationId } = await signInWithKimdis(
      createMockKimdis({ searchRequestsPage }),
    );

    const created = await authedJson<{ profile: { scanState: string; matchCount: number } }>(
      app,
      "/api/saas/watch-profiles",
      {
        cookie,
        organizationId,
        body: {
          name: "Web tenders",
          keywords: ["ιστοσελίδα"],
          cpvs: ["72000000-5"],
        },
      },
    );

    expect(created.status).toBe(201);
    expect(created.json.profile.scanState).toBe("COMPLETED");
    expect(created.json.profile.matchCount).toBe(1);

    const opps = await authedJson<{
      opportunities: Array<{ score: number; tender: { referenceNumber: string } }>;
    }>(app, "/api/saas/opportunities", { cookie, organizationId });

    expect(opps.status).toBe(200);
    expect(opps.json.opportunities).toHaveLength(1);
    expect(opps.json.opportunities[0]?.tender.referenceNumber).toBe("26REQ888777666");
    expect(opps.json.opportunities[0]?.score).toBeGreaterThanOrEqual(45);

    const attention = await prisma.organizationAttentionEvent.findMany({
      where: { organizationId, type: "NEW_OPPORTUNITY" },
    });
    expect(attention).toHaveLength(1);
    const tender = await prisma.tender.findFirst({
      where: { referenceNumber: "26REQ888777666" },
    });
    expect(attention[0]?.dedupeKey).toBe(`NEW_OPPORTUNITY:${tender?.id}`);
  });

  it("two profiles matching same tender yield one org tender and one attention event", async () => {
    const searchRequestsPage = vi.fn(async () => ({
      content: [cpvOnlyRequest()],
      last: true,
      totalElements: 1,
      totalPages: 1,
      number: 0,
    }));
    const { app, cookie, organizationId } = await signInWithKimdis(
      createMockKimdis({ searchRequestsPage }),
    );

    await authedJson(app, "/api/saas/watch-profiles", {
      cookie,
      organizationId,
      body: {
        name: "Keywords profile",
        keywords: ["ιστοσελίδα"],
        cpvs: ["72000000-5"],
      },
    });

    await authedJson(app, "/api/saas/watch-profiles", {
      cookie,
      organizationId,
      body: {
        name: "CPV profile",
        cpvs: ["72000000-5"],
        keywords: ["δήμου"],
      },
    });

    const orgTenders = await prisma.organizationTender.findMany({
      where: { organizationId },
    });
    expect(orgTenders).toHaveLength(1);

    const meta = orgTenders[0]?.matchMeta as {
      matchedProfiles: Array<{ id: string; name: string }>;
    };
    expect(meta.matchedProfiles).toHaveLength(2);
    expect(new Set(meta.matchedProfiles.map((p) => p.name))).toEqual(
      new Set(["Keywords profile", "CPV profile"]),
    );

    const attention = await prisma.organizationAttentionEvent.count({
      where: { organizationId, type: "NEW_OPPORTUNITY" },
    });
    expect(attention).toBe(1);
  });

  it("paused profile skips scan discovery", async () => {
    let callCount = 0;
    const searchRequestsPage = vi.fn(async () => {
      callCount += 1;
      if (callCount === 1) {
        return {
          content: [matchingRequest()],
          last: true,
          totalElements: 1,
          totalPages: 1,
          number: 0,
        };
      }
      return {
        content: [
          {
            ...matchingRequest(),
            referenceNumber: "26REQ000000002",
            title: "Νέα ιστοσελίδα",
          },
        ],
        last: true,
        totalElements: 1,
        totalPages: 1,
        number: 0,
      };
    });

    const kimdis = createMockKimdis({ searchRequestsPage });
    const { app, cookie, organizationId } = await signInWithKimdis(kimdis);

    const created = await authedJson<{ profile: { id: string } }>(
      app,
      "/api/saas/watch-profiles",
      {
        cookie,
        organizationId,
        body: {
          name: "Pausable",
          keywords: ["ιστοσελίδα"],
          cpvs: ["72000000-5"],
        },
      },
    );

    await authedJson(app, `/api/saas/watch-profiles/${created.json.profile.id}/enabled`, {
      method: "PATCH",
      cookie,
      organizationId,
      body: { enabled: false },
    });

    await runWatchProfileScan(prisma, kimdis, created.json.profile.id);

    const opps = await prisma.organizationTender.count({ where: { organizationId } });
    expect(opps).toBe(1);
    expect(searchRequestsPage).toHaveBeenCalledTimes(1);
  });

  it("delete profile does not remove followed organization tender", async () => {
    const searchRequestsPage = vi.fn(async () => ({
      content: [matchingRequest()],
      last: true,
      totalElements: 1,
      totalPages: 1,
      number: 0,
    }));
    const { app, cookie, organizationId } = await signInWithKimdis(
      createMockKimdis({ searchRequestsPage }),
    );

    const created = await authedJson<{ profile: { id: string } }>(
      app,
      "/api/saas/watch-profiles",
      {
        cookie,
        organizationId,
        body: {
          name: "To delete",
          keywords: ["ιστοσελίδα"],
          cpvs: ["72000000-5"],
        },
      },
    );

    const tender = await prisma.tender.findFirstOrThrow({
      where: { referenceNumber: "26REQ888777666" },
    });
    const user = await prisma.user.findFirstOrThrow({
      where: { email: { contains: "watch-" } },
      orderBy: { createdAt: "desc" },
    });

    await followTender(prisma, {
      userId: user.id,
      organizationId,
      tenderId: tender.id,
    });

    const del = await authedJson(app, `/api/saas/watch-profiles/${created.json.profile.id}`, {
      method: "DELETE",
      cookie,
      organizationId,
    });
    expect(del.status).toBe(200);

    const row = await prisma.organizationTender.findFirst({
      where: { organizationId, tenderId: tender.id },
    });
    expect(row).not.toBeNull();
    expect(row?.following).toBe(true);
    expect(row?.watchProfileId).toBeNull();
  });

  it("detects similar criteria on create", async () => {
    const { app, cookie, organizationId } = await signInWithKimdis(
      createMockKimdis({}),
    );

    const criteria = {
      name: "First",
      keywords: ["ιστοσελίδα"],
      cpvs: ["72000000-5"],
      skipSimilarCheck: true,
    };

    await authedJson(app, "/api/saas/watch-profiles", {
      cookie,
      organizationId,
      body: criteria,
    });

    const similarCheck = await authedJson<{ hasSimilar: boolean }>(
      app,
      "/api/saas/watch-profiles/check-similar",
      {
        cookie,
        organizationId,
        body: {
          keywords: ["ιστοσελίδα"],
          cpvs: ["72000000-5"],
        },
      },
    );
    expect(similarCheck.status).toBe(200);
    expect(similarCheck.json.hasSimilar).toBe(true);

    const duplicate = await authedJson<{ error: string }>(
      app,
      "/api/saas/watch-profiles",
      {
        cookie,
        organizationId,
        body: { name: "Duplicate", keywords: ["ιστοσελίδα"], cpvs: ["72000000-5"] },
      },
    );
    expect(duplicate.status).toBe(409);
    expect(duplicate.json.error).toBe("conflict");
  });

  it("PDF proxy returns application/pdf from mock downloadAttachment", async () => {
    const pdfBytes = Buffer.from("%PDF-1.4 watch test");
    const { app, cookie, organizationId } = await signInWithKimdis(
      createMockKimdis({
        downloadAttachment: async () => pdfBytes,
      }),
    );

    const response = await app.request("/api/saas/kimdis/pdf/REQ/26REQ888777666", {
      headers: {
        cookie,
        "X-Organization-Id": organizationId,
      },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    const body = Buffer.from(await response.arrayBuffer());
    expect(body.toString()).toContain("%PDF-1.4");
  });
});
