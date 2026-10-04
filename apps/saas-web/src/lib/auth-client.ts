import { createAuthClient } from "better-auth/react";

/**
 * Prefer same-origin (Vite proxy → :3000) so session cookies are first-party.
 * Only set VITE_SAAS_API_URL when you intentionally call the API cross-origin.
 */
const baseURL =
  import.meta.env.VITE_SAAS_API_URL?.replace(/\/$/, "") ||
  (typeof window !== "undefined" ? window.location.origin : "http://127.0.0.1:5174");

export const authClient = createAuthClient({
  baseURL,
  fetchOptions: {
    credentials: "include",
  },
});
