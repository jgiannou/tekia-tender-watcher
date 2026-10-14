import { describe, expect, it } from "vitest";
import {
  parsePublicUiRelatedActs,
} from "../src/saas/services/kimdis-public-ui.js";
import { mapLooseKimdisAct } from "../src/saas/services/kimdis-acts.js";
import {
  discoverRelatedProcsFromPublicUi,
} from "../src/saas/services/related-acts.js";
import type { Tender } from "@prisma/client";

const REQ_DETAIL_HTML = `
<label>Άμεσα συνδεδεμένες πράξεις</label>
<span class="tableLabels">Εγκρίνει :</span>
<a href="#" class="approved_view"><i class="pi pi-angle-left"></i>26REQ019966624</a>
<span class="tableLabels">Αφορά την Πρόσκληση-Προκήρυξη-Διακήρυξη με Μοναδικό Αριθμό :</span>
<a href="#" class="approved_view">26PROC019972045 <i class="pi pi-angle-right"></i></a>
`;

describe("public UI related acts", () => {
  it("parses linked PROC from REQ detail HTML even when invitee is someone else", () => {
    const related = parsePublicUiRelatedActs(
      REQ_DETAIL_HTML,
      "26REQ019966687",
    );
    expect(related).toEqual(
      expect.arrayContaining([
        {
          adam: "26PROC019972045",
          recordType: "PROC",
          invitationLink: true,
        },
        {
          adam: "26REQ019966624",
          recordType: "REQ",
          invitationLink: false,
        },
      ]),
    );
    expect(related.some((row) => row.adam === "26REQ019966687")).toBe(false);
  });

  it("maps Open Data approvedRequests[].code into parentAdams", () => {
    const item = mapLooseKimdisAct(
      {
        referenceNumber: "26PROC019972045",
        title: "Πρόσκληση ιστοσελίδας",
        organization: { value: "ΔΗΜΟΣ ΚΑΤΩ ΝΕΥΡΟΚΟΠΙΟΥ" },
        totalCostWithoutVAT: 2000,
        approvedRequests: [{ code: "26REQ019966687" }],
        noticeRefNo: [],
        requestRefNo: [],
      },
      "PROC",
      (adam) => `https://example.test/${adam}`,
    );
    expect(item?.parentAdams).toContain("26REQ019966687");
  });

  it("maps objectDetails.shortDescription as Περιληπτική περιγραφή", () => {
    const item = mapLooseKimdisAct(
      {
        referenceNumber: "26REQ019966687",
        title: "Αίτημα ιστοσελίδας",
        organization: { value: "ΔΗΜΟΣ ΚΑΤΩ ΝΕΥΡΟΚΟΠΙΟΥ" },
        objectDetails: [
          {
            shortDescription:
              "Παροχή υπηρεσιών τεχνικής υποστήριξης της επίσημης ιστοσελίδας του Δήμου.",
          },
        ],
      },
      "REQ",
      (adam) => `https://example.test/${adam}`,
    );
    expect(item?.description).toContain("τεχνικής υποστήριξης");
  });

  it("discovers CONFIRMED REQ→PROC from public UI fetch", async () => {
    const source = {
      id: "tender-req-1",
      referenceNumber: "26REQ019966687",
      recordType: "REQ",
      title: "Παροχή υπηρεσιών τεχνικής υποστήριξης της επίσημης ιστοσελίδας",
      contractingAuthority: "ΔΗΜΟΣ ΚΑΤΩ ΝΕΥΡΟΚΟΠΙΟΥ",
    } as Tender;

    const discoveries = await discoverRelatedProcsFromPublicUi(source, {
      fetchRelated: async () => ({
        ok: true,
        sourceAdam: "26REQ019966687",
        related: [
          {
            adam: "26PROC019972045",
            recordType: "PROC",
            invitationLink: true,
          },
        ],
        detailsByAdam: {
          "26PROC019972045": {
            title:
              "Παροχή υπηρεσιών τεχνικής υποστήριξης της επίσημης ιστοσελίδας του Δήμου για δύο (2) έτη.",
            contractingAuthority: "ΔΗΜΟΣ ΚΑΤΩ ΝΕΥΡΟΚΟΠΙΟΥ",
          },
        },
      }),
    });

    expect(discoveries).toHaveLength(1);
    expect(discoveries[0]).toMatchObject({
      sourceTenderId: "tender-req-1",
      relationType: "REQ_TO_PROC",
      confidence: "CONFIRMED",
      detectionMethod: "public_ui_related_acts",
      target: {
        referenceNumber: "26PROC019972045",
        recordType: "PROC",
        parentTenderId: "tender-req-1",
      },
    });
  });
});
