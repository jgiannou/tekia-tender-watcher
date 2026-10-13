import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const main = async () => {
  const org = await prisma.organization.findFirst({ orderBy: { createdAt: "desc" } });
  if (!org) throw new Error("no org");

  const req = await prisma.tender.upsert({
    where: { referenceNumber: "26REQ019966687" },
    create: {
      referenceNumber: "26REQ019966687",
      recordType: "REQ",
      title:
        "Παροχή υπηρεσιών τεχνικής υποστήριξης της επίσημης ιστοσελίδας του Δήμου για δύο (2) έτη.",
      contractingAuthority: "ΔΗΜΟΣ ΚΑΤΩ ΝΕΥΡΟΚΟΠΙΟΥ",
      budgetWithoutVat: 2000,
      submissionDate: new Date("2026-10-12T12:28:56.155Z"),
      publicKimdisUrl:
        "https://cerpp.eprocurement.gov.gr/upgkimdis/unprotected/home.xhtml?referenceNumber=26REQ019966687",
      officialPdfUrl:
        "https://cerpp.eprocurement.gov.gr/khmdhs-opendata/request/attachment/26REQ019966687",
      cpvs: ["72267100-0"],
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
    },
    update: {
      title:
        "Παροχή υπηρεσιών τεχνικής υποστήριξης της επίσημης ιστοσελίδας του Δήμου για δύο (2) έτη.",
      contractingAuthority: "ΔΗΜΟΣ ΚΑΤΩ ΝΕΥΡΟΚΟΠΙΟΥ",
      budgetWithoutVat: 2000,
    },
  });

  const orgTender = await prisma.organizationTender.upsert({
    where: {
      organizationId_tenderId: { organizationId: org.id, tenderId: req.id },
    },
    create: {
      organizationId: org.id,
      tenderId: req.id,
      following: true,
      monitoringActive: true,
      monitoringReason: "USER_FOLLOWING",
      pipelineStage: "NEW",
      operationalStatus: "NEW",
      followedAt: new Date(),
      score: 86,
      matchMeta: {
        highestScore: 86,
        matchedProfiles: [
          {
            id: "seed-web",
            name: "Web",
            score: 86,
            reasons: [
              "Ισχυρή αντιστοίχιση τίτλου",
              "Οικονομικό αντικείμενο άνω των 2.000 €",
              "Λέξεις-κλειδιά: company, work",
              "Ο τίτλος περιέχει τον όρο «Ιστοσελ…»",
            ],
          },
        ],
      },
    },
    update: {
      following: true,
      monitoringActive: true,
      score: 86,
      matchMeta: {
        highestScore: 86,
        matchedProfiles: [
          {
            id: "seed-web",
            name: "Web",
            score: 86,
            reasons: [
              "Ισχυρή αντιστοίχιση τίτλου",
              "Οικονομικό αντικείμενο άνω των 2.000 €",
              "Λέξεις-κλειδιά: company, work",
              "Ο τίτλος περιέχει τον όρο «Ιστοσελ…»",
            ],
          },
        ],
      },
    },
  });

  const existingFollow = await prisma.tenderEvent.findFirst({
    where: {
      organizationTenderId: orgTender.id,
      eventType: "FOLLOWED",
    },
  });
  if (!existingFollow) {
    await prisma.tenderEvent.create({
      data: {
        organizationId: org.id,
        organizationTenderId: orgTender.id,
        eventType: "FOLLOWED",
      },
    });
  }

  console.log({
    orgId: org.id,
    tenderId: req.id,
    adam: req.referenceNumber,
  });
};

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
