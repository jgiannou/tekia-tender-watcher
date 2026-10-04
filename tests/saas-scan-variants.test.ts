import { describe, expect, it } from "vitest";
import { buildScanFilterVariants } from "../src/saas/services/watch-profiles.js";
import {
  mergeMatchMeta,
  removeProfileFromMatchMeta,
} from "../src/saas/services/watch-match.js";
import type { WatchProfile } from "@prisma/client";

const baseProfile = {
  id: "p1",
  organizationId: "org1",
  name: "Construction",
  enabled: true,
  matchingMode: "BALANCED",
  scoreThreshold: 45,
  keywords: ["κατασκευή", "οικοδομή", "κτίριο"],
  negativeKeywords: [],
  cpvs: ["45000000-7", "45210000-2"],
  recordTypes: ["PROC"],
  authority: null,
  contractType: null,
  procedureType: null,
  minBudget: null,
  maxBudget: null,
  dateFrom: "2026-09-04",
  dateTo: "2026-10-04",
  notificationOverride: "INHERIT",
  customFilters: {},
  matchCount: 0,
  lastMatchAt: null,
  lastScannedAt: null,
  initialScanCompletedAt: null,
  scanState: "PENDING",
  createdAt: new Date(),
  updatedAt: new Date(),
} as unknown as WatchProfile;

describe("buildScanFilterVariants", () => {
  it("retrieves candidates as a union of keyword and CPV searches", () => {
    const variants = buildScanFilterVariants(baseProfile);
    const titles = variants.map((v) => v.title).filter(Boolean);
    const cpvs = variants.map((v) => v.cpv).filter(Boolean);

    expect(titles).toEqual(expect.arrayContaining(["κατασκευή", "οικοδομή", "κτίριο"]));
    expect(cpvs).toEqual(expect.arrayContaining(["45000000-7", "45210000-2"]));
    // Must not AND every keyword into one title on CPV queries.
    expect(variants.some((v) => v.cpv && v.title)).toBe(false);
    expect(variants.some((v) => v.title?.includes("κατασκευή οικοδομή"))).toBe(false);
  });
});

describe("removeProfileFromMatchMeta", () => {
  it("drops a stale profile association and keeps others", () => {
    const meta = mergeMatchMeta(
      mergeMatchMeta(null, {
        id: "a",
        name: "A",
        score: 80,
        reasons: ["a"],
      }),
      { id: "b", name: "B", score: 60, reasons: ["b"] },
    );
    const next = removeProfileFromMatchMeta(meta, "a");
    expect(next.matchedProfiles.map((p) => p.id)).toEqual(["b"]);
    expect(next.highestScore).toBe(60);
  });
});
