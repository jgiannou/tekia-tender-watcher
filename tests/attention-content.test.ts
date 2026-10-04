import { describe, expect, it } from "vitest";
import { attentionEventViewModel } from "../apps/saas-web/src/lib/attention-content";
import { attentionEventHref } from "../apps/saas-web/src/lib/attention-routing";
import type { AttentionEvent } from "../apps/saas-web/src/lib/api";

const base = (partial: Partial<AttentionEvent>): AttentionEvent => ({
  id: "e1",
  type: "NEW_OPPORTUNITY",
  title: "fallback",
  createdAt: new Date().toISOString(),
  readAt: null,
  ...partial,
});

describe("attention content & destinations", () => {
  it("formats a single new opportunity and opens tender detail", () => {
    const event = base({
      type: "NEW_OPPORTUNITY",
      organizationTender: {
        id: "ot1",
        tender: {
          id: "t1",
          referenceNumber: "26REQ019911906",
          title: "Δημιουργία και φιλοξενία ιστοσελίδας του ΕΙΕ για το 2026",
          recordType: "REQ",
          contractingAuthority: "Εθνικό Ίδρυμα Ερευνών",
        },
      },
      metadata: {
        profileId: "p1",
        profileName: "Web & Digital",
        referenceNumber: "26REQ019911906",
        recordType: "REQ",
      },
    });

    const view = attentionEventViewModel(event);
    expect(view.eyebrow).toBe("Νέα ευκαιρία");
    expect(view.primary).toContain("ιστοσελίδας");
    expect(view.secondary).toContain("REQ");
    expect(view.secondary).toContain("Εθνικό Ίδρυμα Ερευνών");
    expect(view.context).toContain("Web & Digital");
    expect(attentionEventHref(event)).toBe(
      "/app/tenders/REQ/26REQ019911906",
    );
  });

  it("formats digests without a tender title and opens filtered opportunities", () => {
    const event = base({
      type: "OPPORTUNITY_DIGEST",
      title: "28 ευκαιρίες από την αναζήτηση «Web & Digital»",
      metadata: {
        profileId: "p1",
        profileName: "Web & Digital",
        matchCount: 28,
        newCount: 28,
      },
      organizationTender: {
        id: "ot1",
        tender: {
          id: "t1",
          referenceNumber: "26PROC019899634",
          title: "Should not be the digest primary",
          recordType: "PROC",
        },
      },
    });

    const view = attentionEventViewModel(event);
    expect(view.primary).toBe('28 ευκαιρίες από την αναζήτηση «Web & Digital»');
    expect(view.primary).not.toContain("Should not");
    expect(attentionEventHref(event)).toBe("/app/opportunities?profile=p1");
  });

  it("opens submission notifications on the tender, not monitoring", () => {
    const event = base({
      type: "SUBMISSION_RECORDED",
      organizationTender: {
        id: "ot1",
        tender: {
          id: "t1",
          referenceNumber: "26PROC019899634",
          title: "Πρόσκληση ιστοσελίδας",
          recordType: "PROC",
        },
      },
      metadata: {
        externalReference: "QA-ONLY-083982a-v1",
        tenderTitle: "Πρόσκληση ιστοσελίδας",
      },
    });

    const view = attentionEventViewModel(event);
    expect(view.primary).toContain("Πρόσκληση");
    expect(view.secondary).toContain("QA-ONLY-083982a-v1");
    expect(attentionEventHref(event)).toBe(
      "/app/tenders/PROC/26PROC019899634",
    );
    expect(attentionEventHref(event)).not.toContain("/monitoring");
  });
});
