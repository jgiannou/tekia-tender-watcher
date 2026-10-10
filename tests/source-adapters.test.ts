import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  fetchDiavgeiaDecisionByAda,
  getDiavgeiaAdapterStatus,
  parseDiavgeiaDecisionPayload,
  parseDiavgeiaSearchPayload,
  searchDiavgeiaDecisions,
} from "../src/saas/sources/diavgeia-adapter.js";
import {
  buildTedExpertQuery,
  getTedAdapterStatus,
  parseTedSearchResponse,
  searchTedNotices,
} from "../src/saas/sources/ted-adapter.js";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

const envSnapshot = {
  TED_ENABLED: process.env.TED_ENABLED,
  TED_API_KEY: process.env.TED_API_KEY,
  DIAVGEIA_ENABLED: process.env.DIAVGEIA_ENABLED,
};

afterEach(() => {
  for (const [key, value] of Object.entries(envSnapshot)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("TED adapter", () => {
  it("does not require an API key when enabled", () => {
    process.env.TED_ENABLED = "true";
    delete process.env.TED_API_KEY;
    const status = getTedAdapterStatus();
    expect(status.enabled).toBe(true);
    expect(status.authRequired).toBe(false);
    expect(status.blocker).toBeNull();
  });

  it("stays disabled without TED_ENABLED", async () => {
    delete process.env.TED_ENABLED;
    delete process.env.TED_API_KEY;
    const status = getTedAdapterStatus();
    expect(status.enabled).toBe(false);
    const result = await searchTedNotices({ keywords: ["works"] });
    expect(result.notices).toEqual([]);
    expect(result.blocker).toBeTruthy();
  });

  it("parses official Search API fixture into notice refs", () => {
    const payload = JSON.parse(
      readFileSync(join(fixtures, "ted-search-grc-sample.json"), "utf8"),
    );
    const parsed = parseTedSearchResponse(payload);
    expect(parsed.notices.length).toBeGreaterThanOrEqual(1);
    const first = parsed.notices[0]!;
    expect(first.publicationNumber).toMatch(/^\d+-\d{4}$/);
    expect(first.title).toMatch(/Ελλάδα|Greece|ΥΠΗΡΕΣΙΑ/i);
    expect(first.buyerName).toBeTruthy();
    expect(first.url).toMatch(/^https:\/\/ted\.europa\.eu\//);
    expect(first.provenance).toBe("ted");
    expect(first.cpvs.length).toBeGreaterThan(0);
  });

  it("builds expert queries without inventing keywords", () => {
    expect(buildTedExpertQuery({ keywords: ["φόρτιση"], cpv: ["31681500"] })).toBe(
      "buyer-country=GRC AND notice-title~φόρτιση AND classification-cpv=31681500*",
    );
  });

  it("POSTs to the Search API when enabled (mocked fetch)", async () => {
    process.env.TED_ENABLED = "true";
    const fixture = JSON.parse(
      readFileSync(join(fixtures, "ted-search-grc-sample.json"), "utf8"),
    );
    let seenMethod = "";
    let seenUrl = "";
    const result = await searchTedNotices(
      { keywords: ["φόρτιση"], limit: 2 },
      async (input, init) => {
        seenUrl = String(input);
        seenMethod = String(init?.method || "GET");
        return new Response(JSON.stringify(fixture), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    );
    expect(seenMethod).toBe("POST");
    expect(seenUrl).toContain("/v3/notices/search");
    expect(result.blocker).toBeNull();
    expect(result.notices[0]?.publicationNumber).toBeTruthy();
  });
});

describe("Diavgeia adapter", () => {
  it("keeps Diavgeia disabled without explicit enablement", async () => {
    delete process.env.DIAVGEIA_ENABLED;
    const status = getDiavgeiaAdapterStatus();
    expect(status.enabled).toBe(false);
    expect(status.authRequired).toBe(false);
    expect(status.blocker).toBeTruthy();
    expect(await fetchDiavgeiaDecisionByAda("Ω123")).toBeNull();
  });

  it("parses decision and search fixtures", () => {
    const decision = parseDiavgeiaDecisionPayload(
      JSON.parse(
        readFileSync(join(fixtures, "diavgeia-decision-sample.json"), "utf8"),
      ),
    );
    expect(decision?.ada).toBe("97ΠΒΩΛΔ-ΑΝΣ");
    expect(decision?.subject).toMatch(/Ανάθεση/i);
    expect(decision?.issueDate).toBeTruthy();
    expect(decision?.provenance).toBe("diavgeia");

    const search = parseDiavgeiaSearchPayload(
      JSON.parse(
        readFileSync(join(fixtures, "diavgeia-search-sample.json"), "utf8"),
      ),
    );
    expect(search.length).toBeGreaterThanOrEqual(1);
    expect(search[0]?.ada).toBeTruthy();
  });

  it("fetches by ADA when enabled (mocked fetch)", async () => {
    process.env.DIAVGEIA_ENABLED = "true";
    const fixture = JSON.parse(
      readFileSync(join(fixtures, "diavgeia-decision-sample.json"), "utf8"),
    );
    const decision = await fetchDiavgeiaDecisionByAda(
      "97ΠΒΩΛΔ-ΑΝΣ",
      async (input) => {
        expect(String(input)).toContain("/decisions/");
        return new Response(JSON.stringify(fixture), { status: 200 });
      },
    );
    expect(decision?.ada).toBe("97ΠΒΩΛΔ-ΑΝΣ");
    expect(decision?.subject).toMatch(/Ανάθεση/i);
  });

  it("searches via luminapi when enabled (mocked fetch)", async () => {
    process.env.DIAVGEIA_ENABLED = "true";
    const fixture = JSON.parse(
      readFileSync(join(fixtures, "diavgeia-search-sample.json"), "utf8"),
    );
    const result = await searchDiavgeiaDecisions(
      { term: "ΚΗΜΔΗΣ", size: 2 },
      async (input) => {
        expect(String(input)).toContain("search.json");
        return new Response(JSON.stringify(fixture), { status: 200 });
      },
    );
    expect(result.blocker).toBeNull();
    expect(result.decisions.length).toBeGreaterThan(0);
  });
});
