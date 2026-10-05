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
  const appUrl = resolveSaasAppUrl();
  const name = input.name.trim() || (locale === "en" ? "there" : "εκεί");
  if (locale === "en") {
    const bodyHtml = `
<p style="margin:0 0 16px;font-size:14px;line-height:1.55;color:#111827;">Hello ${escapeHtml(name)},</p>
<p style="margin:0 0 16px;font-size:14px;line-height:1.55;color:#111827;">Confirm your email to unlock periodic saved searches on ARC Tenders. Until then you can sign in and run manual KIMDIS search only.</p>
<p style="margin:0 0 16px;">${ctaButton(input.verifyUrl, "Confirm email")}</p>
<p style="margin:0;font-size:12px;color:#6b7280;line-height:1.5;">If the button does not work, open:<br><a href="${escapeHtml(input.verifyUrl)}" style="color:#0f766e;word-break:break-all;">${escapeHtml(input.verifyUrl)}</a></p>
<p style="margin:16px 0 0;font-size:12px;color:#6b7280;">If you did not create this account, ignore this email.</p>`;
    return {
      subject: "Confirm your ARC Tenders email",
      html: wrapEmailLayout({
        locale,
        appUrl,
        eyebrow: "Account",
        heading: "Confirm your email",
        bodyHtml,
        preheader: "Confirm your email to unlock saved searches",
      }),
      text: `Confirm your email: ${input.verifyUrl}`,
    };
  }
  const bodyHtml = `
<p style="margin:0 0 16px;font-size:14px;line-height:1.55;color:#111827;">Γεια σου ${escapeHtml(name)},</p>
<p style="margin:0 0 16px;font-size:14px;line-height:1.55;color:#111827;">Επιβεβαίωσε το email σου για να ξεκλειδώσεις τις περιοδικές αποθηκευμένες αναζητήσεις στο ARC Tenders. Μέχρι τότε μπορείς να συνδεθείς και να κάνεις μόνο χειροκίνητη αναζήτηση ΚΗΜΔΗΣ.</p>
<p style="margin:0 0 16px;">${ctaButton(input.verifyUrl, "Επιβεβαίωση email")}</p>
<p style="margin:0;font-size:12px;color:#6b7280;line-height:1.5;">Αν το κουμπί δεν ανοίγει, χρησιμοποίησε τον σύνδεσμο:<br><a href="${escapeHtml(input.verifyUrl)}" style="color:#0f766e;word-break:break-all;">${escapeHtml(input.verifyUrl)}</a></p>
<p style="margin:16px 0 0;font-size:12px;color:#6b7280;">Αν δεν δημιούργησες εσύ αυτόν τον λογαριασμό, αγνόησε αυτό το μήνυμα.</p>`;
  return {
    subject: "Επιβεβαίωση email ARC Tenders",
    html: wrapEmailLayout({
      locale,
      appUrl,
      eyebrow: "Λογαριασμός",
      heading: "Επιβεβαίωση email",
      bodyHtml,
      preheader: "Επιβεβαίωσε το email σου για αποθηκευμένες αναζητήσεις",
    }),
    text: `Επιβεβαίωση email: ${input.verifyUrl}`,
  };
};

export const resetPasswordEmailCopy = (input: {
  name: string;
  resetUrl: string;
}) => {
  const locale = getEmailLocale();
  const appUrl = resolveSaasAppUrl();
  const name = input.name.trim() || (locale === "en" ? "there" : "εκεί");
  if (locale === "en") {
    const bodyHtml = `
<p style="margin:0 0 16px;font-size:14px;line-height:1.55;color:#111827;">Hello ${escapeHtml(name)},</p>
<p style="margin:0 0 16px;font-size:14px;line-height:1.55;color:#111827;">Use the button below to choose a new password for your ARC Tenders account.</p>
<p style="margin:0 0 16px;">${ctaButton(input.resetUrl, "Reset password")}</p>
<p style="margin:0;font-size:12px;color:#6b7280;line-height:1.5;">Or open this link:<br><a href="${escapeHtml(input.resetUrl)}" style="color:#0f766e;word-break:break-all;">${escapeHtml(input.resetUrl)}</a></p>
<p style="margin:16px 0 0;font-size:12px;color:#6b7280;">If you did not request this, ignore this email.</p>`;
    return {
      subject: "Reset your ARC Tenders password",
      html: wrapEmailLayout({
        locale,
        appUrl,
        eyebrow: "Account",
        heading: "Reset your password",
        bodyHtml,
        preheader: "Reset your ARC Tenders password",
      }),
      text: `Reset password: ${input.resetUrl}`,
    };
  }
  const bodyHtml = `
<p style="margin:0 0 16px;font-size:14px;line-height:1.55;color:#111827;">Γεια σου ${escapeHtml(name)},</p>
<p style="margin:0 0 16px;font-size:14px;line-height:1.55;color:#111827;">Πάτησε το κουμπί για να ορίσεις νέο κωδικό στον λογαριασμό σου στο ARC Tenders.</p>
<p style="margin:0 0 16px;">${ctaButton(input.resetUrl, "Επαναφορά κωδικού")}</p>
<p style="margin:0;font-size:12px;color:#6b7280;line-height:1.5;">Ή άνοιξε τον σύνδεσμο:<br><a href="${escapeHtml(input.resetUrl)}" style="color:#0f766e;word-break:break-all;">${escapeHtml(input.resetUrl)}</a></p>
<p style="margin:16px 0 0;font-size:12px;color:#6b7280;">Αν δεν το ζήτησες εσύ, αγνόησε αυτό το μήνυμα.</p>`;
  return {
    subject: "Επαναφορά κωδικού ARC Tenders",
    html: wrapEmailLayout({
      locale,
      appUrl,
      eyebrow: "Λογαριασμός",
      heading: "Επαναφορά κωδικού",
      bodyHtml,
      preheader: "Επαναφορά κωδικού ARC Tenders",
    }),
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
  /** Publication / registry date (ISO). */
  submissionDate?: string | null;
  /** Offer deadline when known (ISO) — mainly PROC. */
  finalSubmissionDate?: string | null;
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
  kind: "new_opportunity" | "digest" | "related_act" | "related_act_digest";
  /** Followed / source thread (related-act emails). */
  sourceReferenceNumber?: string | null;
  sourceTenderTitle?: string | null;
  sourceRecordType?: string | null;
  relatedRecordType?: string | null;
  confidence?: string | null;
  relationType?: string | null;
  budgetWithoutVat?: number | null;
  submissionDate?: string | null;
  finalSubmissionDate?: string | null;
  /** Grouped related-act updates for Basic daily digest. */
  relatedItems?: RelatedActEmailItem[];
};

export type RelatedActEmailItem = {
  title: string;
  referenceNumber?: string | null;
  authority?: string | null;
  relatedRecordType?: string | null;
  sourceReferenceNumber?: string | null;
  sourceTenderTitle?: string | null;
  sourceRecordType?: string | null;
  confidence?: string | null;
  budgetWithoutVat?: number | null;
  submissionDate?: string | null;
  finalSubmissionDate?: string | null;
};

const BRAND = {
  teal: "#0f766e",
  tealDark: "#115e59",
  ink: "#111827",
  muted: "#6b7280",
  soft: "#f3f4f6",
  card: "#ffffff",
  line: "#e5e7eb",
  warn: "#b45309",
  warnBg: "#fffbeb",
} as const;

const ctaButton = (href: string, label: string): string =>
  `<a href="${escapeHtml(href)}" style="display:inline-block;background:${BRAND.teal};color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;text-decoration:none;padding:12px 20px;border-radius:8px;line-height:1.2;">${escapeHtml(label)}</a>`;

const metaRow = (label: string, value: string): string =>
  `<tr>
    <td style="padding:6px 14px 6px 0;color:${BRAND.muted};font-size:13px;vertical-align:top;white-space:nowrap;">${escapeHtml(label)}</td>
    <td style="padding:6px 0;color:${BRAND.ink};font-size:13px;font-weight:600;vertical-align:top;">${value}</td>
  </tr>`;

/** Shared branded shell — header, card body, footer. */
export const wrapEmailLayout = (input: {
  locale: "el" | "en";
  appUrl: string;
  preheader?: string;
  eyebrow?: string;
  heading: string;
  bodyHtml: string;
  companyName?: string | null;
}): string => {
  const appUrl = input.appUrl.replace(/\/+$/, "");
  const preheader = escapeHtml(input.preheader?.trim() || input.heading);
  const eyebrow = input.eyebrow?.trim()
    ? `<div style="display:inline-block;font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${BRAND.teal};background:#ecfdf5;padding:5px 10px;border-radius:999px;margin:0 0 12px;">${escapeHtml(input.eyebrow)}</div>`
    : "";
  const company = input.companyName?.trim()
    ? `<p style="margin:0 0 16px;font-size:13px;color:${BRAND.muted};">${input.locale === "en" ? "Workspace" : "Οργανισμός"}: <strong style="color:${BRAND.ink};">${escapeHtml(input.companyName.trim())}</strong></p>`
    : "";
  const footerNote =
    input.locale === "en"
      ? "You receive this because email alerts are enabled for your ARC Tenders workspace."
      : "Λαμβάνετε αυτό το μήνυμα επειδή οι email ειδοποιήσεις είναι ενεργές στον οργανισμό σας στο ARC Tenders.";
  const settingsLabel =
    input.locale === "en" ? "Notification settings" : "Ρυθμίσεις ειδοποιήσεων";
  let displayHost = "arc-tenders.tekia.gr";
  try {
    displayHost = new URL(appUrl).hostname || displayHost;
  } catch {
    /* keep default */
  }
  return `<!DOCTYPE html>
<html lang="${input.locale}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ARC Tenders</title>
<!--[if mso]><style>table,td{font-family:Arial,Helvetica,sans-serif!important;}</style><![endif]-->
</head>
<body style="margin:0;padding:0;background:${BRAND.soft};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${preheader}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.soft};padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:${BRAND.card};border-radius:14px;overflow:hidden;border:1px solid ${BRAND.line};">
        <tr>
          <td style="background:${BRAND.tealDark};padding:18px 24px;">
            <div style="font-family:Arial,Helvetica,sans-serif;font-size:18px;font-weight:800;letter-spacing:0.02em;color:#ffffff;">ARC Tenders</div>
            <div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#99f6e4;margin-top:4px;">${input.locale === "en" ? "Public procurement workspace" : "Χώρος εργασίας δημόσιων συμβάσεων"}</div>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 24px 8px;font-family:Arial,Helvetica,sans-serif;color:${BRAND.ink};">
            ${eyebrow}
            <h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;font-weight:800;color:${BRAND.ink};">${escapeHtml(input.heading)}</h1>
            ${company}
            ${input.bodyHtml}
          </td>
        </tr>
        <tr>
          <td style="padding:8px 24px 24px;font-family:Arial,Helvetica,sans-serif;">
            <div style="border-top:1px solid ${BRAND.line};padding-top:16px;font-size:12px;line-height:1.5;color:${BRAND.muted};">
              <p style="margin:0 0 8px;">${escapeHtml(footerNote)}</p>
              <p style="margin:0;"><a href="${escapeHtml(`${appUrl}/app/settings/notifications`)}" style="color:${BRAND.teal};text-decoration:none;">${escapeHtml(settingsLabel)}</a>
              · <a href="${escapeHtml(appUrl)}" style="color:${BRAND.muted};text-decoration:none;">${escapeHtml(displayHost)}</a></p>
            </div>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
};

const detailCard = (input: {
  title: string;
  badge?: string;
  rowsHtml: string;
}): string =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;background:${BRAND.soft};border:1px solid ${BRAND.line};border-radius:12px;">
  <tr><td style="padding:16px 18px;">
    ${input.badge ? `<div style="font-size:11px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:${BRAND.teal};margin:0 0 8px;">${escapeHtml(input.badge)}</div>` : ""}
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;line-height:1.4;color:${BRAND.ink};margin:0 0 12px;">${escapeHtml(input.title)}</div>
    <table role="presentation" cellpadding="0" cellspacing="0" style="font-family:Arial,Helvetica,sans-serif;width:100%;">${input.rowsHtml}</table>
  </td></tr>
</table>`;

const confidenceLabel = (
  confidence: string | null | undefined,
  locale: "el" | "en",
): string | null => {
  const c = (confidence || "").toUpperCase();
  if (c === "CONFIRMED") return locale === "en" ? "Confirmed link" : "Επιβεβαιωμένη συσχέτιση";
  if (c === "LIKELY") return locale === "en" ? "Likely related — please confirm" : "Πιθανή συσχέτιση — χρειάζεται επιβεβαίωση";
  if (c === "POSSIBLE") return locale === "en" ? "Possible related — please review" : "Ενδεχόμενη συσχέτιση — ελέγξτε";
  return null;
};

const recordTypeLabel = (
  recordType: string | null | undefined,
  locale: "el" | "en",
): string => {
  if (recordType === "PROC") return locale === "en" ? "Invitation / notice (PROC)" : "Πρόσκληση / προκήρυξη (PROC)";
  if (recordType === "REQ") return locale === "en" ? "Request (REQ)" : "Αίτημα (REQ)";
  return recordType?.trim() || "—";
};

const followedSourceBadge = (
  recordType: string | null | undefined,
  locale: "el" | "en",
): string => {
  if (recordType === "REQ") {
    return locale === "en" ? "Followed request" : "Αίτημα που παρακολουθείται";
  }
  if (recordType === "PROC") {
    return locale === "en" ? "Followed tender" : "Διαγωνισμός που παρακολουθείται";
  }
  return locale === "en" ? "Followed item" : "Παρακολούθηση";
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

const formatMatchDate = (
  value: string | null | undefined,
  locale: "el" | "en",
): string | null => {
  if (!value?.trim()) return null;
  const ms = new Date(value).getTime();
  if (Number.isNaN(ms)) return null;
  return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "el-GR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(ms));
};

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
  const dateLabel = locale === "en" ? "Date" : "Ημερομηνία";
  const deadlineLabel = locale === "en" ? "Deadline" : "Προθεσμία";
  const detailsLabel = locale === "en" ? "View details »" : "Αναλυτικές πληροφορίες »";
  return rows
    .map((row) => {
      const score = typeof row.score === "number" ? Math.round(row.score) : 0;
      const stars = scoreStars(score);
      const title = escapeHtml(row.title?.trim() || row.referenceNumber || "—");
      const ref = escapeHtml(row.referenceNumber?.trim() || "—");
      const authority = escapeHtml(row.authority?.trim() || "—");
      const budget = escapeHtml(formatBudget(row.budgetWithoutVat, locale));
      const published = formatMatchDate(row.submissionDate, locale);
      const deadline = formatMatchDate(row.finalSubmissionDate, locale);
      const href = escapeHtml(tenderHref(appUrl, row));
      const dateRows = [
        published
          ? metaRow(dateLabel, escapeHtml(published))
          : "",
        deadline
          ? metaRow(deadlineLabel, escapeHtml(deadline))
          : "",
      ].join("");
      return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 14px;background:${BRAND.soft};border:1px solid ${BRAND.line};border-radius:12px;">
  <tr><td style="padding:16px 18px;font-family:Arial,Helvetica,sans-serif;">
    <div style="color:#ca8a04;font-size:15px;letter-spacing:1px;margin-bottom:6px;">${stars} <span style="color:${BRAND.muted};font-size:12px;">${score}%</span></div>
    <div style="font-weight:700;font-size:15px;line-height:1.4;margin-bottom:10px;color:${BRAND.ink};">${title}</div>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;">
      ${metaRow("ΑΔΑΜ", ref)}
      ${dateRows}
      ${metaRow(budgetLabel, budget)}
      ${metaRow(authorityLabel, authority)}
    </table>
    <p style="margin:12px 0 0;"><a href="${href}" style="color:${BRAND.teal};font-weight:700;text-decoration:none;">${escapeHtml(detailsLabel)}</a></p>
  </td></tr>
</table>`;
    })
    .join("");
};

const resolveCtaHref = (input: AttentionEmailCopyInput): string => {
  const appUrl = input.appUrl.replace(/\/+$/, "");
  if (input.kind === "related_act") {
    const sourceRef = input.sourceReferenceNumber?.trim();
    if (sourceRef) {
      const type =
        input.sourceRecordType === "PROC" || input.sourceRecordType === "REQ"
          ? input.sourceRecordType
          : "REQ";
      return `${appUrl}/app/tenders/${type}/${encodeURIComponent(sourceRef)}`;
    }
    const relatedRef = input.referenceNumber?.trim();
    if (relatedRef) {
      const type =
        input.relatedRecordType === "PROC" || input.relatedRecordType === "REQ"
          ? input.relatedRecordType
          : "PROC";
      return `${appUrl}/app/tenders/${type}/${encodeURIComponent(relatedRef)}`;
    }
    return `${appUrl}/app/monitoring`;
  }
  if (input.referenceNumber?.trim()) {
    return tenderHref(appUrl, {
      referenceNumber: input.referenceNumber,
      recordType: input.relatedRecordType,
    });
  }
  return `${appUrl}/app/opportunities`;
};

export const attentionEmailCopy = (input: AttentionEmailCopyInput) => {
  const locale = getEmailLocale();
  const appUrl = input.appUrl.replace(/\/+$/, "");
  const inboxUrl = `${appUrl}/app/notifications`;
  const opportunitiesUrl = `${appUrl}/app/opportunities`;
  const ref = input.referenceNumber?.trim() || "";
  const relatedTitle =
    input.tenderTitle?.trim() ||
    input.title?.trim() ||
    ref ||
    (locale === "en" ? "Related act" : "Σχετική πράξη");
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
  const ctaHref = resolveCtaHref(input);
  const published = formatMatchDate(input.submissionDate, locale);
  const deadline = formatMatchDate(input.finalSubmissionDate, locale);
  const confLabel = confidenceLabel(input.confidence, locale);

  if (input.kind === "digest") {
    const itemsHtml =
      topMatches.length > 0
        ? renderDigestItemsHtml(topMatches, appUrl, locale)
        : `<p style="margin:0 0 16px;font-size:14px;line-height:1.55;color:${BRAND.ink};">${escapeHtml(input.title)}</p>`;

    if (locale === "en") {
      const subject = `ARC Tenders · ${count} new opportunities · ${dateLabel}`;
      const bodyHtml = `
<p style="margin:0 0 18px;font-size:14px;line-height:1.55;color:${BRAND.ink};">
  We found <strong>${count}</strong> new public-procurement opportunities
  ${profile ? ` for saved search «${escapeHtml(profile)}»` : ""}.
</p>
${itemsHtml}
<p style="margin:8px 0 18px;font-size:13px;line-height:1.55;color:${BRAND.muted};">
  These matches come from your saved searches on KIMDIS. Open the app to follow, prepare, or dismiss.
</p>
<p style="margin:0 0 10px;">${ctaButton(opportunitiesUrl, "Open opportunities")}</p>
<p style="margin:0;font-size:12px;"><a href="${escapeHtml(inboxUrl)}" style="color:${BRAND.muted};text-decoration:none;">View all notifications</a></p>`;
      return {
        subject,
        html: wrapEmailLayout({
          locale,
          appUrl,
          preheader: `${count} new opportunities for your saved searches`,
          eyebrow: "Saved search digest",
          heading: `New opportunities · ${dateLabel}`,
          bodyHtml,
          companyName: company,
        }),
        text: `${subject}\n${opportunitiesUrl}`,
      };
    }

    const subject = `√ Πρωτογενή αιτήματα ${dateLabel} · ${count} νέα`;
    const bodyHtml = `
<p style="margin:0 0 18px;font-size:14px;line-height:1.55;color:${BRAND.ink};">
  Σας αποστέλλουμε <strong>${count}</strong> νέα πρωτογενή αιτήματα / διαγωνισμούς
  βάσει των αποθηκευμένων αναζητήσεών σας${profile ? ` («${escapeHtml(profile)}»)` : ""}.
</p>
${itemsHtml}
<p style="margin:8px 0 18px;font-size:13px;line-height:1.55;color:${BRAND.muted};">
  Τα πρωτογενή αιτήματα προηγούνται ή συνοδεύουν τις προκηρύξεις και δίνουν εικόνα για επερχόμενους διαγωνισμούς.
  Μπορείτε να ρυθμίσετε τα φίλτρα από τις Αποθηκευμένες Αναζητήσεις.
</p>
<p style="margin:0 0 10px;">${ctaButton(opportunitiesUrl, "Άνοιγμα ευκαιριών")}</p>
<p style="margin:0;font-size:12px;"><a href="${escapeHtml(inboxUrl)}" style="color:${BRAND.muted};text-decoration:none;">Ειδοποιήσεις στο app</a></p>`;
    return {
      subject,
      html: wrapEmailLayout({
        locale,
        appUrl,
        preheader: `${count} νέα αιτήματα από τις αποθηκευμένες αναζητήσεις σας`,
        eyebrow: "Αποθηκευμένη αναζήτηση",
        heading: `Πρωτογενή αιτήματα · ${dateLabel}`,
        bodyHtml,
        companyName: company,
      }),
      text: `${subject}\n${opportunitiesUrl}`,
    };
  }

  if (input.kind === "related_act_digest") {
    const items = Array.isArray(input.relatedItems) ? input.relatedItems : [];
    const n = items.length || count || 1;
    const cards = items
      .map((item) => {
        const itemTitle =
          item.title?.trim() ||
          item.referenceNumber?.trim() ||
          (locale === "en" ? "Related act" : "Σχετική πράξη");
        const itemRef = item.referenceNumber?.trim() || "";
        const sourceTitle =
          item.sourceTenderTitle?.trim() ||
          item.sourceReferenceNumber?.trim() ||
          (locale === "en" ? "Followed item" : "Παρακολούθηση");
        const itemConf = confidenceLabel(item.confidence, locale);
        const rows = [
          itemRef
            ? metaRow(locale === "en" ? "ADAM" : "ΑΔΑΜ", escapeHtml(itemRef))
            : "",
          metaRow(
            locale === "en" ? "Type" : "Τύπος",
            escapeHtml(recordTypeLabel(item.relatedRecordType, locale)),
          ),
          item.authority?.trim()
            ? metaRow(
                locale === "en" ? "Authority" : "Αναθέτουσα",
                escapeHtml(item.authority.trim()),
              )
            : "",
          itemConf
            ? metaRow(
                locale === "en" ? "Confidence" : "Σιγουριά",
                escapeHtml(itemConf),
              )
            : "",
          metaRow(
            locale === "en" ? "Followed" : "Παρακολούθηση",
            escapeHtml(sourceTitle),
          ),
        ].join("");
        return detailCard({
          title: itemTitle,
          badge:
            locale === "en" ? "Related update" : "Σχετική εξέλιξη",
          rowsHtml: rows,
        });
      })
      .join("");

    if (locale === "en") {
      const subject = `ARC Tenders · ${n} monitoring updates · ${dateLabel}`;
      const bodyHtml = `
<p style="margin:0 0 16px;font-size:14px;line-height:1.55;color:${BRAND.ink};">
  Summary of <strong>${n}</strong> related update${n === 1 ? "" : "s"} on tenders you follow.
  Open ARC Tenders to confirm or dismiss suggested links.
</p>
${cards || `<p style="margin:0 0 16px;">${escapeHtml(input.title)}</p>`}
<p style="margin:0 0 10px;">${ctaButton(`${appUrl}/app/monitoring`, "Open in ARC Tenders")}</p>
<p style="margin:0;font-size:12px;"><a href="${escapeHtml(inboxUrl)}" style="color:${BRAND.muted};text-decoration:none;">All notifications</a></p>`;
      return {
        subject,
        html: wrapEmailLayout({
          locale,
          appUrl,
          preheader: `${n} monitoring updates`,
          eyebrow: "Daily monitoring digest",
          heading: `Monitoring updates · ${dateLabel}`,
          bodyHtml,
          companyName: company,
        }),
        text: `${subject}\n${inboxUrl}`,
      };
    }

    const subject = `ARC Tenders · ${n} ${n === 1 ? "εξέλιξη παρακολούθησης" : "εξελίξεις παρακολούθησης"} · ${dateLabel}`;
    const bodyHtml = `
<p style="margin:0 0 16px;font-size:14px;line-height:1.55;color:${BRAND.ink};">
  Συγκεντρωτική ενημέρωση με <strong>${n}</strong> ${n === 1 ? "σχετική εξέλιξη" : "σχετικές εξελίξεις"}
  σε αιτήματα / διαγωνισμούς που παρακολουθείτε.
  Ανοίξτε στο ARC Tenders για επιβεβαίωση ή απόρριψη συσχετίσεων.
</p>
${cards || `<p style="margin:0 0 16px;">${escapeHtml(input.title)}</p>`}
<p style="margin:0 0 10px;">${ctaButton(`${appUrl}/app/monitoring`, "Άνοιγμα στο ARC Tenders")}</p>
<p style="margin:0;font-size:12px;"><a href="${escapeHtml(inboxUrl)}" style="color:${BRAND.muted};text-decoration:none;">Όλες οι ειδοποιήσεις</a></p>`;
    return {
      subject,
      html: wrapEmailLayout({
        locale,
        appUrl,
        preheader: `${n} ${n === 1 ? "εξέλιξη παρακολούθησης" : "εξελίξεις παρακολούθησης"}`,
        eyebrow: "Ημερήσιο digest παρακολούθησης",
        heading: `Εξελίξεις παρακολούθησης · ${dateLabel}`,
        bodyHtml,
        companyName: company,
      }),
      text: `${subject}\n${inboxUrl}`,
    };
  }

  if (input.kind === "related_act") {
    const sourceTitle =
      input.sourceTenderTitle?.trim() ||
      input.sourceReferenceNumber?.trim() ||
      (locale === "en" ? "Followed item" : "Παρακολούθηση");
    const sourceBadge = followedSourceBadge(input.sourceRecordType, locale);
    const relatedRows = [
      ref ? metaRow(locale === "en" ? "ADAM" : "ΑΔΑΜ", escapeHtml(ref)) : "",
      metaRow(
        locale === "en" ? "Type" : "Τύπος",
        escapeHtml(recordTypeLabel(input.relatedRecordType, locale)),
      ),
      authority
        ? metaRow(
            locale === "en" ? "Authority" : "Αναθέτουσα",
            escapeHtml(authority),
          )
        : "",
      published
        ? metaRow(locale === "en" ? "Published" : "Ημερομηνία", escapeHtml(published))
        : "",
      deadline
        ? metaRow(locale === "en" ? "Deadline" : "Προθεσμία", escapeHtml(deadline))
        : "",
      input.budgetWithoutVat != null
        ? metaRow(
            locale === "en" ? "Budget" : "Προϋπολογισμός",
            escapeHtml(formatBudget(input.budgetWithoutVat, locale)),
          )
        : "",
      confLabel
        ? metaRow(locale === "en" ? "Confidence" : "Σιγουριά", escapeHtml(confLabel))
        : "",
    ].join("");

    const sourceRows = [
      input.sourceReferenceNumber?.trim()
        ? metaRow(
            locale === "en" ? "ADAM" : "ΑΔΑΜ",
            escapeHtml(input.sourceReferenceNumber.trim()),
          )
        : "",
      input.sourceRecordType
        ? metaRow(
            locale === "en" ? "Type" : "Τύπος",
            escapeHtml(recordTypeLabel(input.sourceRecordType, locale)),
          )
        : "",
    ].join("");

    if (locale === "en") {
      const subject = `ARC Tenders · Update on a followed tender${ref ? ` · ${ref}` : ""}`;
      const needsConfirm =
        (input.confidence || "").toUpperCase() === "LIKELY" ||
        (input.confidence || "").toUpperCase() === "POSSIBLE";
      const bodyHtml = `
<p style="margin:0 0 16px;font-size:14px;line-height:1.55;color:${BRAND.ink};">
  KIMDIS published a related official act on something you are monitoring.
  ${needsConfirm ? "Open ARC Tenders and confirm or dismiss the suggested link." : "Open ARC Tenders to review the update and choose the next step."}
</p>
${detailCard({
  title: relatedTitle,
  badge: "New related act",
  rowsHtml: relatedRows,
})}
${detailCard({
  title: sourceTitle,
  badge: sourceBadge,
  rowsHtml: sourceRows || metaRow("Status", "Monitoring active"),
})}
${needsConfirm ? `<div style="margin:0 0 16px;padding:12px 14px;background:${BRAND.warnBg};border:1px solid #fcd34d;border-radius:10px;font-size:13px;line-height:1.5;color:${BRAND.warn};">Suggested match — confirm «related» or dismiss «not related» in the app.</div>` : ""}
<p style="margin:0 0 10px;">${ctaButton(ctaHref, "Open in ARC Tenders")}</p>
<p style="margin:0;font-size:12px;"><a href="${escapeHtml(inboxUrl)}" style="color:${BRAND.muted};text-decoration:none;">All notifications</a></p>`;
      return {
        subject,
        html: wrapEmailLayout({
          locale,
          appUrl,
          preheader: relatedTitle,
          eyebrow: "Monitoring update",
          heading: "Related act on a followed tender",
          bodyHtml,
          companyName: company,
        }),
        text: `${subject}\n${relatedTitle}\n${ctaHref}`,
      };
    }

    const subject = `ARC Tenders · Εξέλιξη σε παρακολούθηση${ref ? ` · ${ref}` : ""}`;
    const needsConfirm =
      (input.confidence || "").toUpperCase() === "LIKELY" ||
      (input.confidence || "").toUpperCase() === "POSSIBLE";
    const bodyHtml = `
<p style="margin:0 0 16px;font-size:14px;line-height:1.55;color:${BRAND.ink};">
  Στο ΚΗΜΔΗΣ εμφανίστηκε <strong>σχετική επίσημη πράξη</strong> για κάτι που παρακολουθείτε.
  ${needsConfirm ? "Ανοίξτε στο ARC Tenders και επιβεβαιώστε ή απορρίψτε τη συσχέτιση." : "Ανοίξτε στο ARC Tenders για να δείτε την εξέλιξη και να αποφασίσετε το επόμενο βήμα."}
</p>
${detailCard({
  title: relatedTitle,
  badge: "Νέα σχετική πράξη",
  rowsHtml: relatedRows,
})}
${detailCard({
  title: sourceTitle,
  badge: sourceBadge,
  rowsHtml: sourceRows || metaRow("Κατάσταση", "Παρακολούθηση ενεργή"),
})}
${needsConfirm ? `<div style="margin:0 0 16px;padding:12px 14px;background:${BRAND.warnBg};border:1px solid #fcd34d;border-radius:10px;font-size:13px;line-height:1.5;color:${BRAND.warn};">Προτεινόμενη συσχέτιση — στο app πατήστε «Επιβεβαίωση» ή «Δεν σχετίζεται».</div>` : ""}
<p style="margin:0 0 10px;">${ctaButton(ctaHref, "Άνοιγμα στο ARC Tenders")}</p>
<p style="margin:0;font-size:12px;"><a href="${escapeHtml(inboxUrl)}" style="color:${BRAND.muted};text-decoration:none;">Όλες οι ειδοποιήσεις</a></p>`;
    return {
      subject,
      html: wrapEmailLayout({
        locale,
        appUrl,
        preheader: relatedTitle,
        eyebrow: "Εξέλιξη παρακολούθησης",
        heading: "Σχετική πράξη σε παρακολούθηση",
        bodyHtml,
        companyName: company,
      }),
      text: `${subject}\n${relatedTitle}\n${ctaHref}`,
    };
  }

  // new_opportunity (single) — richer card, same shell
  const oppRows = [
    ref ? metaRow(locale === "en" ? "ADAM" : "ΑΔΑΜ", escapeHtml(ref)) : "",
    authority
      ? metaRow(
          locale === "en" ? "Authority" : "Αναθέτουσα",
          escapeHtml(authority),
        )
      : "",
    profile
      ? metaRow(
          locale === "en" ? "Saved search" : "Αποθηκευμένη αναζήτηση",
          escapeHtml(profile),
        )
      : "",
    score != null
      ? metaRow(
          locale === "en" ? "Match" : "Συνάφεια",
          escapeHtml(`${scoreStars(score)} ${score}%`),
        )
      : "",
    published
      ? metaRow(locale === "en" ? "Date" : "Ημερομηνία", escapeHtml(published))
      : "",
    deadline
      ? metaRow(locale === "en" ? "Deadline" : "Προθεσμία", escapeHtml(deadline))
      : "",
  ].join("");

  if (locale === "en") {
    const subject = `ARC Tenders · New match${ref ? ` · ${ref}` : ""}`;
    const bodyHtml = `
<p style="margin:0 0 16px;font-size:14px;line-height:1.55;color:${BRAND.ink};">
  A new opportunity matched your saved search rules.
</p>
${detailCard({
  title: relatedTitle,
  badge: "New opportunity",
  rowsHtml: oppRows,
})}
<p style="margin:0 0 10px;">${ctaButton(ctaHref, "Open in ARC Tenders")}</p>
<p style="margin:0;font-size:12px;"><a href="${escapeHtml(inboxUrl)}" style="color:${BRAND.muted};text-decoration:none;">All notifications</a></p>`;
    return {
      subject,
      html: wrapEmailLayout({
        locale,
        appUrl,
        preheader: relatedTitle,
        eyebrow: "Opportunity",
        heading: "New match from your saved searches",
        bodyHtml,
        companyName: company,
      }),
      text: `${subject}\n${ctaHref}`,
    };
  }

  const subject = `ARC Tenders · Νέα αντιστοίχιση${ref ? ` · ${ref}` : ""}`;
  const bodyHtml = `
<p style="margin:0 0 16px;font-size:14px;line-height:1.55;color:${BRAND.ink};">
  Βρέθηκε νέα ευκαιρία που ταιριάζει στις αποθηκευμένες αναζητήσεις σας.
</p>
${detailCard({
  title: relatedTitle,
  badge: "Νέα ευκαιρία",
  rowsHtml: oppRows,
})}
<p style="margin:0 0 10px;">${ctaButton(ctaHref, "Άνοιγμα στο ARC Tenders")}</p>
<p style="margin:0;font-size:12px;"><a href="${escapeHtml(inboxUrl)}" style="color:${BRAND.muted};text-decoration:none;">Όλες οι ειδοποιήσεις</a></p>`;
  return {
    subject,
    html: wrapEmailLayout({
      locale,
      appUrl,
      preheader: relatedTitle,
      eyebrow: "Ευκαιρία",
      heading: "Νέα αντιστοίχιση από αποθηκευμένη αναζήτηση",
      bodyHtml,
      companyName: company,
    }),
    text: `${subject}\n${ctaHref}`,
  };
};
