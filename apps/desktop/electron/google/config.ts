import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { app } from "electron";

export type GoogleOAuthConfig = {
  clientId: string;
  clientSecret: string | null;
  scope: string;
  source: string;
};

const DEFAULT_SCOPE = "https://www.googleapis.com/auth/drive.file openid email profile";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const parseEnvFile = (filePath: string): Record<string, string> => {
  if (!existsSync(filePath)) return {};
  const out: Record<string, string> = {};
  for (const raw of readFileSync(filePath, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
};

const readJsonConfig = (
  filePath: string,
): { clientId?: string; clientSecret?: string; scope?: string } | null => {
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, "utf8")) as {
      clientId?: string;
      clientSecret?: string;
      scope?: string;
    };
  } catch {
    return null;
  }
};

/**
 * Load Google OAuth client configuration for Electron Main only.
 * Never expose via VITE_* / renderer.
 */
export const loadGoogleOAuthConfig = (): GoogleOAuthConfig | null => {
  const desktopRoot = join(__dirname, "..", "..");
  const fileEnv = parseEnvFile(join(desktopRoot, ".env"));

  const clientId =
    process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() ||
    fileEnv.GOOGLE_OAUTH_CLIENT_ID?.trim() ||
    "";

  const clientSecret =
    process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim() ||
    fileEnv.GOOGLE_OAUTH_CLIENT_SECRET?.trim() ||
    "";

  const scope =
    process.env.GOOGLE_DRIVE_SCOPE?.trim() ||
    fileEnv.GOOGLE_DRIVE_SCOPE?.trim() ||
    DEFAULT_SCOPE;

  if (clientId) {
    return {
      clientId,
      clientSecret: clientSecret || null,
      scope,
      source: process.env.GOOGLE_OAUTH_CLIENT_ID
        ? "process.env"
        : "apps/desktop/.env",
    };
  }

  const localJson = readJsonConfig(join(desktopRoot, "google-oauth.local.json"));
  if (localJson?.clientId) {
    return {
      clientId: localJson.clientId,
      clientSecret: localJson.clientSecret ?? null,
      scope: localJson.scope ?? scope,
      source: "apps/desktop/google-oauth.local.json",
    };
  }

  // Packaged app: optional bundled client id (not tokens)
  try {
    const packaged = join(process.resourcesPath, "google-oauth.json");
    const pkg = readJsonConfig(packaged);
    if (pkg?.clientId) {
      return {
        clientId: pkg.clientId,
        clientSecret: pkg.clientSecret ?? null,
        scope: pkg.scope ?? scope,
        source: "resources/google-oauth.json",
      };
    }
  } catch {
    // process.resourcesPath may be unavailable outside Electron
  }

  // Dev fallback next to userData for operator convenience
  try {
    const userDataCfg = readJsonConfig(
      join(app.getPath("userData"), "google-oauth.json"),
    );
    if (userDataCfg?.clientId) {
      return {
        clientId: userDataCfg.clientId,
        clientSecret: userDataCfg.clientSecret ?? null,
        scope: userDataCfg.scope ?? scope,
        source: "userData/google-oauth.json",
      };
    }
  } catch {
    // ignore
  }

  return null;
};

export const DEFAULT_GOOGLE_DRIVE_SCOPE = DEFAULT_SCOPE;
