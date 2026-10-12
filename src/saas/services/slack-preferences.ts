export type SlackNotificationPreferences = {
  newOpportunity: boolean;
  relatedActOnFollowed: boolean;
  deadlineRadar: boolean;
};

export const DEFAULT_SLACK_PREFERENCES: SlackNotificationPreferences = {
  newOpportunity: false,
  relatedActOnFollowed: false,
  deadlineRadar: false,
};

export const normalizeSlackPreferences = (
  value: unknown,
): SlackNotificationPreferences => {
  const raw =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  return {
    newOpportunity: raw.newOpportunity === true,
    relatedActOnFollowed: raw.relatedActOnFollowed === true,
    deadlineRadar: raw.deadlineRadar === true,
  };
};

export const slackPreferencesHaveAnyEnabled = (
  prefs: SlackNotificationPreferences,
): boolean =>
  prefs.newOpportunity ||
  prefs.relatedActOnFollowed ||
  prefs.deadlineRadar;
