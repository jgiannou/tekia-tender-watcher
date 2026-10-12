/**
 * Slack Block Kit payloads for customer notifications.
 * Layout mirrors the desktop TEKIA Tender Watcher alert density
 * (score headline, org/title, budget, type, CPV, dates, ADAM, source links).
 * Sanitize external text so it cannot inject @channel / misleading mrkdwn.
 */

export type SlackBlock = Record<string, unknown>;

export type SlackMessagePayload = {
  text: string;
  blocks: SlackBlock[];
};

const MRKDWN_SPECIAL = /[&<>]/g;
const AT_MENTION = /@([a-z0-9._-]+)/gi;
const BROADCAST = /<!everyone>|<!channel>|<!here>/gi;

const KIMDIS_PUBLIC_BASE =
  "https://cerpp.eprocurement.gov.gr/upgkimdis/unprotected/home.xhtml";
const KIMDIS_PDF_REQ =
  "https://cerpp.eprocurement.gov.gr/khmdhs-opendata/request/attachment";
const KIMDIS_PDF_PROC =
  "https://cerpp.eprocurement.gov.gr/khmdhs-opendata/notice/attachment";

/** Strip Slack control sequences from untrusted tender titles / authorities. */
export const sanitizeSlackText = (input: string, maxLen = 300): string => {
  const trimmed = input.replace(/\s+/g, " ").trim().slice(0, maxLen);
  return trimmed
    .replace(MRKDWN_SPECIAL, (ch) => {
      if (ch === "&") return "&amp;";
      if (ch === "<") return "&lt;";
      return "&gt;";
    })
    .replace(BROADCAST, "")
    .replace(AT_MENTION, "@\u200b$1");
};

export const formatChannelLabel = (channelName: string): string => {
  const name = channelName.trim();
  if (!name) return "#κανάλι";
  return name.startsWith("#") ? name : `#${name}`;
};

const sourceLabelEl = (source: string | null | undefined): string | null => {
  if (!source) return null;
  const upper = source.trim().toUpperCase();
  if (upper === "KIMDIS" || upper.includes("ΚΗΜΔΗΣ")) return "ΚΗΜΔΗΣ";
  if (upper === "TED") return "TED";
  if (upper === "DIAVGEIA" || upper.includes("ΔΙΑΥΓΕΙΑ")) return "Διαύγεια";
  return sanitizeSlackText(source, 40);
};

const formatValue = (value: number | null | undefined): string | null => {
  if (value == null || !Number.isFinite(value)) return null;
  try {
    return `${value.toLocaleString("el-GR", {
      maximumFractionDigits: 0,
    })} € χωρίς ΦΠΑ`;
  } catch {
    return `${Math.round(value)} € χωρίς ΦΠΑ`;
  }
};

const formatDateTimeEl = (iso: string | null | undefined): string | null => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("el-GR", {
    timeZone: "Europe/Athens",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
};

const formatDeadline = (iso: string | null | undefined): string | null => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("el-GR", {
    timeZone: "Europe/Athens",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
};

const recordTypeLabelEl = (
  recordType: string | null | undefined,
): string | null => {
  if (!recordType) return null;
  const upper = recordType.trim().toUpperCase();
  if (upper === "REQ") return "Αίτημα";
  if (upper === "PROC") return "Διακήρυξη";
  return sanitizeSlackText(recordType, 24);
};

const recommendationEl = (input: {
  score?: number | null;
  recordType?: string | null;
}): string => {
  const score =
    typeof input.score === "number" && Number.isFinite(input.score)
      ? input.score
      : null;
  const isProc = (input.recordType || "").toUpperCase() === "PROC";
  if (isProc) return "Έλεγχος / προετοιμασία προσφοράς";
  if (score != null && score >= 80) return "Επικοινωνία νωρίς";
  if (score != null && score >= 60) return "Αξίζει έλεγχο";
  return "Αξίζει μια ματιά";
};

const scoreHeadlineEl = (input: {
  score?: number | null;
  recordType?: string | null;
  source?: string | null;
}): string => {
  const score =
    typeof input.score === "number" && Number.isFinite(input.score)
      ? Math.round(input.score)
      : null;
  const isProc = (input.recordType || "").toUpperCase() === "PROC";
  const source = sourceLabelEl(input.source) || "ΚΗΜΔΗΣ";
  if (score == null) {
    return isProc
      ? `🟢 *ΝΕΑ ΔΙΑΚΗΡΥΞΗ — ${source}*`
      : `🟢 *ΝΕΑ ΑΝΤΙΣΤΟΙΧΙΑ — ${source}*`;
  }
  const hot = score >= 80;
  if (isProc) {
    return hot
      ? `🔥 *ΕΠΑΛΗΘΕΥΜΕΝΗ ΔΙΑΚΗΡΥΞΗ — ${score}/100*`
      : `🟢 *ΕΠΑΛΗΘΕΥΜΕΝΗ ΔΙΑΚΗΡΥΞΗ — ${score}/100*`;
  }
  return hot
    ? `🔥 *ΝΕΟ LEAD ΚΗΜΔΗΣ — ${score}/100*`
    : `🟢 *ΝΕΑ ΑΝΤΙΣΤΟΙΧΙΑ ΚΗΜΔΗΣ — ${score}/100*`;
};

export type SlackTenderLine = {
  title: string;
  authority?: string | null;
  valueEur?: number | null;
  deadlineIso?: string | null;
  submissionDateIso?: string | null;
  source?: string | null;
  recordType?: string | null;
  referenceNumber?: string | null;
  cpvs?: string[] | null;
  score?: number | null;
  stageLabel?: string | null;
  publicUrl?: string | null;
  pdfUrl?: string | null;
  arcUrl: string;
};

const resolveKimdisPublicUrl = (line: SlackTenderLine): string | null => {
  if (line.publicUrl?.trim()) return line.publicUrl.trim();
  const adam = line.referenceNumber?.trim();
  if (!adam) return null;
  if (adam.startsWith("TED:") || adam.startsWith("DIAVGEIA:")) return null;
  return `${KIMDIS_PUBLIC_BASE}?referenceNumber=${encodeURIComponent(adam)}`;
};

const resolvePdfUrl = (line: SlackTenderLine): string | null => {
  if (line.pdfUrl?.trim()) return line.pdfUrl.trim();
  const adam = line.referenceNumber?.trim();
  if (!adam) return null;
  if (adam.startsWith("TED:") || adam.startsWith("DIAVGEIA:")) return null;
  const base =
    (line.recordType || "").toUpperCase() === "PROC"
      ? KIMDIS_PDF_PROC
      : KIMDIS_PDF_REQ;
  return `${base}/${encodeURIComponent(adam)}`;
};

/** Desktop-parity mrkdwn body for one opportunity card. */
export const formatDesktopStyleCardMrkdwn = (line: SlackTenderLine): string => {
  const title = sanitizeSlackText(line.title, 220) || "Χωρίς τίτλο";
  const authority = line.authority
    ? sanitizeSlackText(line.authority, 120)
    : null;
  const lines: string[] = [scoreHeadlineEl(line), ""];

  if (authority) {
    lines.push(`*${authority} — ${title}*`);
  } else {
    lines.push(`*${title}*`);
  }
  lines.push("");

  if (authority) lines.push(`🏛 ${authority}`);
  const value = formatValue(line.valueEur ?? null);
  if (value) lines.push(`💰 ${value}`);

  const typeLabel = recordTypeLabelEl(line.recordType);
  const stage = line.stageLabel
    ? sanitizeSlackText(line.stageLabel, 60)
    : null;
  if (typeLabel && stage) {
    lines.push(`📌 ${typeLabel} — ${stage}`);
  } else if (typeLabel) {
    lines.push(`📌 ${typeLabel}`);
  }

  const cpvs = (line.cpvs || [])
    .map((c) => String(c).trim())
    .filter(Boolean)
    .slice(0, 3);
  if (cpvs.length > 0) {
    lines.push(`🏷 CPV: ${cpvs.map((c) => sanitizeSlackText(c, 32)).join(", ")}`);
  }

  const posted = formatDateTimeEl(line.submissionDateIso ?? null);
  if (posted) lines.push(`🕒 ΚΗΜΔΗΣ: ${posted}`);

  const deadline = formatDeadline(line.deadlineIso ?? null);
  if (deadline) lines.push(`⏳ Προθεσμία: ${deadline}`);

  const source = sourceLabelEl(line.source);
  if (source) lines.push(`📚 Πηγή: ${source}`);

  lines.push("");
  lines.push(`*Σύσταση:* ${recommendationEl(line)}`);
  lines.push("");

  if (line.referenceNumber?.trim()) {
    lines.push(
      `ΑΔΑΜ: \`${sanitizeSlackText(line.referenceNumber.trim(), 40)}\``,
    );
  }

  const linkBits: string[] = [];
  const kimdisUrl = resolveKimdisPublicUrl(line);
  if (kimdisUrl) linkBits.push(`<${kimdisUrl}|Άνοιγμα στο ΚΗΜΔΗΣ>`);
  const pdfUrl = resolvePdfUrl(line);
  if (pdfUrl) linkBits.push(`<${pdfUrl}|Άνοιγμα PDF>`);
  if (linkBits.length > 0) lines.push(linkBits.join(" · "));

  return lines.join("\n");
};

const actionButton = (url: string, label = "Προβολή στο ARC Tenders"): SlackBlock => ({
  type: "actions",
  elements: [
    {
      type: "button",
      text: { type: "plain_text", text: label, emoji: true },
      url,
      action_id: "arc_open_tender",
    },
  ],
});

const cardBlocksForLine = (line: SlackTenderLine): SlackBlock[] => [
  {
    type: "section",
    text: {
      type: "mrkdwn",
      text: formatDesktopStyleCardMrkdwn(line),
    },
  },
  actionButton(line.arcUrl),
];

export const buildTestSlackMessage = (
  channelName: string,
): SlackMessagePayload => {
  const channel = formatChannelLabel(channelName);
  const text =
    "Δοκιμαστική ειδοποίηση · Η σύνδεση με το ARC Tenders λειτουργεί.";
  return {
    text,
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "Δοκιμαστική ειδοποίηση",
          emoji: true,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "Η σύνδεση με το ARC Tenders λειτουργεί. Σε αυτό το κανάλι θα λαμβάνετε τις ενημερώσεις που έχετε επιλέξει.",
        },
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `Κανάλι: ${sanitizeSlackText(channel, 80)}`,
          },
        ],
      },
    ],
  };
};

export const buildOpportunityBatchSlackMessage = (input: {
  items: SlackTenderLine[];
  totalCount: number;
  moreUrl: string;
}): SlackMessagePayload => {
  const shown = input.items.slice(0, 5);
  const remaining = Math.max(0, input.totalCount - shown.length);
  const text =
    shown.length === 1
      ? `Νέα ευκαιρία · ${sanitizeSlackText(shown[0]!.title, 80)}`
      : `Νέες ευκαιρίες · ${shown.length} ενημερώσεις`;

  const blocks: SlackBlock[] = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: "Νέες ευκαιρίες",
        emoji: true,
      },
    },
  ];

  for (const item of shown) {
    blocks.push(...cardBlocksForLine(item));
    blocks.push({ type: "divider" });
  }

  if (remaining > 0) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `Και ακόμη ${remaining} · <${input.moreUrl}|Δείτε όλες στο ARC Tenders>`,
      },
    });
  } else if (blocks.at(-1)?.type === "divider") {
    blocks.pop();
  }

  return { text, blocks };
};

export const buildRelatedActSlackMessage = (input: SlackTenderLine): SlackMessagePayload => {
  const safeTitle = sanitizeSlackText(input.title, 200);
  const text = `Εξέλιξη σε παρακολούθηση · ${safeTitle}`;
  return {
    text,
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "Εξελίξεις σε διαγωνισμούς που παρακολουθείτε",
          emoji: true,
        },
      },
      ...cardBlocksForLine(input),
    ],
  };
};

export const buildDeadlineSlackMessage = (
  input: SlackTenderLine & { daysRemaining?: number | null },
): SlackMessagePayload => {
  const safeTitle = sanitizeSlackText(input.title, 200);
  const days =
    typeof input.daysRemaining === "number" &&
    Number.isFinite(input.daysRemaining)
      ? input.daysRemaining
      : null;
  const eyebrow =
    days == null
      ? "Υπενθύμιση προθεσμίας"
      : days <= 0
        ? "Προθεσμία σήμερα"
        : days === 1
          ? "Προθεσμία αύριο"
          : `Προθεσμία σε ${days} ημέρες`;
  const text = `${eyebrow} · ${safeTitle}`;
  return {
    text,
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "Υπενθυμίσεις προθεσμιών",
          emoji: true,
        },
      },
      {
        type: "section",
        text: { type: "mrkdwn", text: `*${eyebrow}*` },
      },
      ...cardBlocksForLine(input),
    ],
  };
};
