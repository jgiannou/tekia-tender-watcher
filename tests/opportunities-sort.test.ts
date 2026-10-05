import { describe, expect, it } from "vitest";
import { sortOpportunityRows } from "../src/saas/services/opportunities.js";

const row = (
  id: string,
  opts: {
    score?: number | null;
    submissionDate?: string | null;
    finalSubmissionDate?: string | null;
  },
) => ({
  id,
  score: opts.score ?? null,
  updatedAt: "2026-01-01T00:00:00.000Z",
  tender: {
    submissionDate: opts.submissionDate ?? null,
    finalSubmissionDate: opts.finalSubmissionDate ?? null,
  },
});

describe("sortOpportunityRows", () => {
  const rows = [
    row("old-high", {
      score: 90,
      submissionDate: "2026-01-01T00:00:00.000Z",
      finalSubmissionDate: "2026-12-01T00:00:00.000Z",
    }),
    row("new-low", {
      score: 40,
      submissionDate: "2026-03-01T00:00:00.000Z",
      finalSubmissionDate: "2026-04-01T00:00:00.000Z",
    }),
    row("mid", {
      score: 70,
      submissionDate: "2026-02-01T00:00:00.000Z",
      finalSubmissionDate: "2026-03-15T00:00:00.000Z",
    }),
  ];

  it("defaults newest by submission date", () => {
    expect(sortOpportunityRows(rows, "newest").map((r) => r.id)).toEqual([
      "new-low",
      "mid",
      "old-high",
    ]);
  });

  it("sorts by score", () => {
    expect(sortOpportunityRows(rows, "score").map((r) => r.id)).toEqual([
      "old-high",
      "mid",
      "new-low",
    ]);
  });

  it("sorts by nearest deadline", () => {
    expect(sortOpportunityRows(rows, "deadline").map((r) => r.id)).toEqual([
      "mid",
      "new-low",
      "old-high",
    ]);
  });
});
