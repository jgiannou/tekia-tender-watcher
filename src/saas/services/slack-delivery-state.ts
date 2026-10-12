import type { SlackConnectionStatus } from "@prisma/client";
import {
  slackPreferencesHaveAnyEnabled,
  type SlackNotificationPreferences,
} from "./slack-preferences.js";

/**
 * UI/delivery state derived from persisted connection fields.
 * Connection existence ≠ active sends.
 */
export type SlackDeliveryState =
  | "NEEDS_RECONNECT"
  | "PLAN_PAUSED"
  | "SETUP_INCOMPLETE"
  | "PAUSED"
  | "NO_CATEGORIES"
  | "ACTIVE";

export const SLACK_DELIVERY_STATE_LABEL_EL: Record<SlackDeliveryState, string> =
  {
    NEEDS_RECONNECT: "Η σύνδεση με το Slack χρειάζεται ανανέωση",
    PLAN_PAUSED:
      "Οι ειδοποιήσεις Slack έχουν τεθεί σε παύση. Απαιτείται ενεργό Basic ή Pro.",
    SETUP_INCOMPLETE: "Επιλέξτε τις ειδοποιήσεις σας για να ξεκινήσετε",
    PAUSED: "Οι ειδοποιήσεις είναι σε παύση",
    NO_CATEGORIES: "Δεν έχετε επιλέξει τύπο ειδοποιήσεων",
    ACTIVE: "Οι ειδοποιήσεις είναι ενεργές",
  };

export const deriveSlackDeliveryState = (input: {
  status: SlackConnectionStatus;
  notificationsArmed: boolean;
  preferences: SlackNotificationPreferences;
}): SlackDeliveryState => {
  if (input.status === "NEEDS_RECONNECT") return "NEEDS_RECONNECT";
  if (input.status === "PLAN_PAUSED") return "PLAN_PAUSED";
  if (!input.notificationsArmed) return "SETUP_INCOMPLETE";
  if (input.status === "PAUSED" || input.status === "DISCONNECTED") {
    return "PAUSED";
  }
  if (!slackPreferencesHaveAnyEnabled(input.preferences)) {
    return "NO_CATEGORIES";
  }
  if (input.status === "ACTIVE") return "ACTIVE";
  return "PAUSED";
};

/** True only when automatic sends are live (green indicator). */
export const slackDeliveryStateIsLive = (
  state: SlackDeliveryState,
): boolean => state === "ACTIVE";

export type SlackTestDelivery = "queued" | "delivered";

export const slackTestResultMessageEl = (input: {
  delivery: SlackTestDelivery;
  channelLabel: string;
}): string => {
  if (input.delivery === "queued") {
    return "Η δοκιμαστική ειδοποίηση προγραμματίστηκε για αποστολή.";
  }
  return `Η δοκιμαστική ειδοποίηση στάλθηκε στο ${input.channelLabel}.`;
};
