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
  /** ADAM / KIMDIS reference number — always include in alerts */
  referenceNumber?: string;
  /** Optional local operator dashboard base URL, e.g. http://localhost:5173 */
  localDashboardUrl?: string | null;
  flags: {
    earlyStage: boolean;
    hasLinkedNotice: boolean;
    targetedSupplier: boolean;
    nonInvitedOffersRejected: boolean;
    alreadyAdvanced: boolean;
    pdfNeedsManualReview: boolean;
    pdfVerified?: boolean;
    budgetInRange?: boolean;
  };
  targetedSupplierName?: string | null;
  relation?: {
    decision: string;
    parentAdam: string | null;
    score: number;
    confidence: string | null;
    method: string | null;
    invitationType: string;
    invitedVendorName: string | null;
    ourInvitationStatus: string;
    recommendedAction: string;
    /** Parent REQ already had Early Outreach SENT */
    parentOutreachSent?: boolean;
  } | null;
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

const recommendation = (item: SlackOpportunity): string => {
  if (item.relation?.recommendedAction) {
    return item.relation.recommendedAction;
  }
  if (item.flags.alreadyAdvanced || item.flags.nonInvitedOffersRejected) {
    return "LOW PRIORITY — likely too late";
  }
  if (item.flags.targetedSupplier) {
    return "SKIP — targeted invitation";
  }
  if (item.recordType === "PROC") {
    return "REVIEW / PREPARE OFFER";
  }
  if (item.flags.earlyStage && item.score >= 70) {
    return "CONTACT EARLY";
  }
  if (item.score >= 80) {
    return "CONTACT EARLY";
  }
  return "Worth a look";
};

const isFollowUpRelation = (item: SlackOpportunity): boolean =>
  Boolean(
    item.relation?.parentAdam &&
      item.recordType === "PROC" &&
      (item.relation.parentOutreachSent ||
        item.relation.decision === "AUTO_LINK" ||
        item.relation.decision === "POSSIBLE_RELATION"),
  );

const headline = (item: SlackOpportunity): string => {
  if (isFollowUpRelation(item) && item.relation) {
    if (item.relation.ourInvitationStatus === "NOT_INVITED") {
      return `🔔 *FOLLOW-UP — RELATED PROC DETECTED — TEKIA NOT INVITED*`;
    }
    if (item.relation.ourInvitationStatus === "INVITED") {
      return `🔔 *FOLLOW-UP — RELATED PROC DETECTED — TEKIA INVITED*`;
    }
    if (item.relation.invitationType === "OPEN") {
      return `🔔 *FOLLOW-UP — RELATED PROC DETECTED — OPEN INVITATION*`;
    }
    return `🔔 *FOLLOW-UP — RELATED PROC DETECTED*`;
  }
  if (item.recordType === "PROC") {
    if (item.score >= 80) return `🔥 *VERIFIED OPEN PROC — ${item.score}/100*`;
    return `🟢 *VERIFIED OPEN PROC — ${item.score}/100*`;
  }
  if (item.score >= 80) return `🔥 *NEW KIMDIS LEAD — ${item.score}/100*`;
  return `🟢 *NEW KIMDIS MATCH — ${item.score}/100*`;
};

export const formatSlackMessage = (item: SlackOpportunity): string => {
  const followUp = isFollowUpRelation(item);
  const lines: string[] = [
    headline(item),
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

  if (followUp && item.relation?.parentAdam) {
    lines.push("*Watched Early Outreach follow-up*");
    lines.push(`REQ: \`${item.relation.parentAdam}\``);
    if (item.referenceNumber) {
      lines.push(`PROC: \`${item.referenceNumber}\``);
    }
    lines.push(`Invitation: ${item.relation.invitationType}`);
    if (item.relation.invitedVendorName) {
      lines.push(`Targeted vendor: ${item.relation.invitedVendorName}`);
    }
    lines.push(`TEKIA: ${item.relation.ourInvitationStatus}`);
    if (item.relation.confidence) {
      lines.push(
        `Confidence: ${item.relation.confidence} (score ${item.relation.score})`,
      );
    }
    lines.push("");
    const action =
      item.relation.ourInvitationStatus === "NOT_INVITED"
        ? "NO OFFER"
        : item.relation.ourInvitationStatus === "INVITED"
          ? "PREPARE OFFER"
          : item.relation.invitationType === "OPEN"
            ? "REVIEW REQUIREMENTS"
            : recommendation(item);
    lines.push(`*Action:* ${action}`);
    lines.push(`*Recommendation:* ${recommendation(item)}`);
  } else {
    if (item.recordType === "REQ") {
      lines.push("✅ Explicit website scope");
      if (item.flags.earlyStage) lines.push("✅ Early stage");
      if (!item.flags.hasLinkedNotice) {
        lines.push("✅ No linked invitation");
      } else {
        lines.push("⚠️ Linked notice already exists");
      }
      if (item.flags.budgetInRange) {
        lines.push("✅ Budget in target range");
      }
    } else {
      if (item.flags.pdfVerified) lines.push("✅ PDF verified");
      if (!item.flags.targetedSupplier) {
        lines.push("✅ No named supplier detected");
      }
      if (!item.flags.nonInvitedOffersRejected) {
        lines.push("✅ Non-invited offers not excluded");
      }
      if (item.finalSubmissionDate) {
        lines.push("✅ Deadline open");
      }
    }

    if (item.flags.pdfNeedsManualReview) {
      lines.push("⚠️ PDF needs manual review");
    }

    if (item.flags.targetedSupplier) {
      lines.push("⚠️ Targeted invitation");
      if (item.targetedSupplierName) {
        lines.push(`⚠️ Specific supplier detected: ${item.targetedSupplierName}`);
      }
    }

    if (item.flags.nonInvitedOffersRejected) {
      lines.push("⚠️ Non-invited offers rejected");
    }

    if (item.flags.alreadyAdvanced) {
      lines.push("⚠️ Already advanced / award language in PDF");
    }

    if (item.relation?.parentAdam) {
      lines.push("");
      lines.push("*Relation to existing opportunity*");
      lines.push(`Parent REQ: \`${item.relation.parentAdam}\``);
      if (item.relation.confidence) {
        lines.push(
          `Confidence: ${item.relation.confidence} (score ${item.relation.score})`,
        );
      }
      if (item.relation.invitationType) {
        lines.push(`Invitation: ${item.relation.invitationType}`);
      }
      if (item.relation.invitedVendorName) {
        lines.push(`Vendor: ${item.relation.invitedVendorName}`);
      }
      if (item.relation.ourInvitationStatus) {
        lines.push(`TEKIA: ${item.relation.ourInvitationStatus}`);
      }
    }

    lines.push("");
    lines.push(`*Recommendation:* ${recommendation(item)}`);
  }

  lines.push("");

  if (item.referenceNumber) {
    lines.push(`ADAM: \`${item.referenceNumber}\``);
  }

  lines.push(`<${item.publicUrl}|Open in KIMDIS>`);
  lines.push(`<${item.pdfUrl}|Open PDF>`);

  if (item.localDashboardUrl && item.referenceNumber) {
    const base = item.localDashboardUrl.replace(/\/$/, "");
    lines.push(
      `<${base}/tenders/${encodeURIComponent(item.referenceNumber)}|Open in local dashboard>`,
    );
  }

  return lines.join("\n");
};

export const formatBootstrapMessage = (): string =>
  "✅ TEKIA Tender Watcher started. Existing KIMDIS records were indexed; alerts will be sent for new matches.";

export const formatBootstrapSummaryMessage = (input: {
  highPriorityCount: number;
  recentHours: number;
  examples: Array<{
    adam: string;
    title: string;
    score: number;
    organization: string;
  }>;
}): string => {
  const lines = [
    `✅ Bootstrap completed — ${input.highPriorityCount} high-priority recent opportunities (last ${input.recentHours}h) require review.`,
    "Individual historical alerts were suppressed to avoid flooding Slack.",
    "",
  ];

  for (const example of input.examples) {
    lines.push(
      `• score ${example.score} | \`${example.adam}\` | ${example.organization} — ${example.title}`,
    );
  }

  if (input.highPriorityCount > input.examples.length) {
    lines.push(
      `…and ${input.highPriorityCount - input.examples.length} more — open the dashboard to review.`,
    );
  }

  return lines.join("\n");
};

export const formatTestSlackMessage = (): string =>
  "✅ TEKIA Tender Watcher test notification — Slack webhook is working.";
