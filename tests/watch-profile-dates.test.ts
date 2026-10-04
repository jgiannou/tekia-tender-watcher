import { describe, expect, it } from "vitest";
import {
  normalizeWatchProfileCriteria,
  scanDateWindowForProfile,
} from "../src/saas/services/watch-profiles.js";

describe("watch profile date windows", () => {
  it("allows dateFrom without dateTo", () => {
    const criteria = normalizeWatchProfileCriteria({
      name: "From only",
      keywords: ["ιστοσελίδα"],
      dateFrom: "2026-09-01",
      dateTo: null,
    });
    expect(criteria.dateFrom).toBe("2026-09-01");
    expect(criteria.dateTo).toBeNull();
  });

  it("allows dateTo without dateFrom", () => {
    const criteria = normalizeWatchProfileCriteria({
      name: "To only",
      keywords: ["ιστοσελίδα"],
      dateFrom: null,
      dateTo: "2026-09-30",
    });
    expect(criteria.dateFrom).toBeNull();
    expect(criteria.dateTo).toBe("2026-09-30");
  });

  it("fills open end of dateFrom-only scan window to today", () => {
    const window = scanDateWindowForProfile({
      dateFrom: "2026-09-01",
      dateTo: null,
    });
    expect(window.dateFrom).toBe("2026-09-01");
    expect(window.dateTo).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(window.dateTo >= "2026-09-01").toBe(true);
  });
});
