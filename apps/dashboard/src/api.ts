const webApiUrl = (
  import.meta.env.VITE_WATCHER_API_URL as string | undefined
)?.replace(/\/$/, "");
const webToken = import.meta.env.VITE_OPERATOR_API_TOKEN as string | undefined;

export const isDesktop = (): boolean =>
  typeof window !== "undefined" && Boolean(window.tekia?.isDesktop);

export const isConfigured = (): boolean => {
  if (isDesktop()) {
    // Desktop configuration is checked asynchronously via connection API.
    // Pages should call ensureDesktopReady() / connection status.
    return true;
  }
  return Boolean(webApiUrl && webToken && String(webToken).length > 0);
};

export class ApiError extends Error {
  status: number;
  body: unknown;
  code?: string;

  constructor(status: number, body: unknown, message?: string, code?: string) {
    super(
      message ??
        (typeof body === "object" && body && "error" in body
          ? String((body as { error: string }).error)
          : `HTTP ${status}`),
    );
    this.status = status;
    this.body = body;
    this.code = code;
  }
}

type TekiaErrorPayload = {
  __tekiaError: true;
  status: number;
  code: string;
  message: string;
  body: unknown;
};

const isTekiaError = (value: unknown): value is TekiaErrorPayload =>
  Boolean(
    value &&
      typeof value === "object" &&
      "__tekiaError" in value &&
      (value as TekiaErrorPayload).__tekiaError,
  );

const request = async <T>(
  path: string,
  init?: RequestInit,
): Promise<T> => {
  if (isDesktop()) {
    if (!window.tekia) {
      throw new Error("Desktop bridge unavailable");
    }
    const result = await window.tekia.api.request<T | TekiaErrorPayload>({
      path,
      method: init?.method ?? "GET",
      body:
        typeof init?.body === "string"
          ? init.body
          : init?.body != null
            ? String(init.body)
            : null,
    });

    if (isTekiaError(result)) {
      throw new ApiError(result.status, result.body, result.message, result.code);
    }
    return result as T;
  }

  if (!webApiUrl || !webToken) {
    throw new Error(
      "Set VITE_WATCHER_API_URL and VITE_OPERATOR_API_TOKEN in apps/dashboard/.env",
    );
  }

  const response = await fetch(`${webApiUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Operator-Token": String(webToken),
      ...(init?.headers ?? {}),
    },
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(response.status, body);
  }
  return body as T;
};

export type OpportunityItem = {
  referenceNumber: string;
  score: number | null;
  category: string | null;
  organization: string | null;
  title: string | null;
  recordType: "REQ" | "PROC";
  budgetWithoutVat: number | null;
  deadline: string | null;
  status: string;
  detectedAt: string;
  relevanceStatus: string | null;
};

export type OpportunitiesResponse = {
  filter: string;
  counters: {
    new: number;
    ready: number;
    submittedThisMonth: number;
    pendingResult: number;
  };
  items: OpportunityItem[];
};

export type TenderDetail = {
  referenceNumber: string;
  recordType: "REQ" | "PROC";
  title: string | null;
  organization: string | null;
  submissionDate: string | null;
  finalSubmissionDate: string | null;
  budgetWithoutVat: number | null;
  budgetWithVat: number | null;
  score: number | null;
  stage: string | null;
  targetedSupplier: boolean;
  nonInvitedOffersRejected: boolean;
  pdfTextStatus: string | null;
  officialPdfUrl: string | null;
  publicKimdisUrl: string | null;
  webCategory: string | null;
  relevanceStatus: string | null;
  currentStatus: string;
  contact: {
    name: string | null;
    department: string | null;
    email: string | null;
    phone: string | null;
  };
  submissionInfo: {
    method: string;
    email: string | null;
    portal: string | null;
    instructions: string | null;
  };
  scopeSummary: string | null;
  documentChecklist: Array<{
    key: string;
    label: string;
    status: string;
    note?: string | null;
  }>;
  drafts: {
    outreach: DraftPackage;
    technical: DraftPackage;
    economic: DraftPackage;
    declarations: DraftPackage;
  };
  approvalStatus: string | null;
  approvedAt: string | null;
  decisionTrace: Array<{ tone: string; text: string }>;
  submission: {
    id: string;
    submittedAt: string;
    method: string;
    recipient: string | null;
    subject: string | null;
    amountWithoutVat: number | null;
    amountWithVat: number | null;
    externalReference: string | null;
    result: string;
    notes: string | null;
  } | null;
  events: Array<{
    id: string;
    eventType: string;
    note: string | null;
    createdAt: string;
  }>;
  sendingConfigured: boolean;
  scoreReasons: string[];
};

export type DraftPackage = {
  status: "NOT_STARTED" | "DRAFT" | "READY";
  subject?: string | null;
  body?: string | null;
  notes?: string | null;
  amountWithoutVat?: number | null;
  attachments?: string[];
  updatedAt?: string | null;
};

export type SubmissionListItem = {
  id: string;
  referenceNumber: string;
  organization: string | null;
  title: string | null;
  recordType: string | null;
  submittedAt: string;
  submissionMethod: string;
  recipient: string | null;
  amountWithoutVat: number | null;
  result: string;
};

export type OperatorSettings = {
  company: {
    legal_name: string;
    brand_name: string;
    trading_name: string;
    contact_name: string;
    email: string;
    phone: string;
    address: string;
    vat_number: string;
    tax_office: string;
    gemi_number: string;
    distinctive_title_confirmed: boolean;
  };
  drive: {
    company_documents_folder_url: string;
    templates_folder_url: string;
    submissions_folder_url: string;
  };
  documents: Array<{
    key: string;
    name: string;
    drive_url: string;
    expiry_date: string | null;
    status: string;
  }>;
};

export type SafeConfig = {
  pollIntervalMinutes: number;
  lookbackHours: number;
  minBudget: number;
  maxBudget: number;
  alertScoreThreshold: number;
  localDashboardUrl: string | null;
  sendingConfigured: boolean;
};

export const openExternalUrl = async (url: string): Promise<void> => {
  if (isDesktop() && window.tekia) {
    const result = await window.tekia.shell.openExternal(url);
    if (!result.ok) {
      throw new Error(result.error ?? "Failed to open URL");
    }
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
};

export const api = {
  opportunities: (filter: string) =>
    request<OpportunitiesResponse>(
      `/api/operator/opportunities?filter=${encodeURIComponent(filter)}`,
    ),
  tender: (ref: string) =>
    request<TenderDetail>(`/api/operator/tenders/${encodeURIComponent(ref)}`),
  patchTender: (ref: string, body: unknown) =>
    request<{ tender: TenderDetail; approvalInvalidated: boolean }>(
      `/api/operator/tenders/${encodeURIComponent(ref)}`,
      { method: "PATCH", body: JSON.stringify(body) },
    ),
  setStatus: (ref: string, status: string, note?: string) =>
    request<{ tender: TenderDetail }>(
      `/api/operator/tenders/${encodeURIComponent(ref)}/status`,
      { method: "PATCH", body: JSON.stringify({ status, note }) },
    ),
  approve: (ref: string) =>
    request<{ tender: TenderDetail }>(
      `/api/operator/tenders/${encodeURIComponent(ref)}/approve`,
      { method: "POST", body: "{}" },
    ),
  recordSubmission: (ref: string, body: unknown) =>
    request<{ tender: TenderDetail }>(
      `/api/operator/tenders/${encodeURIComponent(ref)}/submission`,
      { method: "POST", body: JSON.stringify(body) },
    ),
  submissions: (result: string) =>
    request<{ items: SubmissionListItem[] }>(
      `/api/operator/submissions?result=${encodeURIComponent(result)}`,
    ),
  updateSubmissionResult: (id: string, result: string) =>
    request(`/api/operator/submissions/${encodeURIComponent(id)}/result`, {
      method: "PATCH",
      body: JSON.stringify({ result }),
    }),
  settings: () => request<OperatorSettings>("/api/operator/settings"),
  saveSettings: (body: OperatorSettings) =>
    request<OperatorSettings>("/api/operator/settings", {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  config: () => request<SafeConfig>("/api/operator/config"),
};
