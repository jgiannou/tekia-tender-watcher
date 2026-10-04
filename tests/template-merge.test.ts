import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  assertMergeTargetIsCopy,
  buildMergeReplacements,
  buildOutreachDraftContent,
  buildReplaceAllTextRequests,
  canMarkDocumentReady,
  EARLY_OUTREACH_CANONICAL_TEMPLATE,
  EARLY_OUTREACH_DOCUMENT_TITLE,
  findUnresolvedPlaceholders,
  formatOutreachDriveDocumentText,
  hashOutreachContent,
  placeholderToken,
} from "../apps/desktop/electron/google/template-merge.ts";

const knownCtx = {
  organization: "Δήμος Παραδείγματος",
  tenderTitle: "Προμήθεια λογισμικού",
  adam: "26REQ000012345",
  protocolNumber: null as string | null,
  contactName: "Μαρία Παπαδοπούλου",
  contactEmail: "maria@tekia.gr",
  contactPhone: "+30 210 0000000",
  legalRepresentative: "Μαρία Παπαδοπούλου",
  date: "30/09/2026",
  scopeSummary: "Should not auto-fill technical SCOPE_SUMMARY",
  operatorValues: {} as Record<string, string>,
};

describe("template merge — master vs copy safety", () => {
  it("refuses Docs merge when target equals master", () => {
    expect(() => assertMergeTargetIsCopy("master-1", "master-1")).toThrow(
      /tender copy, not the master/,
    );
  });

  it("allows Docs merge only when copy id differs from master", () => {
    expect(() => assertMergeTargetIsCopy("master-1", "copy-9")).not.toThrow();
  });

  it("batchUpdate path in vault-service targets copied.id / driveFileId, never masterId", () => {
    const service = readFileSync(
      resolve(process.cwd(), "apps/desktop/electron/google/vault-service.ts"),
      "utf8",
    );
    expect(service).toContain("assertMergeTargetIsCopy(masterId, copied.id)");
    expect(service).toContain(
      "await batchReplaceAllText(accessToken, copied.id, requests)",
    );
    expect(service).toContain(
      "await batchReplaceAllText(accessToken, existing.driveFileId, requests)",
    );
    expect(service).not.toMatch(
      /batchReplaceAllText\(\s*accessToken,\s*masterId/,
    );
    expect(service).not.toMatch(
      /batchReplaceAllText\(\s*accessToken,\s*existing\.masterFileId/,
    );
  });

  it("docs-api batchUpdate uses documentId argument (caller must pass copy)", () => {
    const docsApi = readFileSync(
      resolve(process.cwd(), "apps/desktop/electron/google/docs-api.ts"),
      "utf8",
    );
    expect(docsApi).toContain("documents/${encodeURIComponent(documentId)}:batchUpdate");
    expect(docsApi).toContain("Always operate on tender COPY");
  });
});

describe("template merge — known fields & no invention", () => {
  it("replaces known tender and company contact fields", () => {
    const plan = buildMergeReplacements("OUTREACH", knownCtx);
    expect(plan.replacements.ORGANIZATION).toBe("Δήμος Παραδείγματος");
    expect(plan.replacements.TENDER_TITLE).toBe("Προμήθεια λογισμικού");
    expect(plan.replacements.ADAM).toBe("26REQ000012345");
    expect(plan.replacements.CONTACT_NAME).toBe("Μαρία Παπαδοπούλου");
    expect(plan.replacements.CONTACT_EMAIL).toBe("maria@tekia.gr");
    expect(plan.replacements.CONTACT_PHONE).toBe("+30 210 0000000");
    expect(plan.replacements.DATE).toBe("30/09/2026");
  });

  it("does not invent missing PROTOCOL_NUMBER", () => {
    const plan = buildMergeReplacements("OUTREACH", {
      ...knownCtx,
      protocolNumber: null,
    });
    expect(plan.replacements.PROTOCOL_NUMBER).toBeUndefined();
    expect(plan.skippedUnknown).toContain("PROTOCOL_NUMBER");
  });

  it("does not invent empty contact fields", () => {
    const plan = buildMergeReplacements("OUTREACH", {
      ...knownCtx,
      contactName: "  ",
      contactEmail: null,
      contactPhone: undefined,
    });
    expect(plan.replacements.CONTACT_NAME).toBeUndefined();
    expect(plan.replacements.CONTACT_EMAIL).toBeUndefined();
    expect(plan.replacements.CONTACT_PHONE).toBeUndefined();
  });

  it("never falls back CONTACT_NAME to LEGAL_NAME", () => {
    const plan = buildMergeReplacements("OUTREACH", {
      ...knownCtx,
      contactName: "",
      legalName: "ΓΙΑΝΝΟΥΣΗΣ ΙΩΑΝΝΗΣ ΤΟΥ ΓΡΗΓΟΡΙΟΥ",
      brandName: "TEKIA",
      recordType: "REQ",
    });
    expect(plan.replacements.CONTACT_NAME).toBeUndefined();
    expect(plan.skippedUnknown).toContain("CONTACT_NAME");
    expect(plan.replacements.LEGAL_NAME).toBe("ΓΙΑΝΝΟΥΣΗΣ ΙΩΑΝΝΗΣ ΤΟΥ ΓΡΗΓΟΡΙΟΥ");
    expect(plan.replacements.BRAND_NAME).toBe("TEKIA");
  });

  it("OUTREACH for ADAM 26REQ019873897 uses Πρωτογενές Αίτημα and Greek title", () => {
    const plan = buildMergeReplacements("OUTREACH", {
      organization: "ΠΕΤΑ Α.Ε.",
      tenderTitle: "Συντήρηση της ιστοσελίδας για την ΠΕΤΑ Α.Ε.",
      adam: "26REQ019873897",
      recordType: "REQ",
      contactName: "Ιωάννης Γιαννούσης",
      legalName: "ΓΙΑΝΝΟΥΣΗΣ ΙΩΑΝΝΗΣ ΤΟΥ ΓΡΗΓΟΡΙΟΥ",
      brandName: "TEKIA",
      contactEmail: "info@tekia.gr",
      contactPhone: "2100000000",
      date: "30/09/2026",
    });

    expect(plan.replacements.DOCUMENT_TITLE).toBe("ΕΚΔΗΛΩΣΗ ΕΝΔΙΑΦΕΡΟΝΤΟΣ");
    expect(plan.replacements.RECORD_TYPE_LABEL).toBe("Πρωτογενές Αίτημα");
    expect(plan.replacements.EMAIL_SUBJECT).toBe(
      "Εκδήλωση ενδιαφέροντος – Συντήρηση της ιστοσελίδας για την ΠΕΤΑ Α.Ε. – ΑΔΑΜ 26REQ019873897",
    );
    expect(plan.replacements.CONTACT_NAME).toBe("Ιωάννης Γιαννούσης");
    expect(plan.replacements.LEGAL_NAME).toBe("ΓΙΑΝΝΟΥΣΗΣ ΙΩΑΝΝΗΣ ΤΟΥ ΓΡΗΓΟΡΙΟΥ");
    expect(plan.replacements.BRAND_NAME).toBe("TEKIA");
    expect(plan.literalReplacements["EARLY OUTREACH"]).toBe(
      "ΕΚΔΗΛΩΣΗ ΕΝΔΙΑΦΕΡΟΝΤΟΣ",
    );
    expect(plan.literalReplacements["αίτημα/προμήθεια"]).toBe("Πρωτογενές Αίτημα");
    expect(EARLY_OUTREACH_CANONICAL_TEMPLATE).toContain("Πρωτογενές Αίτημα");
    expect(EARLY_OUTREACH_CANONICAL_TEMPLATE).not.toContain("EARLY OUTREACH");
    expect(EARLY_OUTREACH_CANONICAL_TEMPLATE).not.toContain("αίτημα/προμήθεια");
  });

  it("ReplaceAllText requests use {{KEY}} tokens and never empty replaceText for known keys", () => {
    const plan = buildMergeReplacements("OUTREACH", knownCtx);
    const requests = buildReplaceAllTextRequests(plan.replacements);
    expect(requests.length).toBeGreaterThan(0);
    for (const req of requests) {
      expect(req.replaceAllText.containsText.text).toMatch(/^\{\{[A-Z0-9_]+\}\}$/);
      expect(req.replaceAllText.replaceText.trim().length).toBeGreaterThan(0);
    }
    expect(
      requests.some(
        (r) => r.replaceAllText.containsText.text === placeholderToken("ADAM"),
      ),
    ).toBe(true);
  });

  it("buildOutreachDraftContent uses LEGAL_NAME in opening line, not brand as official entity", () => {
    const draft = buildOutreachDraftContent({
      organization: "ΠΕΤΑ Α.Ε.",
      tenderTitle: "Συντήρηση της ιστοσελίδας για την ΠΕΤΑ Α.Ε.",
      adam: "26REQ019873897",
      recordType: "REQ",
      contactName: "Ιωάννης Γιαννούσης",
      legalName: "ΓΙΑΝΝΟΥΣΗΣ ΙΩΑΝΝΗΣ ΤΟΥ ΓΡΗΓΟΡΙΟΥ",
      brandName: "TEKIA",
      contactEmail: "info@tekia.gr",
      contactPhone: "2100000000",
      date: "30/09/2026",
    });

    expect(draft.documentTitle).toBe(EARLY_OUTREACH_DOCUMENT_TITLE);
    expect(draft.subject).toContain("ΑΔΑΜ 26REQ019873897");
    expect(draft.subject).toMatch(/ΑΔΑΜ/);
    expect(draft.body).toContain(
      "εκ μέρους της επιχείρησης ΓΙΑΝΝΟΥΣΗΣ ΙΩΑΝΝΗΣ ΤΟΥ ΓΡΗΓΟΡΙΟΥ",
    );
    expect(draft.body).not.toContain("εκ μέρους της TEKIA");
    expect(draft.body).not.toContain("αίτημα/προμήθεια");
    expect(draft.body).toContain("Πρωτογενές Αίτημα");
    expect(draft.body).toContain("TEKIA"); // brand only in signature block
    expect(draft.unresolvedKeys).toEqual([]);

    const driveText = formatOutreachDriveDocumentText(draft.subject, draft.body);
    expect(driveText).toContain(draft.subject);
    expect(driveText).toContain(draft.body.trim());
    expect(driveText).toContain("Θέμα:");
    expect(hashOutreachContent(draft.subject, draft.body)).toBe(
      hashOutreachContent(draft.subject, draft.body),
    );
    expect(hashOutreachContent(draft.subject, draft.body)).not.toBe(
      hashOutreachContent(draft.subject, `${draft.body}x`),
    );

    const partial = buildOutreachDraftContent({
      tenderTitle: "Συντήρηση ιστοσελίδας",
      adam: "26REQ019873897",
      recordType: "REQ",
      brandName: "TEKIA",
      contactName: null,
      legalName: null,
      contactEmail: null,
      contactPhone: null,
    });
    expect(partial.body).toContain("{{CONTACT_NAME}}");
    expect(partial.body).toContain("{{LEGAL_NAME}}");
    expect(partial.body).toContain("εκ μέρους της επιχείρησης {{LEGAL_NAME}}");
    expect(partial.unresolvedKeys).toEqual(
      expect.arrayContaining(["CONTACT_NAME", "LEGAL_NAME"]),
    );
  });
});

describe("template merge — technical offer", () => {
  it("leaves technical narrative placeholders unresolved without operator input", () => {
    const plan = buildMergeReplacements("TECHNICAL_OFFER", knownCtx);
    expect(plan.replacements.SCOPE_SUMMARY).toBeUndefined();
    expect(plan.replacements.TECHNICAL_APPROACH).toBeUndefined();
    expect(plan.replacements.TIMELINE).toBeUndefined();
    expect(plan.skippedUnknown).toEqual(
      expect.arrayContaining([
        "SCOPE_SUMMARY",
        "TECHNICAL_APPROACH",
        "DELIVERABLES",
        "TIMELINE",
        "SUPPORT_TERMS",
        "COMPLIANCE_NOTES",
        "NOTES",
      ]),
    );
  });

  it("fills technical fields only when operator supplies them", () => {
    const plan = buildMergeReplacements("TECHNICAL_OFFER", {
      ...knownCtx,
      operatorValues: {
        TECHNICAL_APPROACH: "Approach A",
        TIMELINE: "30 days",
      },
    });
    expect(plan.replacements.TECHNICAL_APPROACH).toBe("Approach A");
    expect(plan.replacements.TIMELINE).toBe("30 days");
    expect(plan.replacements.DELIVERABLES).toBeUndefined();
  });
});

describe("template merge — economic offer", () => {
  it("requires explicit operator input for pricing fields", () => {
    const plan = buildMergeReplacements("ECONOMIC_OFFER", knownCtx);
    expect(plan.replacements.NET_AMOUNT).toBeUndefined();
    expect(plan.replacements.VAT_PERCENT).toBeUndefined();
    expect(plan.replacements.GROSS_AMOUNT).toBeUndefined();
    expect(plan.skippedUnknown).toEqual(
      expect.arrayContaining([
        "NET_AMOUNT",
        "VAT_PERCENT",
        "VAT_AMOUNT",
        "GROSS_AMOUNT",
        "PRICE_BREAKDOWN",
        "VALIDITY_PERIOD",
        "DELIVERY_TIME",
        "PAYMENT_TERMS",
      ]),
    );
  });

  it("merges economic values only after operator provides them", () => {
    const plan = buildMergeReplacements("ECONOMIC_OFFER", {
      ...knownCtx,
      operatorValues: {
        NET_AMOUNT: "10000",
        VAT_PERCENT: "24",
        VAT_AMOUNT: "2400",
        GROSS_AMOUNT: "12400",
        PRICE_BREAKDOWN: "Item A",
        VALIDITY_PERIOD: "60 days",
        DELIVERY_TIME: "15 days",
        PAYMENT_TERMS: "Net 30",
        NOTES: "Operator note",
      },
    });
    expect(plan.replacements.NET_AMOUNT).toBe("10000");
    expect(plan.replacements.GROSS_AMOUNT).toBe("12400");
    expect(plan.replacements.PAYMENT_TERMS).toBe("Net 30");
  });
});

describe("template merge — declaration", () => {
  it("never invents DECLARATION_TEXT", () => {
    const plan = buildMergeReplacements("DECLARATION", knownCtx);
    expect(plan.replacements.DECLARATION_TEXT).toBeUndefined();
    expect(plan.skippedUnknown).toContain("DECLARATION_TEXT");
    expect(plan.replacements.ORGANIZATION).toBe("Δήμος Παραδείγματος");
    expect(plan.replacements.LEGAL_REPRESENTATIVE).toBe("Μαρία Παπαδοπούλου");
  });

  it("fills DECLARATION_TEXT only from explicit operator input", () => {
    const plan = buildMergeReplacements("DECLARATION", {
      ...knownCtx,
      operatorValues: {
        DECLARATION_TEXT: "Δηλώνω υπεύθυνα ότι…",
        CAPACITY: "Νόμιμος εκπρόσωπος",
      },
    });
    expect(plan.replacements.DECLARATION_TEXT).toBe("Δηλώνω υπεύθυνα ότι…");
    expect(plan.replacements.CAPACITY).toBe("Νόμιμος εκπρόσωπος");
  });
});

describe("template merge — unresolved placeholders & READY gate", () => {
  it("detects unresolved {{...}} placeholders after merge", () => {
    const text = [
      "Org: Δήμος Παραδείγματος",
      "Approach: {{TECHNICAL_APPROACH}}",
      "Timeline: {{TIMELINE}}",
      "Notes: {{NOTES}}",
    ].join("\n");
    expect(findUnresolvedPlaceholders(text)).toEqual([
      "NOTES",
      "TECHNICAL_APPROACH",
      "TIMELINE",
    ]);
  });

  it("blocks READY while required unresolved placeholders remain", () => {
    expect(canMarkDocumentReady(["TECHNICAL_APPROACH", "TIMELINE"])).toBe(false);
    expect(canMarkDocumentReady([])).toBe(true);
  });

  it("markTenderDocumentReady enforces unresolved gate in vault-service", () => {
    const service = readFileSync(
      resolve(process.cwd(), "apps/desktop/electron/google/vault-service.ts"),
      "utf8",
    );
    expect(service).toContain("canMarkDocumentReady");
    expect(service).toContain("Cannot mark READY — unresolved placeholders");
  });
});

describe("template merge — no send during generation", () => {
  it("copyTemplateForTender / merge path never sends or submits", () => {
    const service = readFileSync(
      resolve(process.cwd(), "apps/desktop/electron/google/vault-service.ts"),
      "utf8",
    );
    const merge = readFileSync(
      resolve(process.cwd(), "apps/desktop/electron/google/template-merge.ts"),
      "utf8",
    );
    const docsApi = readFileSync(
      resolve(process.cwd(), "apps/desktop/electron/google/docs-api.ts"),
      "utf8",
    );
    for (const content of [service, merge, docsApi]) {
      expect(content).not.toContain("sendEmail");
      expect(content).not.toContain("submitOffer");
      expect(content).not.toContain("submitToPortal");
      expect(content).not.toContain("autoSend");
    }
    // status stays DRAFT at registration time
    expect(service).toContain('status: "DRAFT"');
    expect(service).toContain("masterUntouched: true");
  });
});
