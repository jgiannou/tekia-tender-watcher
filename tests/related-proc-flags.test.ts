import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  countInvitationIssuedByWatchProfile,
  loadRelatedProcFlagsByAdams,
  loadRelatedProcFlagsByTenderIds,
} from "../src/saas/services/related-proc-flags.js";
import { upsertCanonicalTender } from "../src/saas/services/tenders.js";
import { createOrganization } from "../src/saas/services/organizations.js";
import {
  getSaasTestPrisma,
  resetSaasDatabase,
} from "./helpers/saas-test.js";

const prisma = getSaasTestPrisma();

describe("related PROC invitation flags", () => {
  beforeEach(async () => {
    await resetSaasDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("flags REQ when RelatedActLink or child PROC exists", async () => {
    const req = await upsertCanonicalTender(prisma, {
      referenceNumber: "26REQ019966687",
      recordType: "REQ",
      title: "Ιστοσελίδα δήμου",
      contractingAuthority: "ΔΗΜΟΣ ΚΑΤΩ ΝΕΥΡΟΚΟΠΙΟΥ",
    });
    const proc = await upsertCanonicalTender(prisma, {
      referenceNumber: "26PROC019972045",
      recordType: "PROC",
      title: "Πρόσκληση ιστοσελίδας",
      contractingAuthority: "ΔΗΜΟΣ ΚΑΤΩ ΝΕΥΡΟΚΟΠΙΟΥ",
      parentTenderId: req.id,
    });

    const byParent = await loadRelatedProcFlagsByTenderIds(prisma, [req.id]);
    expect(byParent.get(req.id)).toMatchObject({
      invitationIssued: true,
      relatedProcAdam: "26PROC019972045",
      confidence: "CONFIRMED",
    });

    await prisma.relatedActLink.create({
      data: {
        sourceTenderId: req.id,
        targetTenderId: proc.id,
        relationType: "REQ_TO_PROC",
        confidence: "LIKELY",
        detectionMethod: "public_ui_related_acts",
      },
    });

    const byAdam = await loadRelatedProcFlagsByAdams(prisma, [
      "26req019966687",
      "26PROC000000000",
    ]);
    expect(byAdam.get("26REQ019966687")?.invitationIssued).toBe(true);
    expect(byAdam.get("26PROC000000000")?.invitationIssued).toBe(false);
  });

  it("counts invitation-issued matches per watch profile", async () => {
    const user = await prisma.user.create({
      data: {
        name: "Flag User",
        email: "flag-user@example.com",
        emailVerified: true,
      },
    });
    const organization = await createOrganization(prisma, {
      userId: user.id,
      name: "Flag Org",
    });
    const profile = await prisma.watchProfile.create({
      data: {
        organizationId: organization.id,
        name: "Web",
        keywords: ["ιστοσελ"],
        cpvs: [],
        enabled: true,
      },
    });
    const req = await upsertCanonicalTender(prisma, {
      referenceNumber: "26REQ111111111",
      recordType: "REQ",
      title: "Portal",
    });
    const proc = await upsertCanonicalTender(prisma, {
      referenceNumber: "26PROC111111111",
      recordType: "PROC",
      title: "Invite",
      parentTenderId: req.id,
    });
    await prisma.organizationTender.create({
      data: {
        organizationId: organization.id,
        tenderId: req.id,
        watchProfileId: profile.id,
        score: 80,
        following: false,
        monitoringActive: false,
      },
    });
    void proc;

    const counts = await countInvitationIssuedByWatchProfile(prisma, {
      organizationId: organization.id,
      watchProfileIds: [profile.id],
    });
    expect(counts.get(profile.id)).toBe(1);
  });
});
