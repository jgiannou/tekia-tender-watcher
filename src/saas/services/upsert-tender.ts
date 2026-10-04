import type { PrismaClient, RecordType } from "@prisma/client";
import type { KimdisSearchItem } from "./kimdis-search.js";
import { followTender } from "./follow.js";

export const upsertTenderFromKimdisItem = async (
  prisma: PrismaClient,
  item: KimdisSearchItem,
) => {
  const now = new Date();
  const recordType = item.recordType as RecordType;
  return prisma.tender.upsert({
    where: { referenceNumber: item.adam },
    create: {
      referenceNumber: item.adam,
      recordType,
      title: item.title || null,
      contractingAuthority: item.contractingAuthority || null,
      submissionDate: item.submissionDate ? new Date(item.submissionDate) : null,
      signedDate: item.signedDate ? new Date(item.signedDate) : null,
      finalSubmissionDate: item.finalSubmissionDate
        ? new Date(item.finalSubmissionDate)
        : null,
      budgetWithoutVat: item.budgetWithoutVat,
      budgetWithVat: item.budgetWithVat,
      cpvs: item.cpvs,
      officialPdfUrl: item.officialPdfUrl,
      publicKimdisUrl: item.publicKimdisUrl,
      firstSeenAt: now,
      lastSeenAt: now,
    },
    update: {
      title: item.title || null,
      contractingAuthority: item.contractingAuthority || null,
      submissionDate: item.submissionDate ? new Date(item.submissionDate) : null,
      signedDate: item.signedDate ? new Date(item.signedDate) : null,
      finalSubmissionDate: item.finalSubmissionDate
        ? new Date(item.finalSubmissionDate)
        : null,
      budgetWithoutVat: item.budgetWithoutVat,
      budgetWithVat: item.budgetWithVat,
      cpvs: item.cpvs,
      officialPdfUrl: item.officialPdfUrl,
      publicKimdisUrl: item.publicKimdisUrl,
      lastSeenAt: now,
    },
  });
};

export const followKimdisSearchItem = async (
  prisma: PrismaClient,
  input: {
    userId: string;
    organizationId: string;
    item: KimdisSearchItem;
  },
) => {
  const tender = await upsertTenderFromKimdisItem(prisma, input.item);
  const organizationTender = await followTender(prisma, {
    userId: input.userId,
    organizationId: input.organizationId,
    tenderId: tender.id,
  });
  return { tender, organizationTender };
};
