/**
 * Local scoring sandbox for jgiann94-style ARC Tenders profile.
 * Run: pnpm exec tsx scripts/score-jgiann-local.ts
 */
import {
  criteriaFromWatchProfile,
  scoreKimdisItemAgainstProfile,
} from "../src/saas/services/watch-match.js";
import type { KimdisSearchItem } from "../src/saas/services/kimdis-search.js";

const profile = criteriaFromWatchProfile(
  {
    keywords: ["ιστοσελίδα", "website", "web"],
    negativeKeywords: [],
    cpvs: [], // typical if user only typed keywords
    minBudget: null,
    maxBudget: null,
    matchingMode: "BALANCED",
    scoreThreshold: 45,
    recordTypes: ["REQ", "PROC"],
    authority: null,
    contractType: null,
    procedureType: null,
  },
  {
    companyActivities: [
      { code: "62.01", description: "Δραστηριότητες προγραμματισμού ηλεκτρονικών υπολογιστών" },
    ],
  },
);

const item = (overrides: Partial<KimdisSearchItem>): KimdisSearchItem => ({
  adam: "26REQDEMO",
  recordType: "REQ",
  title: "Γενικές υπηρεσίες",
  contractingAuthority: "ΔΗΜΟΣ ΠΑΡΑΔΕΙΓΜΑΤΟΣ",
  description: "",
  cpvs: [],
  budgetWithoutVat: 8000,
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

const cases: Array<{
  label: string;
  row: KimdisSearchItem;
  criteria?: typeof profile;
}> = [
  {
    label: "Keyword only (old 48% case)",
    row: item({
      title: "Συντήρηση ιστοσελίδας του Δήμου",
    }),
  },
  {
    label: "Keyword + company KAD CPV",
    row: item({
      title: "Συντήρηση ιστοσελίδας του Δήμου",
      cpvs: ["72413000-8"],
    }),
  },
  {
    label: "Keyword + saved-search CPV (no KAD needed)",
    row: item({
      title: "Αναβάθμιση website / CMS",
      cpvs: ["72413000-8"],
    }),
    criteria: criteriaFromWatchProfile({
      keywords: ["ιστοσελίδα"],
      negativeKeywords: [],
      cpvs: ["72413000-8"],
      minBudget: null,
      maxBudget: null,
      matchingMode: "BALANCED",
      scoreThreshold: 45,
      recordTypes: ["REQ", "PROC"],
      authority: null,
      contractType: null,
      procedureType: null,
    }),
  },
  {
    label: "Weak IT title, no web CPV",
    row: item({
      title: "Προμήθεια υπολογιστών και εκτυπωτών",
      cpvs: ["30200000-1"],
    }),
  },
  {
    label: "Targeted invite (should reject)",
    row: item({
      recordType: "PROC",
      title:
        "Πρόσκληση κατάθεσης προσφοράς για συντήρηση ιστοσελίδας (www.example.gov.gr)",
    }),
  },
];

console.log("\n=== jgiann94 local scoring sandbox ===\n");
console.log(
  "Default keywords:",
  profile.keywords.join(", "),
  "| KAD activities:",
  profile.companyActivities?.map((a) => a.code).join(", "),
);
console.log("");

for (const entry of cases) {
  const criteria = entry.criteria ?? profile;
  const result = scoreKimdisItemAgainstProfile(criteria, entry.row, {
    id: "local",
    name: "Web / ιστοσελίδες",
  });
  console.log(`• ${entry.label}`);
  console.log(`  title: ${entry.row.title}`);
  console.log(
    `  score=${result.score}% qualifies=${result.qualifies} signals=[${result.breakdown.signals.join(",")}] capped=${result.breakdown.capped}`,
  );
  for (const reason of result.reasons.slice(0, 4)) {
    console.log(`    - ${reason}`);
  }
  console.log("");
}
