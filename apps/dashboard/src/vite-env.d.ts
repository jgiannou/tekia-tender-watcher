/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_WATCHER_API_URL: string;
  readonly VITE_OPERATOR_API_TOKEN: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

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
