/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_WATCHER_API_URL: string;
  readonly VITE_OPERATOR_API_TOKEN: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

type TekiaDriveBridge = {
  status: (opts?: { refresh?: boolean }) => Promise<unknown>;
  connect: () => Promise<unknown>;
  disconnect: () => Promise<unknown>;
  setRoot: (folderUrlOrId: string) => Promise<unknown>;
  refresh: () => Promise<unknown>;
  chooseTemplate: (key: string, fileId: string) => Promise<unknown>;
  chooseCompanyProfile: (fileId: string) => Promise<unknown>;
  syncCompanyProfile: () => Promise<unknown>;
  saveDocMeta: (meta: unknown) => Promise<unknown>;
  checklist: () => Promise<unknown>;
  packageReadiness: (referenceNumber: string) => Promise<unknown>;
  createWorkspace: (referenceNumber: string) => Promise<unknown>;
  copyTemplate: (
    referenceNumber: string,
    templateKey: string,
    operatorValues?: Record<string, string>,
    outreachContent?: { subject: string; body: string },
  ) => Promise<unknown>;
  syncOutreachContent: (
    referenceNumber: string,
    subject: string,
    body: string,
  ) => Promise<unknown>;
  tenderDocuments: (referenceNumber: string) => Promise<unknown>;
  markDocumentReady: (documentId: string) => Promise<unknown>;
  readDocument: (documentId: string) => Promise<unknown>;
  remergeDocument: (
    documentId: string,
    operatorValues: Record<string, string>,
  ) => Promise<unknown>;
};

type TekiaDesktopBridge = {
  isDesktop: true;
  platform: string;
  api: {
    request: <T = unknown>(payload: {
      path: string;
      method?: string;
      body?: string | null;
    }) => Promise<T>;
    getOpportunities: (filter?: string) => Promise<unknown>;
    getTender: (referenceNumber: string) => Promise<unknown>;
    updateTender: (referenceNumber: string, body: unknown) => Promise<unknown>;
    getSubmissions: (result?: string) => Promise<unknown>;
    recordSubmission: (
      referenceNumber: string,
      body: unknown,
    ) => Promise<unknown>;
  };
  drive: TekiaDriveBridge;
  connection: {
    get: () => Promise<{ apiUrl: string; hasToken: boolean }>;
    save: (input: {
      apiUrl: string;
      token?: string | null;
    }) => Promise<{ apiUrl: string; hasToken: boolean }>;
    test: (input?: {
      apiUrl?: string;
      token?: string;
    }) => Promise<{ status: string; message: string }>;
  };
  companySettings: {
    get: () => Promise<{
      company: Record<string, unknown>;
      updatedAt: string;
      source: "local";
      hasLocalData: boolean;
    }>;
    save: (company: Record<string, unknown>) => Promise<{
      company: Record<string, unknown>;
      updatedAt: string;
      source: "local";
      cloudSynced: boolean;
      cloudError: string | null;
    }>;
  };
  shell: {
    openExternal: (url: string) => Promise<{ ok: boolean; error?: string }>;
  };
  navigation: {
    onOpenTender: (callback: (referenceNumber: string) => void) => () => void;
    onOpenSettings: (callback: () => void) => () => void;
  };
};

interface Window {
  tekia?: TekiaDesktopBridge;
}
