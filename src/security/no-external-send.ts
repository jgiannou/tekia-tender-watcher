/**
 * HARD SECURITY BOUNDARY
 *
 * The cloud watcher must never send emails, submit offers, upload to portals,
 * or contact public authorities. External sending belongs only on a future
 * LOCAL operator process — never in scheduled/cron cloud jobs.
 *
 * Do not add sendEmail / submitTender / sendOffer / autoContactAuthority here.
 */
export const CLOUD_EXTERNAL_SENDING_ENABLED = false as const;

export const FORBIDDEN_CLOUD_SEND_SYMBOLS = [
  "sendEmail",
  "submitTender",
  "sendOffer",
  "autoContactAuthority",
] as const;

export const assertCloudCannotSend = (): void => {
  if (CLOUD_EXTERNAL_SENDING_ENABLED) {
    throw new Error("Cloud external sending must remain disabled");
  }
};
