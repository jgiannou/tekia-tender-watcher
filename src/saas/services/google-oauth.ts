import { createHash, randomBytes } from "node:crypto";
import { encryptSecret, decryptSecret } from "../crypto/secrets.js";
import {
  badRequest,
  serviceUnavailable,
} from "../errors.js";
import {
  getSaasGoogleOAuthConfig,
  GOOGLE_OAUTH_AUTHORIZE_URL,
  GOOGLE_OAUTH_REVOKE_URL,
  GOOGLE_OAUTH_TOKEN_URL,
  GOOGLE_USERINFO_URL,
  scopesForCapabilities,
  type GoogleCapability,
} from "./google-config.js";

export const createPkcePair = (): {
  codeVerifier: string;
  codeChallenge: string;
} => {
  const codeVerifier = randomBytes(32).toString("base64url");
  const codeChallenge = createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");
  return { codeVerifier, codeChallenge };
};

export const buildGoogleAuthorizeUrl = (input: {
  state: string;
  codeChallenge: string;
  capabilities: GoogleCapability[];
  loginHint?: string | null;
}): string => {
  const oauth = getSaasGoogleOAuthConfig();
  if (!oauth) throw serviceUnavailable("google_not_configured");
  const url = new URL(GOOGLE_OAUTH_AUTHORIZE_URL);
  url.searchParams.set("client_id", oauth.clientId);
  url.searchParams.set("redirect_uri", oauth.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", scopesForCapabilities(input.capabilities).join(" "));
  url.searchParams.set("state", input.state);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("code_challenge", input.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  if (input.loginHint) url.searchParams.set("login_hint", input.loginHint);
  return url.toString();
};

export type GoogleTokenResponse = {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
};

export const exchangeGoogleAuthorizationCode = async (input: {
  code: string;
  codeVerifier: string;
}): Promise<GoogleTokenResponse> => {
  const oauth = getSaasGoogleOAuthConfig();
  if (!oauth) throw serviceUnavailable("google_not_configured");
  const body = new URLSearchParams({
    client_id: oauth.clientId,
    client_secret: oauth.clientSecret,
    code: input.code,
    code_verifier: input.codeVerifier,
    grant_type: "authorization_code",
    redirect_uri: oauth.redirectUri,
  });
  const res = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await res.json()) as GoogleTokenResponse;
  if (!res.ok || json.error) {
    throw badRequest("google_oauth_exchange_failed");
  }
  return json;
};

export const refreshGoogleAccessToken = async (input: {
  refreshToken: string;
}): Promise<GoogleTokenResponse> => {
  const oauth = getSaasGoogleOAuthConfig();
  if (!oauth) throw serviceUnavailable("google_not_configured");
  const body = new URLSearchParams({
    client_id: oauth.clientId,
    client_secret: oauth.clientSecret,
    refresh_token: input.refreshToken,
    grant_type: "refresh_token",
  });
  const res = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await res.json()) as GoogleTokenResponse;
  if (!res.ok || json.error) {
    throw badRequest("google_token_refresh_failed");
  }
  return json;
};

export type GoogleUserInfo = {
  sub: string;
  email: string;
  email_verified?: boolean;
};

export const fetchGoogleUserInfo = async (
  accessToken: string,
): Promise<GoogleUserInfo> => {
  const res = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw badRequest("google_userinfo_failed");
  const json = (await res.json()) as {
    sub?: string;
    email?: string;
    email_verified?: boolean;
  };
  if (!json.sub || !json.email) throw badRequest("google_userinfo_incomplete");
  return {
    sub: json.sub,
    email: json.email,
    email_verified: json.email_verified,
  };
};

export const revokeGoogleToken = async (token: string): Promise<void> => {
  try {
    await fetch(`${GOOGLE_OAUTH_REVOKE_URL}?token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
  } catch {
    // Best-effort revoke — local disconnect still proceeds.
  }
};

export const encryptGoogleToken = (token: string) => encryptSecret(token);
export const decryptGoogleToken = (input: {
  ciphertext: string;
  nonce: string;
}) => decryptSecret(input);

/** Merge scope strings; never log tokens. */
export const mergeGrantedScopes = (
  existing: string,
  incoming: string | undefined,
): string => {
  const set = new Set(
    [...existing.split(/\s+/), ...(incoming ?? "").split(/\s+/)]
      .map((s) => s.trim())
      .filter(Boolean),
  );
  return [...set].sort().join(" ");
};
