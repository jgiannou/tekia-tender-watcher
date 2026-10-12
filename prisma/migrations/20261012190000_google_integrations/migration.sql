-- Customer Google integrations (Calendar / Drive / Sheets), personal per user+org.

CREATE TYPE "GoogleCapabilityStatus" AS ENUM (
  'DISABLED',
  'ACTIVE',
  'PAUSED',
  'PLAN_PAUSED',
  'NEEDS_RECONNECT',
  'NEEDS_RECREATE',
  'SYNCING'
);

CREATE TABLE "user_organization_google_connections" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "googleAccountId" TEXT NOT NULL,
    "googleEmail" TEXT NOT NULL,
    "refreshTokenCiphertext" TEXT NOT NULL,
    "refreshTokenNonce" TEXT NOT NULL,
    "accessTokenCiphertext" TEXT,
    "accessTokenNonce" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "grantedScopes" TEXT NOT NULL DEFAULT '',
    "tokenStatus" "GoogleCapabilityStatus" NOT NULL DEFAULT 'ACTIVE',
    "calendarStatus" "GoogleCapabilityStatus" NOT NULL DEFAULT 'DISABLED',
    "calendarId" TEXT,
    "calendarHtmlLink" TEXT,
    "calendarSummary" TEXT,
    "calendarLastSuccessAt" TIMESTAMP(3),
    "calendarLastErrorAt" TIMESTAMP(3),
    "calendarLastErrorSafe" TEXT,
    "calendarInitialSyncAt" TIMESTAMP(3),
    "driveStatus" "GoogleCapabilityStatus" NOT NULL DEFAULT 'DISABLED',
    "driveLastSuccessAt" TIMESTAMP(3),
    "driveLastErrorAt" TIMESTAMP(3),
    "driveLastErrorSafe" TEXT,
    "sheetsStatus" "GoogleCapabilityStatus" NOT NULL DEFAULT 'DISABLED',
    "spreadsheetId" TEXT,
    "spreadsheetUrl" TEXT,
    "sheetsLastSuccessAt" TIMESTAMP(3),
    "sheetsLastErrorAt" TIMESTAMP(3),
    "sheetsLastErrorSafe" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_organization_google_connections_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_organization_google_connections_organizationId_userId_key"
  ON "user_organization_google_connections"("organizationId", "userId");
CREATE INDEX "user_organization_google_connections_organizationId_idx"
  ON "user_organization_google_connections"("organizationId");
CREATE INDEX "user_organization_google_connections_userId_idx"
  ON "user_organization_google_connections"("userId");
CREATE INDEX "user_organization_google_connections_calendarStatus_idx"
  ON "user_organization_google_connections"("calendarStatus");

ALTER TABLE "user_organization_google_connections"
  ADD CONSTRAINT "user_organization_google_connections_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_organization_google_connections"
  ADD CONSTRAINT "user_organization_google_connections_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "google_oauth_states" (
    "id" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT 'CONNECT',
    "capabilities" TEXT NOT NULL,
    "codeVerifier" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "google_oauth_states_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "google_oauth_states_state_key" ON "google_oauth_states"("state");
CREATE INDEX "google_oauth_states_userId_organizationId_idx"
  ON "google_oauth_states"("userId", "organizationId");
CREATE INDEX "google_oauth_states_expiresAt_idx" ON "google_oauth_states"("expiresAt");

CREATE TABLE "google_calendar_event_links" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "organizationTenderId" TEXT NOT NULL,
    "tenderId" TEXT NOT NULL,
    "googleCalendarId" TEXT NOT NULL,
    "googleEventId" TEXT NOT NULL,
    "deadlineFingerprint" TEXT NOT NULL,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "google_calendar_event_links_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "google_calendar_event_links_connectionId_organizationTenderId_key"
  ON "google_calendar_event_links"("connectionId", "organizationTenderId");
CREATE INDEX "google_calendar_event_links_connectionId_googleEventId_idx"
  ON "google_calendar_event_links"("connectionId", "googleEventId");
CREATE INDEX "google_calendar_event_links_tenderId_idx"
  ON "google_calendar_event_links"("tenderId");

ALTER TABLE "google_calendar_event_links"
  ADD CONSTRAINT "google_calendar_event_links_connectionId_fkey"
  FOREIGN KEY ("connectionId") REFERENCES "user_organization_google_connections"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "google_drive_folder_links" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "organizationTenderId" TEXT NOT NULL,
    "tenderId" TEXT NOT NULL,
    "folderId" TEXT NOT NULL,
    "folderUrl" TEXT,
    "folderName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "google_drive_folder_links_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "google_drive_folder_links_connectionId_organizationTenderId_folderId_key"
  ON "google_drive_folder_links"("connectionId", "organizationTenderId", "folderId");
CREATE INDEX "google_drive_folder_links_connectionId_organizationTenderId_idx"
  ON "google_drive_folder_links"("connectionId", "organizationTenderId");

ALTER TABLE "google_drive_folder_links"
  ADD CONSTRAINT "google_drive_folder_links_connectionId_fkey"
  FOREIGN KEY ("connectionId") REFERENCES "user_organization_google_connections"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
