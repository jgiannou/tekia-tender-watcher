-- Customer Slack incoming-webhook connections (one channel per organization).

CREATE TYPE "SlackConnectionStatus" AS ENUM ('ACTIVE', 'PAUSED', 'PLAN_PAUSED', 'NEEDS_RECONNECT', 'DISCONNECTED');

CREATE TABLE "organization_slack_connections" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "status" "SlackConnectionStatus" NOT NULL DEFAULT 'PAUSED',
    "slackTeamId" TEXT NOT NULL,
    "slackTeamName" TEXT NOT NULL,
    "slackChannelId" TEXT NOT NULL,
    "slackChannelName" TEXT NOT NULL,
    "webhookUrlCiphertext" TEXT NOT NULL,
    "webhookUrlNonce" TEXT NOT NULL,
    "installedByUserId" TEXT,
    "preferences" JSONB NOT NULL DEFAULT '{}',
    "notificationsArmed" BOOLEAN NOT NULL DEFAULT false,
    "lastTestSentAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "lastErrorAt" TIMESTAMP(3),
    "lastErrorSafe" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_slack_connections_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "organization_slack_connections_organizationId_key" ON "organization_slack_connections"("organizationId");
CREATE INDEX "organization_slack_connections_status_idx" ON "organization_slack_connections"("status");

ALTER TABLE "organization_slack_connections" ADD CONSTRAINT "organization_slack_connections_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "organization_slack_connections" ADD CONSTRAINT "organization_slack_connections_installedByUserId_fkey" FOREIGN KEY ("installedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "slack_oauth_states" (
    "id" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT 'CONNECT',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "slack_oauth_states_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "slack_oauth_states_state_key" ON "slack_oauth_states"("state");
CREATE INDEX "slack_oauth_states_userId_organizationId_idx" ON "slack_oauth_states"("userId", "organizationId");
CREATE INDEX "slack_oauth_states_expiresAt_idx" ON "slack_oauth_states"("expiresAt");
