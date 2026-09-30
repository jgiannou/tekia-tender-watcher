export const OPERATIONAL_STATUSES = [
  "NEW",
  "REVIEW",
  "READY",
  "SUBMITTED",
  "WON",
  "LOST",
] as const;

export type OperationalStatus = (typeof OPERATIONAL_STATUSES)[number];

export const SUBMISSION_METHODS = [
  "EMAIL",
  "PORTAL",
  "ESIDIS",
  "PHYSICAL",
  "OTHER",
  "UNKNOWN",
] as const;

export type SubmissionMethod = (typeof SUBMISSION_METHODS)[number];

export const SUBMISSION_RESULTS = ["PENDING", "WON", "LOST"] as const;
export type SubmissionResult = (typeof SUBMISSION_RESULTS)[number];

export const TENDER_EVENT_TYPES = [
  "DETECTED",
  "REVIEWED",
  "READY",
  "APPROVED",
  "SUBMITTED",
  "WON",
  "LOST",
] as const;

export type TenderEventType = (typeof TENDER_EVENT_TYPES)[number];

export const DRAFT_STATUSES = ["NOT_STARTED", "DRAFT", "READY"] as const;
export type DraftStatus = (typeof DRAFT_STATUSES)[number];

export const DOCUMENT_ITEM_STATUSES = [
  "AVAILABLE",
  "MISSING",
  "EXPIRED",
  "REQUIRED",
  "NOT_REQUIRED",
  "UNKNOWN",
] as const;

export type DocumentItemStatus = (typeof DOCUMENT_ITEM_STATUSES)[number];

export type DocumentChecklistItem = {
  key: string;
  label: string;
  status: DocumentItemStatus;
  note?: string | null;
};

export type DraftPackage = {
  status: DraftStatus;
  subject?: string | null;
  body?: string | null;
  notes?: string | null;
  amountWithoutVat?: number | null;
  attachments?: string[];
  updatedAt?: string | null;
};

export type TenderDrafts = {
  outreach: DraftPackage;
  technical: DraftPackage;
  economic: DraftPackage;
  declarations: DraftPackage;
};

export type ApprovalSnapshot = {
  recipient: string;
  subject: string;
  body: string;
  attachments: string[];
  amountWithoutVat: number | null;
  declarationText: string;
};

export const DEFAULT_DRAFTS = (): TenderDrafts => ({
  outreach: { status: "NOT_STARTED" },
  technical: { status: "NOT_STARTED" },
  economic: { status: "NOT_STARTED" },
  declarations: { status: "NOT_STARTED" },
});

export const DEFAULT_DOCUMENT_CHECKLIST = (): DocumentChecklistItem[] => [
  { key: "company_profile", label: "Company Profile", status: "UNKNOWN" },
  { key: "gemi", label: "GEMI", status: "UNKNOWN" },
  { key: "tax_clearance", label: "Tax Clearance", status: "UNKNOWN" },
  { key: "insurance_clearance", label: "Insurance Clearance", status: "UNKNOWN" },
  { key: "declaration", label: "Declaration required", status: "UNKNOWN" },
  { key: "economic_offer", label: "Economic Offer required", status: "UNKNOWN" },
];

export type CompanySettings = {
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

export type DriveSettings = {
  company_documents_folder_url: string;
  templates_folder_url: string;
  submissions_folder_url: string;
};

export type VaultDocument = {
  key: string;
  name: string;
  drive_url: string;
  expiry_date: string | null;
  status: DocumentItemStatus;
};

export type OperatorSettings = {
  company: CompanySettings;
  drive: DriveSettings;
  documents: VaultDocument[];
};

export const DEFAULT_OPERATOR_SETTINGS = (): OperatorSettings => ({
  company: {
    legal_name: "",
    brand_name: "TEKIA",
    trading_name: "TEKIA",
    contact_name: "",
    email: "",
    phone: "",
    address: "",
    vat_number: "",
    tax_office: "",
    gemi_number: "",
    distinctive_title_confirmed: false,
  },
  drive: {
    company_documents_folder_url: "",
    templates_folder_url: "",
    submissions_folder_url: "",
  },
  documents: [
    { key: "gemi", name: "GEMI", drive_url: "", expiry_date: null, status: "UNKNOWN" },
    {
      key: "tax_clearance",
      name: "Tax Clearance",
      drive_url: "",
      expiry_date: null,
      status: "UNKNOWN",
    },
    {
      key: "insurance_clearance",
      name: "Insurance Clearance",
      drive_url: "",
      expiry_date: null,
      status: "UNKNOWN",
    },
    { key: "kad", name: "KAD", drive_url: "", expiry_date: null, status: "UNKNOWN" },
    {
      key: "company_profile",
      name: "Company Profile",
      drive_url: "",
      expiry_date: null,
      status: "UNKNOWN",
    },
  ],
});
