-- AlterEnum
ALTER TYPE "VaultDocumentSource" ADD VALUE 'IMPORTED';

-- AlterTable
ALTER TABLE "vault_documents"
  ADD COLUMN "originalFilename" TEXT,
  ADD COLUMN "documentType" TEXT,
  ADD COLUMN "checksum" TEXT,
  ADD COLUMN "noExpiry" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "vault_document_versions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalFilename" TEXT,
    "mimeType" TEXT,
    "fileSize" INTEGER,
    "checksum" TEXT,
    "uploadedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vault_document_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submission_document_snapshots" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "documentVersionId" TEXT NOT NULL,
    "purpose" TEXT,
    "nameSnapshot" TEXT NOT NULL,
    "storageKeySnapshot" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "submission_document_snapshots_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "tender_workspace_document_refs"
  ADD COLUMN "documentVersionId" TEXT,
  ADD COLUMN "purpose" TEXT,
  ADD COLUMN "linkedByUserId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "vault_document_versions_documentId_version_key" ON "vault_document_versions"("documentId", "version");

-- CreateIndex
CREATE INDEX "vault_document_versions_organizationId_documentId_idx" ON "vault_document_versions"("organizationId", "documentId");

-- CreateIndex
CREATE INDEX "vault_documents_organizationId_name_idx" ON "vault_documents"("organizationId", "name");

-- CreateIndex
CREATE INDEX "tender_workspace_document_refs_documentVersionId_idx" ON "tender_workspace_document_refs"("documentVersionId");

-- CreateIndex
CREATE INDEX "submission_document_snapshots_submissionId_idx" ON "submission_document_snapshots"("submissionId");

-- CreateIndex
CREATE INDEX "submission_document_snapshots_organizationId_submissionId_idx" ON "submission_document_snapshots"("organizationId", "submissionId");

-- AddForeignKey
ALTER TABLE "vault_document_versions" ADD CONSTRAINT "vault_document_versions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vault_document_versions" ADD CONSTRAINT "vault_document_versions_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "vault_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tender_workspace_document_refs" ADD CONSTRAINT "tender_workspace_document_refs_documentVersionId_fkey" FOREIGN KEY ("documentVersionId") REFERENCES "vault_document_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission_document_snapshots" ADD CONSTRAINT "submission_document_snapshots_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission_document_snapshots" ADD CONSTRAINT "submission_document_snapshots_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission_document_snapshots" ADD CONSTRAINT "submission_document_snapshots_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "vault_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission_document_snapshots" ADD CONSTRAINT "submission_document_snapshots_documentVersionId_fkey" FOREIGN KEY ("documentVersionId") REFERENCES "vault_document_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
