import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach } from "vitest";
import { openDatabase } from "../src/db/database.js";
import { createRepository } from "../src/db/repository.js";
import { classifyPdfText } from "../src/pdf/classify.js";
import { applyProcRelationAndInvitation } from "../src/relations/apply-proc-relation.js";
import {
  assessInvitation,
  compareInvitedVendor,
} from "../src/relations/invitation-identity.js";
import {
  matchProcToReqs,
  scoreReqProcPair,
  type RelationCandidate,
} from "../src/relations/req-proc-match.js";

const sithoniaReq = (): RelationCandidate => ({
  referenceNumber: "26REQ019877036",
  recordType: "REQ",
  title: "Πρωτογενές αίτημα για συντήρηση ιστοσελίδας",
  organization: "ΔΗΜΟΣ ΣΙΘΩΝΙΑΣ",
  budgetWithoutVat: 2400,
  cpvs: ["72212221-4"],
  description:
    "Υπηρεσίες υποστήριξης, συντήρησης και αναβάθμισης ιστοσελίδας για 12 μήνες",
  submissionDate: "2026-09-29T10:00:00.000Z",
  explicitRefs: [],
});

const sithoniaProc = (): RelationCandidate => ({
  referenceNumber: "26PROC019900001",
  recordType: "PROC",
  title: "Πρόσκληση υποβολής προσφοράς για συντήρηση ιστοσελίδας",
  organization: "ΔΗΜΟΣ ΣΙΘΩΝΙΑΣ",
  budgetWithoutVat: 2400,
  cpvs: ["72212221-4"],
  description:
    "Υποστήριξη, συντήρηση και αναβάθμιση ιστοσελίδας για 12 μήνες",
  submissionDate: "2026-10-01T10:00:00.000Z",
  explicitRefs: [],
});

describe("REQ→PROC inferred scoring", () => {
  it("auto-links high-confidence same authority Sithonia case", () => {
    const result = matchProcToReqs(sithoniaProc(), [sithoniaReq()]);
    expect(result.decision).toBe("AUTO_LINK");
    expect(result.confidence).toBe("HIGH");
    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.parentAdam).toBe("26REQ019877036");
    expect(result.reasons.some((r) => r.label.includes("authority"))).toBe(true);
    expect(result.reasons.some((r) => r.label.includes("budget"))).toBe(true);
  });

  it("prioritizes watched Early Outreach REQ on tie", () => {
    const watched = { ...sithoniaReq(), watched: true as const };
    const other: RelationCandidate = {
      ...sithoniaReq(),
      referenceNumber: "26REQ019899999",
      watched: false,
    };
    const result = matchProcToReqs(sithoniaProc(), [other, watched]);
    expect(result.parentAdam).toBe("26REQ019877036");
    expect(result.reasons.some((r) => r.label.includes("Watched REQ"))).toBe(
      true,
    );
  });

  it("does not link similar title from another authority", () => {
    const other: RelationCandidate = {
      ...sithoniaProc(),
      organization: "ΔΗΜΟΣ ΘΕΣΣΑΛΟΝΙΚΗΣ",
      referenceNumber: "26PROC019900099",
    };
    const result = matchProcToReqs(other, [sithoniaReq()]);
    expect(result.decision).toBe("NO_LINK");
  });

  it("returns POSSIBLE_RELATION for medium score band", () => {
    const req = sithoniaReq();
    const proc: RelationCandidate = {
      ...sithoniaProc(),
      // Weaken signals: different budget & CPV, keep authority + title/scope/time
      budgetWithoutVat: 3100,
      cpvs: ["79980000-7"],
      description: "Συντήρηση ιστοσελίδας δήμου",
    };
    const scored = scoreReqProcPair(proc, req);
    expect(scored.score).toBeGreaterThanOrEqual(60);
    expect(scored.score).toBeLessThan(80);
    const result = matchProcToReqs(proc, [req]);
    expect(result.decision).toBe("POSSIBLE_RELATION");
    expect(result.confidence).toBe("MEDIUM");
  });

  it("explicit ADAM reference auto-links with HIGH confidence", () => {
    const result = matchProcToReqs(
      {
        ...sithoniaProc(),
        description: "Συνέχεια του 26REQ019877036 για συντήρηση ιστοσελίδας",
      },
      [sithoniaReq()],
      {
        corpusText:
          "Σε συνέχεια του πρωτογενούς αιτήματος 26REQ019877036 καλείται...",
      },
    );
    expect(result.decision).toBe("AUTO_LINK");
    expect(result.method).toBe("EXPLICIT_REFERENCE");
    expect(result.confidence).toBe("HIGH");
  });
});

describe("targeted invitation + legal identity", () => {
  it("extracts vendor and marks NOT_INVITED for other company", () => {
    const pdf = classifyPdfText(`
      ΠΡΟΣ: My company projects Ο.Ε.
      Δεν λαμβάνονται υπόψη προσφορές οικονομικών φορέων που δεν προσκλήθηκαν.
    `);
    expect(pdf.targetedSupplier).toBe(true);
    expect(pdf.targetedSupplierName).toContain("My company projects");

    const assessment = assessInvitation(pdf, {
      legalName: "ΓΙΑΝΝΟΥΣΗΣ ΙΩΑΝΝΗΣ ΤΟΥ ΓΡΗΓΟΡΙΟΥ",
      vatNumber: "123456789",
      brandName: "TEKIA",
    });
    expect(assessment.invitationType).toBe("TARGETED");
    expect(assessment.invitedVendorName).toContain("My company projects");
    expect(assessment.ourInvitationStatus).toBe("NOT_INVITED");
  });

  it("marks INVITED when legal name matches", () => {
    expect(
      compareInvitedVendor("ΓΙΑΝΝΟΥΣΗΣ ΙΩΑΝΝΗΣ ΤΟΥ ΓΡΗΓΟΡΙΟΥ", {
        legalName: "ΓΙΑΝΝΟΥΣΗΣ ΙΩΑΝΝΗΣ ΤΟΥ ΓΡΗΓΟΡΙΟΥ",
        vatNumber: "",
      }),
    ).toBe("INVITED");
  });

  it("returns UNKNOWN when no vendor named", () => {
    const assessment = assessInvitation(
      {
        targetedSupplier: false,
        targetedSupplierName: null,
        nonInvitedOffersRejected: false,
      },
      { legalName: "ΓΙΑΝΝΟΥΣΗΣ ΙΩΑΝΝΗΣ ΤΟΥ ΓΡΗΓΟΡΙΟΥ", vatNumber: "" },
    );
    expect(assessment.invitationType).toBe("OPEN");
    expect(assessment.ourInvitationStatus).toBe("UNKNOWN");
  });
});

describe("persist relation without LOST", () => {
  let dir: string;
  let dbPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "tekia-rel-"));
    dbPath = join(dir, "t.db");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("links PROC to REQ, stores invitation, does not mark LOST", () => {
    const db = openDatabase(dbPath);
    const repo = createRepository(db);
    const now = "2026-09-29T10:00:00.000Z";

    repo.saveOperatorSettings({
      ...repo.getOperatorSettings(),
      company: {
        ...repo.getOperatorSettings().company,
        legal_name: "ΓΙΑΝΝΟΥΣΗΣ ΙΩΑΝΝΗΣ ΤΟΥ ΓΡΗΓΟΡΙΟΥ",
        brand_name: "TEKIA",
        vat_number: "999999999",
      },
    });

    repo.upsertNewOrTouch({
      referenceNumber: "26REQ019877036",
      recordType: "REQ",
      title: "Πρωτογενές αίτημα για συντήρηση ιστοσελίδας",
      organization: "ΔΗΜΟΣ ΣΙΘΩΝΙΑΣ",
      submissionDate: now,
      signedDate: null,
      finalSubmissionDate: null,
      budgetWithoutVat: 2400,
      budgetWithVat: null,
      cpvs: ["72212221-4"],
      score: 85,
      stage: "EARLY",
      targetedSupplier: false,
      nonInvitedOffersRejected: false,
      pdfTextStatus: "skipped",
      officialPdfUrl: "https://example.com/r.pdf",
      publicKimdisUrl: "https://example.com/r",
      scoreReasons: [],
      webRelevant: true,
      webCategory: "WEBSITE_SUPPORT",
      relevanceStatus: "RELEVANT",
      ignoreReason: null,
      reviewReason: null,
      rawJson: {
        objectDetails: [
          {
            shortDescription:
              "Υπηρεσίες υποστήριξης, συντήρησης και αναβάθμισης ιστοσελίδας για 12 μήνες",
          },
        ],
      },
      nowIso: now,
    });

    repo.upsertNewOrTouch({
      referenceNumber: "26PROC019900001",
      recordType: "PROC",
      title: "Πρόσκληση για συντήρηση ιστοσελίδας",
      organization: "ΔΗΜΟΣ ΣΙΘΩΝΙΑΣ",
      submissionDate: "2026-10-01T10:00:00.000Z",
      signedDate: null,
      finalSubmissionDate: "2026-10-10T10:00:00.000Z",
      budgetWithoutVat: 2400,
      budgetWithVat: null,
      cpvs: ["72212221-4"],
      score: 70,
      stage: "TARGETED",
      targetedSupplier: true,
      nonInvitedOffersRejected: true,
      pdfTextStatus: "extracted",
      officialPdfUrl: "https://example.com/p.pdf",
      publicKimdisUrl: "https://example.com/p",
      scoreReasons: [],
      webRelevant: true,
      webCategory: "WEBSITE_SUPPORT",
      relevanceStatus: "TARGETED",
      ignoreReason: null,
      reviewReason: null,
      rawJson: {
        objectDetails: [
          {
            shortDescription:
              "Υποστήριξη, συντήρηση και αναβάθμιση ιστοσελίδας για 12 μήνες",
          },
        ],
      },
      nowIso: "2026-10-01T10:00:00.000Z",
    });

    const pdf = classifyPdfText(`
      ΠΡΟΣ: My company projects Ο.Ε.
      Δεν λαμβάνονται υπόψη προσφορές οικονομικών φορέων που δεν προσκλήθηκαν.
    `);

    const applied = applyProcRelationAndInvitation(
      repo,
      "26PROC019900001",
      pdf,
      {
        corpusText:
          "Πρόσκληση για συντήρηση ιστοσελίδας. Υποστήριξη, συντήρηση και αναβάθμιση ιστοσελίδας για 12 μήνες. ΠΡΟΣ: My company projects Ο.Ε.",
        pdfExtracted: true,
      },
    );

    expect(applied?.relation.decision).toBe("AUTO_LINK");
    expect(applied?.invitation.ourInvitationStatus).toBe("NOT_INVITED");

    const proc = repo.findByAdam("26PROC019900001");
    expect(proc?.parent_tender_id).toBe("26REQ019877036");
    expect(proc?.invitation_type).toBe("TARGETED");
    expect(proc?.invited_vendor_name).toContain("My company projects");
    expect(proc?.our_invitation_status).toBe("NOT_INVITED");
    expect(proc?.current_status).not.toBe("LOST");

    const req = repo.findByAdam("26REQ019877036");
    expect(req?.current_status).not.toBe("LOST");

    const linked = repo.listLinkedProcsForReq("26REQ019877036");
    expect(linked).toHaveLength(1);
    expect(JSON.parse(proc?.relation_reasons_json ?? "[]").length).toBeGreaterThan(0);
  });
});
