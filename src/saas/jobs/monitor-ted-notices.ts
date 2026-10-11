import type { PrismaClient } from "@prisma/client";
import { searchTedNotices } from "../sources/ted-adapter.js";
import { pruneAttentionEventsForOrg } from "../services/attention.js";
import { queueAttentionEmail } from "../services/notify.js";
import {
  deadlineDayKey,
  tedDeadlineChangeTitle,
  tedNoticeUpdateTitle,
} from "../services/ted-change-copy.js";
import {
  publicationNumberFromTedReference,
  tedNoticeSnapshot,
  upsertTenderFromTedNotice,
} from "../services/ted-notices.js";
import { tedReferencePrefix } from "../services/source-provenance.js";

export type MonitorTedNoticesResult = {
  followedTedTenders: number;
  refreshed: number;
  attentionEventsCreated: number;
  errors: string[];
};

const isoOrNull = (value: Date | null | undefined): string | null =>
  value ? value.toISOString() : null;

/**
 * Re-fetch followed TED notices and emit attention on deadline / content changes.
 * Does not invent KIMDIS RELATED_* links.
 */
export const monitorTedFollowedNotices = async (
  prisma: PrismaClient,
): Promise<MonitorTedNoticesResult> => {
  const active = await prisma.organizationTender.findMany({
    where: {
      monitoringActive: true,
      monitoringStoppedAt: null,
      tender: { referenceNumber: { startsWith: tedReferencePrefix } },
    },
    select: {
      id: true,
      organizationId: true,
      tenderId: true,
      tender: {
        select: {
          id: true,
          referenceNumber: true,
          title: true,
          stage: true,
          finalSubmissionDate: true,
          rawJson: true,
        },
      },
    },
  });

  const byTender = new Map<string, typeof active>();
  for (const row of active) {
    const list = byTender.get(row.tenderId) ?? [];
    list.push(row);
    byTender.set(row.tenderId, list);
  }

  let refreshed = 0;
  let attentionEventsCreated = 0;
  const errors: string[] = [];
  const now = new Date();

  for (const [tenderId, orgRows] of byTender) {
    const source = orgRows[0]!.tender;
    const publicationNumber = publicationNumberFromTedReference(
      source.referenceNumber,
    );
    if (!publicationNumber) continue;

    const search = await searchTedNotices({
      query: `publication-number=${publicationNumber}`,
      limit: 1,
      page: 1,
    });
    if (search.blocker) {
      errors.push(search.blocker);
      continue;
    }
    const notice =
      search.notices.find((row) => row.publicationNumber === publicationNumber) ??
      search.notices[0];
    if (!notice) continue;

    refreshed += 1;
    const previousDeadline = isoOrNull(source.finalSubmissionDate);
    const previousTitle = source.title ?? null;
    const previousType = source.stage ?? null;
    const previousSnap =
      source.rawJson &&
      typeof source.rawJson === "object" &&
      "notice" in (source.rawJson as object)
        ? tedNoticeSnapshot(
            (source.rawJson as { notice: Parameters<typeof tedNoticeSnapshot>[0] })
              .notice,
          )
        : null;

    await upsertTenderFromTedNotice(prisma, notice);

    const nextDeadline = notice.deadline;
    const deadlineChanged =
      deadlineDayKey(previousDeadline) !== deadlineDayKey(nextDeadline);
    const contentChanged =
      (previousTitle ?? "") !== (notice.title ?? "") ||
      (previousType ?? "") !== (notice.noticeType ?? "") ||
      (previousSnap != null && previousSnap !== tedNoticeSnapshot(notice));

    if (!deadlineChanged && !contentChanged) {
      await prisma.organizationTender.updateMany({
        where: { tenderId, monitoringActive: true },
        data: { lastRelatedCheckAt: now },
      });
      continue;
    }

    const changeKind = deadlineChanged ? "deadline" : "notice_update";
    const checkedAt = now.toISOString();
    const title = deadlineChanged
      ? tedDeadlineChangeTitle(previousDeadline, nextDeadline)
      : tedNoticeUpdateTitle();
    const dedupeKey = `TED_UPDATE:${tenderId}:${changeKind}:${tedNoticeSnapshot(notice)}`;

    for (const orgRow of orgRows) {
      const existing = await prisma.organizationAttentionEvent.findFirst({
        where: { organizationId: orgRow.organizationId, dedupeKey },
        select: { id: true },
      });
      if (existing) continue;

      const event = await prisma.organizationAttentionEvent.create({
        data: {
          organizationId: orgRow.organizationId,
          organizationTenderId: orgRow.id,
          relatedTenderId: tenderId,
          type: "DEADLINE_CHANGED",
          title,
          dedupeKey,
          metadata: {
            changeKind,
            sourceSystem: "ted",
            publicationNumber,
            previousDeadline,
            nextDeadline,
            checkedAt,
            canonicalUrl: notice.url,
            tenderTitle: notice.title ?? previousTitle,
          },
        },
      });
      attentionEventsCreated += 1;
      await pruneAttentionEventsForOrg(prisma, orgRow.organizationId);
      await queueAttentionEmail(prisma, event.id);
    }

    await prisma.organizationTender.updateMany({
      where: { tenderId, monitoringActive: true },
      data: {
        lastRelatedCheckAt: now,
        latestRelatedActAt: now,
      },
    });
  }

  return {
    followedTedTenders: byTender.size,
    refreshed,
    attentionEventsCreated,
    errors,
  };
};
