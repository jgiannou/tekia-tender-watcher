import { createServer } from "node:http";
import { randomBytes, createHash } from "node:crypto";
import { shell } from "electron";
import type { GoogleOAuthConfig } from "./config.js";
import {
  getGoogleTokens,
  saveGoogleTokens,
  type GoogleTokenBundle,
} from "./vault-store.js";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";

const base64Url = (buf: Buffer): string =>
  buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

const createPkce = (): { verifier: string; challenge: string } => {
  const verifier = base64Url(randomBytes(32));
  const challenge = base64Url(createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
};

export const startGoogleOAuthLogin = async (
  config: GoogleOAuthConfig,
): Promise<{ email: string | null }> => {
  const pkce = createPkce();
  const expectedState = base64Url(randomBytes(16));

  let resolveCode: ((value: string) => void) | null = null;
  let rejectCode: ((error: Error) => void) | null = null;
  const codePromise = new Promise<string>((resolve, reject) => {
    resolveCode = resolve;
    rejectCode = reject;
    setTimeout(
      () => reject(new Error("Google OAuth timed out (5 minutes)")),
      5 * 60_000,
    ).unref();
  });

  const server = createServer((req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      if (url.pathname !== "/oauth2callback") {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      const error = url.searchParams.get("error");
      if (error) {
        res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
        res.end(`<h1>Authorization failed</h1><p>${error}</p>`);
        rejectCode?.(new Error(`Google OAuth error: ${error}`));
        return;
      }
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state") ?? "";
      if (!code || state !== expectedState) {
        res.writeHead(400);
        res.end("Invalid OAuth callback");
        rejectCode?.(new Error("Invalid OAuth callback"));
        return;
      }
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(
        `<html><body style="font-family:sans-serif;padding:2rem">
        <h1>TEKIA Tender Watcher</h1>
        <p>Google Drive connected. You can close this tab and return to the app.</p>
        </body></html>`,
      );
      resolveCode?.(code);
    } catch (error) {
      rejectCode?.(error instanceof Error ? error : new Error(String(error)));
    }
  });

  const port = await new Promise<number>((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Failed to bind OAuth loopback"));
        return;
      }
      resolve(address.port);
    });
    server.on("error", reject);
  });

  const redirectUri = `http://127.0.0.1:${port}/oauth2callback`;
  const authUrl = new URL(AUTH_URL);
  authUrl.searchParams.set("client_id", config.clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", config.scope);
  authUrl.searchParams.set("state", expectedState);
  authUrl.searchParams.set("code_challenge", pkce.challenge);
  authUrl.searchParams.set("code_challenge_method", "S256");
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");

  try {
    await shell.openExternal(authUrl.toString());
    const code = await codePromise;

    const body = new URLSearchParams({
      client_id: config.clientId,
      code,
      code_verifier: pkce.verifier,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    });
    if (config.clientSecret) {
      body.set("client_secret", config.clientSecret);
    }

    const tokenResponse = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const tokenJson = (await tokenResponse.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      token_type?: string;
      scope?: string;
      error?: string;
      error_description?: string;
    };

    if (!tokenResponse.ok || !tokenJson.access_token) {
      throw new Error(
        tokenJson.error_description ||
          tokenJson.error ||
          `Token exchange failed (${tokenResponse.status})`,
      );
    }

    const existing = getGoogleTokens();
    const tokens: GoogleTokenBundle = {
      accessToken: tokenJson.access_token,
      refreshToken: tokenJson.refresh_token ?? existing?.refreshToken ?? null,
      expiryDate: tokenJson.expires_in
        ? Date.now() + tokenJson.expires_in * 1000
        : null,
      tokenType: tokenJson.token_type,
      scope: tokenJson.scope,
    };

    let email: string | null = null;
    try {
      const profileResponse = await fetch(USERINFO_URL, {
        headers: { Authorization: `Bearer ${tokens.accessToken}` },
      });
      if (profileResponse.ok) {
        const profile = (await profileResponse.json()) as { email?: string };
        email = profile.email ?? null;
      }
    } catch {
      // optional
    }

    saveGoogleTokens(tokens, email);
    return { email };
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
};

export const getValidAccessToken = async (
  config: GoogleOAuthConfig,
): Promise<string> => {
  const tokens = getGoogleTokens();
  if (!tokens?.accessToken) {
    throw new Error("Google Drive is not connected");
  }

  const stillValid =
    tokens.expiryDate && tokens.expiryDate > Date.now() + 60_000;
  if (stillValid) return tokens.accessToken;

  if (!tokens.refreshToken) {
    throw new Error("Google authorization expired. Reconnect Google Drive.");
  }

  const body = new URLSearchParams({
    client_id: config.clientId,
    refresh_token: tokens.refreshToken,
    grant_type: "refresh_token",
  });
  if (config.clientSecret) {
    body.set("client_secret", config.clientSecret);
  }

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };

  if (!response.ok || !json.access_token) {
    throw new Error(
      json.error_description ||
        json.error ||
        "Google authorization expired. Reconnect Google Drive.",
    );
  }

  const next: GoogleTokenBundle = {
    ...tokens,
    accessToken: json.access_token,
    expiryDate: json.expires_in ? Date.now() + json.expires_in * 1000 : null,
  };
  saveGoogleTokens(next);
  return next.accessToken;
};
