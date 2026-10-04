export type CompanyActivitySuggestion = {
  code: string;
  description: string;
  isPrimary: boolean;
  kadVersion?: string | null;
};

export type CompanyRegistryRecord = {
  gemiNumber: string;
  afm: string;
  legalName: string;
  distinctiveTitle: string | null;
  status: string | null;
  gemiService: string | null;
  legalType: string | null;
  website: string | null;
  email: string | null;
  incorporationDate: string | null;
  address: {
    street: string | null;
    streetNumber: string | null;
    zipCode: string | null;
    city: string | null;
    municipality: string | null;
    prefecture: string | null;
  };
  activities: CompanyActivitySuggestion[];
  source: "GEMI";
};

export type CompanyLookupQuery = {
  afm?: string;
  gemiNumber?: string;
};

export type CompanyRegistryLookupResult =
  | { status: "not_configured" }
  | { status: "unavailable"; message: string }
  | { status: "not_found" }
  | { status: "found"; companies: CompanyRegistryRecord[] };

export type ActivityCatalogEntry = {
  code: string;
  description: string;
  kadVersion?: string | null;
};

export interface CompanyRegistryProvider {
  isConfigured(): boolean;
  lookupExact(query: CompanyLookupQuery): Promise<CompanyRegistryLookupResult>;
  getByGemiNumber(gemiNumber: string): Promise<CompanyRegistryLookupResult>;
  searchActivities?(query: string): Promise<ActivityCatalogEntry[]>;
}
