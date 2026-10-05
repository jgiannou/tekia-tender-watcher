import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetMailTestHooks,
  __setMailTransportForTests,
  LIVE_EMAIL_IN_TESTS_ENV,
} from "../src/saas/mail/mail.js";
import { createOrganization } from "../src/saas/services/organizations.js";
import {
  deliverAttentionEmail,
  shouldEmailAttentionType,
} from "../src/saas/services/notify.js";
import { upsertCanonicalTender } from "../src/saas/services/tenders.js";
import { getSaasTestPrisma, resetSaasDatabase } from "./helpers/saas-test.js";

describe("attention email delivery", () => {
  const prisma = getSaasTestPrisma();

  beforeEach(async () => {
    process.env.EMAIL_ENABLED = "true";
    process.env.EMAIL_FROM = "contact@tekia.gr";
    process.env.SMTP_HOST = "smtp.test.local";
    process.env[LIVE_EMAIL_IN_TESTS_ENV] = "true";
    await resetSaasDatabase(prisma);
  });

  afterEach(() => {
    __resetMailTestHooks();
    delete process.env[LIVE_EMAIL_IN_TESTS_ENV];
    process.env.EMAIL_ENABLED = "false";
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("plan policy: digests + related, not per-match opportunity mail", () => {
    expect(shouldEmailAttentionType("NEW_OPPORTUNITY", "IMMEDIATE")).toBe(false);
    expect(shouldEmailAttentionType("NEW_OPPORTUNITY", "DIGEST")).toBe(false);
    expect(shouldEmailAttentionType("OPPORTUNITY_DIGEST", "DIGEST")).toBe(true);
    expect(shouldEmailAttentionType("OPPORTUNITY_DIGEST", "IMMEDIATE")).toBe(
      true,
    );
    expect(
      shouldEmailAttentionType("RELATED_PROC_DISCOVERED", "DIGEST"),
    ).toBe(true);
  });

  it("sends DDA-style digest mail on Pro org", async () => {
    const sendMail = vi.fn(async () => ({ messageId: "test" }));
    __setMailTransportForTests({ sendMail } as never);

    const user = await prisma.user.create({
      data: {
        name: "Notify Pro",
        email: `notify-pro-${Date.now()}@example.com`,
        emailVerified: true,
      },
    });
    const organization = await createOrganization(prisma, {
      userId: user.id,
      name: "Notify Pro Org",
    });
    await prisma.subscription.update({
      where: { organizationId: organization.id },
      data: { planKey: "pro", status: "ACTIVE", trialEndsAt: null },
    });
    await prisma.organizationSettings.update({
      where: { organizationId: organization.id },
      data: {
        notifications: {
          emailEnabled: true,
          recipients: [user.email],
          events: {
            newOpportunity: true,
            relatedActOnFollowed: true,
            postSubmissionUpdate: true,
          },
        },
      },
    });

    const tender = await upsertCanonicalTender(prisma, {
      referenceNumber: "26REQ-NOTIFY-1",
      recordType: "REQ",
      title: "Ιστοσελίδα δήμου",
      contractingAuthority: "Δήμος Test",
      submissionDate: new Date(),
    });
    const orgTender = await prisma.organizationTender.create({
      data: {
        organizationId: organization.id,
        tenderId: tender.id,
        relevanceStatus: "RELEVANT",
        score: 92,
      },
    });
    const event = await prisma.organizationAttentionEvent.create({
      data: {
        organizationId: organization.id,
        organizationTenderId: orgTender.id,
        type: "OPPORTUNITY_DIGEST",
        title: "2 ευκαιρίες από την αναζήτηση «Web»",
        dedupeKey: `OPPORTUNITY_DIGEST:${organization.id}:test`,
        metadata: {
          profileName: "Web",
          matchCount: 2,
          newCount: 2,
          topMatches: [
            {
              referenceNumber: tender.referenceNumber,
              title: tender.title,
              score: 92,
              authority: tender.contractingAuthority,
              budgetWithoutVat: 15000,
              recordType: "REQ",
            },
            {
              referenceNumber: "26REQ-NOTIFY-1B",
              title: "Υπηρεσίες λογισμικού",
              score: 74,
              authority: "Δήμος Β",
              budgetWithoutVat: 9000,
              recordType: "REQ",
            },
          ],
        },
      },
    });

    const result = await deliverAttentionEmail(prisma, event.id);
    expect(result).toBe("sent");
    expect(sendMail).toHaveBeenCalledTimes(1);
    const mailArg = sendMail.mock.calls[0]?.[0] as { subject?: string; html?: string };
    expect(mailArg.subject).toMatch(/Πρωτογενή αιτήματα|opportunities/i);
    expect(mailArg.html).toContain("★★★★★");
    expect(mailArg.html).toContain("Ιστοσελίδα δήμου");
    const delivery = await prisma.notificationDelivery.findFirst({
      where: { organizationAttentionEventId: event.id },
    });
    expect(delivery?.status).toBe("SENT");
  });

  it("skips NEW_OPPORTUNITY email (in-app only)", async () => {
    const sendMail = vi.fn(async () => ({ messageId: "test" }));
    __setMailTransportForTests({ sendMail } as never);

    const user = await prisma.user.create({
      data: {
        name: "Notify Skip",
        email: `notify-skip-${Date.now()}@example.com`,
        emailVerified: true,
      },
    });
    const organization = await createOrganization(prisma, {
      userId: user.id,
      name: "Notify Skip Org",
    });
    await prisma.subscription.update({
      where: { organizationId: organization.id },
      data: { planKey: "pro", status: "ACTIVE", trialEndsAt: null },
    });

    const tender = await upsertCanonicalTender(prisma, {
      referenceNumber: "26REQ-NOTIFY-2",
      recordType: "REQ",
      title: "Per-match skip",
      submissionDate: new Date(),
    });
    const orgTender = await prisma.organizationTender.create({
      data: {
        organizationId: organization.id,
        tenderId: tender.id,
        relevanceStatus: "RELEVANT",
        score: 80,
      },
    });
    const event = await prisma.organizationAttentionEvent.create({
      data: {
        organizationId: organization.id,
        organizationTenderId: orgTender.id,
        type: "NEW_OPPORTUNITY",
        title: "Per-match skip",
        dedupeKey: `NEW_OPPORTUNITY:${tender.id}`,
        metadata: { score: 80 },
      },
    });

    const result = await deliverAttentionEmail(prisma, event.id);
    expect(result).toBe("skipped");
    expect(sendMail).not.toHaveBeenCalled();
  });
});
