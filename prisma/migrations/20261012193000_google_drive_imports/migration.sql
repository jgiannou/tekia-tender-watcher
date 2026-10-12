-- Phase 2: Google Drive document import records (copy into company vault).

CREATE TYPE "GoogleDriveImportStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED');

CREATE TABLE "google_drive_import_records" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "vaultDocumentId" TEXT,
    "googleFileId" TEXT NOT NULL,
    "googleFileName" TEXT NOT NULL,
    "googleMimeType" TEXT NOT NULL,
    "googleModifiedTime" TIMESTAMP(3),
    "googleMd5Checksum" TEXT,
    "googleVersion" TEXT,
    "exportMimeType" TEXT,
    "targetFolderId" TEXT NOT NULL,
    "status" "GoogleDriveImportStatus" NOT NULL DEFAULT 'PENDING',
    "errorSafe" TEXT,
    "importedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "google_drive_import_records_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "google_drive_import_records_connectionId_status_idx"
  ON "google_drive_import_records"("connectionId", "status");
CREATE INDEX "google_drive_import_records_organizationId_userId_status_idx"
  ON "google_drive_import_records"("organizationId", "userId", "status");
CREATE INDEX "google_drive_import_records_googleFileId_idx"
  ON "google_drive_import_records"("googleFileId");
CREATE INDEX "google_drive_import_records_vaultDocumentId_idx"
  ON "google_drive_import_records"("vaultDocumentId");

ALTER TABLE "google_drive_import_records"
  ADD CONSTRAINT "google_drive_import_records_connectionId_fkey"
  FOREIGN KEY ("connectionId") REFERENCES "user_organization_google_connections"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "google_drive_import_records"
  ADD CONSTRAINT "google_drive_import_records_vaultDocumentId_fkey"
  FOREIGN KEY ("vaultDocumentId") REFERENCES "vault_documents"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
