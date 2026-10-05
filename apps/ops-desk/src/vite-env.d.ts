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
    };
  }
}
