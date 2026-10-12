export {};

declare global {
  interface Window {
    arcTendersOps?: {
      isElectron: boolean;
      fetch: (payload: {
        url: string;
        method?: string;
        headers?: Record<string, string>;
        body?: string;
      }) => Promise<{
        status: number;
        body: string;
        headers: Record<string, string>;
      }>;
      openExternal: (url: string) => Promise<void>;
      writePulseCache?: (snapshot: {
        generatedAt: number;
        users: number;
        organizations: number;
        paying: number;
        errors: number;
        healthy: boolean;
        statusText: string;
        apiUrl?: string;
        adminToken?: string;
      }) => Promise<{ ok: boolean; path?: string; error?: string }>;
      syncPulseWidget?: (payload: {
        apiUrl: string;
        adminToken: string;
      }) => Promise<{ ok: boolean; error?: string }>;
    };
  }
}
