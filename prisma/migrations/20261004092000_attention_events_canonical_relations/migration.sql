-- Rebuild related/notification tables and add organization attention events.

DELETE FROM "notification_deliveries";
DELETE FROM "related_act_links";

CREATE TYPE "AttentionEventType" AS ENUM (
  'RELATED_PROC_DISCOVERED',
  'RELATED_APPROVED_REQUEST_DISCOVERED',
  'RELATED_AWARD_DISCOVERED',
  'RELATED_CONTRACT_DISCOVERED',
  'DEADLINE_CHANGED'
);

CREATE TYPE "PipelineStage_new" AS ENUM ('NEW', 'REVIEWING', 'OUTREACH_SENT', 'PREPARING', 'SUBMITTED', 'WON', 'LOST', 'CLOSED', 'DISMISSED');
ALTER TABLE "organization_tenders" ALTER COLUMN "pipelineStage" DROP DEFAULT;
ALTER TABLE "organization_tenders" ALTER COLUMN "pipelineStage" TYPE "PipelineStage_new" USING (
  CASE "pipelineStage"::text
    WHEN 'OUTREACH_SENT' THEN 'OUTREACH_SENT'::"PipelineStage_new"
    WHEN 'PREPARING' THEN 'PREPARING'::"PipelineStage_new"
    WHEN 'SUBMITTED' THEN 'SUBMITTED'::"PipelineStage_new"
    WHEN 'COMPLETED' THEN 'CLOSED'::"PipelineStage_new"
    ELSE 'NEW'::"PipelineStage_new"
  END
);
ALTER TYPE "PipelineStage" RENAME TO "PipelineStage_old";
ALTER TYPE "PipelineStage_new" RENAME TO "PipelineStage";
DROP TYPE "PipelineStage_old";
ALTER TABLE "organization_tenders" ALTER COLUMN "pipelineStage" SET DEFAULT 'NEW';

ALTER TYPE "RecordType" ADD VALUE IF NOT EXISTS 'AWRD';
ALTER TYPE "RecordType" ADD VALUE IF NOT EXISTS 'OTHER';
ALTER TYPE "RelationConfidence" ADD VALUE IF NOT EXISTS 'DISMISSED';

DROP TABLE "related_act_links";
DROP TABLE "notification_deliveries";
DROP TYPE IF EXISTS "RelatedActReviewStatus";

CREATE TABLE "related_act_links" (
  "id" TEXT NOT NULL,
  "sourceTenderId" TEXT NOT NULL,
  "targetTenderId" TEXT NOT NULL,
  "relationType" TEXT NOT NULL,
  "confidence" "RelationConfidence" NOT NULL DEFAULT 'LIKELY',
  "detectionMethod" TEXT NOT NULL,
  "payload" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "confirmedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "related_act_links_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "organization_attention_events" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "organizationTenderId" TEXT NOT NULL,
  "relatedTenderId" TEXT,
  "relatedActLinkId" TEXT,
  "type" "AttentionEventType" NOT NULL,
  "title" TEXT NOT NULL,
  "metadata" JSONB,
  "dedupeKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "readAt" TIMESTAMP(3),
  CONSTRAINT "organization_attention_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "notification_deliveries" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "organizationAttentionEventId" TEXT NOT NULL,
  "organizationTenderId" TEXT,
  "channel" "AlertChannel" NOT NULL,
  "templateKey" TEXT NOT NULL,
  "dedupeKey" TEXT NOT NULL,
  "status" "NotificationDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "subject" TEXT,
  "bodyPreview" TEXT,
  "providerMessageId" TEXT,
  "error" TEXT,
  "payload" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sentAt" TIMESTAMP(3),
  CONSTRAINT "notification_deliveries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "related_act_links_sourceTenderId_targetTenderId_relationTyp_key"
  ON "related_act_links"("sourceTenderId", "targetTenderId", "relationType");
CREATE INDEX "related_act_links_sourceTenderId_idx" ON "related_act_links"("sourceTenderId");
CREATE INDEX "related_act_links_targetTenderId_idx" ON "related_act_links"("targetTenderId");
CREATE INDEX "related_act_links_confidence_idx" ON "related_act_links"("confidence");

CREATE UNIQUE INDEX "organization_attention_events_organizationId_dedupeKey_key"
  ON "organization_attention_events"("organizationId", "dedupeKey");
CREATE INDEX "organization_attention_events_organizationId_createdAt_idx"
  ON "organization_attention_events"("organizationId", "createdAt");
CREATE INDEX "organization_attention_events_organizationId_readAt_idx"
  ON "organization_attention_events"("organizationId", "readAt");
CREATE INDEX "organization_attention_events_organizationTenderId_createdA_idx"
  ON "organization_attention_events"("organizationTenderId", "createdAt");

CREATE UNIQUE INDEX "notification_deliveries_organizationId_dedupeKey_key"
  ON "notification_deliveries"("organizationId", "dedupeKey");
CREATE INDEX "notification_deliveries_organizationAttentionEventId_idx"
  ON "notification_deliveries"("organizationAttentionEventId");
CREATE INDEX "notification_deliveries_organizationId_createdAt_idx"
  ON "notification_deliveries"("organizationId", "createdAt");

ALTER TABLE "related_act_links"
  ADD CONSTRAINT "related_act_links_sourceTenderId_fkey"
  FOREIGN KEY ("sourceTenderId") REFERENCES "tenders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "related_act_links"
  ADD CONSTRAINT "related_act_links_targetTenderId_fkey"
  FOREIGN KEY ("targetTenderId") REFERENCES "tenders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "organization_attention_events"
  ADD CONSTRAINT "organization_attention_events_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "organization_attention_events"
  ADD CONSTRAINT "organization_attention_events_organizationTenderId_fkey"
  FOREIGN KEY ("organizationTenderId") REFERENCES "organization_tenders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "organization_attention_events"
  ADD CONSTRAINT "organization_attention_events_relatedTenderId_fkey"
  FOREIGN KEY ("relatedTenderId") REFERENCES "tenders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "organization_attention_events"
  ADD CONSTRAINT "organization_attention_events_relatedActLinkId_fkey"
  FOREIGN KEY ("relatedActLinkId") REFERENCES "related_act_links"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "notification_deliveries"
  ADD CONSTRAINT "notification_deliveries_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notification_deliveries"
  ADD CONSTRAINT "notification_deliveries_organizationAttentionEventId_fkey"
  FOREIGN KEY ("organizationAttentionEventId") REFERENCES "organization_attention_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notification_deliveries"
  ADD CONSTRAINT "notification_deliveries_organizationTenderId_fkey"
  FOREIGN KEY ("organizationTenderId") REFERENCES "organization_tenders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
