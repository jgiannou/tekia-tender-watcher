-- CreateTable
CREATE TABLE IF NOT EXISTS "product_events" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "userId" TEXT,
    "organizationId" TEXT,
    "sessionId" TEXT,
    "requestId" TEXT,
    "entityType" TEXT,
    "entityId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "product_events_type_createdAt_idx" ON "product_events"("type", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "product_events_userId_createdAt_idx" ON "product_events"("userId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "product_events_organizationId_createdAt_idx" ON "product_events"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "product_events_sessionId_createdAt_idx" ON "product_events"("sessionId", "createdAt");
