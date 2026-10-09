-- ARC Tenders competition features: region, contract/award memory, Diavgeia ADA.

ALTER TYPE "RecordType" ADD VALUE IF NOT EXISTS 'CONTRACT';

ALTER TABLE "watch_profiles" ADD COLUMN IF NOT EXISTS "regions" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "watch_profiles" ADD COLUMN IF NOT EXISTS "includeUnclassifiedRegion" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "watch_profiles" ADD COLUMN IF NOT EXISTS "unclassifiedRegionCount" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "tenders" ADD COLUMN IF NOT EXISTS "nutsCode" TEXT;
ALTER TABLE "tenders" ADD COLUMN IF NOT EXISTS "contractEndsAt" TIMESTAMP(3);
ALTER TABLE "tenders" ADD COLUMN IF NOT EXISTS "awardAmount" DOUBLE PRECISION;
ALTER TABLE "tenders" ADD COLUMN IF NOT EXISTS "winnerName" TEXT;
ALTER TABLE "tenders" ADD COLUMN IF NOT EXISTS "diavgeiaAda" TEXT;
ALTER TABLE "tenders" ADD COLUMN IF NOT EXISTS "diavgeiaUrl" TEXT;

CREATE INDEX IF NOT EXISTS "tenders_contractEndsAt_idx" ON "tenders"("contractEndsAt");
CREATE INDEX IF NOT EXISTS "tenders_nutsCode_idx" ON "tenders"("nutsCode");
