import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { KimdisClient } from "../src/kimdis/client.js";
import type {
  KimdisPage,
  KimdisRequestRecord,
  NoticeSearchBody,
  RequestSearchBody,
} from "../src/kimdis/types.js";
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

const sampleRequest = (): KimdisRequestRecord => ({
  referenceNumber: "24REQ012345678",
  title: "Sample request",
  organization: { value: "Demo Municipality" },
  totalCostWithoutVAT: 1000,
  totalCostWithVAT: 1240,
  objectDetails: [{ cpvs: [{ key: "72000000-5" }] }],
  cancelled: false,
  contractTypes: [{ contractType: { key: "9", value: "Υπηρεσίες" } }],
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
}): KimdisClient => ({
  searchRequestsPage:
    handlers.searchRequestsPage ??
    (async () => emptyPage<KimdisRequestRecord>()),
  searchNoticesPage:
    handlers.searchNoticesPage ??
    (async () => emptyPage<KimdisRequestRecord>()),
  searchRequests: async () => [],
  searchNotices: async () => [],
  downloadAttachment: async () => null,
  publicUrl: (adam) => `https://kimdis.test/public/${adam}`,
  pdfUrl: (_recordType, adam) => `https://kimdis.test/pdf/${adam}`,
});

describe("saas kimdis search", () => {
  const prisma = getSaasTestPrisma();

  beforeEach(async () => {
    await resetSaasDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const signIn = async (kimdis: KimdisClient) => {
    const { app } = createSaasTestApp(prisma, { kimdis });
    const { cookie } = await signUpAndGetCookie(app, {
      name: "Kimdis User",
      email: `kimdis-${Date.now()}@example.com`,
      password: "password12345",
    });
    return { app, cookie };
  };

  it("maps title, ADAM, CPV, and contract type label into KIMDIS request body", async () => {
    const searchRequestsPage = vi.fn(async () => ({
      content: [sampleRequest()],
      last: true,
      totalElements: 1,
      totalPages: 1,
      number: 0,
    }));
    const { app, cookie } = await signIn(
      createMockKimdis({ searchRequestsPage }),
    );

    const response = await authedJson<{
      items: Array<{ adam: string; title: string; cpvs: string[] }>;
    }>(app, "/api/saas/kimdis/search", {
      cookie,
      body: {
        recordFamily: "REQ",
        title: "cloud hosting",
        referenceNumber: "24REQ012345678",
        cpv: "72000000-5",
        contractType: "Υπηρεσίες",
        dateFrom: "2026-01-01",
        dateTo: "2026-01-31",
      },
    });

    expect(response.status).toBe(200);
    expect(searchRequestsPage).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "cloud hosting",
        referenceNumber: "24REQ012345678",
        cpvItems: ["72000000-5"],
        contractType: "9",
        isInitial: true,
        isApproved: false,
        isApproval: false,
        dateFrom: "2026-01-01",
        dateTo: "2026-01-31",
      }),
      0,
      "submissionDate,desc",
    );
    expect(response.json.items[0]?.adam).toBe("24REQ012345678");
    expect(response.json.items[0]?.cpvs).toEqual(["72000000-5"]);
  });

  it("passes pagination page number to KIMDIS", async () => {
    const searchNoticesPage = vi.fn(async (_body, page) => ({
      content: [],
      last: true,
      totalElements: 0,
      totalPages: 3,
      number: page,
    }));
    const { app, cookie } = await signIn(
      createMockKimdis({ searchNoticesPage }),
    );

    const response = await authedJson<{ page: number }>(
      app,
      "/api/saas/kimdis/search",
      {
        cookie,
        body: {
          recordFamily: "PROC",
          page: 2,
          dateFrom: "2026-02-01",
          dateTo: "2026-02-28",
        },
      },
    );

    expect(response.status).toBe(200);
    expect(searchNoticesPage).toHaveBeenCalledWith(
      expect.objectContaining({
        dateFrom: "2026-02-01",
        dateTo: "2026-02-28",
      }),
      2,
      "submissionDate,desc",
    );
    expect(response.json.page).toBe(2);
  });

  it("returns a usable SaaS error when KIMDIS upstream fails", async () => {
    const searchRequestsPage = vi.fn(async () => {
      throw new Error("KIMDIS HTTP 503 for /request");
    });
    const { app, cookie } = await signIn(
      createMockKimdis({ searchRequestsPage }),
    );

    const response = await authedJson<{ error: string; message: string }>(
      app,
      "/api/saas/kimdis/search",
      {
        cookie,
        body: {
          recordFamily: "REQ",
          dateFrom: "2026-03-01",
          dateTo: "2026-03-31",
        },
      },
    );

    expect(response.status).toBe(502);
    expect(response.json.error).toBe("kimdis_error");
    expect(response.json.message).toContain("KIMDIS HTTP 503");
  });

  it("exposes kimdis meta labels", async () => {
    const { app, cookie } = await signIn(createMockKimdis({}));

    const response = await authedJson<{
      contractTypes: Record<string, string>;
      procedureTypes: Record<string, string>;
      requestKinds: Array<{ id: string; label: string }>;
    }>(app, "/api/saas/kimdis/meta", { cookie });

    expect(response.status).toBe(200);
    expect(response.json.contractTypes["9"]).toBe("Υπηρεσίες");
    expect(response.json.procedureTypes["1"]).toBe("Ανοιχτή");
    expect(response.json.requestKinds.map((k) => k.id)).toEqual([
      "initial",
      "approved",
      "approval",
    ]);
  });

  it("maps organization and amount filters for REQ", async () => {
    const searchRequestsPage = vi.fn(async () => emptyPage());
    const { app, cookie } = await signIn(
      createMockKimdis({ searchRequestsPage }),
    );

    const response = await authedJson(app, "/api/saas/kimdis/search", {
      cookie,
      body: {
        recordFamily: "REQ",
        organization: "100024656",
        totalCostFrom: 1000,
        totalCostTo: 50000,
        requestKind: "approved",
        dateFrom: "2026-01-01",
        dateTo: "2026-01-31",
      },
    });

    expect(response.status).toBe(200);
    expect(searchRequestsPage).toHaveBeenCalledWith(
      expect.objectContaining({
        organizations: ["100024656"],
        totalCostFrom: 1000,
        totalCostTo: 50000,
        isInitial: false,
        isApproved: true,
        isApproval: false,
      }),
      0,
      "submissionDate,desc",
    );
  });

  it("maps PROC procedure and deadline filters", async () => {
    const searchNoticesPage = vi.fn(async () => emptyPage());
    const { app, cookie } = await signIn(
      createMockKimdis({ searchNoticesPage }),
    );

    const response = await authedJson(app, "/api/saas/kimdis/search", {
      cookie,
      body: {
        recordFamily: "PROC",
        procedureType: "Ανοιχτή",
        finalSubmissionDateFrom: "2026-04-01",
        finalSubmissionDateTo: "2026-04-30",
        dateFrom: "2026-01-01",
        dateTo: "2026-03-31",
      },
    });

    expect(response.status).toBe(200);
    expect(searchNoticesPage).toHaveBeenCalledWith(
      expect.objectContaining({
        procedureType: "1",
        finalSubmissionDateFrom: "2026-04-01",
        finalSubmissionDateTo: "2026-04-30",
      }),
      0,
      "submissionDate,desc",
    );
  });

  it("follows a KIMDIS search item by upserting tender + follow", async () => {
    const { app, cookie } = await signIn(createMockKimdis({}));
    const org = await authedJson<{ organization: { id: string } }>(
      app,
      "/api/saas/organizations",
      { method: "POST", cookie, body: { name: "Follow Org" } },
    );

    const response = await authedJson<{
      tender: { id: string; referenceNumber: string };
    }>(app, "/api/saas/kimdis/follow", {
      cookie,
      organizationId: org.json.organization.id,
      body: {
        adam: "26REQ999000111",
        recordType: "REQ",
        title: "Follow me",
        contractingAuthority: "Demo",
        cpvs: ["72000000-5"],
        budgetWithoutVat: 1000,
        budgetWithVat: 1240,
        submissionDate: "2026-01-10",
        signedDate: null,
        finalSubmissionDate: null,
        procedureType: null,
        contractTypeLabel: "Υπηρεσίες",
        cancelled: false,
        publicKimdisUrl: "https://kimdis.test/public/26REQ999000111",
        officialPdfUrl: "https://kimdis.test/pdf/26REQ999000111",
        openState: "UNKNOWN",
      },
    });

    expect(response.status).toBe(201);
    expect(response.json.tender.referenceNumber).toBe("26REQ999000111");

    const monitoring = await authedJson<{
      organizationTenders: Array<{ monitoringActive: boolean }>;
    }>(app, "/api/saas/monitoring/state", {
      cookie,
      organizationId: org.json.organization.id,
    });
    expect(monitoring.status).toBe(200);
    expect(monitoring.json.organizationTenders.some((row) => row.monitoringActive)).toBe(
      true,
    );
  });
});
