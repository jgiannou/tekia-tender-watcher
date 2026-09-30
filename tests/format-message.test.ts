import { describe, expect, it } from "vitest";
import {
  formatBootstrapMessage,
  formatSlackMessage,
  formatTestSlackMessage,
} from "../src/slack/format-message.js";

describe("slack formatter", () => {
  it("formats a high match message with web category", () => {
    const text = formatSlackMessage({
      score: 88,
      title: "Δημιουργία νέας ιστοσελίδας και συντήρηση",
      organization: "Δήμος Χ",
      budgetWithoutVat: 8000,
      recordType: "REQ",
      stageLabel: "Πρωτογενές Αίτημα",
      webCategoryLabel: "🌐 WEBSITE",
      cpvs: ["72413000-8"],
      submissionDate: "2026-09-29T12:41:00.000Z",
      publicUrl:
        "https://cerpp.eprocurement.gov.gr/upgkimdis/unprotected/home.xhtml?referenceNumber=26REQ1",
      pdfUrl:
        "https://cerpp.eprocurement.gov.gr/khmdhs-opendata/request/attachment/26REQ1",
      reasons: ["Strong web keyword in title"],
      flags: {
        earlyStage: true,
        hasLinkedNotice: false,
        targetedSupplier: false,
        nonInvitedOffersRejected: false,
        alreadyAdvanced: false,
        pdfNeedsManualReview: true,
      },
    });

    expect(text).toContain("NEW KIMDIS LEAD — 88/100");
    expect(text).toContain("🌐 WEBSITE");
    expect(text).toContain("Clear web scope");
    expect(text).toContain("Open in KIMDIS");
  });

  it("formats bootstrap and test messages", () => {
    expect(formatBootstrapMessage()).toContain("TEKIA Tender Watcher started");
    expect(formatTestSlackMessage()).toContain("test notification");
  });
});
