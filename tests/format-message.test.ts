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
      referenceNumber: "26REQ1",
      localDashboardUrl: "http://localhost:5173",
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
    expect(text).toContain("ADAM:");
    expect(text).toContain("Open in local dashboard");
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

  it("formats FOLLOW-UP for watched REQ related PROC invitation", () => {
    const invited = formatSlackMessage({
      score: 70,
      title: "Συντήρηση ιστοσελίδας",
      organization: "ΠΕΤΑ Α.Ε.",
      budgetWithoutVat: 5000,
      recordType: "PROC",
      stageLabel: "Πρόσκληση",
      webCategoryLabel: "🌐 WEBSITE",
      cpvs: [],
      submissionDate: "2026-10-02T10:00:00.000Z",
      publicUrl: "https://example.com/public",
      pdfUrl: "https://example.com/pdf",
      reasons: [],
      referenceNumber: "26PROC111",
      flags: {
        earlyStage: false,
        hasLinkedNotice: false,
        targetedSupplier: true,
        nonInvitedOffersRejected: false,
        alreadyAdvanced: false,
        pdfNeedsManualReview: false,
        pdfVerified: true,
      },
      relation: {
        decision: "AUTO_LINK",
        parentAdam: "26REQ019873897",
        score: 90,
        confidence: "HIGH",
        method: "INFERRED",
        invitationType: "TARGETED",
        invitedVendorName: "ΤΕΚΙΑ Α.Ε.",
        ourInvitationStatus: "INVITED",
        recommendedAction: "Προετοιμασία Φακέλου Προσφοράς",
        parentOutreachSent: true,
      },
    });
    expect(invited).toContain("FOLLOW-UP — RELATED PROC DETECTED — TEKIA INVITED");
    expect(invited).toContain("REQ: `26REQ019873897`");
    expect(invited).toContain("PREPARE OFFER");
    expect(invited).not.toContain("NEW KIMDIS LEAD");

    const other = formatSlackMessage({
      score: 70,
      title: "Συντήρηση ιστοσελίδας",
      organization: "Δήμος Σιθωνίας",
      budgetWithoutVat: 2400,
      recordType: "PROC",
      stageLabel: "Πρόσκληση",
      webCategoryLabel: "🌐 WEBSITE",
      cpvs: [],
      submissionDate: "2026-10-02T10:00:00.000Z",
      publicUrl: "https://example.com/public",
      pdfUrl: "https://example.com/pdf",
      reasons: [],
      referenceNumber: "26PROC222",
      flags: {
        earlyStage: false,
        hasLinkedNotice: false,
        targetedSupplier: true,
        nonInvitedOffersRejected: true,
        alreadyAdvanced: false,
        pdfNeedsManualReview: false,
        pdfVerified: true,
      },
      relation: {
        decision: "AUTO_LINK",
        parentAdam: "26REQ019877036",
        score: 95,
        confidence: "HIGH",
        method: "INFERRED",
        invitationType: "TARGETED",
        invitedVendorName: "My company projects Ο.Ε.",
        ourInvitationStatus: "NOT_INVITED",
        recommendedAction: "Καμία υποβολή προσφοράς",
        parentOutreachSent: true,
      },
    });
    expect(other).toContain("FOLLOW-UP — RELATED PROC DETECTED — TEKIA NOT INVITED");
    expect(other).toContain("Targeted vendor: My company projects Ο.Ε.");
    expect(other).toContain("NO OFFER");
    expect(other).not.toContain("NEW KIMDIS LEAD");
  });

  it("formats bootstrap and test messages", () => {
    expect(formatBootstrapMessage()).toContain("TEKIA Tender Watcher started");
    expect(formatTestSlackMessage()).toContain("test notification");
  });
});
