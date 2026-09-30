/**
 * Desktop shell must never auto-send email/offers/submissions.
 * External communication remains Prepare → Review → Approve → Send (future local).
 */
export const DESKTOP_EXTERNAL_SENDING_ENABLED = false as const;

export const FORBIDDEN_DESKTOP_SEND_SYMBOLS = [
  "sendEmail",
  "submitTender",
  "sendOffer",
  "autoContactAuthority",
] as const;

export const assertDesktopCannotAutoSend = (): void => {
  if (DESKTOP_EXTERNAL_SENDING_ENABLED) {
    throw new Error("Desktop auto-sending must remain disabled");
  }
};
