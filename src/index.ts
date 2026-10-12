import { serve } from "@hono/node-server";
import { Hono } from "hono";
import cron from "node-cron";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadConfig } from "./config.js";
import { openDatabase } from "./db/database.js";
import { createRepository } from "./db/repository.js";
import { createKimdisClient } from "./kimdis/client.js";
import { createSlackClient } from "./slack/client.js";
import { createPollJob } from "./jobs/poll-kimdis.js";
import { createHealthRoutes } from "./routes/health.js";
import { createAdminRoutes } from "./routes/admin.js";
import { createOperatorRoutes } from "./routes/operator.js";
import { POSITIVE_KEYWORDS } from "./filters/keywords.js";
import { STRONG_CPVS } from "./filters/cpvs.js";

const loadEnvFile = () => {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return;

  const content = readFileSync(envPath, "utf8");
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
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
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
};

loadEnvFile();

const config = loadConfig();
const db = openDatabase(config.databasePath);
const repo = createRepository(db);
const kimdis = createKimdisClient(config.KIMDIS_BASE_URL, config.HTTP_TIMEOUT_MS);
const slack = createSlackClient(config.SLACK_WEBHOOK_URL);
const pollJob = createPollJob({ config, kimdis, repo, slack });

console.log("watcher started");
console.log(`database path: ${config.databasePath}`);
console.log(`poll interval: ${config.POLL_INTERVAL_MINUTES} minutes`);
console.log(
  `filters: budget=${config.MIN_BUDGET}-${config.MAX_BUDGET} threshold=${config.ALERT_SCORE_THRESHOLD} lookback=${config.LOOKBACK_HOURS}h cpvs=${STRONG_CPVS.length} keywords=${POSITIVE_KEYWORDS.length}`,
);
console.log(`bootstrap send alerts: ${config.BOOTSTRAP_SEND_ALERTS}`);

const app = new Hono();

app.use("*", async (c, next) => {
  const started = Date.now();
  const requestId = crypto.randomUUID();
  c.header("X-Request-Id", requestId);
  await next();
  try {
    const { recordRequestLog, opsLogger } = await import("./saas/ops/logger.js");
    const status = c.res.status;
    const path = c.req.path;
    const method = c.req.method;
    const ms = Date.now() - started;
    recordRequestLog({
      requestId,
      method,
      path,
      status,
      ms,
    });
    if (status >= 500) {
      opsLogger.error("http_5xx", { requestId, method, path, status, ms });
    } else if (status >= 400) {
      opsLogger.warn("http_4xx", { requestId, method, path, status, ms });
    }
  } catch {
    // ops logger is best-effort
  }
});

app.route("/", createHealthRoutes(repo, { databasePath: config.databasePath }));

// Optional additive SaaS surface. Mount before admin so /api/auth and /api/saas
// are never shadowed. Internal SQLite/operator path stays primary.
if (process.env.SAAS_ENABLED === "1" || process.env.SAAS_ENABLED === "true") {
  try {
    const { getPrisma } = await import("./db/prisma.js");
    const { createSaasApp } = await import("./saas/app.js");
    const { runHourlyNotificationWave } = await import(
      "./saas/jobs/notification-waves.js"
    );
    const { runSharedKimdisIngest } = await import(
      "./saas/jobs/shared-ingest.js"
    );
    const { runSaasOutboxWorker } = await import(
      "./saas/jobs/process-outbox.js"
    );
    const { scheduleDueWeeklyFreeDigests } = await import(
      "./saas/jobs/weekly-free-digest.js"
    );
    const { app: saasApp } = createSaasApp({ prisma: getPrisma(), kimdis });
    app.route("/", saasApp);
    console.log("saas API: enabled (/api/auth/* , /api/saas/*)");

    // Shared KIMDIS ingest for every plan: new acts + followed threads.
    // Target: in-app / push within 5 minutes of Open Data availability.
    const sharedIngestExpression = "*/2 * * * *";
    if (cron.validate(sharedIngestExpression)) {
      cron.schedule(
        sharedIngestExpression,
        () => {
          void runSharedKimdisIngest(getPrisma(), kimdis)
            .then((summary) => {
              console.log(
                "[ingest] shared kimdis",
                JSON.stringify(summary),
              );
            })
            .catch((error) => {
              console.error(
                "shared kimdis ingest error:",
                error instanceof Error ? error.message : error,
              );
            });
        },
        { timezone: "Europe/Athens" },
      );
      console.log(
        `saas shared ingest: cron ${sharedIngestExpression} Europe/Athens`,
      );
    }

    // Hourly Athens wave: digest email flush + Deadline Radar (Pro).
    // Discovery itself is the shared ingest above, not per-org rescans.
    const hourlyWaveExpression = "5 * * * *";
    if (cron.validate(hourlyWaveExpression)) {
      cron.schedule(
        hourlyWaveExpression,
        () => {
          void runHourlyNotificationWave(getPrisma(), kimdis)
            .then((summary) => {
              console.log(
                "[email] hourly notification wave",
                JSON.stringify({
                  hour: summary.hour,
                  dueOrgs: summary.dueOrgs,
                  scanned: summary.scans.orgsScanned,
                  relatedSent: summary.relatedFlush.sent,
                  deadlineEmails: summary.deadlineRadar.emailsSent,
                }),
              );
            })
            .catch((error) => {
              console.error(
                "hourly notification wave error:",
                error instanceof Error ? error.message : error,
              );
            });
        },
        { timezone: "Europe/Athens" },
      );
      console.log(
        `saas notification waves: cron ${hourlyWaveExpression} Europe/Athens`,
      );
    }

    // Product email outbox + Free weekly digest scheduler (Europe/Athens).
    const outboxExpression = "*/2 * * * *";
    if (cron.validate(outboxExpression)) {
      cron.schedule(
        outboxExpression,
        () => {
          void runSaasOutboxWorker(getPrisma(), { limit: 20, kimdis })
            .then((summary) => {
              if (summary.processed > 0) {
                console.log("[outbox] processed", JSON.stringify(summary));
              }
            })
            .catch((error) => {
              console.error(
                "saas outbox worker error:",
                error instanceof Error ? error.message : error,
              );
            });
        },
        { timezone: "Europe/Athens" },
      );
      console.log(
        `saas outbox worker: cron ${outboxExpression} Europe/Athens`,
      );
    }

    const weeklyExpression = "10,40 * * * *";
    if (cron.validate(weeklyExpression)) {
      cron.schedule(
        weeklyExpression,
        () => {
          void scheduleDueWeeklyFreeDigests(getPrisma())
            .then((summary) => {
              if (summary.due > 0) {
                console.log(
                  "[email] weekly free digest schedule",
                  JSON.stringify(summary),
                );
              }
            })
            .catch((error) => {
              console.error(
                "weekly free digest schedule error:",
                error instanceof Error ? error.message : error,
              );
            });
        },
        { timezone: "Europe/Athens" },
      );
      console.log(
        `saas weekly free digests: cron ${weeklyExpression} Europe/Athens`,
      );
    }
  } catch (error) {
    console.error(
      "saas API: failed to start (internal watcher continues):",
      error instanceof Error ? error.message : error,
    );
  }
}

app.route("/", createAdminRoutes({
  adminToken: config.ADMIN_TOKEN,
  pollJob,
  slack,
  config,
  repo,
}));
app.route("/", createOperatorRoutes({
  operatorToken: config.OPERATOR_API_TOKEN,
  adminToken: config.ADMIN_TOKEN,
  allowedOrigins: config.LOCAL_DASHBOARD_ORIGINS,
  config,
  repo,
}));

if (config.OPERATOR_API_TOKEN) {
  console.log(
    `operator API: enabled (OPERATOR_API_TOKEN len=${config.OPERATOR_API_TOKEN.length})`,
  );
} else {
  console.log(
    `operator API: enabled via ADMIN_TOKEN fallback (set OPERATOR_API_TOKEN to dedicated token)`,
  );
}

const server = serve(
  {
    fetch: app.fetch,
    port: config.PORT,
  },
  (info) => {
    console.log(`http listening on :${info.port}`);
  },
);

const cronExpression = `*/${config.POLL_INTERVAL_MINUTES} * * * *`;
if (!cron.validate(cronExpression)) {
  throw new Error(`Invalid cron expression derived from POLL_INTERVAL_MINUTES=${config.POLL_INTERVAL_MINUTES}`);
}

const scheduled = cron.schedule(cronExpression, () => {
  void pollJob.run().catch((error) => {
    console.error("scheduled poll error:", error instanceof Error ? error.message : error);
  });
});

// Initial poll shortly after boot (non-blocking).
setTimeout(() => {
  void pollJob.run().catch((error) => {
    console.error("startup poll error:", error instanceof Error ? error.message : error);
  });
}, 2_000);

const shutdown = (signal: string) => {
  console.log(`shutting down on ${signal}`);
  try {
    scheduled.stop();
  } catch {
    /* ignore */
  }
  try {
    server.close(() => {
      try {
        db.close();
      } catch {
        /* ignore */
      }
      process.exit(0);
    });
  } catch {
    process.exit(0);
  }
  // tsx watch must be able to recycle this process; do not wait on hung fetches.
  setTimeout(() => process.exit(1), 1_500).unref();
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
