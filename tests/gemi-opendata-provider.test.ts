import { describe, expect, it, vi } from "vitest";
import {
  extractGemiCompanyList,
  GemiOpenDataProvider,
  mapGemiCompany,
} from "../src/saas/company-registry/gemi-opendata-provider.js";
import { suggestWatchInterestsFromKads } from "../src/saas/recommendations/kad-to-watch.js";

describe("mapGemiCompany", () => {
  it("maps exact company fields and activities from the OpenAPI shape", () => {
    const mapped = mapGemiCompany({
      arGemi: 123456789,
      afm: "999999999",
      coNameEl: "ΠΑΡΑΔΕΙΓΜΑ ΑΕ",
      coTitlesEl: ["ΠΑΡΑΔΕΙΓΜΑ"],
      status: { id: 1, descr: "Ενεργή" },
      gemiOffice: { id: 10, descr: "Αθήνα" },
      activities: [
        {
          type: "Κύρια",
          activity: { id: "62.01.11", descr: "Υπηρεσίες λογισμικού", kadVersion: "2008" },
        },
        {
          type: "Δευτερεύουσα",
          activity: { id: "62.02", descr: "Συμβουλευτικές ΤΠΕ" },
        },
      ],
    });

    expect(mapped).toMatchObject({
      gemiNumber: "123456789",
      afm: "999999999",
      legalName: "ΠΑΡΑΔΕΙΓΜΑ ΑΕ",
      distinctiveTitle: "ΠΑΡΑΔΕΙΓΜΑ",
      status: "Ενεργή",
      source: "GEMI",
    });
    expect(mapped?.activities).toHaveLength(2);
    expect(mapped?.activities[0]?.isPrimary).toBe(true);
  });

  it("returns not_configured when API key is missing", async () => {
    const provider = new GemiOpenDataProvider({ apiKey: "", baseUrl: "https://example.test" });
    const result = await provider.lookupExact({ afm: "123456789" });
    expect(result.status).toBe("not_configured");
  });

  it("parses wrapped searchResults payloads from the live OpenData API", () => {
    const list = extractGemiCompanyList({
      searchMetadata: { totalCount: 1 },
      searchResults: [
        {
          arGemi: "195930203000",
          afm: "150707361",
          coNameEl: "ΓΙΑΝΝΟΥΣΗΣ ΙΩΑΝΝΗΣ ΤΟΥ ΓΡΗΓΟΡΙΟΥ",
        },
      ],
    });
    expect(list).toHaveLength(1);
    expect(list[0]?.afm).toBe("150707361");
  });

  it("looks up AFM against wrapped searchResults + detail company objects", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/companies?") || url.endsWith("/companies")) {
        return new Response(
          JSON.stringify({
            searchMetadata: { totalCount: 1, resultsOffset: 0, resultsSize: 1 },
            searchResults: [
              {
                arGemi: "195930203000",
                afm: "150707361",
                coNameEl: "ΓΙΑΝΝΟΥΣΗΣ ΙΩΑΝΝΗΣ ΤΟΥ ΓΡΗΓΟΡΙΟΥ",
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({
          arGemi: "195930203000",
          afm: "150707361",
          coNameEl: "ΓΙΑΝΝΟΥΣΗΣ ΙΩΑΝΝΗΣ ΤΟΥ ΓΡΗΓΟΡΙΟΥ",
          coTitlesEl: ["TEKIA"],
          status: { descr: "Ενεργή" },
          activities: [
            {
              type: "Κύρια",
              activity: {
                id: "62202000",
                descr: "ΥΠΗΡΕΣΙΕΣ ΠΑΡΟΧΗΣ ΣΥΜΒΟΥΛΩΝ",
                kadVersion: "kad_2026",
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    const provider = new GemiOpenDataProvider({
      apiKey: "test-key",
      baseUrl: "https://example.test/api/opendata/v1",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const result = await provider.lookupExact({ afm: "150707361" });
    expect(result.status).toBe("found");
    if (result.status !== "found") return;
    expect(result.companies[0]?.legalName).toContain("ΓΙΑΝΝΟΥΣΗΣ");
    expect(result.companies[0]?.gemiNumber).toBe("195930203000");
    expect(result.companies[0]?.activities[0]?.code).toBe("62202000");
  });
});

describe("suggestWatchInterestsFromKads", () => {
  it("suggests CPV/keywords without claiming official mapping", () => {
    const suggestions = suggestWatchInterestsFromKads([
      { code: "62.01.11", description: "software" },
    ]);
    expect(suggestions.cpvs.length).toBeGreaterThan(0);
    expect(suggestions.keywords).toContain("ιστοσελίδα");
  });
});
