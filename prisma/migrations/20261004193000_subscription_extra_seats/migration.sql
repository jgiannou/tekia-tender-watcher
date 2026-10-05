-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "extraSeats" INTEGER NOT NULL DEFAULT 0;

-- Normalize legacy plan keys toward the locked Basic/Pro catalog.
UPDATE "subscriptions" SET "planKey" = 'basic' WHERE "planKey" IN ('starter_499', 'saas_standard', 'basic_499');
UPDATE "subscriptions" SET "planKey" = 'pro' WHERE "planKey" IN ('pro_1000', 'pro_999');
