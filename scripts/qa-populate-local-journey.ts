/**
 * Local QA populate: company docs + full journey states for johnn.giannousis@gmail.com
 * Run: pnpm exec tsx scripts/qa-populate-local-journey.ts
 */
import { PrismaClient } from "@prisma/client";
import { ensureVaultFolders, uploadDocument } from "../src/saas/services/vault.js";
import { followTender } from "../src/saas/services/follow.js";
import { recordOutreachSent } from "../src/saas/services/outreach.js";
import { recordFormalSubmission } from "../src/saas/services/submission.js";
import { addWorkspaceDocuments } from "../src/saas/services/workspace.js";
import { startPreparation } from "../src/saas/services/workflow.js";

const EMAIL = "johnn.giannousis@gmail.com";

const pdfBytes = Buffer.from(
  `%PDF-1.4
1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj
2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj
3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>endobj
4 0 obj<< /Length 44 >>stream
BT /F1 24 Tf 100 700 Td (TEKIA QA Doc) Tj ET
endstream
endobj
xref
0 5
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000214 00000 n 
trailer<< /Size 5 /Root 1 0 R >>
startxref
308
%%EOF`,
);

const prisma = new PrismaClient();

const pick = <T>(rows: T[], n: number): T[] => rows.slice(0, n);

const main = async () => {
  const user = await prisma.user.findFirst({ where: { email: EMAIL } });
  if (!user) throw new Error(`user_not_found:${EMAIL}`);

  const membership = await prisma.organizationMember.findFirst({
    where: { userId: user.id },
    include: { organization: true },
    orderBy: { createdAt: "asc" },
  });
  if (!membership) throw new Error("membership_not_found");
  const organizationId = membership.organizationId;
  console.log("org", membership.organization.name, organizationId);

  await prisma.organizationSettings.upsert({
    where: { organizationId },
    create: {
      organizationId,
      company: {
        legalName: "TEKIA ΙΔΙΩΤΙΚΗ ΚΕΦΑΛΑΙΟΥΧΙΚΗ ΕΤΑΙΡΕΙΑ",
        distinctiveTitle: "TEKIA",
        vatNumber: "801234567",
        gemiNumber: "123456789000",
        address: "Αθήνα",
        email: EMAIL,
        phone: "+30 210 0000000",
      },
      activities: [
        {
          code: "62.01",
          description: "Δραστηριότητες προγραμματισμού ηλεκτρονικών υπολογιστών",
          isPrimary: true,
          source: "manual",
        },
        {
          code: "63.11",
          description: "Επεξεργασία δεδομένων, φιλοξενία ιστοσελίδων",
          isPrimary: false,
          source: "manual",
        },
      ],
      onboardingStatus: "COMPLETED",
      onboardingMeta: { completedAt: new Date().toISOString() },
    },
    update: {
      company: {
        legalName: "TEKIA ΙΔΙΩΤΙΚΗ ΚΕΦΑΛΑΙΟΥΧΙΚΗ ΕΤΑΙΡΕΙΑ",
        distinctiveTitle: "TEKIA",
        vatNumber: "801234567",
        gemiNumber: "123456789000",
        address: "Αθήνα",
        email: EMAIL,
        phone: "+30 210 0000000",
      },
      activities: [
        {
          code: "62.01",
          description: "Δραστηριότητες προγραμματισμού ηλεκτρονικών υπολογιστών",
          isPrimary: true,
          source: "manual",
        },
        {
          code: "63.11",
          description: "Επεξεργασία δεδομένων, φιλοξενία ιστοσελίδων",
          isPrimary: false,
          source: "manual",
        },
      ],
      onboardingStatus: "COMPLETED",
      onboardingMeta: { completedAt: new Date().toISOString() },
    },
  });

  await ensureVaultFolders(prisma, organizationId);
  const folders = await prisma.vaultFolder.findMany({
    where: { organizationId },
    orderBy: { sortOrder: "asc" },
  });
  const bySlug = Object.fromEntries(folders.map((f) => [f.slug, f]));

  const docsSpec = [
    {
      folderId: bySlug["01"]!.id,
      name: "ΓΕΜΗ — Πιστοποιητικό εκπροσώπησης",
      documentType: "GEMI_REPRESENTATION",
      expiryDate: new Date(Date.now() + 120 * 86400000),
      noExpiry: false,
    },
    {
      folderId: bySlug["02"]!.id,
      name: "Φορολογική ενημερότητα",
      documentType: "TAX_CLEARANCE",
      expiryDate: new Date(Date.now() + 20 * 86400000),
      noExpiry: false,
    },
    {
      folderId: bySlug["03"]!.id,
      name: "Ασφαλιστική ενημερότητα",
      documentType: "INSURANCE_CLEARANCE",
      expiryDate: new Date(Date.now() - 5 * 86400000),
      noExpiry: false,
    },
    {
      folderId: bySlug["08"]!.id,
      name: "Εταιρικό προφίλ TEKIA",
      documentType: "COMPANY_PROFILE",
      expiryDate: null as Date | null,
      noExpiry: true,
    },
    {
      folderId: bySlug["04"]!.id,
      name: "Υπεύθυνη δήλωση Ν.1599/1986",
      documentType: "SOLEMN_DECLARATION",
      expiryDate: null as Date | null,
      noExpiry: true,
    },
    {
      folderId: bySlug["07"]!.id,
      name: "Κατάλογος έργων — ιστοσελίδες ΟΤΑ",
      documentType: "EXPERIENCE_LIST",
      expiryDate: null as Date | null,
      noExpiry: true,
    },
  ];

  const uploadedDocs = [];
  for (const spec of docsSpec) {
    const existing = await prisma.vaultDocument.findFirst({
      where: { organizationId, name: spec.name },
    });
    if (existing) {
      uploadedDocs.push(existing);
      continue;
    }
    const result = await uploadDocument(prisma, {
      userId: user.id,
      organizationId,
      folderId: spec.folderId,
      name: spec.name,
      documentType: spec.documentType,
      expiryDate: spec.expiryDate,
      noExpiry: spec.noExpiry,
      originalFilename: `${spec.documentType}.pdf`,
      bytes: pdfBytes,
      declaredMimeType: "application/pdf",
    });
    uploadedDocs.push(result.document);
    console.log("uploaded", result.document.name, result.document.status);
  }

  const opportunities = await prisma.organizationTender.findMany({
    where: { organizationId, pipelineStage: { not: "DISMISSED" } },
    include: { tender: true },
    orderBy: [{ score: "desc" }, { createdAt: "desc" }],
    take: 40,
  });
  if (opportunities.length < 5) {
    throw new Error(`need_more_opportunities:${opportunities.length}`);
  }

  const [followOnly, outreachTarget, prepareTarget, submitTarget, wonTarget] = pick(
    opportunities,
    5,
  );

  await followTender(prisma, {
    userId: user.id,
    organizationId,
    tenderId: followOnly!.tenderId,
  });
  console.log(
    "followed",
    followOnly!.tender.referenceNumber,
    followOnly!.tender.title?.slice(0, 50),
  );

  await recordOutreachSent(prisma, {
    userId: user.id,
    organizationId,
    tenderId: outreachTarget!.tenderId,
    method: "EMAIL",
    recipient: "proswrim@example.gov.gr",
    subject: "Εκδήλωση ενδιαφέροντος — συντήρηση ιστοσελίδας",
    notes: "QA populate — early interest recorded",
    externalReference: "QA-OUT-001",
    documentIds: [uploadedDocs[3]!.id, uploadedDocs[0]!.id],
    sentAt: new Date(Date.now() - 3 * 86400000),
  });
  console.log("outreach", outreachTarget!.tender.referenceNumber);

  await followTender(prisma, {
    userId: user.id,
    organizationId,
    tenderId: prepareTarget!.tenderId,
  });
  await startPreparation(prisma, {
    userId: user.id,
    organizationId,
    tenderId: prepareTarget!.tenderId,
  });
  await addWorkspaceDocuments(prisma, {
    userId: user.id,
    organizationId,
    tenderId: prepareTarget!.tenderId,
    documentIds: [uploadedDocs[3]!.id],
    section: "company_profile",
  });
  await addWorkspaceDocuments(prisma, {
    userId: user.id,
    organizationId,
    tenderId: prepareTarget!.tenderId,
    documentIds: [uploadedDocs[4]!.id],
    section: "declarations",
  });
  await addWorkspaceDocuments(prisma, {
    userId: user.id,
    organizationId,
    tenderId: prepareTarget!.tenderId,
    documentIds: [uploadedDocs[5]!.id],
    section: "technical",
  });
  console.log("preparing", prepareTarget!.tender.referenceNumber);

  await followTender(prisma, {
    userId: user.id,
    organizationId,
    tenderId: submitTarget!.tenderId,
  });
  const pending = await recordFormalSubmission(prisma, {
    userId: user.id,
    organizationId,
    tenderId: submitTarget!.tenderId,
    submissionMethod: "PORTAL",
    recipient: "ΕΣΗΔΗΣ",
    subject: "Οικονομική & τεχνική προσφορά",
    amountWithoutVat: 4200,
    amountWithVat: 5208,
    externalReference: "QA-SUB-ESIDIS-001",
    notes: "QA populate — formal offer recorded (not auto-sent)",
    documentIds: [
      uploadedDocs[0]!.id,
      uploadedDocs[1]!.id,
      uploadedDocs[3]!.id,
      uploadedDocs[5]!.id,
    ],
    submittedAt: new Date(Date.now() - 10 * 86400000),
  });
  console.log("submitted", submitTarget!.tender.referenceNumber, pending.submission.id);

  await followTender(prisma, {
    userId: user.id,
    organizationId,
    tenderId: wonTarget!.tenderId,
  });
  const wonSub = await recordFormalSubmission(prisma, {
    userId: user.id,
    organizationId,
    tenderId: wonTarget!.tenderId,
    submissionMethod: "EMAIL",
    recipient: "promitheies@example.gov.gr",
    amountWithoutVat: 3000,
    externalReference: "QA-SUB-WON-001",
    documentIds: [uploadedDocs[0]!.id, uploadedDocs[3]!.id],
    submittedAt: new Date(Date.now() - 40 * 86400000),
  });
  await prisma.submission.update({
    where: { id: wonSub.submission.id },
    data: { result: "WON", notes: "QA populate — user-confirmed win" },
  });
  await prisma.organizationTender.update({
    where: { id: wonTarget!.id },
    data: {
      pipelineStage: "WON",
      monitoringActive: false,
      monitoringStoppedAt: new Date(),
    },
  });
  console.log("won", wonTarget!.tender.referenceNumber, wonSub.submission.id);

  const summary = {
    docs: await prisma.vaultDocument.count({ where: { organizationId } }),
    following: await prisma.organizationTender.count({
      where: { organizationId, following: true },
    }),
    outreach: await prisma.outreachLedger.count({
      where: { organizationId, status: "SENT" },
    }),
    submissions: await prisma.submission.count({ where: { organizationId } }),
    preparing: await prisma.organizationTender.count({
      where: { organizationId, pipelineStage: "PREPARING" },
    }),
    submitted: await prisma.organizationTender.count({
      where: { organizationId, pipelineStage: "SUBMITTED" },
    }),
    won: await prisma.organizationTender.count({
      where: { organizationId, pipelineStage: "WON" },
    }),
    monitoring: await prisma.organizationTender.count({
      where: { organizationId, monitoringActive: true },
    }),
  };
  console.log("SUMMARY", summary);
  console.log(
    "refs",
    JSON.stringify({
      follow: followOnly!.tender.referenceNumber,
      outreach: outreachTarget!.tender.referenceNumber,
      prepare: prepareTarget!.tender.referenceNumber,
      submit: submitTarget!.tender.referenceNumber,
      won: wonTarget!.tender.referenceNumber,
    }),
  );
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
