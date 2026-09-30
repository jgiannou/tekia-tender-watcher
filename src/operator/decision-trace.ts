import type { TenderRow } from "../db/repository.js";

export type DecisionTraceItem = {
  tone: "positive" | "warning" | "negative";
  text: string;
};

/**
 * Build a human-readable decision trace from stored watcher classification data.
 * Does not re-run classification logic.
 */
export const buildDecisionTrace = (row: TenderRow): DecisionTraceItem[] => {
  const items: DecisionTraceItem[] = [];
  const reasons = parseJsonArray(row.score_reasons);
  const status = row.relevance_status ?? "";
  const category = row.web_category ?? "UNKNOWN";
  const stage = row.stage ?? "";

  if (row.web_relevant) {
    items.push({
      tone: "positive",
      text: `Explicit website / web scope (${category})`,
    });
  } else if (status === "NEEDS_REVIEW") {
    items.push({
      tone: "warning",
      text: row.review_reason ?? "Needs manual relevance review",
    });
  } else if (status === "IRRELEVANT") {
    items.push({
      tone: "negative",
      text: row.ignore_reason ?? "Not web relevant",
    });
  }

  if (row.record_type === "REQ") {
    if (stage === "EARLY" || stage === "UNKNOWN") {
      items.push({ tone: "positive", text: "Early-stage REQ" });
    }
    if (stage === "ALREADY_ADVANCED") {
      items.push({ tone: "warning", text: "Already advanced language detected" });
    }
  }

  if (row.record_type === "PROC") {
    const pdfOk = row.pdf_text_status === "extracted";
    items.push({
      tone: pdfOk ? "positive" : "warning",
      text: pdfOk ? "PDF verified" : `PDF status: ${row.pdf_text_status ?? "unknown"}`,
    });

    if (row.targeted_supplier) {
      items.push({ tone: "negative", text: "Targeted invitation / named supplier" });
    } else {
      items.push({ tone: "positive", text: "No named supplier detected" });
    }

    if (row.non_invited_offers_rejected) {
      items.push({ tone: "negative", text: "Non-invited suppliers rejected" });
    } else {
      items.push({
        tone: "positive",
        text: "Non-invited offers not excluded",
      });
    }

    if (row.final_submission_date) {
      const past = new Date(row.final_submission_date).getTime() < Date.now();
      items.push({
        tone: past ? "negative" : "positive",
        text: past ? "Deadline passed" : "Deadline open",
      });
    }
  }

  if (status === "TARGETED") {
    items.push({ tone: "negative", text: "Classified as TARGETED" });
  }
  if (status === "EXPIRED") {
    items.push({ tone: "negative", text: "Classified as EXPIRED" });
  }

  for (const reason of reasons.slice(0, 6)) {
    if (!items.some((i) => i.text === reason)) {
      const tone =
        /target|reject|expired|irrelevant|skip|late/i.test(reason)
          ? "warning"
          : "positive";
      items.push({ tone, text: reason });
    }
  }

  if (items.length === 0) {
    items.push({
      tone: "warning",
      text: "No stored classification details available",
    });
  }

  return items;
};

const parseJsonArray = (raw: string | null): string[] => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((v): v is string => typeof v === "string")
      : [];
  } catch {
    return [];
  }
};
