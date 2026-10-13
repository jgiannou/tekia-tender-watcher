-- Enum: REVOKED status
DO $$ BEGIN
  ALTER TYPE "OrganizationPromotionStatus" ADD VALUE 'REVOKED';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Enum: activation source
DO $$ BEGIN
  CREATE TYPE "PromotionActivationSource" AS ENUM ('SELF_SERVICE', 'ADMIN');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "organization_promotion_redemptions"
  ADD COLUMN IF NOT EXISTS "source" "PromotionActivationSource" NOT NULL DEFAULT 'SELF_SERVICE',
  ADD COLUMN IF NOT EXISTS "slotConsumed" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "slotRestoredAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "revokedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "revokedBy" TEXT,
  ADD COLUMN IF NOT EXISTS "revokeReason" TEXT;

CREATE INDEX IF NOT EXISTS "organization_promotion_redemptions_promotionKey_slotConsumed_idx"
  ON "organization_promotion_redemptions"("promotionKey", "slotConsumed");

CREATE TABLE IF NOT EXISTS "promotion_campaign_configs" (
    "promotionKey" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,
    "note" TEXT,
    CONSTRAINT "promotion_campaign_configs_pkey" PRIMARY KEY ("promotionKey")
);

INSERT INTO "promotion_campaign_configs" ("promotionKey", "capacity", "updatedAt", "note")
VALUES ('ARC_PRO_LAUNCH_30', 25, CURRENT_TIMESTAMP, 'Initial launch capacity')
ON CONFLICT ("promotionKey") DO NOTHING;

CREATE TABLE IF NOT EXISTS "promotion_audit_events" (
    "id" TEXT NOT NULL,
    "promotionKey" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "organizationId" TEXT,
    "redemptionId" TEXT,
    "previousCapacity" INTEGER,
    "newCapacity" INTEGER,
    "previousStatus" TEXT,
    "newStatus" TEXT,
    "reason" TEXT NOT NULL,
    "performedBy" TEXT NOT NULL,
    "idempotencyKey" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "promotion_audit_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "promotion_audit_events_idempotencyKey_key"
  ON "promotion_audit_events"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "promotion_audit_events_promotionKey_createdAt_idx"
  ON "promotion_audit_events"("promotionKey", "createdAt");
CREATE INDEX IF NOT EXISTS "promotion_audit_events_organizationId_createdAt_idx"
  ON "promotion_audit_events"("organizationId", "createdAt");
