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
      nutsCode: item.nutsCode ?? null,
      contractEndsAt: item.contractEndsAt ? new Date(item.contractEndsAt) : null,
      awardAmount: item.awardAmount ?? null,
      winnerName: item.winnerName ?? null,
      diavgeiaAda: item.diavgeiaAda ?? null,
      diavgeiaUrl: item.diavgeiaAda
        ? `https://diavgeia.gov.gr/decision/view/${encodeURIComponent(item.diavgeiaAda)}`
        : null,
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
      ...(item.nutsCode ? { nutsCode: item.nutsCode } : {}),
      ...(item.contractEndsAt
        ? { contractEndsAt: new Date(item.contractEndsAt) }
        : {}),
      ...(item.awardAmount != null ? { awardAmount: item.awardAmount } : {}),
      ...(item.winnerName ? { winnerName: item.winnerName } : {}),
      ...(item.diavgeiaAda
        ? {
            diavgeiaAda: item.diavgeiaAda,
            diavgeiaUrl: `https://diavgeia.gov.gr/decision/view/${encodeURIComponent(item.diavgeiaAda)}`,
          }
        : {}),
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
