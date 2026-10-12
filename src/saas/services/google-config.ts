import { isSecretsEncryptionConfigured } from "../crypto/secrets.js";

export const GOOGLE_OAUTH_AUTHORIZE_URL =
  "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_OAUTH_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
export const GOOGLE_USERINFO_URL =
  "https://openidconnect.googleapis.com/v1/userinfo";
export const GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3";
export const GOOGLE_DRIVE_API = "https://www.googleapis.com/drive/v3";
export const GOOGLE_DRIVE_UPLOAD_API =
  "https://www.googleapis.com/upload/drive/v3";
export const GOOGLE_SHEETS_API = "https://sheets.googleapis.com/v4";

/** Secondary calendars + events only — not primary calendar access. */
export const GOOGLE_SCOPE_CALENDAR_APP_CREATED =
  "https://www.googleapis.com/auth/calendar.app.created";
/** OpenID for account identity (email / sub). */
export const GOOGLE_SCOPE_OPENID = "openid";
export const GOOGLE_SCOPE_EMAIL = "email";
/** Drive: only files created/opened by the app / Picker. */
export const GOOGLE_SCOPE_DRIVE_FILE =
  "https://www.googleapis.com/auth/drive.file";
/** Spreadsheets created/opened by the app. */
export const GOOGLE_SCOPE_SPREADSHEETS =
  "https://www.googleapis.com/auth/spreadsheets";

/** Shown wherever a Drive import is offered (copy, not live sync). */
export const GOOGLE_DRIVE_IMPORT_COPY_HINT_EL =
  "Θα αποθηκευτεί αντίγραφο του αρχείου στα Έγγραφα του ARC. Το αρχείο στο Google Drive δεν συγχρονίζεται και δεν τροποποιείται.";

export type GoogleCapability = "calendar" | "drive" | "sheets";

export type GoogleOAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

const truthy = (value: string | undefined): boolean => {
  const v = String(value || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
};

export const getSaasGoogleOAuthConfig = (
  env: NodeJS.ProcessEnv = process.env,
): GoogleOAuthConfig | null => {
  const clientId = String(env.SAAS_GOOGLE_CLIENT_ID || "").trim();
  const clientSecret = String(env.SAAS_GOOGLE_CLIENT_SECRET || "").trim();
  const redirectUri = String(env.SAAS_GOOGLE_REDIRECT_URI || "").trim();
  if (!clientId || !clientSecret || !redirectUri) return null;
  return { clientId, clientSecret, redirectUri };
};

export const isSaasGoogleOAuthConfigured = (
  env: NodeJS.ProcessEnv = process.env,
): boolean =>
  Boolean(getSaasGoogleOAuthConfig(env)) && isSecretsEncryptionConfigured(env);

export const isSaasGoogleCalendarEnabled = (
  env: NodeJS.ProcessEnv = process.env,
): boolean =>
  truthy(env.SAAS_GOOGLE_CALENDAR_ENABLED) && isSaasGoogleOAuthConfigured(env);

export const isSaasGoogleDriveEnabled = (
  env: NodeJS.ProcessEnv = process.env,
): boolean =>
  truthy(env.SAAS_GOOGLE_DRIVE_ENABLED) && isSaasGoogleOAuthConfigured(env);

export type GooglePickerConfig = {
  /** Browser API key restricted to the Picker / Drive APIs and the ARC origin. */
  apiKey: string;
  /** Google Cloud project number — required by Picker for drive.file grants. */
  appId: string;
};

export const getSaasGooglePickerConfig = (
  env: NodeJS.ProcessEnv = process.env,
): GooglePickerConfig | null => {
  const apiKey = String(env.SAAS_GOOGLE_PICKER_API_KEY || "").trim();
  const appId = String(env.SAAS_GOOGLE_PICKER_APP_ID || "").trim();
  if (!apiKey || !appId) return null;
  return { apiKey, appId };
};

/** Drive import (Picker) needs the Drive flag plus Picker key + app id. */
export const isSaasGooglePickerConfigured = (
  env: NodeJS.ProcessEnv = process.env,
): boolean =>
  isSaasGoogleDriveEnabled(env) && Boolean(getSaasGooglePickerConfig(env));

export const isSaasGoogleSheetsEnabled = (
  env: NodeJS.ProcessEnv = process.env,
): boolean =>
  truthy(env.SAAS_GOOGLE_SHEETS_ENABLED) && isSaasGoogleOAuthConfigured(env);

export const scopesForCapabilities = (
  capabilities: GoogleCapability[],
): string[] => {
  const scopes = new Set<string>([GOOGLE_SCOPE_OPENID, GOOGLE_SCOPE_EMAIL]);
  for (const cap of capabilities) {
    if (cap === "calendar") scopes.add(GOOGLE_SCOPE_CALENDAR_APP_CREATED);
    if (cap === "drive") scopes.add(GOOGLE_SCOPE_DRIVE_FILE);
    if (cap === "sheets") {
      scopes.add(GOOGLE_SCOPE_DRIVE_FILE);
      scopes.add(GOOGLE_SCOPE_SPREADSHEETS);
    }
  }
  return [...scopes];
};

export const parseCapabilities = (raw: string): GoogleCapability[] => {
  const allowed = new Set<GoogleCapability>(["calendar", "drive", "sheets"]);
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s): s is GoogleCapability => allowed.has(s as GoogleCapability));
};

export const hasGrantedScope = (
  grantedScopes: string,
  required: string,
): boolean => {
  const set = new Set(
    grantedScopes
      .split(/\s+/)
      .map((s) => s.trim())
      .filter(Boolean),
  );
  return set.has(required);
};
