#!/usr/bin/env node
/**
 * Live smoke: TED Search API + Diavgeia luminapi (no SaaS auth).
 * Usage: node scripts/smoke-sources-live.mjs
 */
const tedUrl = "https://api.ted.europa.eu/v3/notices/search";
const diavgeiaSearch =
  "https://diavgeia.gov.gr/luminapi/opendata/search.json?term=%CE%9A%CE%97%CE%9C%CE%94%CE%97%CE%A3&page=0&size=2";

const tedBody = {
  query: "buyer-country=GRC AND notice-title~φόρτιση",
  fields: [
    "publication-number",
    "notice-title",
    "buyer-name",
    "publication-date",
    "notice-type",
  ],
  limit: 2,
  scope: "ACTIVE",
  paginationMode: "PAGE_NUMBER",
  page: 1,
};

const main = async () => {
  const tedRes = await fetch(tedUrl, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(tedBody),
    signal: AbortSignal.timeout(25_000),
  });
  if (!tedRes.ok) {
    throw new Error(`TED HTTP ${tedRes.status}`);
  }
  const ted = await tedRes.json();
  const notices = Array.isArray(ted.notices) ? ted.notices : [];
  console.log(
    `TED ok · notices=${notices.length} · first=${notices[0]?.["publication-number"] ?? "—"}`,
  );

  const diavRes = await fetch(diavgeiaSearch, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!diavRes.ok) {
    throw new Error(`Diavgeia HTTP ${diavRes.status}`);
  }
  const diav = await diavRes.json();
  const decisions = Array.isArray(diav.decisions) ? diav.decisions : [];
  console.log(
    `Diavgeia ok · decisions=${decisions.length} · firstAda=${decisions[0]?.ada ?? "—"}`,
  );
  console.log("smoke-sources-live: PASS");
};

main().catch((error) => {
  console.error("smoke-sources-live: FAIL", error);
  process.exit(1);
});
