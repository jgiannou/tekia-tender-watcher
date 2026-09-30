export type SlackOpportunity = {
  score: number;
  title: string;
  organization: string;
  budgetWithoutVat: number | null;
  recordType: "REQ" | "PROC";
  stageLabel: string;
  webCategoryLabel: string;
  cpvs: string[];
  submissionDate: string | null;
  finalSubmissionDate?: string | null;
  publicUrl: string;
  pdfUrl: string;
  reasons: string[];
  flags: {
    earlyStage: boolean;
    hasLinkedNotice: boolean;
    targetedSupplier: boolean;
    nonInvitedOffersRejected: boolean;
    alreadyAdvanced: boolean;
    pdfNeedsManualReview: boolean;
  };
  targetedSupplierName?: string | null;
};

const formatEuro = (amount: number | null): string => {
  if (amount == null) return "Budget not stated";
  return `€${amount.toLocaleString("el-GR", {
    maximumFractionDigits: 0,
  })} χωρίς ΦΠΑ`;
};

const formatDateTime = (value: string | null | undefined): string => {
  if (!value) return "n/a";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("el-GR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const headline = (score: number): string => {
  if (score >= 80) return `🔥 *NEW KIMDIS LEAD — ${score}/100*`;
  return `🟢 *NEW KIMDIS MATCH — ${score}/100*`;
};

const recommendation = (item: SlackOpportunity): string => {
  if (item.flags.alreadyAdvanced || item.flags.nonInvitedOffersRejected) {
    return "LOW PRIORITY — likely too late";
  }
  if (item.flags.targetedSupplier && item.score < 85) {
    return "REVIEW carefully — targeted invitation";
  }
  if (item.score >= 80 && item.flags.earlyStage) {
    return "CONTACT NOW";
  }
  if (item.score >= 80) {
    return "HIGH PRIORITY — review today";
  }
  return "Worth a look";
};

export const formatSlackMessage = (item: SlackOpportunity): string => {
  const lines: string[] = [
    headline(item.score),
    "",
    `*${item.organization} — ${item.title}*`,
    "",
    `${item.webCategoryLabel}`,
    `🏛 ${item.organization}`,
    `💰 ${formatEuro(item.budgetWithoutVat)}`,
    `📌 ${item.recordType} — ${item.stageLabel}`,
  ];

  if (item.cpvs.length > 0) {
    lines.push(`🏷 CPV: ${item.cpvs.slice(0, 3).join(", ")}`);
  }

  lines.push(`🕒 KIMDIS: ${formatDateTime(item.submissionDate)}`);

  if (item.recordType === "PROC" && item.finalSubmissionDate) {
    lines.push(`⏳ Deadline: ${formatDateTime(item.finalSubmissionDate)}`);
  }

  lines.push("");

  if (item.flags.earlyStage) lines.push("✅ Early stage");
  lines.push("✅ Clear web scope");
  if (!item.flags.hasLinkedNotice) {
    lines.push("✅ No linked invitation found");
  } else {
    lines.push("⚠️ Linked notice already exists");
  }

  if (item.flags.pdfNeedsManualReview) {
    lines.push("⚠️ PDF needs manual review");
  }

  if (item.flags.targetedSupplier) {
    lines.push("⚠️ Targeted invitation");
    if (item.targetedSupplierName) {
      lines.push(`⚠️ Specific supplier detected: ${item.targetedSupplierName}`);
    } else {
      lines.push("⚠️ Specific supplier detected");
    }
  }

  if (item.flags.nonInvitedOffersRejected) {
    lines.push("⚠️ Non-invited offers rejected");
  }

  if (item.flags.alreadyAdvanced) {
    lines.push("⚠️ Already advanced / award language in PDF");
  }

  lines.push("");
  lines.push(`*Recommendation:* ${recommendation(item)}`);
  lines.push("");
  lines.push(`<${item.publicUrl}|Open in KIMDIS>`);
  lines.push(`<${item.pdfUrl}|Open PDF>`);

  return lines.join("\n");
};

export const formatBootstrapMessage = (): string =>
  "✅ TEKIA Tender Watcher started. Existing KIMDIS records were indexed; alerts will be sent for new matches.";

export const formatTestSlackMessage = (): string =>
  "✅ TEKIA Tender Watcher test notification — Slack webhook is working.";
