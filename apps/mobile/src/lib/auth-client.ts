import { createAuthClient } from "better-auth/react";
import { expoClient } from "@better-auth/expo/client";
import * as SecureStore from "expo-secure-store";

const baseURL = (
  process.env.EXPO_PUBLIC_SAAS_API_URL || "https://arc-tenders.tekia.gr"
).replace(/\/$/, "");

export const authClient = createAuthClient({
  baseURL,
  plugins: [
    expoClient({
      scheme: "arctenders",
      storagePrefix: "arctenders",
      storage: SecureStore,
    }),
  ],
});
