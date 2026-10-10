import type { PrismaClient, RecordType } from "@prisma/client";
import type { TedNoticeRef } from "../sources/ted-adapter.js";
import { followTender } from "./follow.js";

/** Stable local key so TED notices never collide with KIMDIS ADAMs. */
export const tedReferenceNumber = (publicationNumber: string): string =>
  `TED:${publicationNumber.trim()}`;

export const upsertTenderFromTedNotice = async (
  prisma: PrismaClient,
  notice: TedNoticeRef,
) => {
  const now = new Date();
  const referenceNumber = tedReferenceNumber(notice.publicationNumber);
  const recordType = "PROC" as RecordType;
  return prisma.tender.upsert({
    where: { referenceNumber },
    create: {
      referenceNumber,
      recordType,
      title: notice.title,
      contractingAuthority: notice.buyerName,
      submissionDate: notice.publicationDate
        ? new Date(notice.publicationDate)
        : null,
      finalSubmissionDate: notice.deadline ? new Date(notice.deadline) : null,
      cpvs: notice.cpvs,
      officialPdfUrl: notice.pdfUrl,
      publicKimdisUrl: notice.url,
      stage: notice.noticeType,
      rawJson: notice as unknown as object,
      firstSeenAt: now,
      lastSeenAt: now,
    },
    update: {
      title: notice.title,
      contractingAuthority: notice.buyerName,
      submissionDate: notice.publicationDate
        ? new Date(notice.publicationDate)
        : null,
      finalSubmissionDate: notice.deadline ? new Date(notice.deadline) : null,
      cpvs: notice.cpvs,
      officialPdfUrl: notice.pdfUrl,
      publicKimdisUrl: notice.url,
      stage: notice.noticeType,
      rawJson: notice as unknown as object,
      lastSeenAt: now,
    },
  });
};

export const followTedNotice = async (
  prisma: PrismaClient,
  input: {
    userId: string;
    organizationId: string;
    notice: TedNoticeRef;
  },
) => {
  const tender = await upsertTenderFromTedNotice(prisma, input.notice);
  const organizationTender = await followTender(prisma, {
    userId: input.userId,
    organizationId: input.organizationId,
    tenderId: tender.id,
  });
  return { tender, organizationTender };
};
