import type { PrismaClient } from "@prisma/client";
import { requireOrgMembership } from "../auth/org-context.js";
import { notFound } from "../errors.js";

/** Procurement folder structure used while preparing an offer. */
export const WORKSPACE_SECTIONS = [
  { id: "00", label: "ΚΗΜΔΗΣ" },
  { id: "01", label: "Απαιτήσεις / Διακήρυξη" },
  { id: "02", label: "Δικαιολογητικά" },
  { id: "03", label: "Τεχνική Προσφορά" },
  { id: "04", label: "Οικονομική Προσφορά" },
  { id: "05", label: "Δηλώσεις" },
  { id: "06", label: "Λοιπά" },
  { id: "07", label: "Τελική Υποβολή" },
] as const;

export type WorkspaceSectionId = (typeof WORKSPACE_SECTIONS)[number]["id"];

const DEFAULT_SECTION: WorkspaceSectionId = "02";

const normalizeSection = (value?: string | null): WorkspaceSectionId => {
  const found = WORKSPACE_SECTIONS.find((section) => section.id === value);
  return found?.id ?? DEFAULT_SECTION;
};

const workspaceInclude = {
  documentRefs: {
    orderBy: { createdAt: "asc" },
    include: {
      document: true,
      documentVersion: true,
    },
  },
} as const;

const requireOrganizationTender = async (
  prisma: PrismaClient,
  input: { organizationId: string; tenderId: string },
) => {
  const orgTender = await prisma.organizationTender.findUnique({
    where: {
      organizationId_tenderId: {
        organizationId: input.organizationId,
        tenderId: input.tenderId,
      },
    },
    include: { tender: true },
  });
  if (!orgTender) throw notFound("organization_tender_not_found");
  return orgTender;
};

export const ensureTenderWorkspace = async (
  prisma: PrismaClient,
  input: { organizationId: string; organizationTenderId: string; name: string },
) => {
  const existing = await prisma.tenderWorkspace.findUnique({
    where: { organizationTenderId: input.organizationTenderId },
  });
  if (existing) return existing;
  return prisma.tenderWorkspace.create({
    data: {
      organizationId: input.organizationId,
      organizationTenderId: input.organizationTenderId,
      name: input.name,
    },
  });
};

export const getTenderWorkspace = async (
  prisma: PrismaClient,
  input: {
    userId: string;
    organizationId: string | null;
    tenderId: string;
    create?: boolean;
  },
) => {
  const { organizationId } = await requireOrgMembership(
    prisma,
    input.userId,
    input.organizationId,
  );
  const orgTender = await requireOrganizationTender(prisma, {
    organizationId,
    tenderId: input.tenderId,
  });

  let workspace = await prisma.tenderWorkspace.findUnique({
    where: { organizationTenderId: orgTender.id },
    include: workspaceInclude,
  });

  if (!workspace && input.create) {
    await ensureTenderWorkspace(prisma, {
      organizationId,
      organizationTenderId: orgTender.id,
      name: orgTender.tender.referenceNumber,
    });
    workspace = await prisma.tenderWorkspace.findUnique({
      where: { organizationTenderId: orgTender.id },
      include: workspaceInclude,
    });
  }

  if (!workspace) {
    return {
      workspace: null,
      sections: WORKSPACE_SECTIONS.map((section) => ({
        ...section,
        documents: [],
      })),
      documentCount: 0,
    };
  }

  const sections = WORKSPACE_SECTIONS.map((section) => ({
    ...section,
    documents: workspace.documentRefs
      .filter((ref) => normalizeSection(ref.folderHint) === section.id)
      .map((ref) => ({
        id: ref.id,
        documentId: ref.documentId,
        name: ref.document.name,
        status: ref.document.status,
        expiryDate: ref.document.expiryDate,
        version: ref.documentVersion?.version ?? ref.document.version,
        purpose: ref.purpose,
      })),
  }));

  return {
    workspace: {
      id: workspace.id,
      name: workspace.name,
      createdAt: workspace.createdAt,
    },
    sections,
    documentCount: workspace.documentRefs.length,
  };
};

/**
 * Links existing Company Vault documents into the workspace. Already linked
 * documents are moved to the requested section instead of failing.
 */
export const addWorkspaceDocuments = async (
  prisma: PrismaClient,
  input: {
    userId: string;
    organizationId: string | null;
    tenderId: string;
    documentIds: string[];
    section?: string | null;
    purpose?: string | null;
  },
) => {
  const { organizationId, userId } = await requireOrgMembership(
    prisma,
    input.userId,
    input.organizationId,
  );
  const orgTender = await requireOrganizationTender(prisma, {
    organizationId,
    tenderId: input.tenderId,
  });
  const workspace = await ensureTenderWorkspace(prisma, {
    organizationId,
    organizationTenderId: orgTender.id,
    name: orgTender.tender.referenceNumber,
  });

  const folderHint = normalizeSection(input.section);
  const documents = await prisma.vaultDocument.findMany({
    where: { id: { in: input.documentIds }, organizationId },
    include: { versions: { orderBy: { version: "desc" }, take: 1 } },
  });
  if (documents.length !== new Set(input.documentIds).size) {
    throw notFound("vault_document_not_found");
  }

  for (const document of documents) {
    const documentVersionId = document.versions[0]?.id ?? null;
    await prisma.tenderWorkspaceDocumentRef.upsert({
      where: {
        workspaceId_documentId: {
          workspaceId: workspace.id,
          documentId: document.id,
        },
      },
      create: {
        workspaceId: workspace.id,
        documentId: document.id,
        documentVersionId,
        folderHint,
        purpose: input.purpose ?? null,
        linkedByUserId: userId,
      },
      update: {
        folderHint,
        ...(input.purpose ? { purpose: input.purpose } : {}),
      },
    });
  }

  return getTenderWorkspace(prisma, {
    userId: input.userId,
    organizationId,
    tenderId: input.tenderId,
  });
};

export const removeWorkspaceDocument = async (
  prisma: PrismaClient,
  input: {
    userId: string;
    organizationId: string | null;
    tenderId: string;
    refId: string;
  },
) => {
  const { organizationId } = await requireOrgMembership(
    prisma,
    input.userId,
    input.organizationId,
  );
  const ref = await prisma.tenderWorkspaceDocumentRef.findFirst({
    where: { id: input.refId, workspace: { organizationId } },
  });
  if (!ref) throw notFound("workspace_document_ref_not_found");
  await prisma.tenderWorkspaceDocumentRef.delete({ where: { id: ref.id } });

  return getTenderWorkspace(prisma, {
    userId: input.userId,
    organizationId,
    tenderId: input.tenderId,
  });
};
