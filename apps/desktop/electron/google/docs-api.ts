/**
 * Google Docs API helpers (Electron Main only).
 * Always operate on tender COPY document IDs — never masters.
 */

export class DocsApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

type DocsStructuralElement = {
  paragraph?: {
    elements?: Array<{ textRun?: { content?: string } }>;
  };
  table?: {
    tableRows?: Array<{
      tableCells?: Array<{
        content?: DocsStructuralElement[];
      }>;
    }>;
  };
};

type DocsDocument = {
  documentId?: string;
  body?: { content?: DocsStructuralElement[] };
};

const docsFetch = async <T>(
  accessToken: string,
  path: string,
  init?: RequestInit,
): Promise<T> => {
  const response = await fetch(`https://docs.googleapis.com/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });

  const json = (await response.json().catch(() => ({}))) as {
    error?: { message?: string; status?: string };
  } & T;

  if (!response.ok) {
    throw new DocsApiError(
      response.status,
      json.error?.status ?? "docs_error",
      json.error?.message ?? `Google Docs API HTTP ${response.status}`,
    );
  }

  return json as T;
};

const collectText = (elements: DocsStructuralElement[] | undefined): string => {
  if (!elements?.length) return "";
  let out = "";
  for (const el of elements) {
    if (el.paragraph?.elements) {
      for (const pe of el.paragraph.elements) {
        out += pe.textRun?.content ?? "";
      }
    }
    if (el.table?.tableRows) {
      for (const row of el.table.tableRows) {
        for (const cell of row.tableCells ?? []) {
          out += collectText(cell.content);
        }
      }
    }
  }
  return out;
};

export const getDocumentText = async (
  accessToken: string,
  documentId: string,
): Promise<string> => {
  const doc = await docsFetch<DocsDocument>(
    accessToken,
    `/documents/${encodeURIComponent(documentId)}`,
  );
  return collectText(doc.body?.content);
};

type DocsBodyElement = {
  startIndex?: number;
  endIndex?: number;
};

/**
 * Replace the entire body of a Google Doc COPY with plain text,
 * then normalize typography so we don't inherit master Title styles
 * (large bold pink fonts, etc.).
 * Never call this with a master template ID.
 */
export const replaceDocumentBody = async (
  accessToken: string,
  documentId: string,
  plainText: string,
): Promise<void> => {
  const doc = await docsFetch<{
    body?: { content?: DocsBodyElement[] };
  }>(accessToken, `/documents/${encodeURIComponent(documentId)}`);

  const content = doc.body?.content ?? [];
  const last = content[content.length - 1];
  const endIndex = last?.endIndex ?? 1;
  const text = plainText.endsWith("\n") ? plainText : `${plainText}\n`;

  const writeRequests: unknown[] = [];
  // Docs API keeps a trailing newline — delete everything before it.
  if (endIndex > 2) {
    writeRequests.push({
      deleteContentRange: {
        range: { startIndex: 1, endIndex: endIndex - 1 },
      },
    });
  }
  writeRequests.push({
    insertText: {
      location: { index: 1 },
      text,
    },
  });

  await docsFetch(
    accessToken,
    `/documents/${encodeURIComponent(documentId)}:batchUpdate`,
    {
      method: "POST",
      body: JSON.stringify({ requests: writeRequests }),
    },
  );

  // Insert inherits the previous paragraph's named style (often Title).
  // Force NORMAL_TEXT + readable body typography on the written range.
  const styleEnd = 1 + text.length;
  if (styleEnd <= 2) return;

  await docsFetch(
    accessToken,
    `/documents/${encodeURIComponent(documentId)}:batchUpdate`,
    {
      method: "POST",
      body: JSON.stringify({
        requests: [
          {
            updateParagraphStyle: {
              range: { startIndex: 1, endIndex: styleEnd },
              paragraphStyle: {
                namedStyleType: "NORMAL_TEXT",
              },
              fields: "namedStyleType",
            },
          },
          {
            updateTextStyle: {
              range: { startIndex: 1, endIndex: styleEnd },
              textStyle: {
                bold: false,
                italic: false,
                underline: false,
                fontSize: { magnitude: 11, unit: "PT" },
                weightedFontFamily: { fontFamily: "Arial" },
                foregroundColor: {
                  color: { rgbColor: { red: 0, green: 0, blue: 0 } },
                },
              },
              fields:
                "bold,italic,underline,fontSize,weightedFontFamily,foregroundColor",
            },
          },
        ],
      }),
    },
  );
};

export const batchReplaceAllText = async (
  accessToken: string,
  documentId: string,
  requests: Array<{
    replaceAllText: {
      containsText: { text: string; matchCase: boolean };
      replaceText: string;
    };
  }>,
): Promise<void> => {
  if (requests.length === 0) return;
  await docsFetch(
    accessToken,
    `/documents/${encodeURIComponent(documentId)}:batchUpdate`,
    {
      method: "POST",
      body: JSON.stringify({ requests }),
    },
  );
};
