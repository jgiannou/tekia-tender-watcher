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
