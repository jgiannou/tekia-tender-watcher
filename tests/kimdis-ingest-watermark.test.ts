import { describe, expect, it } from "vitest";
import {
  dedupeKimdisItems,
  fetchRecentActs,
  shouldStopAtWatermark,
  type KimdisIngestCursor,
} from "../src/saas/services/kimdis-acts.js";
import type { KimdisClient } from "../src/kimdis/client.js";
import type { KimdisPage } from "../src/kimdis/types.js";

const page = <T>(content: T[], last: boolean): KimdisPage<T> => ({
  content,
  last,
  totalElements: content.length,
  totalPages: last ? 1 : 3,
  number: 0,
  size: 50,
  first: true,
  numberOfElements: content.length,
  empty: content.length === 0,
});

describe("kimdis ingest watermark helpers", () => {
  it("stops only when item is older than watermark minus overlap", () => {
    const watermark = Date.parse("2026-10-13T12:00:00.000Z");
    const overlap = 6 * 60 * 60 * 1000;
    expect(
      shouldStopAtWatermark(
        Date.parse("2026-10-13T10:00:00.000Z"),
        watermark,
        overlap,
      ),
    ).toBe(false);
    expect(
      shouldStopAtWatermark(
        Date.parse("2026-10-13T05:00:00.000Z"),
        watermark,
        overlap,
      ),
    ).toBe(true);
    expect(shouldStopAtWatermark(null, watermark, overlap)).toBe(false);
  });

  it("dedupes by ADAM + recordType across overlap", () => {
    const items = dedupeKimdisItems([
      {
        adam: "26REQ1",
        recordType: "REQ",
        title: "a",
        contractingAuthority: "x",
        description: "",
        cpvs: [],
        budgetWithoutVat: null,
        budgetWithVat: null,
        submissionDate: "2026-10-13T10:00:00",
        signedDate: null,
        finalSubmissionDate: null,
        procedureType: null,
        contractTypeLabel: null,
        cancelled: false,
        publicKimdisUrl: "",
        officialPdfUrl: "",
        openState: "UNKNOWN",
        nutsCode: null,
        contractEndsAt: null,
        awardAmount: null,
        winnerName: null,
        diavgeiaAda: null,
        parentAdams: [],
      },
      {
        adam: "26REQ1",
        recordType: "REQ",
        title: "b",
        contractingAuthority: "x",
        description: "",
        cpvs: [],
        budgetWithoutVat: null,
        budgetWithVat: null,
        submissionDate: "2026-10-13T10:00:00",
        signedDate: null,
        finalSubmissionDate: null,
        procedureType: null,
        contractTypeLabel: null,
        cancelled: false,
        publicKimdisUrl: "",
        officialPdfUrl: "",
        openState: "UNKNOWN",
        nutsCode: null,
        contractEndsAt: null,
        awardAmount: null,
        winnerName: null,
        diavgeiaAda: null,
        parentAdams: [],
      },
    ]);
    expect(items).toHaveLength(1);
  });

  it("walks newest-first and stops at watermark; finds page-3 records before watermark", async () => {
    const calls: Array<{ path: string; page: number; sort?: string }> = [];
    const mk = (adam: string, submissionDate: string) => ({
      referenceNumber: adam,
      title: adam,
      organization: { value: "Δήμος" },
      submissionDate,
      totalCostWithoutVAT: 100,
      objectDetails: [],
    });

    const kimdis: KimdisClient = {
      searchRequestsPage: async () => page([], true),
      searchNoticesPage: async () => page([], true),
      searchRequests: async () => [],
      searchNotices: async () => [],
      searchOpenDataPage: async (path, _body, pageNum, sort) => {
        calls.push({ path, page: pageNum, sort });
        if (!path.includes("/request")) {
          return page([], true);
        }
        if (pageNum === 0) {
          return page(
            [
              mk("26REQ-NEW", "2026-10-13T16:00:00Z"),
              mk("26REQ-P1", "2026-10-13T15:00:00Z"),
            ],
            false,
          );
        }
        if (pageNum === 1) {
          return page([mk("26REQ-P2", "2026-10-13T14:00:00Z")], false);
        }
        // Third page — the critical case: new record beyond first two pages
        return page(
          [
            mk("26REQ-P3", "2026-10-13T13:30:00Z"),
            mk("26REQ-OLD", "2026-10-12T08:00:00Z"),
          ],
          true,
        );
      },
      downloadAttachment: async () => null,
      publicUrl: (adam) => `https://example.test/${adam}`,
      pdfUrl: () => "",
    };

    const cursors: Partial<Record<"REQ", KimdisIngestCursor>> = {
      REQ: {
        recordType: "REQ",
        safeWatermarkIso: "2026-10-13T12:00:00.000Z",
        lastSeenAdam: "26REQ-PREV",
        lastSuccessfulSourceTimestamp: "2026-10-13T12:00:00.000Z",
        lastPageFetched: 0,
        pageBudgetExhausted: false,
        lastCompletedAt: null,
        lastError: null,
      },
    };

    const result = await fetchRecentActs(kimdis, {
      days: 2,
      pages: 4,
      recordTypes: ["REQ"],
      cursorsByType: cursors,
      watermarkOverlapMs: 0,
    });

    expect(result.sortRequested).toBe(true);
    expect(calls.some((c) => c.sort === "submissionDate,desc")).toBe(true);
    expect(calls.filter((c) => c.path.includes("/request")).map((c) => c.page)).toEqual([
      0, 1, 2,
    ]);
    expect(result.items.map((i) => i.adam)).toEqual([
      "26REQ-NEW",
      "26REQ-P1",
      "26REQ-P2",
      "26REQ-P3",
    ]);
    expect(result.items.map((i) => i.adam)).not.toContain("26REQ-OLD");
    expect(result.checkpoints[0]?.reachedWatermark).toBe(true);
    expect(result.pageBudgetExhausted).toBe(false);
  });

  it("marks pageBudgetExhausted when pages run out before watermark", async () => {
    const kimdis: KimdisClient = {
      searchRequestsPage: async () => page([], true),
      searchNoticesPage: async () => page([], true),
      searchRequests: async () => [],
      searchNotices: async () => [],
      searchOpenDataPage: async (_path, _body, pageNum) =>
        page(
          [
            {
              referenceNumber: `26REQ-P${pageNum}`,
              title: "x",
              organization: { value: "Δήμος" },
              submissionDate: "2026-10-13T18:00:00",
            },
          ],
          false,
        ),
      downloadAttachment: async () => null,
      publicUrl: (adam) => adam,
      pdfUrl: () => "",
    };

    const result = await fetchRecentActs(kimdis, {
      days: 2,
      pages: 2,
      recordTypes: ["REQ"],
      cursorsByType: {
        REQ: {
          recordType: "REQ",
          safeWatermarkIso: "2026-10-01T00:00:00.000Z",
          lastSeenAdam: null,
          lastSuccessfulSourceTimestamp: null,
          lastPageFetched: 0,
          pageBudgetExhausted: false,
          lastCompletedAt: null,
          lastError: null,
        },
      },
      watermarkOverlapMs: 0,
    });

    expect(result.pageBudgetExhausted).toBe(true);
    // Watermark must not advance past the incomplete walk.
    expect(result.cursors[0]?.safeWatermarkIso).toBe("2026-10-01T00:00:00.000Z");
  });
});
