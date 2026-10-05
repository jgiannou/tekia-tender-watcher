/**
 * Repair local QA org state so full/journey asserts can pass:
 * - PREPARING workspace has vault docs linked
 * - at least one SUBMITTED + monitoringActive
 * - at least one DISMISSED related-act link (keeps one CONFIRMED)
 */
import { PrismaClient } from "@prisma/client";
import { addWorkspaceDocuments } from "../src/saas/services/workspace.js";
import { startPreparation } from "../src/saas/services/workflow.js";
import { recordFormalSubmission } from "../src/saas/services/submission.js";

const EMAIL = "johnn.giannousis@gmail.com";
const prisma = new PrismaClient();

const main = async () => {
  const user = await prisma.user.findFirstOrThrow({ where: { email: EMAIL } });
  const membership = await prisma.organizationMember.findFirstOrThrow({
    where: { userId: user.id },
  });
  const organizationId = membership.organizationId;
  const userId = user.id;

  const docs = await prisma.vaultDocument.findMany({
    where: { organizationId },
    take: 2,
  });

  // 1) SUBMITTED + monitoring (prefer existing; else convert a PROC that is not the only PREPARING)
  let submitted = await prisma.organizationTender.findFirst({
    where: {
      organizationId,
      pipelineStage: "SUBMITTED",
      monitoringActive: true,
    },
  });
  if (!submitted) {
    const candidate = await prisma.organizationTender.findFirst({
      where: {
        organizationId,
        following: true,
        pipelineStage: { in: ["OUTREACH_SENT", "NEW", "PREPARING"] },
        tender: { is: { recordType: "PROC" } },
      },
      include: { tender: true },
      orderBy: { updatedAt: "asc" },
    });
    if (candidate) {
      await recordFormalSubmission(prisma, {
        userId,
        organizationId,
        tenderId: candidate.tenderId,
        submissionMethod: "PORTAL",
        externalReference: "QA-SUBMITTED-MONITOR",
        amountWithoutVat: 2500,
      });
      submitted = await prisma.organizationTender.findUnique({
        where: { id: candidate.id },
      });
      console.log(
        "created SUBMITTED",
        candidate.tender.referenceNumber,
        "mon=",
        submitted?.monitoringActive,
        "stage=",
        submitted?.pipelineStage,
      );
    } else {
      console.log("no candidate for SUBMITTED");
    }
  } else {
    console.log("SUBMITTED already exists");
  }

  // 2) PREPARING with workspace docs (after SUBMITTED so we don't consume the only prep row)
  let preparing = await prisma.organizationTender.findFirst({
    where: { organizationId, pipelineStage: "PREPARING" },
    include: { tender: true },
  });
  if (!preparing) {
    const candidate = await prisma.organizationTender.findFirst({
      where: {
        organizationId,
        following: true,
        pipelineStage: { notIn: ["WON", "LOST", "DISMISSED", "SUBMITTED"] },
        tender: { is: { recordType: "PROC" } },
      },
      include: { tender: true },
    });
    if (candidate) {
      await startPreparation(prisma, {
        userId,
        organizationId,
        tenderId: candidate.tenderId,
      });
      preparing = await prisma.organizationTender.findUniqueOrThrow({
        where: { id: candidate.id },
        include: { tender: true },
      });
    }
  }
  if (preparing && docs.length) {
    await addWorkspaceDocuments(prisma, {
      userId,
      organizationId,
      tenderId: preparing.tenderId,
      documentIds: docs.map((d) => d.id),
      section: "08",
      purpose: "QA prepare package",
    });
    console.log(
      "workspace linked",
      preparing.tender.referenceNumber,
      docs.length,
    );
  } else {
    console.log("workspace skip", Boolean(preparing), docs.length);
  }

  const links = await prisma.relatedActLink.findMany({ take: 10 });
  const hasDismissed = links.some((l) => l.confidence === "DISMISSED");
  const confirmed = links.filter((l) => l.confidence === "CONFIRMED");
  if (!hasDismissed && confirmed.length >= 2) {
    const other = confirmed[1]!;
    await prisma.relatedActLink.update({
      where: { id: other.id },
      data: { confidence: "DISMISSED", confirmedAt: null },
    });
    console.log("marked dismissed", other.id);
  } else {
    console.log("dismissed state ok", { hasDismissed, confirmed: confirmed.length });
  }
};

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
