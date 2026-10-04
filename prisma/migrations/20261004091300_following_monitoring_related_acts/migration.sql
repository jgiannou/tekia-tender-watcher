-- CreateEnum
CREATE TYPE "MonitoringReason" AS ENUM ('USER_FOLLOWING', 'OUTREACH_SENT', 'SUBMISSION_RECORDED');

-- CreateEnum
CREATE TYPE "PipelineStage" AS ENUM ('DISCOVERED', 'FOLLOWING', 'OUTREACH_SENT', 'OFFICIAL_NOTICE_FOUND', 'PREPARING', 'SUBMITTED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "RelationConfidence" AS ENUM ('CONFIRMED', 'LIKELY', 'POSSIBLE');

-- CreateEnum
CREATE TYPE "RelatedActReviewStatus" AS ENUM ('PENDING', 'CONFIRMED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "NotificationDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED');

-- AlterTable
ALTER TABLE "organization_tenders" ADD COLUMN     "followedAt" TIMESTAMP(3),
ADD COLUMN     "followedByUserId" TEXT,
ADD COLUMN     "following" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lastMonitoringNotificationAt" TIMESTAMP(3),
ADD COLUMN     "lastRelatedCheckAt" TIMESTAMP(3),
ADD COLUMN     "latestRelatedActAt" TIMESTAMP(3),
ADD COLUMN     "monitoringActive" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "monitoringReason" "MonitoringReason",
ADD COLUMN     "monitoringStartedAt" TIMESTAMP(3),
ADD COLUMN     "monitoringStoppedAt" TIMESTAMP(3),
ADD COLUMN     "pipelineStage" "PipelineStage" NOT NULL DEFAULT 'DISCOVERED';

-- CreateTable
CREATE TABLE "related_act_links" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "organizationTenderId" TEXT NOT NULL,
    "sourceTenderId" TEXT NOT NULL,
    "relatedTenderId" TEXT NOT NULL,
    "relationType" TEXT NOT NULL,
    "confidence" "RelationConfidence" NOT NULL,
    "detectionMethod" TEXT NOT NULL,
    "reviewStatus" "RelatedActReviewStatus" NOT NULL DEFAULT 'PENDING',
    "discoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedByUserId" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "related_act_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_deliveries" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "organizationTenderId" TEXT,
    "relatedActLinkId" TEXT,
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

-- CreateIndex
CREATE INDEX "related_act_links_organizationId_reviewStatus_idx" ON "related_act_links"("organizationId", "reviewStatus");

-- CreateIndex
CREATE INDEX "related_act_links_organizationTenderId_discoveredAt_idx" ON "related_act_links"("organizationTenderId", "discoveredAt");

-- CreateIndex
CREATE UNIQUE INDEX "related_act_links_organizationId_sourceTenderId_relatedTend_key" ON "related_act_links"("organizationId", "sourceTenderId", "relatedTenderId");

-- CreateIndex
CREATE INDEX "notification_deliveries_organizationId_createdAt_idx" ON "notification_deliveries"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "notification_deliveries_organizationTenderId_createdAt_idx" ON "notification_deliveries"("organizationTenderId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "notification_deliveries_organizationId_dedupeKey_key" ON "notification_deliveries"("organizationId", "dedupeKey");

-- CreateIndex
CREATE INDEX "organization_tenders_organizationId_following_idx" ON "organization_tenders"("organizationId", "following");

-- CreateIndex
CREATE INDEX "organization_tenders_organizationId_monitoringActive_idx" ON "organization_tenders"("organizationId", "monitoringActive");

-- CreateIndex
CREATE INDEX "organization_tenders_organizationId_pipelineStage_idx" ON "organization_tenders"("organizationId", "pipelineStage");

-- AddForeignKey
ALTER TABLE "related_act_links" ADD CONSTRAINT "related_act_links_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "related_act_links" ADD CONSTRAINT "related_act_links_organizationTenderId_fkey" FOREIGN KEY ("organizationTenderId") REFERENCES "organization_tenders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "related_act_links" ADD CONSTRAINT "related_act_links_sourceTenderId_fkey" FOREIGN KEY ("sourceTenderId") REFERENCES "tenders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "related_act_links" ADD CONSTRAINT "related_act_links_relatedTenderId_fkey" FOREIGN KEY ("relatedTenderId") REFERENCES "tenders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_organizationTenderId_fkey" FOREIGN KEY ("organizationTenderId") REFERENCES "organization_tenders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
