-- Priority Monitoring (Παρακολούθηση Προτεραιότητας) for Pro Hot Watch.
-- Shared KIMDIS ingest remains plan-agnostic; this only intensifies related-act checks.

CREATE TYPE "MonitoringPriority" AS ENUM ('NORMAL', 'PRIORITY');
CREATE TYPE "PriorityMonitoringReason" AS ENUM ('FOLLOW', 'OUTREACH', 'MANUAL');

ALTER TABLE "organization_tenders"
  ADD COLUMN "monitoringPriority" "MonitoringPriority" NOT NULL DEFAULT 'NORMAL',
  ADD COLUMN "priorityMonitoringSince" TIMESTAMP(3),
  ADD COLUMN "priorityMonitoringReason" "PriorityMonitoringReason",
  ADD COLUMN "lastPriorityCheckAt" TIMESTAMP(3),
  ADD COLUMN "nextPriorityCheckAt" TIMESTAMP(3),
  ADD COLUMN "priorityMonitoringLastError" TEXT,
  ADD COLUMN "priorityMonitoringErrorCount" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "organization_tenders_organizationId_monitoringPriority_idx"
  ON "organization_tenders"("organizationId", "monitoringPriority");

CREATE INDEX "organization_tenders_monitoringPriority_nextPriorityCheckAt_idx"
  ON "organization_tenders"("monitoringPriority", "nextPriorityCheckAt");

-- Safe backfill: active Pro/Trial/promo outreach monitoring → Priority (non-terminal).
UPDATE "organization_tenders" ot
SET
  "monitoringPriority" = 'PRIORITY',
  "priorityMonitoringSince" = COALESCE(ot."monitoringStartedAt", ot."updatedAt"),
  "priorityMonitoringReason" = 'OUTREACH',
  "nextPriorityCheckAt" = NOW()
FROM "subscriptions" s
WHERE ot."organizationId" = s."organizationId"
  AND ot."monitoringActive" = true
  AND ot."monitoringPriority" = 'NORMAL'
  AND ot."pipelineStage" NOT IN ('WON', 'LOST', 'CLOSED', 'DISMISSED')
  AND (
    ot."monitoringReason" = 'OUTREACH_SENT'
    OR ot."pipelineStage" = 'OUTREACH_SENT'
  )
  AND (
    s."planKey" IN ('pro', 'pro_999', 'trial')
    OR (s."trialEndsAt" IS NOT NULL AND s."trialEndsAt" > NOW())
    OR EXISTS (
      SELECT 1 FROM "organization_promotion_redemptions" r
      WHERE r."organizationId" = ot."organizationId"
        AND r."status" = 'ACTIVE'
        AND r."expiresAt" > NOW()
    )
  );
