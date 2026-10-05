/**
 * Force-rescan the local QA watch profile so scores refresh under the new scorer.
 * Run: pnpm exec tsx scripts/qa-rescan-local-profile.ts
 */
import { PrismaClient } from "@prisma/client";
import { createKimdisClient } from "../src/kimdis/client.js";
import { runWatchProfileScan } from "../src/saas/services/watch-profiles.js";

const EMAIL = "johnn.giannousis@gmail.com";
const prisma = new PrismaClient();

const main = async () => {
  const user = await prisma.user.findFirst({ where: { email: EMAIL } });
  if (!user) throw new Error("user_not_found");
  const membership = await prisma.organizationMember.findFirst({
    where: { userId: user.id },
  });
  if (!membership) throw new Error("membership_not_found");

  const profile = await prisma.watchProfile.findFirst({
    where: { organizationId: membership.organizationId, enabled: true },
    orderBy: { updatedAt: "desc" },
  });
  if (!profile) throw new Error("profile_not_found");

  // Clear stuck RUNNING if any
  if (profile.scanState === "RUNNING") {
    await prisma.watchProfile.update({
      where: { id: profile.id },
      data: { scanState: "FAILED", lastScanError: "qa_force_reset" },
    });
  }

  const kimdis = createKimdisClient(
    process.env.KIMDIS_BASE_URL || "https://opendata.eprocurement.gov.gr",
    Number(process.env.HTTP_TIMEOUT_MS || 30_000),
  );

  console.log("rescanning", profile.id, profile.name);
  const result = await runWatchProfileScan(prisma, kimdis, profile.id);
  console.log({
    scanState: result.scanState,
    matchCount: result.matchCount,
    lastScanError: result.lastScanError,
  });

  const scores = await prisma.organizationTender.findMany({
    where: {
      organizationId: membership.organizationId,
      watchProfileId: profile.id,
    },
    select: { score: true },
    take: 200,
  });
  const buckets = { under50: 0, from50to79: 0, from80to99: 0, exactly100: 0, nullish: 0 };
  for (const row of scores) {
    if (row.score == null) buckets.nullish += 1;
    else if (row.score >= 100) buckets.exactly100 += 1;
    else if (row.score >= 80) buckets.from80to99 += 1;
    else if (row.score >= 50) buckets.from50to79 += 1;
    else buckets.under50 += 1;
  }
  console.log("score_buckets", buckets, "n=", scores.length);
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
