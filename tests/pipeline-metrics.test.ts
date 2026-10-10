import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  __resetPdfExtractTimingForTests,
  collectPipelineMetrics,
  pipelineHealthSummary,
  recordPdfExtractTiming,
} from "../src/saas/ops/pipeline-metrics.js";
import { enqueueSaasJob, SAAS_JOB_TYPES } from "../src/saas/jobs/outbox.js";
import {
  createSaasTestApp,
  getSaasTestPrisma,
  resetSaasDatabase,
  signUpAndGetCookie,
  authedJson,
} from "./helpers/saas-test.js";

const prisma = getSaasTestPrisma();

describe("pipeline metrics ops dashboard", () => {
  beforeEach(async () => {
    await resetSaasDatabase(prisma);
    __resetPdfExtractTimingForTests();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("aggregates outbox/ingest/email/storage without PII fields", async () => {
    const { app } = createSaasTestApp(prisma);
    const user = await signUpAndGetCookie(app, {
      name: "Pipeline Ops",
      email: `pipeline-${Date.now()}@example.com`,
      password: "password123",
    });
    const org = await authedJson<{ organization: { id: string } }>(
      app,
      "/api/saas/organizations",
      { cookie: user.cookie, body: { name: "Pipeline Org" } },
    );
    const organizationId = org.json.organization.id;

    await enqueueSaasJob(prisma, {
      type: SAAS_JOB_TYPES.weeklyDigest,
      deliveryKey: `WEEKLY_DIGEST:${organizationId}:2026-W41`,
      organizationId,
      payload: { cycleId: "2026-W41" },
    });
    await enqueueSaasJob(prisma, {
      type: SAAS_JOB_TYPES.attentionEmail,
      deliveryKey: `EMAIL:failed-demo`,
      organizationId,
      payload: { attentionEventId: "x" },
    });
    await prisma.saasJob.updateMany({
      where: { deliveryKey: "EMAIL:failed-demo" },
      data: { status: "FAILED", lastError: "smtp_timeout", attempts: 3 },
    });

    recordPdfExtractTiming({ durationMs: 120, status: "extracted" });
    recordPdfExtractTiming({ durationMs: 40, status: "unreadable" });

    const metrics = await collectPipelineMetrics(prisma);
    expect(metrics.outbox.pending).toBeGreaterThanOrEqual(1);
    expect(metrics.outbox.failed).toBeGreaterThanOrEqual(1);
    expect(metrics.outbox.byType[SAAS_JOB_TYPES.weeklyDigest]).toBeGreaterThanOrEqual(1);
    expect(metrics.pdf.process.count).toBe(2);
    expect(metrics.pdf.process.avgMs).toBe(80);
    expect(metrics.storage.root).toBeTruthy();
    expect(metrics.alerts.some((a) => a.code === "outbox_failed_jobs")).toBe(true);

    const serialized = JSON.stringify(metrics);
    expect(serialized).not.toMatch(/@example\.com/);
    expect(serialized).not.toMatch(/password/i);

    const summary = pipelineHealthSummary(metrics);
    expect(summary.outboxFailed).toBeGreaterThanOrEqual(1);
    expect(summary.alertCount).toBeGreaterThan(0);
  });
});
