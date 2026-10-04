-- CreateEnum
CREATE TYPE "MemberRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'INCOMPLETE');

-- CreateEnum
CREATE TYPE "RecordType" AS ENUM ('REQ', 'PROC');

-- CreateEnum
CREATE TYPE "RelevanceStatus" AS ENUM ('RELEVANT', 'NEEDS_REVIEW', 'IRRELEVANT', 'EXPIRED', 'TARGETED');

-- CreateEnum
CREATE TYPE "OperationalStatus" AS ENUM ('NEW', 'REVIEW', 'READY', 'SUBMITTED', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "SubmissionResult" AS ENUM ('PENDING', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "AlertChannel" AS ENUM ('SLACK', 'EMAIL', 'IN_APP');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,
    "activeOrganizationId" TEXT,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verifications" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_members" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "MemberRole" NOT NULL DEFAULT 'MEMBER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitations" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "MemberRole" NOT NULL DEFAULT 'MEMBER',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "inviterId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'INCOMPLETE',
    "planKey" TEXT NOT NULL DEFAULT 'saas_standard',
    "stripePriceId" TEXT,
    "trialEndsAt" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stripe_webhook_events" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payload" JSONB,

    CONSTRAINT "stripe_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "watch_profiles" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "presetKey" TEXT,
    "keywords" JSONB NOT NULL DEFAULT '[]',
    "negativeKeywords" JSONB NOT NULL DEFAULT '[]',
    "cpvs" JSONB NOT NULL DEFAULT '[]',
    "minBudget" DOUBLE PRECISION,
    "maxBudget" DOUBLE PRECISION,
    "scoreThreshold" INTEGER NOT NULL DEFAULT 45,
    "alertScoreThreshold" INTEGER NOT NULL DEFAULT 60,
    "categories" JSONB,
    "notificationThreshold" INTEGER,
    "customFilters" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "watch_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenders" (
    "id" TEXT NOT NULL,
    "referenceNumber" TEXT NOT NULL,
    "recordType" "RecordType" NOT NULL,
    "title" TEXT,
    "contractingAuthority" TEXT,
    "submissionDate" TIMESTAMP(3),
    "signedDate" TIMESTAMP(3),
    "finalSubmissionDate" TIMESTAMP(3),
    "budgetWithoutVat" DOUBLE PRECISION,
    "budgetWithVat" DOUBLE PRECISION,
    "cpvs" JSONB NOT NULL DEFAULT '[]',
    "stage" TEXT,
    "targetedSupplier" BOOLEAN NOT NULL DEFAULT false,
    "nonInvitedOffersRejected" BOOLEAN NOT NULL DEFAULT false,
    "pdfTextStatus" TEXT,
    "pdfText" TEXT,
    "officialPdfUrl" TEXT,
    "publicKimdisUrl" TEXT,
    "rawJson" JSONB,
    "sourceFingerprint" TEXT,
    "classificationVersion" INTEGER,
    "parentTenderId" TEXT,
    "relationCandidateId" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_tenders" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "tenderId" TEXT NOT NULL,
    "watchProfileId" TEXT,
    "relevanceStatus" "RelevanceStatus",
    "score" INTEGER,
    "scoreReasons" JSONB,
    "webRelevant" BOOLEAN NOT NULL DEFAULT false,
    "webCategory" TEXT,
    "ignoreReason" TEXT,
    "reviewReason" TEXT,
    "matchedKeywords" JSONB,
    "matchedCpvs" JSONB,
    "classificationVersion" INTEGER,
    "alertEligibilityReason" TEXT,
    "operationalStatus" "OperationalStatus" NOT NULL DEFAULT 'NEW',
    "notifiedAt" TIMESTAMP(3),
    "assignedMemberId" TEXT,
    "notes" TEXT,
    "contactName" TEXT,
    "contactDepartment" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "submissionMethod" TEXT,
    "submissionEmail" TEXT,
    "submissionPortal" TEXT,
    "submissionInstructions" TEXT,
    "scopeSummary" TEXT,
    "documentChecklist" JSONB,
    "drafts" JSONB,
    "approvalStatus" TEXT,
    "approvalSnapshot" JSONB,
    "approvedAt" TIMESTAMP(3),
    "relationConfidence" TEXT,
    "relationMethod" TEXT,
    "relationScore" INTEGER,
    "relationReasons" JSONB,
    "invitationType" TEXT,
    "invitedVendorName" TEXT,
    "ourInvitationStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_tenders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submissions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "organizationTenderId" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL,
    "submissionMethod" TEXT NOT NULL,
    "recipient" TEXT,
    "subject" TEXT,
    "amountWithoutVat" DOUBLE PRECISION,
    "amountWithVat" DOUBLE PRECISION,
    "attachments" JSONB,
    "externalReference" TEXT,
    "result" "SubmissionResult" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tender_events" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "organizationTenderId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tender_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outreach_ledgers" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "organizationTenderId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NOT_STARTED',
    "subject" TEXT,
    "body" TEXT,
    "notes" TEXT,
    "recipient" TEXT,
    "sentAt" TIMESTAMP(3),
    "payload" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outreach_ledgers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_settings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "company" JSONB NOT NULL,
    "drive" JSONB,
    "documents" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alert_destinations" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "channel" "AlertChannel" NOT NULL,
    "name" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alert_destinations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingestion_meta" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ingestion_meta_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "poll_runs" (
    "id" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),
    "success" BOOLEAN,
    "error" TEXT,
    "fetched" INTEGER NOT NULL DEFAULT 0,
    "newCount" INTEGER NOT NULL DEFAULT 0,
    "matching" INTEGER NOT NULL DEFAULT 0,
    "notified" INTEGER NOT NULL DEFAULT 0,
    "bootstrap" BOOLEAN NOT NULL DEFAULT false,
    "durationMs" INTEGER,

    CONSTRAINT "poll_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_key" ON "sessions"("token");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE INDEX "accounts_userId_idx" ON "accounts"("userId");

-- CreateIndex
CREATE INDEX "verifications_identifier_idx" ON "verifications"("identifier");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE INDEX "organization_members_userId_idx" ON "organization_members"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "organization_members_organizationId_userId_key" ON "organization_members"("organizationId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "invitations_token_key" ON "invitations"("token");

-- CreateIndex
CREATE INDEX "invitations_organizationId_email_idx" ON "invitations"("organizationId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_organizationId_key" ON "subscriptions"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_stripeCustomerId_key" ON "subscriptions"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_stripeSubscriptionId_key" ON "subscriptions"("stripeSubscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "stripe_webhook_events_eventId_key" ON "stripe_webhook_events"("eventId");

-- CreateIndex
CREATE INDEX "watch_profiles_organizationId_enabled_idx" ON "watch_profiles"("organizationId", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "tenders_referenceNumber_key" ON "tenders"("referenceNumber");

-- CreateIndex
CREATE INDEX "tenders_recordType_idx" ON "tenders"("recordType");

-- CreateIndex
CREATE INDEX "tenders_lastSeenAt_idx" ON "tenders"("lastSeenAt");

-- CreateIndex
CREATE INDEX "tenders_parentTenderId_idx" ON "tenders"("parentTenderId");

-- CreateIndex
CREATE INDEX "organization_tenders_organizationId_operationalStatus_idx" ON "organization_tenders"("organizationId", "operationalStatus");

-- CreateIndex
CREATE INDEX "organization_tenders_organizationId_relevanceStatus_idx" ON "organization_tenders"("organizationId", "relevanceStatus");

-- CreateIndex
CREATE INDEX "organization_tenders_organizationId_notifiedAt_idx" ON "organization_tenders"("organizationId", "notifiedAt");

-- CreateIndex
CREATE INDEX "organization_tenders_watchProfileId_idx" ON "organization_tenders"("watchProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "organization_tenders_organizationId_tenderId_key" ON "organization_tenders"("organizationId", "tenderId");

-- CreateIndex
CREATE INDEX "submissions_organizationId_result_idx" ON "submissions"("organizationId", "result");

-- CreateIndex
CREATE INDEX "submissions_organizationTenderId_idx" ON "submissions"("organizationTenderId");

-- CreateIndex
CREATE INDEX "tender_events_organizationId_createdAt_idx" ON "tender_events"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "tender_events_organizationTenderId_createdAt_idx" ON "tender_events"("organizationTenderId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "outreach_ledgers_organizationTenderId_key" ON "outreach_ledgers"("organizationTenderId");

-- CreateIndex
CREATE INDEX "outreach_ledgers_organizationId_status_idx" ON "outreach_ledgers"("organizationId", "status");

-- CreateIndex
CREATE INDEX "outreach_ledgers_organizationId_sentAt_idx" ON "outreach_ledgers"("organizationId", "sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "organization_settings_organizationId_key" ON "organization_settings"("organizationId");

-- CreateIndex
CREATE INDEX "alert_destinations_organizationId_channel_enabled_idx" ON "alert_destinations"("organizationId", "channel", "enabled");

-- CreateIndex
CREATE INDEX "poll_runs_startedAt_idx" ON "poll_runs"("startedAt");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_inviterId_fkey" FOREIGN KEY ("inviterId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "watch_profiles" ADD CONSTRAINT "watch_profiles_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenders" ADD CONSTRAINT "tenders_parentTenderId_fkey" FOREIGN KEY ("parentTenderId") REFERENCES "tenders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_tenders" ADD CONSTRAINT "organization_tenders_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_tenders" ADD CONSTRAINT "organization_tenders_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "tenders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_tenders" ADD CONSTRAINT "organization_tenders_watchProfileId_fkey" FOREIGN KEY ("watchProfileId") REFERENCES "watch_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_organizationTenderId_fkey" FOREIGN KEY ("organizationTenderId") REFERENCES "organization_tenders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tender_events" ADD CONSTRAINT "tender_events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tender_events" ADD CONSTRAINT "tender_events_organizationTenderId_fkey" FOREIGN KEY ("organizationTenderId") REFERENCES "organization_tenders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outreach_ledgers" ADD CONSTRAINT "outreach_ledgers_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outreach_ledgers" ADD CONSTRAINT "outreach_ledgers_organizationTenderId_fkey" FOREIGN KEY ("organizationTenderId") REFERENCES "organization_tenders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_settings" ADD CONSTRAINT "organization_settings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_destinations" ADD CONSTRAINT "alert_destinations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
