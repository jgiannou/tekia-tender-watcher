import { GemiOpenDataProvider } from "./gemi-opendata-provider.js";
import type { CompanyRegistryProvider } from "./types.js";

export type { CompanyRegistryProvider } from "./types.js";
export * from "./types.js";
export { GemiOpenDataProvider, mapGemiCompany } from "./gemi-opendata-provider.js";

export type CompanyRegistryConfig = {
  GEMI_API_KEY?: string;
  GEMI_API_BASE_URL?: string;
};

export const createCompanyRegistryProvider = (
  config: CompanyRegistryConfig,
  fetchImpl?: typeof fetch,
): CompanyRegistryProvider =>
  new GemiOpenDataProvider({
    apiKey: config.GEMI_API_KEY?.trim() ?? "",
    baseUrl:
      config.GEMI_API_BASE_URL?.trim() ||
      "https://opendata-api.businessportal.gr/api/opendata/v1",
    fetchImpl,
  });
