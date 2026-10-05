import { describe, expect, it } from "vitest";
import { buildScanFilterVariants } from "../src/saas/services/watch-profiles.js";
import {
  criteriaFromWatchProfile,
  effectiveScoreThreshold,
  expandKeywordNeedles,
  mergeMatchMeta,
  removeProfileFromMatchMeta,
  scoreKimdisItemAgainstProfile,
} from "../src/saas/services/watch-match.js";
import type { KimdisSearchItem } from "../src/saas/services/kimdis-search.js";
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

const baseItem = (overrides: Partial<KimdisSearchItem> = {}): KimdisSearchItem => ({
  adam: "26REQ0001",
  recordType: "REQ",
  title: "Γενικές υπηρεσίες",
  contractingAuthority: "ΔΗΜΟΣ ΠΑΡΑΔΕΙΓΜΑΤΟΣ",
  description: "",
  cpvs: [],
  budgetWithoutVat: 5000,
  budgetWithVat: null,
  submissionDate: "2026-10-01",
  signedDate: null,
  finalSubmissionDate: null,
  procedureType: null,
  contractTypeLabel: null,
  cancelled: false,
  publicKimdisUrl: "https://example.test",
  officialPdfUrl: "https://example.test/pdf",
  openState: "UNKNOWN",
  ...overrides,
});

const balancedCriteria = criteriaFromWatchProfile({
  keywords: ["ιστοσελίδα"],
  negativeKeywords: [],
  cpvs: [],
  minBudget: null,
  maxBudget: null,
  matchingMode: "BALANCED",
  scoreThreshold: 45,
  recordTypes: ["REQ", "PROC"],
  authority: null,
  contractType: null,
  procedureType: null,
});

describe("SaaS watch-match scoring", () => {
  it("uses lowered BALANCED / BROAD thresholds", () => {
    expect(effectiveScoreThreshold(balancedCriteria)).toBe(35);
    expect(
      effectiveScoreThreshold({ ...balancedCriteria, matchingMode: "BROAD" }),
    ).toBe(25);
    expect(
      effectiveScoreThreshold({ ...balancedCriteria, matchingMode: "STRICT" }),
    ).toBe(70);
  });

  it("expands website synonyms for matching", () => {
    const needles = expandKeywordNeedles("ιστοσελίδα");
    expect(needles.some((n) => n.includes("website") || n.includes("ιστοτοπ"))).toBe(
      true,
    );
  });

  it("matches genitive title forms via stemming", () => {
    const result = scoreKimdisItemAgainstProfile(
      balancedCriteria,
      baseItem({
        title: "Συντήρηση της ιστοσελίδας του Δήμου",
      }),
    );
    expect(result.qualifies).toBe(true);
    expect(result.matchedKeywords).toContain("ιστοσελίδα");
    expect(result.score).toBe(48);
    expect(result.reasons.some((r) => r.includes("ιστοσελίδα"))).toBe(true);
  });

  it("matches synonym website in title while keeping user keyword in reasons", () => {
    const result = scoreKimdisItemAgainstProfile(
      balancedCriteria,
      baseItem({ title: "Municipality website redesign and CMS" }),
    );
    expect(result.qualifies).toBe(true);
    expect(result.matchedKeywords).toEqual(["ιστοσελίδα"]);
    expect(result.reasons[0]).toContain("ιστοσελίδα");
    expect(result.score).toBe(48);
  });

  it("does not stack synonym keywords to 100%", () => {
    const criteria = criteriaFromWatchProfile({
      ...balancedCriteria,
      keywords: ["ιστοσελίδα", "website", "ιστότοπος"],
      cpvs: ["72413000-8"],
    });
    const result = scoreKimdisItemAgainstProfile(
      criteria,
      baseItem({
        title: "Συντήρηση ιστοσελίδας Δήμου",
        cpvs: ["72413000-8"],
      }),
    );
    expect(result.qualifies).toBe(true);
    expect(result.score).toBe(86); // 48 title cluster + 38 CPV
    expect(result.score).toBeLessThan(100);
  });

  it("matches keyword in description haystack at body weight", () => {
    const result = scoreKimdisItemAgainstProfile(
      balancedCriteria,
      baseItem({
        title: "Παροχή υπηρεσιών πληροφορικής",
        description: "Αναβάθμιση ιστοτόπου και φιλοξενία",
      }),
    );
    expect(result.qualifies).toBe(true);
    expect(result.score).toBe(35);
    expect(result.reasons.some((r) => r.includes("στο κείμενο"))).toBe(true);
  });

  it("rejects directed invitation titles (Sparti-style) in BALANCED mode", () => {
    const result = scoreKimdisItemAgainstProfile(
      balancedCriteria,
      baseItem({
        recordType: "PROC",
        title:
          "Πρόσκληση κατάθεσης προσφοράς για την υπηρεσία με τίτλο: «Συντήρηση ιστοσελίδας» (www.sparti.gov.gr)",
        adam: "26PROC019704619",
      }),
    );
    expect(result.targetedInvitation).toBe(true);
    expect(result.qualifies).toBe(false);
    expect(result.rejected).toBe(true);
    expect(result.score).toBeLessThanOrEqual(22);
  });

  it("rejects closed / direct-award procedure types", () => {
    const result = scoreKimdisItemAgainstProfile(
      balancedCriteria,
      baseItem({
        recordType: "PROC",
        title: "Συντήρηση ιστοσελίδας Δήμου",
        procedureType: "Απευθείας ανάθεση",
      }),
    );
    expect(result.targetedInvitation).toBe(true);
    expect(result.qualifies).toBe(false);
  });

  it("keeps open website maintenance invites eligible", () => {
    const result = scoreKimdisItemAgainstProfile(
      balancedCriteria,
      baseItem({
        title:
          "Υπηρεσίες Συντήρησης, Καλής Λειτουργίας, Υποστήριξης, της Ιστοσελίδας του Δήμου Κορδελιού- Ευόσμου",
      }),
    );
    expect(result.targetedInvitation).toBe(false);
    expect(result.qualifies).toBe(true);
    expect(result.score).toBe(48);
  });
});
