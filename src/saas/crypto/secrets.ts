import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGO = "aes-256-gcm";
const KEY_ENV = "SAAS_SECRETS_ENCRYPTION_KEY";

/**
 * 32-byte key as hex (64 chars) or base64.
 * Required to store customer Slack webhook URLs at rest.
 */
export const getSecretsEncryptionKey = (
  env: NodeJS.ProcessEnv = process.env,
): Buffer | null => {
  const raw = String(env[KEY_ENV] || "").trim();
  if (!raw) return null;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, "hex");
  try {
    const buf = Buffer.from(raw, "base64");
    if (buf.length === 32) return buf;
  } catch {
    // ignore
  }
  return null;
};

export const isSecretsEncryptionConfigured = (
  env: NodeJS.ProcessEnv = process.env,
): boolean => Boolean(getSecretsEncryptionKey(env));

export type EncryptedSecret = {
  ciphertext: string;
  nonce: string;
};

export const encryptSecret = (
  plaintext: string,
  env: NodeJS.ProcessEnv = process.env,
): EncryptedSecret => {
  const key = getSecretsEncryptionKey(env);
  if (!key) {
    throw new Error("saas_secrets_encryption_not_configured");
  }
  const nonce = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, nonce);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: Buffer.concat([encrypted, tag]).toString("base64"),
    nonce: nonce.toString("base64"),
  };
};

export const decryptSecret = (
  input: EncryptedSecret,
  env: NodeJS.ProcessEnv = process.env,
): string => {
  const key = getSecretsEncryptionKey(env);
  if (!key) {
    throw new Error("saas_secrets_encryption_not_configured");
  }
  const payload = Buffer.from(input.ciphertext, "base64");
  const nonce = Buffer.from(input.nonce, "base64");
  if (payload.length < 17) throw new Error("saas_secret_corrupt");
  const tag = payload.subarray(payload.length - 16);
  const data = payload.subarray(0, payload.length - 16);
  const decipher = createDecipheriv(ALGO, key, nonce);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString(
    "utf8",
  );
};
