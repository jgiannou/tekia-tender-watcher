import { describe, expect, it } from "vitest";
import {
  deriveReqMonitoringState,
  getGreekMonitoringRecommendedAction,
  getGreekMonitoringStateLabel,
  isActivelyMonitored,
  isOutreachSent,
  watchForRelatedProc,
} from "../src/operator/outreach-monitoring.js";

describe("outreach monitoring derive", () => {
  it("treats SENT as watching for related PROC", () => {
    expect(isOutreachSent({ status: "SENT" })).toBe(true);
    expect(watchForRelatedProc({ outreach: { status: "SENT" } })).toBe(true);
    expect(watchForRelatedProc({ outreach: { status: "READY" } })).toBe(false);
  });

  it("WAITING_FOR_INVITATION when SENT and no related PROC", () => {
    const state = deriveReqMonitoringState({
      outreachStatus: "SENT",
      linkedProcs: [],
    });
    expect(state).toBe("WAITING_FOR_INVITATION");
    expect(isActivelyMonitored(state)).toBe(true);
    expect(getGreekMonitoringStateLabel(state)).toBe("Αναμονή πρόσκλησης");
  });

  it("TARGETED_OTHER closes waiting but is not LOST wording", () => {
    const state = deriveReqMonitoringState({
      outreachStatus: "SENT",
      linkedProcs: [
        {
          referenceNumber: "26PROC000000001",
          linked: true,
          possible: false,
          invitationType: "TARGETED",
          ourInvitationStatus: "NOT_INVITED",
          invitedVendorName: "My company projects Ο.Ε.",
        },
      ],
    });
    expect(state).toBe("TARGETED_OTHER");
    expect(isActivelyMonitored(state)).toBe(false);
    expect(getGreekMonitoringStateLabel(state)).toBe(
      "Προσκλήθηκε άλλος προμηθευτής",
    );
    expect(getGreekMonitoringRecommendedAction(state)).toContain(
      "Καμία υποβολή",
    );
  });

  it("INVITED and OPEN move to formal opportunity states", () => {
    expect(
      deriveReqMonitoringState({
        outreachStatus: "SENT",
        linkedProcs: [
          {
            referenceNumber: "26PROC1",
            linked: true,
            possible: false,
            invitationType: "TARGETED",
            ourInvitationStatus: "INVITED",
          },
        ],
      }),
    ).toBe("INVITED");

    expect(
      deriveReqMonitoringState({
        outreachStatus: "SENT",
        linkedProcs: [
          {
            referenceNumber: "26PROC2",
            linked: true,
            possible: false,
            invitationType: "OPEN",
            ourInvitationStatus: "UNKNOWN",
          },
        ],
      }),
    ).toBe("OPEN_INVITATION");
  });

  it("possible relation stays actively monitored", () => {
    const state = deriveReqMonitoringState({
      outreachStatus: "SENT",
      linkedProcs: [
        {
          referenceNumber: "26PROC3",
          linked: false,
          possible: true,
          invitationType: "UNKNOWN",
          ourInvitationStatus: "UNKNOWN",
        },
      ],
    });
    expect(state).toBe("POSSIBLE_RELATION");
    expect(isActivelyMonitored(state)).toBe(true);
  });
});
