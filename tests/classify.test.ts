import { describe, expect, it } from "vitest";
import { classifyPdfText } from "../src/pdf/classify.js";

describe("pdf classify", () => {
  it("detects already-targeted invitation text", () => {
    const text = `
      ΠΡΟΣ: ΑΒΓ Πληροφορική Α.Ε.
      Η παρούσα πρόσκληση απευθύνεται στον ανωτέρω οικονομικό φορέα.
      Δεν λαμβάνονται υπόψη προσφορές οικονομικών φορέων που δεν προσκλήθηκαν.
    `;

    const result = classifyPdfText(text);
    expect(result.targetedSupplier).toBe(true);
    expect(result.targetedSupplierName).toContain("ΑΒΓ");
    expect(result.nonInvitedOffersRejected).toBe(true);
  });

  it("marks already advanced award language", () => {
    const text = `
      Αποφασίζει την ανάθεση στην εταιρεία Χ.
      Η πλέον συμφέρουσα προσφορά της εταιρείας επελέγη μετά από έρευνα αγοράς.
    `;

    const result = classifyPdfText(text);
    expect(result.stage).toBe("ALREADY_ADVANCED");
    expect(result.advancedPhraseHits).toBeGreaterThanOrEqual(2);
  });
});
