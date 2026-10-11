import { describe, expect, it } from "vitest";
import {
  deadlineDayKey,
  formatDayEl,
  normalizeTedDateTime,
  parseTedDate,
  tedDeadlineChangeTitle,
  tedNoticeUpdateTitle,
} from "../src/saas/services/ted-change-copy.js";

describe("TED change copy", () => {
  it("formats from→to deadline titles in Greek", () => {
    expect(
      tedDeadlineChangeTitle("2026-10-15T12:00:00.000Z", "2026-10-22+03:00"),
    ).toMatch(/Η προθεσμία άλλαξε από .+ σε .+/);
    expect(tedDeadlineChangeTitle(null, "2026-10-22")).toContain(
      "Ορίστηκε προθεσμία",
    );
    expect(tedNoticeUpdateTitle()).toContain("TED");
  });

  it("parses TED offset dates without T", () => {
    expect(normalizeTedDateTime("2026-10-15+03:00")).toBe(
      "2026-10-15T00:00:00+03:00",
    );
    expect(parseTedDate("2026-10-15+03:00")?.toISOString()).toContain(
      "2026-10-14",
    );
    expect(deadlineDayKey("2026-10-15")).toBe("2026-10-15");
    expect(deadlineDayKey("2026-10-15+03:00")).toBe("2026-10-14");
    expect(formatDayEl("2026-10-15+03:00")).toBeTruthy();
  });
});

