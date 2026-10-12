/**
 * Slack Block Kit payloads for customer notifications.
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
    })} €`;
  } catch {
    return `${Math.round(value)} €`;
  }
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

export type SlackTenderLine = {
  title: string;
  authority?: string | null;
  valueEur?: number | null;
  deadlineIso?: string | null;
  source?: string | null;
  arcUrl: string;
};

const fieldsForLine = (line: SlackTenderLine): SlackBlock[] => {
  const fields: Array<{ type: "mrkdwn"; text: string }> = [];
  if (line.authority) {
    fields.push({
      type: "mrkdwn",
      text: `*Αναθέτουσα αρχή*\n${sanitizeSlackText(line.authority, 120)}`,
    });
  }
  const value = formatValue(line.valueEur ?? null);
  if (value) {
    fields.push({ type: "mrkdwn", text: `*Αξία*\n${value}` });
  }
  const deadline = formatDeadline(line.deadlineIso ?? null);
  if (deadline) {
    fields.push({ type: "mrkdwn", text: `*Προθεσμία*\n${deadline}` });
  }
  const source = sourceLabelEl(line.source);
  if (source) {
    fields.push({ type: "mrkdwn", text: `*Πηγή*\n${source}` });
  }
  if (fields.length === 0) return [];
  return [{ type: "section", fields }];
};

const actionButton = (url: string): SlackBlock => ({
  type: "actions",
  elements: [
    {
      type: "button",
      text: { type: "plain_text", text: "Προβολή στο ARC Tenders", emoji: true },
      url,
      action_id: "arc_open_tender",
    },
  ],
});

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
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${sanitizeSlackText(item.title, 200)}*`,
      },
    });
    blocks.push(...fieldsForLine(item));
    blocks.push(actionButton(item.arcUrl));
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

export const buildRelatedActSlackMessage = (input: {
  title: string;
  authority?: string | null;
  valueEur?: number | null;
  deadlineIso?: string | null;
  source?: string | null;
  arcUrl: string;
}): SlackMessagePayload => {
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
      {
        type: "section",
        text: { type: "mrkdwn", text: `*${safeTitle}*` },
      },
      ...fieldsForLine({
        title: input.title,
        authority: input.authority,
        valueEur: input.valueEur,
        deadlineIso: input.deadlineIso,
        source: input.source,
        arcUrl: input.arcUrl,
      }),
      actionButton(input.arcUrl),
    ],
  };
};

export const buildDeadlineSlackMessage = (input: {
  title: string;
  authority?: string | null;
  valueEur?: number | null;
  deadlineIso?: string | null;
  source?: string | null;
  arcUrl: string;
  daysRemaining?: number | null;
}): SlackMessagePayload => {
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
        text: { type: "mrkdwn", text: `*${eyebrow}*\n${safeTitle}` },
      },
      ...fieldsForLine({
        title: input.title,
        authority: input.authority,
        valueEur: input.valueEur,
        deadlineIso: input.deadlineIso,
        source: input.source,
        arcUrl: input.arcUrl,
      }),
      actionButton(input.arcUrl),
    ],
  };
};
