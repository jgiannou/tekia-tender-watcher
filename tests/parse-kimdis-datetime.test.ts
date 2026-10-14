import { describe, expect, it } from "vitest";
import { parseKimdisDateTime } from "../src/saas/kimdis/parse-kimdis-datetime.js";

describe("parseKimdisDateTime", () => {
  it("parses date-only as noon UTC", () => {
    const result = parseKimdisDateTime("2026-10-13");
    expect(result.kind).toBe("date_only");
    expect(result.date?.toISOString()).toBe("2026-10-13T12:00:00.000Z");
  });

  it("respects explicit Z offset", () => {
    const result = parseKimdisDateTime("2026-10-13T14:00:00Z");
    expect(result.kind).toBe("offset_aware");
    expect(result.date?.toISOString()).toBe("2026-10-13T14:00:00.000Z");
  });

  it("respects explicit +03:00 (summer EEST)", () => {
    const result = parseKimdisDateTime("2026-07-15T14:00:00+03:00");
    expect(result.kind).toBe("offset_aware");
    expect(result.date?.toISOString()).toBe("2026-07-15T11:00:00.000Z");
  });

  it("respects explicit +02:00 (winter EET)", () => {
    const result = parseKimdisDateTime("2026-01-15T14:00:00+02:00");
    expect(result.kind).toBe("offset_aware");
    expect(result.date?.toISOString()).toBe("2026-01-15T12:00:00.000Z");
  });

  it("treats offset-less local as Europe/Athens in summer", () => {
    const result = parseKimdisDateTime("2026-07-15T14:00:00");
    expect(result.kind).toBe("athens_local");
    // 14:00 EEST (+03) → 11:00 UTC
    expect(result.date?.toISOString()).toBe("2026-07-15T11:00:00.000Z");
  });

  it("treats offset-less local as Europe/Athens in winter", () => {
    const result = parseKimdisDateTime("2026-01-15T14:00:00");
    expect(result.kind).toBe("athens_local");
    // 14:00 EET (+02) → 12:00 UTC
    expect(result.date?.toISOString()).toBe("2026-01-15T12:00:00.000Z");
  });

  it("handles empty / invalid", () => {
    expect(parseKimdisDateTime(null).kind).toBe("empty");
    expect(parseKimdisDateTime("not-a-date").kind).toBe("invalid");
  });
});
