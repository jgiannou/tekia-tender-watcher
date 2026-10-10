import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  dataSourcesForProfile,
  kimdisItemFromTedNotice,
  scanTedForWatchProfile,
} from "../src/saas/services/watch-scan-sources.js";
import { parseTedSearchResponse } from "../src/saas/sources/ted-adapter.js";
import { scoreKimdisItemAgainstProfile } from "../src/saas/services/watch-match.js";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

afterEach(() => {
  delete process.env.TED_ENABLED;
});

describe("watch scan sources", () => {
  it("defaults dataSources to kimdis", () => {
    expect(
      dataSourcesForProfile({
        customFilters: null,
      } as never),
    ).toEqual(["kimdis"]);
    expect(
      dataSourcesForProfile({
        customFilters: { dataSources: ["kimdis", "ted"] },
      } as never),
    ).toEqual(["kimdis", "ted"]);
  });

  it("scores TED fixture notices against keyword criteria", () => {
    const payload = JSON.parse(
      readFileSync(join(fixtures, "ted-search-grc-sample.json"), "utf8"),
    );
    const { notices } = parseTedSearchResponse(payload);
    const item = kimdisItemFromTedNotice(notices[0]!);
    const match = scoreKimdisItemAgainstProfile(
      {
        keywords: ["φόρτιση"],
        negativeKeywords: [],
        cpvs: [],
        minBudget: null,
        maxBudget: null,
        matchingMode: "BALANCED",
        scoreThreshold: 35,
        recordTypes: ["PROC"],
        authority: null,
        contractType: null,
        procedureType: null,
        regions: ["EL30"],
        includeUnclassifiedRegion: false,
      },
      item,
      { id: "p1", name: "TED test", sourceSystem: "ted" },
    );
    expect(match.qualifies).toBe(true);
    expect(match.reasons.some((row) => /TED/i.test(row))).toBe(true);
    expect(item.budgetWithoutVat).toBe(250000);
    expect(item.nutsCode).toBe("EL531");
    expect(item.contractTypeLabel).toBe("Υπηρεσίες");
    expect(item.finalSubmissionDate).toMatch(/^2026-03-15/);
  });

  it("records ted_disabled when TED_ENABLED is off", async () => {
    process.env.TED_ENABLED = "false";
    const result = await scanTedForWatchProfile({
      profile: { id: "p1", name: "x", customFilters: { dataSources: ["ted"] } } as never,
      criteria: {
        keywords: ["φόρτιση"],
        negativeKeywords: [],
        cpvs: [],
        minBudget: null,
        maxBudget: null,
        matchingMode: "BALANCED",
        scoreThreshold: 35,
        recordTypes: ["PROC"],
        authority: null,
        contractType: null,
        procedureType: null,
        regions: [],
        includeUnclassifiedRegion: false,
      },
      seenRefs: new Set(),
      assertBudget: () => undefined,
    });
    expect(result.matches).toEqual([]);
    expect(result.blocker).toBeTruthy();
  });
});
