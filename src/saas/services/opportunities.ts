import { Prisma, type PrismaClient } from "@prisma/client";
import { requireOrgMembership } from "../auth/org-context.js";
import { parseMatchMeta } from "./watch-match.js";

export const listOpportunities = async (
  prisma: PrismaClient,
  input: { userId: string; organizationId: string | null },
) => {
  const { organizationId } = await requireOrgMembership(
    prisma,
    input.userId,
    input.organizationId,
  );

  const rows = await prisma.organizationTender.findMany({
    where: {
      organizationId,
      OR: [
        { score: { not: null } },
        { watchProfileId: { not: null } },
        { matchMeta: { not: Prisma.DbNull } },
      ],
    },
    include: { tender: true, watchProfile: true },
    orderBy: [{ score: "desc" }, { updatedAt: "desc" }],
  });

  return rows.filter((row) => {
    if (row.score != null && row.score > 0) return true;
    if (row.watchProfileId) return true;
    const meta = parseMatchMeta(row.matchMeta);
    return (meta?.matchedProfiles.length ?? 0) > 0;
  });
};
