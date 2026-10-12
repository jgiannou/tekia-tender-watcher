-- Phase 3: Google Drive tender participation folders (snapshot, idempotent jobs).

CREATE TYPE "GoogleDriveFolderStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'PARTIAL', 'FAILED');
CREATE TYPE "GoogleDriveFolderItemStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'SKIPPED');

-- Root folder id is unknown until Drive created it.
ALTER TABLE "google_drive_folder_links" ALTER COLUMN "folderId" DROP NOT NULL;

ALTER TABLE "google_drive_folder_links"
  ADD COLUMN "organizationId" TEXT,
  ADD COLUMN "createdByUserId" TEXT,
  ADD COLUMN "googleAccountId" TEXT,
  ADD COLUMN "googleEmail" TEXT,
  ADD COLUMN "snapshotKey" TEXT,
  ADD COLUMN "status" "GoogleDriveFolderStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "errorSafe" TEXT,
  ADD COLUMN "options" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN "jobEpoch" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "completedAt" TIMESTAMP(3);

-- Backfill any pre-existing rows (none are written by Phase 1/2) from their connection.
UPDATE "google_drive_folder_links" l
SET "organizationId" = c."organizationId",
    "createdByUserId" = c."userId",
    "googleAccountId" = c."googleAccountId",
    "googleEmail" = c."googleEmail",
    "snapshotKey" = l."id",
    "status" = 'SUCCEEDED'
FROM "user_organization_google_connections" c
WHERE c."id" = l."connectionId";

ALTER TABLE "google_drive_folder_links"
  ALTER COLUMN "organizationId" SET NOT NULL,
  ALTER COLUMN "createdByUserId" SET NOT NULL,
  ALTER COLUMN "googleAccountId" SET NOT NULL,
  ALTER COLUMN "googleEmail" SET NOT NULL,
  ALTER COLUMN "snapshotKey" SET NOT NULL;

-- Explicit short names: Postgres truncates identifiers at 63 chars (names would collide).
DROP INDEX IF EXISTS "google_drive_folder_links_connectionId_organizationTenderId_fol";
CREATE UNIQUE INDEX "gdrive_folder_links_conn_tender_folder_key"
  ON "google_drive_folder_links"("connectionId", "organizationTenderId", "folderId");
CREATE UNIQUE INDEX "gdrive_folder_links_conn_tender_snapshot_key"
  ON "google_drive_folder_links"("connectionId", "organizationTenderId", "snapshotKey");
CREATE INDEX "google_drive_folder_links_organizationId_status_idx"
  ON "google_drive_folder_links"("organizationId", "status");

CREATE TABLE "google_drive_folder_items" (
    "id" TEXT NOT NULL,
    "linkId" TEXT NOT NULL,
    "itemKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "section" TEXT,
    "displayName" TEXT NOT NULL,
    "sourceRef" TEXT,
    "sortOrder" INTEGER NOT NULL,
    "status" "GoogleDriveFolderItemStatus" NOT NULL DEFAULT 'PENDING',
    "driveFileId" TEXT,
    "errorSafe" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "google_drive_folder_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "google_drive_folder_items_linkId_itemKey_key"
  ON "google_drive_folder_items"("linkId", "itemKey");
CREATE INDEX "google_drive_folder_items_linkId_status_idx"
  ON "google_drive_folder_items"("linkId", "status");

ALTER TABLE "google_drive_folder_items"
  ADD CONSTRAINT "google_drive_folder_items_linkId_fkey"
  FOREIGN KEY ("linkId") REFERENCES "google_drive_folder_links"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
