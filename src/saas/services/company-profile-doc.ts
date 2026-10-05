import type { PrismaClient } from "@prisma/client";
import { requireOrgMembership } from "../auth/org-context.js";
import {
  buildCompanyProfileDocx,
  GENERATED_COMPANY_PROFILE_NAME,
} from "../templates/company-profile-docx.js";
import { getOrgSettings } from "./org-settings.js";
import { ensureVaultFolders, uploadDocument, uploadNewVersion } from "./vault.js";

const PROFILE_DOC_TYPE = "COMPANY_PROFILE";
const PROFILE_FILENAME = "company-profile-arc-tenders.docx";

/**
 * Generate (or regenerate) the org Company Profile DOCX into folder 08 — Εταιρικό Προφίλ.
 * Idempotent: updates existing generated doc as a new version when present.
 */
export const generateCompanyProfileDocument = async (
  prisma: PrismaClient,
  input: { userId: string; organizationId: string },
) => {
  const { organizationId, userId } = await requireOrgMembership(
    prisma,
    input.userId,
    input.organizationId,
  );

  const settings = await getOrgSettings(prisma, {
    userId,
    organizationId,
  });
  const company = settings.company;
  const companyExtra = company as typeof company & {
    contactName?: string | null;
    portfolioReferences?: string | null;
    techStack?: string | null;
    publicSectorNotes?: string | null;
  };

  const bytes = await buildCompanyProfileDocx(company, {
    contactName: companyExtra.contactName ?? null,
    portfolioReferences: companyExtra.portfolioReferences ?? null,
    techStack: companyExtra.techStack ?? null,
    publicSectorNotes: companyExtra.publicSectorNotes ?? null,
    activities: settings.activities,
  });

  await ensureVaultFolders(prisma, organizationId);
  const folder = await prisma.vaultFolder.findFirst({
    where: { organizationId, slug: "08" },
  });
  const folderId =
    folder?.id ??
    (
      await prisma.vaultFolder.findFirstOrThrow({
        where: {
          organizationId,
          name: { contains: "Εταιρικό Προφίλ" },
        },
      })
    ).id;

  const existing = await prisma.vaultDocument.findFirst({
    where: {
      organizationId,
      documentType: PROFILE_DOC_TYPE,
      OR: [
        { name: GENERATED_COMPANY_PROFILE_NAME },
        { originalFilename: PROFILE_FILENAME },
      ],
    },
    orderBy: { updatedAt: "desc" },
  });

  if (existing) {
    const updated = await uploadNewVersion(prisma, {
      userId,
      organizationId,
      documentId: existing.id,
      bytes: Buffer.from(bytes),
      originalFilename: PROFILE_FILENAME,
      declaredMimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    return {
      document: updated.document,
      created: false,
      name: GENERATED_COMPANY_PROFILE_NAME,
    };
  }

  const created = await uploadDocument(prisma, {
    userId,
    organizationId,
    folderId,
    name: GENERATED_COMPANY_PROFILE_NAME,
    originalFilename: PROFILE_FILENAME,
    bytes: Buffer.from(bytes),
    declaredMimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    documentType: PROFILE_DOC_TYPE,
    noExpiry: true,
    source: "USER_UPLOAD",
    notes: "Αυτόματη δημιουργία από στοιχεία οργανισμού στο ARC Tenders",
  });

  return {
    document: created.document,
    created: true,
    name: GENERATED_COMPANY_PROFILE_NAME,
  };
};
