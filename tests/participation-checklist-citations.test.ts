import { describe, expect, it } from "vitest";
import {
  extractParticipationChecklist,
  isDocumentExpiredForChecklist,
} from "../src/saas/services/participation-checklist.js";

describe("participation checklist citations", () => {
  it("attaches page excerpts for rule hits", () => {
    const text = `Προκήρυξη διαγωνισμού
Προθεσμία υποβολής προσφορών 15/11/2026.
Απαιτείται φορολογική ενημερότητα και ασφαλιστική ενημερότητα.
Κριτήριο κατακύρωσης η πλέον συμφέρουσα προσφορά.`;
    const checklist = extractParticipationChecklist(text, {
      pages: [{ page: 1, text }],
      pageCount: 1,
      vaultDocs: [{ name: "Φορολογική ενημερότητα.pdf" }],
    });
    expect(checklist.readable).toBe(true);
    const deadline = checklist.fields.find((f) => f.key === "deadline");
    expect(deadline?.status).toBe("found");
    expect(deadline?.citation?.page).toBe(1);
    expect(deadline?.citation?.excerpt).toMatch(/Προθεσμία/i);
    const tax = checklist.documents.find((d) => d.key === "tax");
    expect(tax?.status).toBe("needs_review");
    expect(checklist.matchDisclaimerEl).toMatch(/δεν επιβεβαιώνει/i);
  });

  it("does not invent page 1 when there are no page splits", () => {
    const text = `Προκήρυξη διαγωνισμού
Προθεσμία υποβολής προσφορών 15/11/2026.
Απαιτείται φορολογική ενημερότητα.`;
    const checklist = extractParticipationChecklist(text, { pages: [] });
    const deadline = checklist.fields.find((f) => f.key === "deadline");
    expect(deadline?.citation?.page).toBeNull();
    expect(deadline?.citation?.confidence).toBe("low");
  });

  it("marks vault docs expired relative to submission deadline", () => {
    const text = `Προκήρυξη διαγωνισμού με αρκετό κείμενο.
Προθεσμία υποβολής προσφορών 15/12/2026.
Απαιτείται φορολογική ενημερότητα.`;
    const checklist = extractParticipationChecklist(text, {
      pages: [{ page: 2, text }],
      vaultDocs: [
        {
          name: "Φορολογική ενημερότητα.pdf",
          // Still valid today (2026-10-10), but expires before submission.
          expiresAt: "2026-11-01T00:00:00.000Z",
        },
      ],
    });
    expect(checklist.documents.find((d) => d.key === "tax")?.status).toBe(
      "expired",
    );
    expect(
      isDocumentExpiredForChecklist(
        "2026-11-01T00:00:00.000Z",
        new Date("2026-12-15T00:00:00.000Z"),
      ),
    ).toBe(true);
  });

  it("states unreadable PDF clearly", () => {
    const checklist = extractParticipationChecklist("too short");
    expect(checklist.readable).toBe(false);
    expect(checklist.unreadMessage).toMatch(/χειροκίνητα/i);
  });

  it("states zero automatic findings", () => {
    const text =
      "Αυτό είναι ένα αρκετά μεγάλο κείμενο τεχνικών προδιαγραφών για προμήθεια υλικών γραφείου και περιγραφή αντικειμένου χωρίς ημερομηνίες ή απαιτήσεις συμμετοχής.";
    const checklist = extractParticipationChecklist(text);
    expect(checklist.readable).toBe(true);
    expect(checklist.zeroRulesMessage ?? "").toMatch(/αυτόματο έλεγχο/i);
  });
});
