import type { Prisma, PrismaClient, RecordType } from "@prisma/client";

export type UpsertCanonicalTenderInput = {
  referenceNumber: string;
  recordType: RecordType;
  title?: string | null;
  contractingAuthority?: string | null;
  submissionDate?: Date | null;
  signedDate?: Date | null;
  finalSubmissionDate?: Date | null;
  budgetWithoutVat?: number | null;
  budgetWithVat?: number | null;
  cpvs?: string[];
  parentTenderId?: string | null;
  officialPdfUrl?: string | null;
  publicKimdisUrl?: string | null;
  rawJson?: Prisma.InputJsonValue;
  now?: Date;
};

export const upsertCanonicalTender = async (
  prisma: PrismaClient,
  input: UpsertCanonicalTenderInput,
) => {
  const now = input.now ?? new Date();
  return prisma.tender.upsert({
    where: { referenceNumber: input.referenceNumber },
    create: {
      referenceNumber: input.referenceNumber,
      recordType: input.recordType,
      title: input.title ?? null,
      contractingAuthority: input.contractingAuthority ?? null,
      submissionDate: input.submissionDate ?? null,
      signedDate: input.signedDate ?? null,
      finalSubmissionDate: input.finalSubmissionDate ?? null,
      budgetWithoutVat: input.budgetWithoutVat ?? null,
      budgetWithVat: input.budgetWithVat ?? null,
      cpvs: input.cpvs ?? [],
      parentTenderId: input.parentTenderId ?? null,
      officialPdfUrl: input.officialPdfUrl ?? null,
      publicKimdisUrl: input.publicKimdisUrl ?? null,
      rawJson: input.rawJson ?? undefined,
      firstSeenAt: now,
      lastSeenAt: now,
    },
    update: {
      title: input.title ?? undefined,
      contractingAuthority: input.contractingAuthority ?? undefined,
      submissionDate: input.submissionDate ?? undefined,
      signedDate: input.signedDate ?? undefined,
      finalSubmissionDate: input.finalSubmissionDate ?? undefined,
      budgetWithoutVat: input.budgetWithoutVat ?? undefined,
      budgetWithVat: input.budgetWithVat ?? undefined,
      cpvs: input.cpvs ?? undefined,
      parentTenderId: input.parentTenderId ?? undefined,
      officialPdfUrl: input.officialPdfUrl ?? undefined,
      publicKimdisUrl: input.publicKimdisUrl ?? undefined,
      rawJson: input.rawJson ?? undefined,
      lastSeenAt: now,
    },
  });
};
