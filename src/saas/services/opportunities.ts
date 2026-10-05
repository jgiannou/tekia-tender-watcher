import { Prisma, type PrismaClient } from "@prisma/client";
import { requireOrgMembership } from "../auth/org-context.js";
import { notFound } from "../errors.js";
import { parseMatchMeta } from "./watch-match.js";

const opportunityWhere = (organizationId: string, tenderId?: string) => ({
  organizationId,
  ...(tenderId ? { tenderId } : {}),
  pipelineStage: { not: "DISMISSED" as const },
  // SQL NULL trap: `NOT (ignoreReason IN (...))` excludes null rows.
  AND: [
    {
      OR: [
        { relevanceStatus: null },
        { NOT: { relevanceStatus: "EXPIRED" as const } },
      ],
    },
    {
      OR: [
        { ignoreReason: null },
        {
          ignoreReason: {
            notIn: ["user_marked_expired", "user_dismissed"],
          },
        },
      ],
    },
    {
      OR: [
        { score: { not: null } },
        { watchProfileId: { not: null } },
        { matchMeta: { not: Prisma.DbNull } },
      ],
    },
  ],
});

const passesOpportunityFilter = (row: {
  score: number | null;
  watchProfileId: string | null;
  matchMeta: unknown;
}) => {
  if (row.score != null && row.score > 0) return true;
  if (row.watchProfileId) return true;
  const meta = parseMatchMeta(row.matchMeta);
  return (meta?.matchedProfiles.length ?? 0) > 0;
};

export type OpportunitySort =
  | "newest"
  | "oldest"
  | "score"
  | "deadline";

const opportunityOrderBy = (
  sort: OpportunitySort,
): Prisma.OrganizationTenderOrderByWithRelationInput[] => {
  switch (sort) {
    case "oldest":
      return [
        { tender: { submissionDate: "asc" } },
        { updatedAt: "asc" },
      ];
    case "score":
      return [{ score: "desc" }, { tender: { submissionDate: "desc" } }];
    case "deadline":
      return [
        { tender: { finalSubmissionDate: "asc" } },
        { tender: { submissionDate: "desc" } },
      ];
    case "newest":
    default:
      return [
        { tender: { submissionDate: "desc" } },
        { score: "desc" },
        { updatedAt: "desc" },
      ];
  }
};

const dateMs = (value: Date | string | null | undefined): number => {
  if (!value) return Number.NaN;
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(ms) ? ms : Number.NaN;
};

/** Stable in-memory sort (also used after client-side profile filtering). */
export const sortOpportunityRows = <
  T extends {
    score: number | null;
    updatedAt?: Date | string;
    tender: {
      submissionDate: Date | string | null;
      finalSubmissionDate?: Date | string | null;
    };
  },
>(
  rows: T[],
  sort: OpportunitySort,
): T[] => {
  const copy = [...rows];
  copy.sort((a, b) => {
    const scoreA = a.score ?? -1;
    const scoreB = b.score ?? -1;
    const subA = dateMs(a.tender.submissionDate);
    const subB = dateMs(b.tender.submissionDate);
    const deadA = dateMs(a.tender.finalSubmissionDate);
    const deadB = dateMs(b.tender.finalSubmissionDate);
    const updA = dateMs(a.updatedAt);
    const updB = dateMs(b.updatedAt);

    const cmpNullableDesc = (x: number, y: number) => {
      if (Number.isNaN(x) && Number.isNaN(y)) return 0;
      if (Number.isNaN(x)) return 1;
      if (Number.isNaN(y)) return -1;
      return y - x;
    };
    const cmpNullableAsc = (x: number, y: number) => {
      if (Number.isNaN(x) && Number.isNaN(y)) return 0;
      if (Number.isNaN(x)) return 1;
      if (Number.isNaN(y)) return -1;
      return x - y;
    };

    if (sort === "oldest") {
      const byDate = cmpNullableAsc(subA, subB);
      if (byDate !== 0) return byDate;
      return cmpNullableAsc(updA, updB);
    }
    if (sort === "score") {
      if (scoreB !== scoreA) return scoreB - scoreA;
      return cmpNullableDesc(subA, subB);
    }
    if (sort === "deadline") {
      const byDeadline = cmpNullableAsc(deadA, deadB);
      if (byDeadline !== 0) return byDeadline;
      return cmpNullableDesc(subA, subB);
    }
    // newest
    const byDate = cmpNullableDesc(subA, subB);
    if (byDate !== 0) return byDate;
    if (scoreB !== scoreA) return scoreB - scoreA;
    return cmpNullableDesc(updA, updB);
  });
  return copy;
};

export const listOpportunities = async (
  prisma: PrismaClient,
  input: {
    userId: string;
    organizationId: string | null;
    /** Cap returned rows (counts still reflect the full matching set). */
    limit?: number;
    /** Fetch a single organization tender opportunity by tender id. */
    tenderId?: string;
    /** Default: newest (KIMDIS submission / publication date). */
    sort?: OpportunitySort;
  },
) => {
  const { organizationId } = await requireOrgMembership(
    prisma,
    input.userId,
    input.organizationId,
  );

  const sort: OpportunitySort = input.sort ?? "newest";
  const rows = await prisma.organizationTender.findMany({
    where: opportunityWhere(organizationId, input.tenderId),
    include: { tender: true, watchProfile: true },
    orderBy: opportunityOrderBy(sort),
  });

  const filtered = sortOpportunityRows(
    rows.filter(passesOpportunityFilter),
    sort,
  );
  const unreadNew = await loadUnreadNewOpportunityIds(
    prisma,
    organizationId,
    filtered.map((row) => row.id),
  );

  const withFlags = filtered.map((row) => {
    const attentionEventId = unreadNew.get(row.id) ?? null;
    return {
      ...row,
      isNew: Boolean(attentionEventId),
      attentionEventId,
    };
  });

  // Keep unread search matches at the top so new arrivals are obvious.
  withFlags.sort((a, b) => Number(b.isNew) - Number(a.isNew));

  const unfollowed = withFlags.filter((row) => !row.following).length;
  const opportunities =
    input.limit != null
      ? withFlags.slice(0, Math.max(0, input.limit))
      : withFlags;

  return {
    opportunities,
    total: withFlags.length,
    unfollowed,
    unreadNewCount: unreadNew.size,
  };
};

const loadUnreadNewOpportunityIds = async (
  prisma: PrismaClient,
  organizationId: string,
  organizationTenderIds: string[],
): Promise<Map<string, string>> => {
  const map = new Map<string, string>();
  if (organizationTenderIds.length === 0) return map;
  const events = await prisma.organizationAttentionEvent.findMany({
    where: {
      organizationId,
      organizationTenderId: { in: organizationTenderIds },
      type: "NEW_OPPORTUNITY",
      readAt: null,
    },
    select: { id: true, organizationTenderId: true },
    orderBy: { createdAt: "desc" },
  });
  for (const event of events) {
    if (!map.has(event.organizationTenderId)) {
      map.set(event.organizationTenderId, event.id);
    }
  }
  return map;
};

/** Mark NEW_OPPORTUNITY attention as read once the user opens the opportunity. */
export const markOpportunitySeen = async (
  prisma: PrismaClient,
  input: {
    userId: string;
    organizationId: string | null;
    organizationTenderId: string;
  },
) => {
  const { organizationId } = await requireOrgMembership(
    prisma,
    input.userId,
    input.organizationId,
  );

  const orgTender = await prisma.organizationTender.findFirst({
    where: {
      id: input.organizationTenderId,
      organizationId,
    },
    select: { id: true },
  });
  if (!orgTender) throw notFound("opportunity_not_found");

  const result = await prisma.organizationAttentionEvent.updateMany({
    where: {
      organizationId,
      organizationTenderId: orgTender.id,
      type: "NEW_OPPORTUNITY",
      readAt: null,
    },
    data: { readAt: new Date() },
  });

  return { ok: true as const, updated: result.count };
};
