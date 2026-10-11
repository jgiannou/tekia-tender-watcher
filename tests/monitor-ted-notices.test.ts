import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { monitorTedFollowedNotices } from "../src/saas/jobs/monitor-ted-notices.js";
import { followTender } from "../src/saas/services/follow.js";
import { createOrganization } from "../src/saas/services/organizations.js";
import { upsertTenderFromTedNotice } from "../src/saas/services/ted-notices.js";
import {
  deadlineDayKey,
  tedDeadlineChangeTitle,
} from "../src/saas/services/ted-change-copy.js";
import {
  getSaasTestPrisma,
  resetSaasDatabase,
} from "./helpers/saas-test.js";

const prisma = getSaasTestPrisma();

const noticePayload = (deadline: string) => ({
  notices: [
    {
      "publication-number": "999001-2026",
      "notice-title": { ell: "Δοκιμαστική δημοσίευση φόρτισης TED" },
      "buyer-name": { ell: ["ΔΗΜΟΣ ΔΟΚΙΜΗΣ"] },
      "publication-date": "2026-01-10+01:00",
      "notice-type": "cn-standard",
      "classification-cpv": ["31681500"],
      "deadline-receipt-tender-date-lot": [deadline],
      "estimated-value-proc": "100000",
      "estimated-value-cur-proc": "EUR",
      "place-of-performance-subdiv-proc": ["EL632"],
      "contract-nature-main-proc": "services",
      links: {
        html: { ELL: "https://ted.europa.eu/el/notice/-/detail/999001-2026" },
        pdf: { ELL: "https://ted.europa.eu/el/notice/999001-2026/pdf" },
      },
    },
  ],
  totalNoticeCount: 1,
});

describe("monitorTedFollowedNotices", () => {
  beforeEach(async () => {
    await resetSaasDatabase(prisma);
    vi.unstubAllGlobals();
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await prisma.$disconnect();
  });

  it("creates human deadline-change attention and queues plan email path", async () => {
    process.env.TED_ENABLED = "true";
    const user = await prisma.user.create({
      data: {
        name: "TED Monitor",
        email: `ted-monitor-${Date.now()}@example.com`,
        emailVerified: true,
      },
    });
    const organization = await createOrganization(prisma, {
      userId: user.id,
      name: "TED Monitor Co",
    });
    await prisma.subscription.update({
      where: { organizationId: organization.id },
      data: { planKey: "pro", status: "ACTIVE", trialEndsAt: null },
    });

    const tender = await upsertTenderFromTedNotice(prisma, {
      publicationNumber: "999001-2026",
      title: "Δοκιμαστική δημοσίευση φόρτισης TED",
      buyerName: "ΔΗΜΟΣ ΔΟΚΙΜΗΣ",
      publicationDate: "2026-01-10+01:00",
      noticeType: "cn-standard",
      cpvs: ["31681500"],
      deadline: "2026-10-15+03:00",
      estimatedValue: 100000,
      currency: "EUR",
      nutsCode: "EL632",
      placeCity: null,
      contractNature: "services",
      buyerCity: null,
      buyerCountry: "GRC",
      noticeSubtype: null,
      url: "https://ted.europa.eu/el/notice/-/detail/999001-2026",
      pdfUrl: "https://ted.europa.eu/el/notice/999001-2026/pdf",
      provenance: "ted",
    });

    await followTender(prisma, {
      userId: user.id,
      organizationId: organization.id,
      tenderId: tender.id,
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify(noticePayload("2026-10-22+03:00")), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    const result = await monitorTedFollowedNotices(prisma);
    expect(result.followedTedTenders).toBe(1);
    expect(result.refreshed).toBe(1);
    expect(result.attentionEventsCreated).toBe(1);

    const event = await prisma.organizationAttentionEvent.findFirst({
      where: { organizationId: organization.id, type: "DEADLINE_CHANGED" },
    });
    expect(event).toBeTruthy();
    const meta = event!.metadata as {
      sourceSystem?: string;
      changeKind?: string;
      checkedAt?: string;
      previousDeadline?: string;
      nextDeadline?: string;
    };
    expect(event!.title).toBe(
      tedDeadlineChangeTitle(meta.previousDeadline, meta.nextDeadline),
    );
    expect(event!.title).toMatch(/Η προθεσμία άλλαξε από .+ σε .+/);
    expect(meta.sourceSystem).toBe("ted");
    expect(meta.changeKind).toBe("deadline");
    expect(meta.checkedAt).toBeTruthy();
    expect(deadlineDayKey(meta.previousDeadline)).toBe(
      deadlineDayKey("2026-10-15+03:00"),
    );
    expect(deadlineDayKey(meta.nextDeadline)).toBe(
      deadlineDayKey("2026-10-22+03:00"),
    );

    // Related types are digest-queued (not immediate send) — attention is the
    // in-app signal; plan-gated email uses flushRelatedActEmailDigests.
    const updated = await prisma.tender.findUnique({ where: { id: tender.id } });
    expect(deadlineDayKey(updated?.finalSubmissionDate?.toISOString())).toBe(
      deadlineDayKey("2026-10-22+03:00"),
    );
  });
});
