import { describe, expect, it } from "vitest";
import {
  formatBootstrapMessage,
  formatSlackMessage,
  formatTestSlackMessage,
} from "../src/slack/format-message.js";

describe("slack formatter", () => {
  it("formats a high early REQ with CONTACT EARLY", () => {
    const text = formatSlackMessage({
      score: 84,
      title: "Δημιουργία νέας ιστοσελίδας",
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
        pdfNeedsManualReview: false,
        budgetInRange: true,
      },
    });

    expect(text).toContain("NEW KIMDIS LEAD — 84/100");
    expect(text).toContain("🌐 WEBSITE");
    expect(text).toContain("Explicit website scope");
    expect(text).toContain("CONTACT EARLY");
    expect(text).toContain("Open in KIMDIS");
  });

  it("formats verified open PROC recommendation", () => {
    const text = formatSlackMessage({
      score: 82,
      title: "Αναβάθμιση ιστοσελίδας",
      organization: "Δήμος Χ",
      budgetWithoutVat: 18000,
      recordType: "PROC",
      stageLabel: "Πρόσκληση / Διακήρυξη",
      webCategoryLabel: "🌐 WEBSITE",
      cpvs: ["72413000-8"],
      submissionDate: "2026-09-29T12:41:00.000Z",
      finalSubmissionDate: "2026-10-15T12:00:00.000Z",
      publicUrl: "https://example.com/public",
      pdfUrl: "https://example.com/pdf",
      reasons: [],
      flags: {
        earlyStage: false,
        hasLinkedNotice: false,
        targetedSupplier: false,
        nonInvitedOffersRejected: false,
        alreadyAdvanced: false,
        pdfNeedsManualReview: false,
        pdfVerified: true,
      },
    });

    expect(text).toContain("VERIFIED OPEN PROC — 82/100");
    expect(text).toContain("REVIEW / PREPARE OFFER");
    expect(text).toContain("PDF verified");
  });

  it("formats bootstrap and test messages", () => {
    expect(formatBootstrapMessage()).toContain("TEKIA Tender Watcher started");
    expect(formatTestSlackMessage()).toContain("test notification");
  });
});
