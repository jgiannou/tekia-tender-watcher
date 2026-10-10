import type { PrismaClient, RecordType } from "@prisma/client";
import type { DiavgeiaDecisionRef } from "../sources/diavgeia-adapter.js";
import { buildProvenance, diavgeiaReferencePrefix } from "./source-provenance.js";
import { followTender } from "./follow.js";

export const diavgeiaReferenceNumber = (ada: string): string =>
  `${diavgeiaReferencePrefix}${ada.trim()}`;

export const upsertTenderFromDiavgeiaDecision = async (
  prisma: PrismaClient,
  decision: DiavgeiaDecisionRef,
) => {
  const now = new Date();
  const referenceNumber = diavgeiaReferenceNumber(decision.ada);
  const recordType = "OTHER" as RecordType;
  const provenance = buildProvenance({
    system: "diavgeia",
    externalId: decision.ada,
    canonicalUrl: decision.documentUrl || decision.url,
    publicationDate: decision.issueDate,
    fetchedAt: now,
  });
  return prisma.tender.upsert({
    where: { referenceNumber },
    create: {
      referenceNumber,
      recordType,
      title: decision.subject,
      contractingAuthority: decision.organization,
      submissionDate: decision.issueDate ? new Date(decision.issueDate) : null,
      officialPdfUrl: decision.documentUrl,
      publicKimdisUrl: decision.url,
      stage: decision.decisionTypeId,
      sourceFingerprint: `diavgeia:${decision.ada}`,
      rawJson: { decision, provenance } as object,
      firstSeenAt: now,
      lastSeenAt: now,
    },
    update: {
      title: decision.subject,
      contractingAuthority: decision.organization,
      submissionDate: decision.issueDate ? new Date(decision.issueDate) : null,
      officialPdfUrl: decision.documentUrl,
      publicKimdisUrl: decision.url,
      stage: decision.decisionTypeId,
      sourceFingerprint: `diavgeia:${decision.ada}`,
      rawJson: { decision, provenance } as object,
      lastSeenAt: now,
    },
  });
};

export const followDiavgeiaDecision = async (
  prisma: PrismaClient,
  input: {
    userId: string;
    organizationId: string;
    decision: DiavgeiaDecisionRef;
  },
) => {
  const tender = await upsertTenderFromDiavgeiaDecision(prisma, input.decision);
  const organizationTender = await followTender(prisma, {
    userId: input.userId,
    organizationId: input.organizationId,
    tenderId: tender.id,
  });
  return { tender, organizationTender };
};
