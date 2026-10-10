import type { PrismaClient, RecordType } from "@prisma/client";
import {
  searchTedNotices,
  type TedNoticeRef,
} from "../sources/ted-adapter.js";
import type { KimdisSearchItem } from "./kimdis-search.js";
import { kimdisItemFromTender } from "./kimdis-search.js";
import { buildProvenance, tedReferencePrefix } from "./source-provenance.js";
import { followTender } from "./follow.js";

const mergeTedNotice = (
  base: TedNoticeRef,
  live: TedNoticeRef | null,
): TedNoticeRef => {
  if (!live) return base;
  return {
    ...base,
    ...live,
    title: live.title ?? base.title,
    buyerName: live.buyerName ?? base.buyerName,
    publicationDate: live.publicationDate ?? base.publicationDate,
    noticeType: live.noticeType ?? base.noticeType,
    cpvs: live.cpvs.length ? live.cpvs : base.cpvs,
    deadline: live.deadline ?? base.deadline,
    estimatedValue: live.estimatedValue ?? base.estimatedValue,
    currency: live.currency ?? base.currency,
    nutsCode: live.nutsCode ?? base.nutsCode,
    placeCity: live.placeCity ?? base.placeCity,
    contractNature: live.contractNature ?? base.contractNature,
    buyerCity: live.buyerCity ?? base.buyerCity,
    buyerCountry: live.buyerCountry ?? base.buyerCountry,
    noticeSubtype: live.noticeSubtype ?? base.noticeSubtype,
    url: live.url || base.url,
    pdfUrl: live.pdfUrl ?? base.pdfUrl,
    provenance: "ted",
  };
};

/** Re-fetch from TED when the client payload lacks estimated value. */
export const enrichTedNotice = async (
  notice: TedNoticeRef,
): Promise<TedNoticeRef> => {
  if (notice.estimatedValue != null && notice.cpvs.length > 0) {
    return notice;
  }
  const live = await fetchTedNoticeByPublicationNumber(notice.publicationNumber);
  return mergeTedNotice(notice, live);
};

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
      budgetWithoutVat: notice.estimatedValue,
      cpvs: notice.cpvs,
      officialPdfUrl: notice.pdfUrl,
      publicKimdisUrl: notice.url,
      nutsCode: notice.nutsCode,
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
      budgetWithoutVat: notice.estimatedValue,
      cpvs: notice.cpvs,
      officialPdfUrl: notice.pdfUrl,
      publicKimdisUrl: notice.url,
      nutsCode: notice.nutsCode,
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
  const notice = await enrichTedNotice(input.notice);
  const tender = await upsertTenderFromTedNotice(prisma, notice);
  const organizationTender = await followTender(prisma, {
    userId: input.userId,
    organizationId: input.organizationId,
    tenderId: tender.id,
  });
  return { tender, organizationTender };
};

/** Persist TED notice for in-app detail without starting follow. */
export const openTedNotice = async (
  prisma: PrismaClient,
  notice: TedNoticeRef,
) => {
  const enriched = await enrichTedNotice(notice);
  const tender = await upsertTenderFromTedNotice(prisma, enriched);
  return {
    tender: { id: tender.id, referenceNumber: tender.referenceNumber },
    item: kimdisItemFromTender(tender),
  };
};

export const fetchTedNoticeByPublicationNumber = async (
  publicationNumber: string,
): Promise<TedNoticeRef | null> => {
  const clean = publicationNumber.trim();
  if (!clean) return null;
  const result = await searchTedNotices({
    query: `publication-number=${clean}`,
    limit: 5,
    page: 1,
  });
  if (result.blocker) return null;
  return (
    result.notices.find((row) => row.publicationNumber === clean) ??
    result.notices[0] ??
    null
  );
};

/**
 * Load TED tender for detail pages: local DB first, then live TED fetch + upsert.
 */
export const resolveTedRecordForDetail = async (
  prisma: PrismaClient,
  referenceOrPublication: string,
): Promise<{ item: KimdisSearchItem; tenderId: string; referenceNumber: string } | null> => {
  const raw = referenceOrPublication.trim();
  const referenceNumber = raw.startsWith(tedReferencePrefix)
    ? raw
    : tedReferenceNumber(raw);
  const publicationNumber = publicationNumberFromTedReference(referenceNumber);
  if (!publicationNumber) return null;

  const local = await prisma.tender.findUnique({
    where: { referenceNumber },
  });
  if (local) {
    return {
      item: kimdisItemFromTender(local),
      tenderId: local.id,
      referenceNumber: local.referenceNumber,
    };
  }

  const notice = await fetchTedNoticeByPublicationNumber(publicationNumber);
  if (!notice) return null;
  const opened = await openTedNotice(prisma, notice);
  return {
    item: opened.item,
    tenderId: opened.tender.id,
    referenceNumber: opened.tender.referenceNumber,
  };
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
