/**
 * Derived Early Outreach monitoring state.
 * outreachStatus=SENT implies watchForRelatedProc — no separate toggle.
 * Never maps outreach SENT → operational SUBMITTED.
 */

import type { DraftPackage, TenderDrafts } from "./types.js";

export type MonitoringState =
  | "NONE"
  | "WAITING_FOR_INVITATION"
  | "POSSIBLE_RELATION"
  | "INVITED"
  | "OPEN_INVITATION"
  | "TARGETED_OTHER"
  | "UNKNOWN_LINKED";

export type LinkedProcSummary = {
  referenceNumber: string;
  linked: boolean;
  possible: boolean;
  invitationType: string | null;
  ourInvitationStatus: string | null;
  invitedVendorName?: string | null;
};

export const isOutreachSent = (
  outreach: Pick<DraftPackage, "status"> | null | undefined,
): boolean => outreach?.status === "SENT";

/** Automatic: SENT outreach means we watch for related PROC. */
export const watchForRelatedProc = (
  drafts: Pick<TenderDrafts, "outreach"> | null | undefined,
): boolean => isOutreachSent(drafts?.outreach);

export const deriveReqMonitoringState = (input: {
  outreachStatus: string | null | undefined;
  linkedProcs: LinkedProcSummary[];
}): MonitoringState => {
  if (input.outreachStatus !== "SENT") return "NONE";

  const confirmed = input.linkedProcs.filter((p) => p.linked);
  if (confirmed.length > 0) {
    // Prefer the strongest outcome among confirmed links
    if (
      confirmed.some(
        (p) =>
          p.invitationType === "TARGETED" &&
          p.ourInvitationStatus === "INVITED",
      )
    ) {
      return "INVITED";
    }
    if (confirmed.some((p) => p.invitationType === "OPEN")) {
      return "OPEN_INVITATION";
    }
    if (
      confirmed.some(
        (p) =>
          p.invitationType === "TARGETED" &&
          p.ourInvitationStatus === "NOT_INVITED",
      )
    ) {
      return "TARGETED_OTHER";
    }
    return "UNKNOWN_LINKED";
  }

  if (input.linkedProcs.some((p) => p.possible)) {
    return "POSSIBLE_RELATION";
  }

  return "WAITING_FOR_INVITATION";
};

/** Still actively waiting — no final related-PROC outcome yet. */
export const isActivelyMonitored = (state: MonitoringState): boolean =>
  state === "WAITING_FOR_INVITATION" || state === "POSSIBLE_RELATION";

export const isFormalOpportunityState = (state: MonitoringState): boolean =>
  state === "INVITED" || state === "OPEN_INVITATION";

export const isClosedMonitoringState = (state: MonitoringState): boolean =>
  state === "TARGETED_OTHER";

export const getGreekMonitoringStateLabel = (state: MonitoringState): string => {
  const map: Record<MonitoringState, string> = {
    NONE: "—",
    WAITING_FOR_INVITATION: "Αναμονή πρόσκλησης",
    POSSIBLE_RELATION: "Πιθανή συνέχεια — προς επιβεβαίωση",
    INVITED: "Προσκληθήκαμε",
    OPEN_INVITATION: "Ανοικτή πρόσκληση",
    TARGETED_OTHER: "Προσκλήθηκε άλλος προμηθευτής",
    UNKNOWN_LINKED: "Σχετική πρόσκληση — άγνωστη ταξινόμηση",
  };
  return map[state];
};

export const getGreekMonitoringRecommendedAction = (
  state: MonitoringState,
): string => {
  switch (state) {
    case "WAITING_FOR_INVITATION":
      return "Παρακολούθηση — αναμονή σχετικής πρόσκλησης";
    case "POSSIBLE_RELATION":
      return "Επιβεβαίωση ή απόρριψη πιθανής σύνδεσης";
    case "INVITED":
      return "Προετοιμασία Φακέλου Προσφοράς";
    case "OPEN_INVITATION":
      return "Έλεγχος απαιτήσεων και προετοιμασία προσφοράς";
    case "TARGETED_OTHER":
      return "Καμία υποβολή προσφοράς";
    case "UNKNOWN_LINKED":
      return "Έλεγχος πρόσκλησης";
    default:
      return "—";
  }
};

export const primaryRelatedProc = (
  linkedProcs: LinkedProcSummary[],
): LinkedProcSummary | null => {
  const confirmed = linkedProcs.find((p) => p.linked);
  if (confirmed) return confirmed;
  return linkedProcs.find((p) => p.possible) ?? null;
};
