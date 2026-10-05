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

export type DigestMatchRow = {
  referenceNumber?: string | null;
  title?: string | null;
  score?: number | null;
  authority?: string | null;
  budgetWithoutVat?: number | null;
  recordType?: string | null;
};

export type AttentionEmailCopyInput = {
  title: string;
  appUrl: string;
  referenceNumber?: string | null;
  tenderTitle?: string | null;
  authority?: string | null;
  score?: number | null;
  profileName?: string | null;
  companyName?: string | null;
  matchCount?: number | null;
  newCount?: number | null;
  topMatches?: DigestMatchRow[];
  kind: "new_opportunity" | "digest" | "related_act";
};

/** Map 0–100 score to ★☆ display (DDA-style). */
export const scoreStars = (score: number): string => {
  const filled =
    score >= 90 ? 5 : score >= 70 ? 4 : score >= 50 ? 3 : score >= 30 ? 2 : 1;
  return `${"★".repeat(filled)}${"☆".repeat(5 - filled)}`;
};

const formatBudget = (value: number | null | undefined, locale: "el" | "en") => {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat(locale === "en" ? "en-GB" : "el-GR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(value);
};

const formatDigestDate = (locale: "el" | "en") =>
  new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "el-GR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date());

const tenderHref = (
  appUrl: string,
  row: DigestMatchRow,
): string => {
  const ref = row.referenceNumber?.trim();
  if (!ref || ref === "—") return `${appUrl}/app/opportunities`;
  const type =
    row.recordType === "PROC" || row.recordType === "REQ"
      ? row.recordType
      : "REQ";
  return `${appUrl}/app/tenders/${type}/${encodeURIComponent(ref)}`;
};

const renderDigestItemsHtml = (
  rows: DigestMatchRow[],
  appUrl: string,
  locale: "el" | "en",
): string => {
  const budgetLabel = locale === "en" ? "Budget (€)" : "Προϋπολογισμός (€)";
  const authorityLabel = locale === "en" ? "Contracting authority" : "Αναθέτουσα Αρχή";
  const detailsLabel = locale === "en" ? "View details »" : "Αναλυτικές Πληροφορίες »";
  return rows
    .map((row) => {
      const score = typeof row.score === "number" ? Math.round(row.score) : 0;
      const stars = scoreStars(score);
      const title = escapeHtml(row.title?.trim() || row.referenceNumber || "—");
      const ref = escapeHtml(row.referenceNumber?.trim() || "—");
      const authority = escapeHtml(row.authority?.trim() || "—");
      const budget = escapeHtml(formatBudget(row.budgetWithoutVat, locale));
      const href = escapeHtml(tenderHref(appUrl, row));
      return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;border-bottom:1px solid #e5e7eb;padding-bottom:14px;">
  <tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.45;color:#111827;">
    <div style="color:#ca8a04;font-size:15px;letter-spacing:1px;margin-bottom:4px;">${stars} <span style="color:#6b7280;font-size:12px;">${score}%</span></div>
    <div style="font-weight:700;font-size:15px;margin-bottom:8px;">${title}</div>
    <table role="presentation" cellpadding="0" cellspacing="0" style="font-size:13px;color:#374151;">
      <tr><td style="padding:2px 12px 2px 0;color:#6b7280;">ΑΔΑΜ</td><td>${ref}</td></tr>
      <tr><td style="padding:2px 12px 2px 0;color:#6b7280;">${escapeHtml(budgetLabel)}</td><td>${budget}</td></tr>
      <tr><td style="padding:2px 12px 2px 0;color:#6b7280;">${escapeHtml(authorityLabel)}</td><td>${authority}</td></tr>
    </table>
    <p style="margin:10px 0 0;"><a href="${href}" style="color:#0f766e;font-weight:600;text-decoration:none;">${escapeHtml(detailsLabel)}</a></p>
  </td></tr>
</table>`;
    })
    .join("");
};

export const attentionEmailCopy = (input: AttentionEmailCopyInput) => {
  const locale = getEmailLocale();
  const appUrl = input.appUrl.replace(/\/+$/, "");
  const inboxUrl = `${appUrl}/app/notifications`;
  const opportunitiesUrl = `${appUrl}/app/opportunities`;
  const ref = input.referenceNumber?.trim() || "";
  const title = input.tenderTitle?.trim() || input.title;
  const authority = input.authority?.trim() || "";
  const profile = input.profileName?.trim() || "";
  const company = input.companyName?.trim() || "";
  const score =
    typeof input.score === "number" && Number.isFinite(input.score)
      ? Math.round(input.score)
      : null;
  const topMatches = Array.isArray(input.topMatches) ? input.topMatches : [];
  const count =
    typeof input.newCount === "number" && input.newCount > 0
      ? input.newCount
      : typeof input.matchCount === "number"
        ? input.matchCount
        : topMatches.length;
  const dateLabel = formatDigestDate(locale);

  if (input.kind === "digest") {
    const itemsHtml =
      topMatches.length > 0
        ? renderDigestItemsHtml(topMatches, appUrl, locale)
        : `<p style="font-family:Arial,Helvetica,sans-serif;color:#374151;">${escapeHtml(input.title)}</p>`;

    if (locale === "en") {
      const subject = `ARC Tenders · ${count} new opportunities · ${dateLabel}`;
      const html = `
<div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;color:#111827;">
  <h1 style="font-size:20px;margin:0 0 8px;">√ New opportunities ${escapeHtml(dateLabel)}</h1>
  ${company ? `<p style="margin:0 0 12px;color:#4b5563;font-size:13px;">Business profile: ${escapeHtml(company)}</p>` : ""}
  <p style="margin:0 0 18px;font-size:14px;line-height:1.5;">
    We found <strong>${count}</strong> new public-procurement opportunities
    ${profile ? ` for saved search «${escapeHtml(profile)}»` : ""}.
  </p>
  ${itemsHtml}
  <p style="font-size:13px;color:#6b7280;line-height:1.5;margin-top:20px;">
    These matches come from your saved searches on KIMDIS. Open the app to follow, outreach, or dismiss.
  </p>
  <p style="margin-top:14px;"><a href="${escapeHtml(opportunitiesUrl)}" style="color:#0f766e;font-weight:700;">Open opportunities →</a></p>
</div>`;
      return {
        subject,
        html,
        text: `${subject}\n${opportunitiesUrl}`,
      };
    }

    const subject = `√ Πρωτογενή αιτήματα ${dateLabel} · ${count} νέα`;
    const html = `
<div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;color:#111827;">
  <h1 style="font-size:20px;margin:0 0 8px;">√ Πρωτογενή αιτήματα ${escapeHtml(dateLabel)}</h1>
  ${company ? `<p style="margin:0 0 12px;color:#4b5563;font-size:13px;">Επιχειρηματικό προφίλ: ${escapeHtml(company)}${profile ? ` · Φίλτρο: «${escapeHtml(profile)}»` : ""}</p>` : profile ? `<p style="margin:0 0 12px;color:#4b5563;font-size:13px;">Αποθηκευμένη αναζήτηση: «${escapeHtml(profile)}»</p>` : ""}
  <p style="margin:0 0 18px;font-size:14px;line-height:1.5;">
    Σας αποστέλλουμε <strong>${count}</strong> νέα πρωτογενή αιτήματα / διαγωνισμούς
    βάσει των αποθηκευμένων αναζητήσεών σας στο ARC Tenders.
  </p>
  ${itemsHtml}
  <p style="font-size:13px;color:#6b7280;line-height:1.5;margin-top:20px;">
    Τα πρωτογενή αιτήματα προηγούνται ή συνοδεύουν τις προκηρύξεις και δίνουν εικόνα για επερχόμενους διαγωνισμούς.
    Μπορείτε να ρυθμίσετε τα φίλτρα από τις Αποθηκευμένες Αναζητήσεις.
  </p>
  <p style="margin-top:14px;"><a href="${escapeHtml(opportunitiesUrl)}" style="color:#0f766e;font-weight:700;">Άνοιγμα ευκαιριών →</a></p>
  <p style="margin-top:8px;font-size:12px;"><a href="${escapeHtml(inboxUrl)}" style="color:#6b7280;">Ειδοποιήσεις στο app</a></p>
</div>`;
    return {
      subject,
      html,
      text: `${subject}\n${opportunitiesUrl}`,
    };
  }

  if (locale === "en") {
    const subject =
      input.kind === "related_act"
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
      score != null ? `<p><strong>Score:</strong> ${scoreStars(score)} ${score}%</p>` : "",
      `<p><a href="${escapeHtml(inboxUrl)}">Open in ARC Tenders</a></p>`,
    ].filter(Boolean);
    return {
      subject,
      html: lines.join(""),
      text: `${input.title}\n${inboxUrl}`,
    };
  }

  const subject =
    input.kind === "related_act"
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
    score != null
      ? `<p><strong>Συνάφεια:</strong> ${scoreStars(score)} ${score}%</p>`
      : "",
    `<p><a href="${escapeHtml(inboxUrl)}">Άνοιγμα στο ARC Tenders</a></p>`,
  ].filter(Boolean);
  return {
    subject,
    html: lines.join(""),
    text: `${input.title}\n${inboxUrl}`,
  };
};
