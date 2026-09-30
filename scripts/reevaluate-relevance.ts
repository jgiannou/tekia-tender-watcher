import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { openDatabase } from "../src/db/database.js";
import { createRepository } from "../src/db/repository.js";
import { isWebRelevant } from "../src/filters/web-relevance.js";
import { scoreOpportunity } from "../src/filters/scorer.js";

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
  const dbPath = resolve(
    process.cwd(),
    process.env.DATABASE_PATH ?? "./data/tenders.db",
  );
  const db = openDatabase(dbPath);
  const repo = createRepository(db);
  const rows = repo.listAll();
  const nowIso = new Date().toISOString();

  let relevant = 0;
  let needsReview = 0;
  let irrelevant = 0;
  const newlyIrrelevant: Array<{
    adam: string;
    title: string;
    oldScore: number | null;
    reason: string | null;
  }> = [];

  for (const row of rows) {
    const cpvs = row.cpvs ? (JSON.parse(row.cpvs) as string[]) : [];
    const gate = isWebRelevant({
      title: row.title ?? "",
      description: "",
      cpvs,
    });

    let score = 0;
    let reasons: string[] = [gate.ignoreReason ?? "Not web relevant"];
    let stage = row.stage ?? "UNKNOWN";

    if (!gate.isWebRelevant) {
      score = 0;
      stage = gate.status === "NEEDS_REVIEW" ? "NEEDS_REVIEW" : "IRRELEVANT";
      if (gate.status === "IRRELEVANT") {
        irrelevant += 1;
        if ((row.score ?? 0) >= 60) {
          newlyIrrelevant.push({
            adam: row.reference_number,
            title: row.title ?? "",
            oldScore: row.score,
            reason: gate.ignoreReason,
          });
        }
      } else {
        needsReview += 1;
      }
    } else {
      const scored = scoreOpportunity({
        recordType: row.record_type,
        title: row.title ?? "",
        description: "",
        cpvs,
        budgetWithoutVat: row.budget_without_vat,
        minBudget: Number(process.env.MIN_BUDGET ?? 1500),
        maxBudget: Number(process.env.MAX_BUDGET ?? 30000),
        hasNoticeRef: false,
        isPrimaryRequest: row.record_type === "REQ",
        webCategory: gate.category,
      });
      score = scored.score;
      reasons = scored.reasons;
      relevant += 1;
    }

    repo.updateRelevanceFields({
      referenceNumber: row.reference_number,
      score,
      stage,
      scoreReasons: reasons,
      webRelevant: gate.isWebRelevant,
      webCategory: gate.category,
      relevanceStatus: gate.status,
      ignoreReason: gate.ignoreReason,
      nowIso,
    });
  }

  console.log(
    JSON.stringify(
      {
        total: rows.length,
        relevant,
        needsReview,
        irrelevant,
        previouslyHighNowIrrelevant: newlyIrrelevant.length,
        samples: newlyIrrelevant.slice(0, 25),
      },
      null,
      2,
    ),
  );

  db.close();
};

main();
