import type { PrismaClient, RecordType } from "@prisma/client";
import type { TedNoticeRef } from "../sources/ted-adapter.js";
import { buildProvenance, tedReferencePrefix } from "./source-provenance.js";
import { followTender } from "./follow.js";

/** Stable local key so TED notices never collide with KIMDIS ADAMs. */
export const tedReferenceNumber = (publicationNumber: string): string =>
  `${tedReferencePrefix}${publicationNumber.trim()}`;

export const publicationNumberFromTedReference = (
  referenceNumber: string,
): string | null => {
  if (!referenceNumber.startsWith(tedReferencePrefix)) return null;
  const pub = referenceNumber.slice(tedReferencePrefix.length).trim();
  return pub || null;
};

export const upsertTenderFromTedNotice = async (
  prisma: PrismaClient,
  notice: TedNoticeRef,
) => {
  const now = new Date();
  const referenceNumber = tedReferenceNumber(notice.publicationNumber);
  const recordType = "PROC" as RecordType;
  const provenance = buildProvenance({
    system: "ted",
    externalId: notice.publicationNumber,
    canonicalUrl: notice.url,
    noticeType: notice.noticeType,
    publicationDate: notice.publicationDate,
    fetchedAt: now,
  });
  const deadlineMs = notice.deadline ? Date.parse(notice.deadline) : NaN;
  const finalSubmissionDate = Number.isFinite(deadlineMs)
    ? new Date(deadlineMs)
    : null;
  const pubMs = notice.publicationDate
    ? Date.parse(notice.publicationDate)
    : NaN;
  const submissionDate = Number.isFinite(pubMs) ? new Date(pubMs) : null;

  return prisma.tender.upsert({
    where: { referenceNumber },
    create: {
      referenceNumber,
      recordType,
      title: notice.title,
      contractingAuthority: notice.buyerName,
      submissionDate,
      finalSubmissionDate,
      cpvs: notice.cpvs,
      officialPdfUrl: notice.pdfUrl,
      publicKimdisUrl: notice.url,
      stage: notice.noticeType,
      sourceFingerprint: `ted:${notice.publicationNumber}`,
      rawJson: { notice, provenance } as object,
      firstSeenAt: now,
      lastSeenAt: now,
    },
    update: {
      title: notice.title,
      contractingAuthority: notice.buyerName,
      submissionDate,
      finalSubmissionDate,
      cpvs: notice.cpvs,
      officialPdfUrl: notice.pdfUrl,
      publicKimdisUrl: notice.url,
      stage: notice.noticeType,
      sourceFingerprint: `ted:${notice.publicationNumber}`,
      rawJson: { notice, provenance } as object,
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

export const tedNoticeSnapshot = (notice: TedNoticeRef) =>
  JSON.stringify({
    title: notice.title,
    buyerName: notice.buyerName,
    deadline: notice.deadline,
    noticeType: notice.noticeType,
    publicationDate: notice.publicationDate,
    cpvs: notice.cpvs,
  });
