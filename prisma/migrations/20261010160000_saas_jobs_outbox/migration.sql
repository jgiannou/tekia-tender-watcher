-- Durable product job outbox (email digests, retries, leases).
CREATE TYPE "SaasJobStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

CREATE TABLE "saas_jobs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "type" TEXT NOT NULL,
    "deliveryKey" TEXT NOT NULL,
    "payload" JSONB,
    "status" "SaasJobStatus" NOT NULL DEFAULT 'PENDING',
    "priority" INTEGER NOT NULL DEFAULT 100,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseOwner" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 8,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "saas_jobs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "saas_jobs_deliveryKey_key" ON "saas_jobs"("deliveryKey");
CREATE INDEX "saas_jobs_status_availableAt_priority_idx" ON "saas_jobs"("status", "availableAt", "priority");
CREATE INDEX "saas_jobs_organizationId_type_status_idx" ON "saas_jobs"("organizationId", "type", "status");
CREATE INDEX "saas_jobs_leaseExpiresAt_idx" ON "saas_jobs"("leaseExpiresAt");

ALTER TABLE "saas_jobs" ADD CONSTRAINT "saas_jobs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
