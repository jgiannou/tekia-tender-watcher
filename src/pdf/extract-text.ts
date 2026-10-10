import pdfParse from "pdf-parse";
import { repairGreekPdfText } from "./greek-text.js";

export type PdfTextStatus = "none" | "extracted" | "unreadable" | "skipped" | "error";

export type PdfExtractResult = {
  status: PdfTextStatus;
  text: string;
  pageCount: number;
  /** 1-based page texts when the PDF exposes form-feed separators. */
  pages: Array<{ page: number; text: string }>;
};

const MIN_MEANINGFUL_CHARS = 40;

const splitPages = (raw: string): Array<{ page: number; text: string }> => {
  const chunks = raw.split("\f");
  if (chunks.length <= 1) {
    return raw.trim() ? [{ page: 1, text: repairGreekPdfText(raw.trim()) }] : [];
  }
  return chunks
    .map((chunk, index) => ({
      page: index + 1,
      text: repairGreekPdfText(chunk.trim()),
    }))
    .filter((row) => row.text.length > 0);
};

export const extractPdfText = async (
  buffer: Buffer | null,
): Promise<PdfExtractResult> => {
  const started = Date.now();
  const record = async (status: PdfTextStatus, result: PdfExtractResult) => {
    try {
      const { recordPdfExtractTiming } = await import(
        "../saas/ops/pipeline-metrics.js"
      );
      recordPdfExtractTiming({ durationMs: Date.now() - started, status });
    } catch {
      // Ops metrics must never break PDF extraction.
    }
    return result;
  };

  if (!buffer || buffer.length === 0) {
    return record("none", { status: "none", text: "", pageCount: 0, pages: [] });
  }

  try {
    const parsed = await pdfParse(buffer);
    const raw = (parsed.text ?? "").trim();
    const pages = splitPages(raw);
    const text = repairGreekPdfText(raw);
    const pageCount =
      typeof parsed.numpages === "number" && parsed.numpages > 0
        ? parsed.numpages
        : Math.max(pages.length, text ? 1 : 0);

    if (text.length < MIN_MEANINGFUL_CHARS) {
      return record("unreadable", {
        status: "unreadable",
        text: "",
        pageCount,
        pages: [],
      });
    }

    return record("extracted", { status: "extracted", text, pageCount, pages });
  } catch {
    return record("error", { status: "error", text: "", pageCount: 0, pages: [] });
  }
};
