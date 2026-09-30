import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadConfig } from "../src/config.js";
import { openDatabase } from "../src/db/database.js";
import { createRepository } from "../src/db/repository.js";
import { reevaluateStoredTenders } from "../src/jobs/reevaluate.js";

const loadEnv = () => {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return;
  for (const raw of readFileSync(envPath, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
};

const main = () => {
  loadEnv();
  const config = loadConfig();
  const db = openDatabase(config.databasePath);
  const repo = createRepository(db);
  const result = reevaluateStoredTenders(repo, config);

  console.log("\n=== Reprocess summary (no Slack resent) ===");
  console.log(`Total:          ${result.total}`);
  console.log(`Relevant:       ${result.relevant}`);
  console.log(`Needs Review:   ${result.needsReview}`);
  console.log(`Ignored:        ${result.irrelevant}`);
  console.log(`Expired:        ${result.expired}`);
  console.log(`Targeted:       ${result.targeted}`);
  console.log(`Slack eligible: ${result.alertCandidates}`);

  console.log("\n--- Previously notified, now suppressed ---");
  if (result.previouslyNotifiedNowSuppressed.length === 0) {
    console.log("(none)");
  } else {
    for (const row of result.previouslyNotifiedNowSuppressed) {
      console.log(
        `- ${row.adam} | ${row.organization ?? ""} | ${row.title} | ${row.newStatus} | ${row.reason ?? ""}`,
      );
    }
  }

  console.log("\n--- Spotlight ---");
  for (const row of result.spotlight) {
    console.log(
      `- ${row.match}: status=${row.status} score=${row.score} category=${row.category} slack=${row.slackEligible} reason=${row.reason ?? "-"}`,
    );
    if (row.title) console.log(`  ${row.organization ?? ""} — ${row.title}`);
  }

  console.log("\n" + JSON.stringify(result, null, 2));
  db.close();
};

main();
