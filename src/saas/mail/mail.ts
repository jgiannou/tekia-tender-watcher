import nodemailer from "nodemailer";
import type Transporter from "nodemailer/lib/mailer/index.js";

export const LIVE_EMAIL_IN_TESTS_ENV = "ARC_ALLOW_LIVE_EMAIL_IN_TESTS";

export const isEmailEnabled = (
  env: NodeJS.ProcessEnv = process.env,
): boolean => {
  const enabled = String(env.EMAIL_ENABLED || "").toLowerCase() === "true";
  const host = String(env.SMTP_HOST || "").trim();
  return enabled && Boolean(host);
};

/** Blocks SMTP in automated tests unless ARC_ALLOW_LIVE_EMAIL_IN_TESTS=true. */
export const isMailSendingBlocked = (
  env: NodeJS.ProcessEnv = process.env,
): boolean =>
  env.NODE_ENV === "test" &&
  String(env[LIVE_EMAIL_IN_TESTS_ENV] || "").toLowerCase() !== "true";

export const getEmailLocale = (
  env: NodeJS.ProcessEnv = process.env,
): "el" | "en" => {
  const locale = String(env.EMAIL_LOCALE || "el").toLowerCase();
  return locale.startsWith("en") ? "en" : "el";
};

const normalizeOrigin = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    return new URL(trimmed).origin;
  } catch {
    try {
      return new URL(`https://${trimmed}`).origin;
    } catch {
      return "";
    }
  }
};

export const resolveSaasAppUrl = (
  env: NodeJS.ProcessEnv = process.env,
): string => {
  const appUrl = normalizeOrigin(env.SAAS_APP_URL || "");
  if (appUrl) return appUrl;
  const trusted = String(env.SAAS_TRUSTED_ORIGINS || "")
    .split(",")
    .map((entry) => normalizeOrigin(entry))
    .find(Boolean);
  return trusted || "http://127.0.0.1:5174";
};

export const joinUrl = (base: string, path: string): string => {
  const normalizedBase = base.replace(/\/+$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
};

const createSmtpTransport = (env: NodeJS.ProcessEnv = process.env) => {
  const host = String(env.SMTP_HOST || "").trim();
  const port = Number(env.SMTP_PORT || 587);
  const secure = String(env.SMTP_SECURE || "false").toLowerCase() === "true";
  const user = String(env.SMTP_USERNAME || "").trim();
  const pass = String(env.SMTP_PASSWORD || "").trim();
  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user ? { user, pass } : undefined,
  });
};

let transportOverride: Transporter | null = null;

/** Injectable transport for unit tests only (NODE_ENV=test). */
export const __setMailTransportForTests = (transport: Transporter | null) => {
  if (process.env.NODE_ENV !== "test") {
    throw new Error(
      "__setMailTransportForTests is available only when NODE_ENV=test",
    );
  }
  transportOverride = transport;
};

export const __resetMailTestHooks = () => {
  transportOverride = null;
};

const getTransport = () => transportOverride ?? createSmtpTransport();

const sanitizeSenderName = (value: string) =>
  value.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 78);

export const sendMail = async (input: {
  to: string;
  subject: string;
  html: string;
  text: string;
  fromName?: string | null;
}): Promise<boolean> => {
  if (!isEmailEnabled()) {
    console.info("[email] Skipping send: email disabled");
    return false;
  }
  const fromAddress = String(process.env.EMAIL_FROM || "").trim();
  if (!fromAddress) {
    console.warn("[email] Skipping: EMAIL_FROM missing");
    return false;
  }
  if (isMailSendingBlocked()) {
    console.info(
      `[email] Skipping send: test mode blocked (set ${LIVE_EMAIL_IN_TESTS_ENV}=true to opt in)`,
    );
    return false;
  }

  const fromName =
    sanitizeSenderName(input.fromName || "") ||
    sanitizeSenderName(String(process.env.EMAIL_FROM_NAME || "")) ||
    "ARC Tenders";

  const transport = getTransport();
  await transport.sendMail({
    from: { name: fromName, address: fromAddress },
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
  });
  console.info(
    "[email] sent",
    JSON.stringify({
      provider: "brevo",
      subject: input.subject.slice(0, 120),
    }),
  );
  return true;
};

export const verificationEmailCopy = (input: {
  name: string;
  verifyUrl: string;
}) => {
  const locale = getEmailLocale();
  const name = input.name.trim() || (locale === "en" ? "there" : "γεια σου");
  if (locale === "en") {
    return {
      subject: "Confirm your ARC Tenders email",
      html: `<p>Hello ${name},</p><p>Confirm your email to unlock periodic saved searches on ARC Tenders:</p><p><a href="${input.verifyUrl}">${input.verifyUrl}</a></p><p>Until then you can sign in and run manual KIMDIS search only.</p><p>If you did not create this account, ignore this email.</p>`,
      text: `Confirm your email: ${input.verifyUrl}`,
    };
  }
  return {
    subject: "Επιβεβαίωση email ARC Tenders",
    html: `<p>Γεια σου ${name},</p><p>Επιβεβαίωσε το email σου για να ξεκλειδώσεις τις περιοδικές αποθηκευμένες αναζητήσεις στο ARC Tenders:</p><p><a href="${input.verifyUrl}">${input.verifyUrl}</a></p><p>Μέχρι τότε μπορείς να συνδεθείς και να κάνεις μόνο χειροκίνητη αναζήτηση ΚΗΜΔΗΣ.</p><p>Αν δεν δημιούργησες εσύ αυτόν τον λογαριασμό, αγνόησε αυτό το μήνυμα.</p>`,
    text: `Επιβεβαίωση email: ${input.verifyUrl}`,
  };
};

export const resetPasswordEmailCopy = (input: {
  name: string;
  resetUrl: string;
}) => {
  const locale = getEmailLocale();
  const name = input.name.trim() || (locale === "en" ? "there" : "γεια σου");
  if (locale === "en") {
    return {
      subject: "Reset your ARC Tenders password",
      html: `<p>Hello ${name},</p><p>Reset your password:</p><p><a href="${input.resetUrl}">${input.resetUrl}</a></p><p>If you did not request this, ignore this email.</p>`,
      text: `Reset password: ${input.resetUrl}`,
    };
  }
  return {
    subject: "Επαναφορά κωδικού ARC Tenders",
    html: `<p>Γεια σου ${name},</p><p>Επαναφορά κωδικού:</p><p><a href="${input.resetUrl}">${input.resetUrl}</a></p><p>Αν δεν το ζήτησες εσύ, αγνόησε αυτό το μήνυμα.</p>`,
    text: `Επαναφορά κωδικού: ${input.resetUrl}`,
  };
};

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export type AttentionEmailCopyInput = {
  title: string;
  appUrl: string;
  referenceNumber?: string | null;
  tenderTitle?: string | null;
  authority?: string | null;
  score?: number | null;
  profileName?: string | null;
  matchCount?: number | null;
  newCount?: number | null;
  kind: "new_opportunity" | "digest" | "related_act";
};

export const attentionEmailCopy = (input: AttentionEmailCopyInput) => {
  const locale = getEmailLocale();
  const appUrl = input.appUrl.replace(/\/+$/, "");
  const inboxUrl = `${appUrl}/app/notifications`;
  const ref = input.referenceNumber?.trim() || "";
  const title = input.tenderTitle?.trim() || input.title;
  const authority = input.authority?.trim() || "";
  const profile = input.profileName?.trim() || "";
  const score =
    typeof input.score === "number" && Number.isFinite(input.score)
      ? Math.round(input.score)
      : null;

  if (locale === "en") {
    const subject =
      input.kind === "digest"
        ? `ARC Tenders · ${input.newCount ?? input.matchCount ?? "New"} opportunities`
        : input.kind === "related_act"
          ? `ARC Tenders · Update on a followed tender`
          : `ARC Tenders · New match${ref ? ` · ${ref}` : ""}`;
    const lines = [
      `<p>${escapeHtml(input.title)}</p>`,
      ref ? `<p><strong>Reference:</strong> ${escapeHtml(ref)}</p>` : "",
      title && title !== input.title
        ? `<p><strong>Title:</strong> ${escapeHtml(title)}</p>`
        : "",
      authority ? `<p><strong>Authority:</strong> ${escapeHtml(authority)}</p>` : "",
      profile ? `<p><strong>Saved search:</strong> ${escapeHtml(profile)}</p>` : "",
      score != null ? `<p><strong>Score:</strong> ${score}%</p>` : "",
      `<p><a href="${escapeHtml(inboxUrl)}">Open in ARC Tenders</a></p>`,
    ].filter(Boolean);
    return {
      subject,
      html: lines.join(""),
      text: `${input.title}\n${inboxUrl}`,
    };
  }

  const subject =
    input.kind === "digest"
      ? `ARC Tenders · ${input.newCount ?? input.matchCount ?? "Νέες"} ευκαιρίες`
      : input.kind === "related_act"
        ? `ARC Tenders · Εξέλιξη σε διαγωνισμό που παρακολουθείτε`
        : `ARC Tenders · Νέα αντιστοίχιση${ref ? ` · ${ref}` : ""}`;
  const lines = [
    `<p>${escapeHtml(input.title)}</p>`,
    ref ? `<p><strong>ΑΔΑΜ:</strong> ${escapeHtml(ref)}</p>` : "",
    title && title !== input.title
      ? `<p><strong>Τίτλος:</strong> ${escapeHtml(title)}</p>`
      : "",
    authority
      ? `<p><strong>Αναθέτουσα:</strong> ${escapeHtml(authority)}</p>`
      : "",
    profile
      ? `<p><strong>Αποθηκευμένη αναζήτηση:</strong> ${escapeHtml(profile)}</p>`
      : "",
    score != null ? `<p><strong>Συνάφεια:</strong> ${score}%</p>` : "",
    `<p><a href="${escapeHtml(inboxUrl)}">Άνοιγμα στο ARC Tenders</a></p>`,
  ].filter(Boolean);
  return {
    subject,
    html: lines.join(""),
    text: `${input.title}\n${inboxUrl}`,
  };
};
