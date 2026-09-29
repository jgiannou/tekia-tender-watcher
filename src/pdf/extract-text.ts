import pdfParse from "pdf-parse";

export type PdfTextStatus = "none" | "extracted" | "unreadable" | "skipped" | "error";

export type PdfExtractResult = {
  status: PdfTextStatus;
  text: string;
};

const MIN_MEANINGFUL_CHARS = 40;

export const extractPdfText = async (
  buffer: Buffer | null,
): Promise<PdfExtractResult> => {
  if (!buffer || buffer.length === 0) {
    return { status: "none", text: "" };
  }

  try {
    const parsed = await pdfParse(buffer);
    const text = (parsed.text ?? "").replace(/\u0000/g, "").trim();

    if (text.length < MIN_MEANINGFUL_CHARS) {
      return { status: "unreadable", text: "" };
    }

    return { status: "extracted", text };
  } catch {
    return { status: "error", text: "" };
  }
};
