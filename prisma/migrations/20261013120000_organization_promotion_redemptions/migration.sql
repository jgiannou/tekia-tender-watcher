-- CreateEnum
CREATE TYPE "OrganizationPromotionStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'SUPERSEDED');

-- CreateTable
CREATE TABLE "organization_promotion_redemptions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "promotionKey" TEXT NOT NULL,
    "activatedByUserId" TEXT NOT NULL,
    "activatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "status" "OrganizationPromotionStatus" NOT NULL DEFAULT 'ACTIVE',
    "attribution" JSONB,
    "activationEmailSentAt" TIMESTAMP(3),
    "reminder7dSentAt" TIMESTAMP(3),
    "reminder2dSentAt" TIMESTAMP(3),
    "expiredNotifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_promotion_redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organization_promotion_redemptions_organizationId_promotionKey_key" ON "organization_promotion_redemptions"("organizationId", "promotionKey");

-- CreateIndex
CREATE INDEX "organization_promotion_redemptions_promotionKey_status_idx" ON "organization_promotion_redemptions"("promotionKey", "status");

-- CreateIndex
CREATE INDEX "organization_promotion_redemptions_status_expiresAt_idx" ON "organization_promotion_redemptions"("status", "expiresAt");

-- AddForeignKey
ALTER TABLE "organization_promotion_redemptions" ADD CONSTRAINT "organization_promotion_redemptions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_promotion_redemptions" ADD CONSTRAINT "organization_promotion_redemptions_activatedByUserId_fkey" FOREIGN KEY ("activatedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
