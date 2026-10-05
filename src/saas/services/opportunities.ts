import { Prisma, type PrismaClient } from "@prisma/client";
import { requireOrgMembership } from "../auth/org-context.js";
import { parseMatchMeta } from "./watch-match.js";

const opportunityWhere = (organizationId: string, tenderId?: string) => ({
  organizationId,
  ...(tenderId ? { tenderId } : {}),
  pipelineStage: { not: "DISMISSED" as const },
  // SQL NULL trap: `NOT (ignoreReason IN (...))` excludes null rows.
  AND: [
    { NOT: { relevanceStatus: "EXPIRED" as const } },
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

export const listOpportunities = async (
  prisma: PrismaClient,
  input: {
    userId: string;
    organizationId: string | null;
    /** Cap returned rows (counts still reflect the full matching set). */
    limit?: number;
    /** Fetch a single organization tender opportunity by tender id. */
    tenderId?: string;
  },
) => {
  const { organizationId } = await requireOrgMembership(
    prisma,
    input.userId,
    input.organizationId,
  );

  const rows = await prisma.organizationTender.findMany({
    where: opportunityWhere(organizationId, input.tenderId),
    include: { tender: true, watchProfile: true },
    orderBy: [{ score: "desc" }, { updatedAt: "desc" }],
  });

  const filtered = rows.filter(passesOpportunityFilter);
  const unfollowed = filtered.filter((row) => !row.following).length;
  const opportunities =
    input.limit != null ? filtered.slice(0, Math.max(0, input.limit)) : filtered;

  return {
    opportunities,
    total: filtered.length,
    unfollowed,
  };
};
