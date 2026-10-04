-- CreateEnum
CREATE TYPE "VaultDocumentStatus" AS ENUM ('VALID', 'EXPIRING_SOON', 'EXPIRED', 'NO_EXPIRY');

-- CreateEnum
CREATE TYPE "VaultDocumentSource" AS ENUM ('USER_UPLOAD', 'GEMI', 'GENERATED');

-- CreateTable
CREATE TABLE "vault_folders" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "parentId" TEXT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vault_folders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vault_documents" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "folderId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mimeType" TEXT,
    "storageKey" TEXT,
    "fileSize" INTEGER,
    "issueDate" TIMESTAMP(3),
    "expiryDate" TIMESTAMP(3),
    "status" "VaultDocumentStatus" NOT NULL DEFAULT 'NO_EXPIRY',
    "version" INTEGER NOT NULL DEFAULT 1,
    "notes" TEXT,
    "source" "VaultDocumentSource" NOT NULL DEFAULT 'USER_UPLOAD',
    "uploadedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vault_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tender_workspaces" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "organizationTenderId" TEXT,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tender_workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tender_workspace_document_refs" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "folderHint" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tender_workspace_document_refs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vault_folders_organizationId_parentId_idx" ON "vault_folders"("organizationId", "parentId");

-- CreateIndex
CREATE INDEX "vault_folders_organizationId_parentId_slug_idx" ON "vault_folders"("organizationId", "parentId", "slug");

-- Slug uniqueness: nested folders (parentId NOT NULL)
CREATE UNIQUE INDEX "vault_folders_org_parent_slug_key" ON "vault_folders"("organizationId", "parentId", "slug") WHERE "parentId" IS NOT NULL;

-- Slug uniqueness: root folders (parentId IS NULL)
CREATE UNIQUE INDEX "vault_folders_org_root_slug_key" ON "vault_folders"("organizationId", "slug") WHERE "parentId" IS NULL;

-- CreateIndex
CREATE INDEX "vault_documents_organizationId_folderId_idx" ON "vault_documents"("organizationId", "folderId");

-- CreateIndex
CREATE UNIQUE INDEX "tender_workspaces_organizationTenderId_key" ON "tender_workspaces"("organizationTenderId");

-- CreateIndex
CREATE INDEX "tender_workspaces_organizationId_idx" ON "tender_workspaces"("organizationId");

-- CreateIndex
CREATE INDEX "tender_workspace_document_refs_documentId_idx" ON "tender_workspace_document_refs"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "tender_workspace_document_refs_workspaceId_documentId_key" ON "tender_workspace_document_refs"("workspaceId", "documentId");

-- AddForeignKey
ALTER TABLE "vault_folders" ADD CONSTRAINT "vault_folders_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vault_folders" ADD CONSTRAINT "vault_folders_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "vault_folders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vault_documents" ADD CONSTRAINT "vault_documents_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vault_documents" ADD CONSTRAINT "vault_documents_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "vault_folders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tender_workspaces" ADD CONSTRAINT "tender_workspaces_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tender_workspaces" ADD CONSTRAINT "tender_workspaces_organizationTenderId_fkey" FOREIGN KEY ("organizationTenderId") REFERENCES "organization_tenders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tender_workspace_document_refs" ADD CONSTRAINT "tender_workspace_document_refs_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "tender_workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tender_workspace_document_refs" ADD CONSTRAINT "tender_workspace_document_refs_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "vault_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
