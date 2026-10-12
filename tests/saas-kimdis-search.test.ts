import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { KimdisClient } from "../src/kimdis/client.js";
import type {
  KimdisPage,
  KimdisRequestRecord,
  NoticeSearchBody,
  RequestSearchBody,
} from "../src/kimdis/types.js";
import {
  parseKimdisAdamInput,
  searchKimdis,
  type KimdisSearchItem,
} from "../src/saas/services/kimdis-search.js";
import {
  mergeKimdisSearchItems,
  parsePublicUiRequestResults,
} from "../src/saas/services/kimdis-public-ui.js";
import {
  authedJson,
  createSaasTestApp,
  getSaasTestPrisma,
  resetSaasDatabase,
  signUpAndGetCookie,
} from "./helpers/saas-test.js";

const searchKimdisPublicUiMock = vi.hoisted(() =>
  vi.fn(async () => ({
    ok: true as const,
    items: [] as KimdisSearchItem[],
  })),
);

vi.mock("../src/saas/services/kimdis-public-ui.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../src/saas/services/kimdis-public-ui.js")>();
  return {
    ...actual,
    searchKimdisPublicUi: searchKimdisPublicUiMock,
  };
});

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
  searchOpenDataPage: async () => emptyPage(),
  downloadAttachment: async () => null,
  publicUrl: (adam) => `https://kimdis.test/public/${adam}`,
  pdfUrl: (_recordType, adam) => `https://kimdis.test/pdf/${adam}`,
});

describe("parseKimdisAdamInput", () => {
  it("normalizes spaces and case for exact ADAM", () => {
    expect(parseKimdisAdamInput("  26req019966624  ")).toEqual({
      status: "exact",
      adam: "26REQ019966624",
      recordType: "REQ",
    });
  });

  it("rejects incomplete ADAM instead of pretending exact search", () => {
    expect(parseKimdisAdamInput("26REQ019")).toMatchObject({
      status: "invalid",
      reason: "adam_incomplete",
    });
  });
});

describe("kimdis public UI merge", () => {
  it("keeps Open Data rows and adds only new ADAMs", () => {
    const open: KimdisSearchItem[] = [
      {
        adam: "26REQ019961666",
        recordType: "REQ",
        title: "Open Data title",
        contractingAuthority: "A",
        cpvs: [],
        budgetWithoutVat: 1,
        budgetWithVat: 1,
        submissionDate: "2026-10-10",
        signedDate: null,
        finalSubmissionDate: null,
        procedureType: null,
        contractTypeLabel: null,
        cancelled: false,
        publicKimdisUrl: "https://od/1",
        officialPdfUrl: "https://od/1.pdf",
        openState: "UNKNOWN",
        nutsCode: null,
        parentAdams: [],
      },
    ];
    const ui: KimdisSearchItem[] = [
      { ...open[0]!, title: "UI duplicate should lose", publicKimdisUrl: "https://ui/1" },
      {
        ...open[0]!,
        adam: "26REQ019966624",
        title: "UI-only",
        publicKimdisUrl: "https://ui/2",
      },
    ];
    const { items, addedFromPublicUi } = mergeKimdisSearchItems(open, ui);
    expect(addedFromPublicUi).toBe(1);
    expect(items).toHaveLength(2);
    expect(items.find((i) => i.adam === "26REQ019961666")?.title).toBe(
      "Open Data title",
    );
    expect(items.find((i) => i.adam === "26REQ019966624")?.title).toBe("UI-only");
  });

  it("parses public UI result rows by table index", () => {
    const html = `
      <span id="appForm:rsltTbl:0:tableRefNo"><span id="26REQ019966624">26REQ019966624</span></span>
      <span id="appForm:rsltTbl:0:j_idt282">Τίτλος πράξης Α</span>
      <span id="appForm:rsltTbl:0:j_idt296">10/10/2026 12:00</span>
      <span id="appForm:rsltTbl:0:j_idt302">Δήμος</span>
      <span id="appForm:rsltTbl:0:j_idt305">1.234,56</span>
      <span id="appForm:rsltTbl:1:tableRefNo"><span id="26REQ019963428">26REQ019963428</span></span>
      <span id="appForm:rsltTbl:1:j_idt282">Τίτλος πράξης Β</span>`;
    const items = parsePublicUiRequestResults(html, "https://cerpp.test");
    expect(items.map((i) => i.adam)).toEqual([
      "26REQ019966624",
      "26REQ019963428",
    ]);
    expect(items[0]?.title).toBe("Τίτλος πράξης Α");
    expect(items[0]?.budgetWithoutVat).toBe(1234.56);
  });
});

describe("saas kimdis search", () => {
  const prisma = getSaasTestPrisma();

  beforeEach(async () => {
    await resetSaasDatabase(prisma);
    searchKimdisPublicUiMock.mockReset();
    searchKimdisPublicUiMock.mockResolvedValue({ ok: true, items: [] });
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

  it("maps title, CPV, and contract type label into KIMDIS request body", async () => {
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
      "any",
      "initial",
      "approved",
      "approval",
    ]);
  });

  it("accepts requestKind any and maps all flags", async () => {
    const searchRequestsPage = vi.fn(async () => emptyPage());
    const { app, cookie } = await signIn(
      createMockKimdis({ searchRequestsPage }),
    );

    const response = await authedJson(app, "/api/saas/kimdis/search", {
      cookie,
      body: {
        recordFamily: "REQ",
        title: "ιστοσελ",
        requestKind: "any",
        dateFrom: "2026-10-09",
        dateTo: "2026-10-12",
      },
    });

    expect(response.status).toBe(200);
    expect(searchRequestsPage).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "ιστοσελ",
        isInitial: true,
        isApproved: true,
        isApproval: true,
        dateFrom: "2026-10-09",
        dateTo: "2026-10-12",
      }),
      0,
      "submissionDate,desc",
    );
  });

  it("exact ADAM ignores draft dates and requestKind defaults", async () => {
    const searchRequestsPage = vi.fn(async (body) => {
      if (body.referenceNumber === "26REQ019966624") {
        return {
          content: [
            {
              ...sampleRequest(),
              referenceNumber: "26REQ019966624",
              title: "Ιστοσελίδα Δήμου",
            },
          ],
          last: true,
          totalElements: 1,
          totalPages: 1,
          number: 0,
        };
      }
      return emptyPage();
    });
    const { app, cookie } = await signIn(
      createMockKimdis({ searchRequestsPage }),
    );

    const response = await authedJson<{
      items: Array<{ adam: string }>;
      mode: string;
      exactAdamFound: boolean;
    }>(app, "/api/saas/kimdis/search", {
      cookie,
      body: {
        recordFamily: "REQ",
        referenceNumber: " 26req019966624 ",
        title: "should-be-ignored",
        requestKind: "initial",
        dateFrom: "2020-01-01",
        dateTo: "2020-01-02",
      },
    });

    expect(response.status).toBe(200);
    expect(response.json.mode).toBe("exact_adam");
    expect(response.json.exactAdamFound).toBe(true);
    expect(response.json.items[0]?.adam).toBe("26REQ019966624");
    const bodies = searchRequestsPage.mock.calls.map((call) => call[0]);
    expect(bodies.every((b) => b.referenceNumber === "26REQ019966624")).toBe(
      true,
    );
    expect(bodies.every((b) => !b.title)).toBe(true);
    expect(
      bodies.every(
        (b) => b.isInitial === true && b.isApproved === true && b.isApproval === true,
      ),
    ).toBe(true);
  });

  it("exact ADAM not found returns honest empty exact mode", async () => {
    const searchRequestsPage = vi.fn(async () => {
      throw new Error("KIMDIS HTTP 404 for /request: No notices found");
    });
    const { app, cookie } = await signIn(
      createMockKimdis({ searchRequestsPage }),
    );

    const response = await authedJson<{
      items: unknown[];
      mode: string;
      exactAdamFound: boolean;
      exactAdam: string;
    }>(app, "/api/saas/kimdis/search", {
      cookie,
      body: {
        recordFamily: "REQ",
        referenceNumber: "26REQ019963428",
      },
    });

    expect(response.status).toBe(200);
    expect(response.json.mode).toBe("exact_adam");
    expect(response.json.exactAdamFound).toBe(false);
    expect(response.json.exactAdam).toBe("26REQ019963428");
    expect(response.json.items).toEqual([]);
    expect(searchKimdisPublicUiMock).toHaveBeenCalled();
  });

  it("merges public UI extras after Open Data without duplicates", async () => {
    const searchRequestsPage = vi.fn(async () => ({
      content: [
        {
          ...sampleRequest(),
          referenceNumber: "26REQ019961666",
          title: "Open Data ιστοσελ",
        },
      ],
      last: true,
      totalElements: 1,
      totalPages: 1,
      number: 0,
    }));
    searchKimdisPublicUiMock.mockResolvedValue({
      ok: true,
      items: [
        {
          adam: "26REQ019961666",
          recordType: "REQ",
          title: "UI duplicate",
          contractingAuthority: null,
          cpvs: [],
          budgetWithoutVat: null,
          budgetWithVat: null,
          submissionDate: "2026-10-10",
          signedDate: null,
          finalSubmissionDate: null,
          procedureType: null,
          contractTypeLabel: null,
          cancelled: false,
          publicKimdisUrl: "https://ui/dup",
          officialPdfUrl: "https://ui/dup.pdf",
          openState: "UNKNOWN",
          nutsCode: null,
          parentAdams: [],
        },
        {
          adam: "26REQ019966624",
          recordType: "REQ",
          title: "UI-only ιστοσελ",
          contractingAuthority: "Δήμος",
          cpvs: [],
          budgetWithoutVat: 100,
          budgetWithVat: 124,
          submissionDate: "2026-10-11",
          signedDate: null,
          finalSubmissionDate: null,
          procedureType: null,
          contractTypeLabel: null,
          cancelled: false,
          publicKimdisUrl: "https://ui/new",
          officialPdfUrl: "https://ui/new.pdf",
          openState: "UNKNOWN",
          nutsCode: null,
          parentAdams: [],
        },
      ],
    });

    const { app, cookie } = await signIn(
      createMockKimdis({ searchRequestsPage }),
    );

    const response = await authedJson<{
      items: Array<{ adam: string; title: string }>;
      totalElements: number;
      publicUiEnrichment?: { attempted: boolean; ok: boolean; added: number };
    }>(app, "/api/saas/kimdis/search", {
      cookie,
      body: {
        recordFamily: "REQ",
        title: "ιστοσελ",
        requestKind: "any",
        dateFrom: "2026-10-09",
        dateTo: "2026-10-12",
      },
    });

    expect(response.status).toBe(200);
    expect(response.json.items.map((i) => i.adam).sort()).toEqual([
      "26REQ019961666",
      "26REQ019966624",
    ]);
    expect(
      response.json.items.find((i) => i.adam === "26REQ019961666")?.title,
    ).toBe("Open Data ιστοσελ");
    expect(response.json.publicUiEnrichment).toEqual({
      attempted: true,
      ok: true,
      added: 1,
    });
    expect(response.json.totalElements).toBe(2);
  });

  it("exact ADAM falls back to public UI when Open Data misses", async () => {
    const searchRequestsPage = vi.fn(async () => {
      throw new Error("KIMDIS HTTP 404 for /request: No notices found");
    });
    searchKimdisPublicUiMock.mockResolvedValue({
      ok: true,
      items: [
        {
          adam: "26REQ019963428",
          recordType: "REQ",
          title: "From public UI",
          contractingAuthority: null,
          cpvs: [],
          budgetWithoutVat: null,
          budgetWithVat: null,
          submissionDate: "2026-10-10",
          signedDate: null,
          finalSubmissionDate: null,
          procedureType: null,
          contractTypeLabel: null,
          cancelled: false,
          publicKimdisUrl: "https://ui/adam",
          officialPdfUrl: "https://ui/adam.pdf",
          openState: "UNKNOWN",
          nutsCode: null,
          parentAdams: [],
        },
      ],
    });
    const { app, cookie } = await signIn(
      createMockKimdis({ searchRequestsPage }),
    );

    const response = await authedJson<{
      items: Array<{ adam: string; title: string }>;
      exactAdamFound: boolean;
      publicUiEnrichment?: { added: number };
    }>(app, "/api/saas/kimdis/search", {
      cookie,
      body: {
        recordFamily: "REQ",
        referenceNumber: "26REQ019963428",
      },
    });

    expect(response.status).toBe(200);
    expect(response.json.exactAdamFound).toBe(true);
    expect(response.json.items[0]?.title).toBe("From public UI");
    expect(response.json.publicUiEnrichment?.added).toBe(1);
  });

  it("watch-style searchKimdis does not call public UI without flag", async () => {
    const searchRequestsPage = vi.fn(async () => ({
      content: [sampleRequest()],
      last: true,
      totalElements: 1,
      totalPages: 1,
      number: 0,
    }));
    const result = await searchKimdis(createMockKimdis({ searchRequestsPage }), {
      recordFamily: "REQ",
      title: "ιστοσελ",
      requestKind: "any",
      dateFrom: "2026-10-09",
      dateTo: "2026-10-12",
    });
    expect(result.items).toHaveLength(1);
    expect(searchKimdisPublicUiMock).not.toHaveBeenCalled();
    expect(result.publicUiEnrichment).toBeUndefined();
  });

  it("rejects incomplete ADAM with validation error", async () => {
    const { app, cookie } = await signIn(createMockKimdis({}));
    const response = await authedJson<{ message: string }>(
      app,
      "/api/saas/kimdis/search",
      {
        cookie,
        body: {
          recordFamily: "REQ",
          referenceNumber: "26REQ019",
        },
      },
    );
    expect(response.status).toBe(400);
    expect(response.json.message).toBe("adam_incomplete");
  });

  it("rejects ADAM family mismatch with selected tab", async () => {
    const { app, cookie } = await signIn(createMockKimdis({}));
    const response = await authedJson<{ message: string }>(
      app,
      "/api/saas/kimdis/search",
      {
        cookie,
        body: {
          recordFamily: "PROC",
          referenceNumber: "26REQ019966624",
        },
      },
    );
    expect(response.status).toBe(400);
    expect(response.json.message).toContain("adam_family_mismatch");
  });

  it("keeps primary and approval as separate results for requestKind any", async () => {
    const searchRequestsPage = vi.fn(async () => ({
      content: [
        {
          ...sampleRequest(),
          referenceNumber: "26REQ019961666",
          title: "Ιστοσελίδα Α",
          approvalRefNo: ["26REQ019961667"],
        },
        {
          ...sampleRequest(),
          referenceNumber: "26REQ019961667",
          title: "Ιστοσελίδα Α",
        },
      ],
      last: true,
      totalElements: 2,
      totalPages: 1,
      number: 0,
    }));
    const { app, cookie } = await signIn(
      createMockKimdis({ searchRequestsPage }),
    );

    const response = await authedJson<{ items: Array<{ adam: string }> }>(
      app,
      "/api/saas/kimdis/search",
      {
        cookie,
        body: {
          recordFamily: "REQ",
          title: "ιστοσελ",
          requestKind: "any",
          dateFrom: "2026-10-09",
          dateTo: "2026-10-12",
        },
      },
    );

    expect(response.status).toBe(200);
    expect(response.json.items.map((i) => i.adam)).toEqual([
      "26REQ019961666",
      "26REQ019961667",
    ]);
  });

  it("filters regions server-side across a later upstream page", async () => {
    const page0: KimdisRequestRecord[] = Array.from({ length: 50 }, (_, i) => ({
      ...sampleRequest(),
      referenceNumber: `26REQ0100000${String(i).padStart(2, "0")}`,
      nutsCode: { key: "EL30" },
    }));
    const page1Hit: KimdisRequestRecord = {
      ...sampleRequest(),
      referenceNumber: "26REQ019960252",
      title: "Ιστοσελίδα Μαραθώνα",
      nutsCode: { key: "EL53" },
    };
    const searchRequestsPage = vi.fn(async (_body, page) => {
      if (page === 0) {
        return {
          content: page0,
          last: false,
          totalElements: 51,
          totalPages: 2,
          number: 0,
        };
      }
      return {
        content: [page1Hit],
        last: true,
        totalElements: 51,
        totalPages: 2,
        number: 1,
      };
    });
    const kimdis = createMockKimdis({ searchRequestsPage });
    const result = await searchKimdis(kimdis, {
      recordFamily: "REQ",
      title: "ιστοσελ",
      requestKind: "any",
      dateFrom: "2026-10-09",
      dateTo: "2026-10-12",
      regions: ["EL53"],
      page: 0,
    });

    expect(result.items.map((i) => i.adam)).toEqual(["26REQ019960252"]);
    expect(result.regionFilter?.applied).toBe(true);
    expect(result.regionFilter?.partial).toBe(false);
    expect(result.totalElements).toBe(1);
    expect(searchRequestsPage).toHaveBeenCalledTimes(2);
  });

  it("does not convert upstream 503 into zero results", async () => {
    const searchRequestsPage = vi.fn(async () => {
      throw new Error("KIMDIS HTTP 503 for /request");
    });
    const { app, cookie } = await signIn(
      createMockKimdis({ searchRequestsPage }),
    );

    const response = await authedJson<{ error: string }>(
      app,
      "/api/saas/kimdis/search",
      {
        cookie,
        body: {
          recordFamily: "REQ",
          title: "ιστοσελ",
          requestKind: "any",
          dateFrom: "2026-10-09",
          dateTo: "2026-10-12",
        },
      },
    );

    expect(response.status).toBe(502);
    expect(response.json.error).toBe("kimdis_error");
  });

  it("omitted requestKind stays initial for watch-scan compatibility", async () => {
    const searchRequestsPage = vi.fn(async () => emptyPage());
    const { app, cookie } = await signIn(
      createMockKimdis({ searchRequestsPage }),
    );

    await authedJson(app, "/api/saas/kimdis/search", {
      cookie,
      body: {
        recordFamily: "REQ",
        title: "ιστοσελ",
        dateFrom: "2026-10-09",
        dateTo: "2026-10-12",
      },
    });

    expect(searchRequestsPage).toHaveBeenCalledWith(
      expect.objectContaining({
        isInitial: true,
        isApproved: false,
        isApproval: false,
      }),
      0,
      "submissionDate,desc",
    );
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
