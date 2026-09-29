export type RecordType = "REQ" | "PROC";

export type KimdisKeyValue = {
  key?: string | number | null;
  value?: string | null;
};

export type KimdisCpv = {
  key?: string | null;
  value?: string | null;
};

export type KimdisObjectDetail = {
  quantity?: number | null;
  shortDescription?: string | null;
  costWithoutVAT?: number | null;
  vat?: string | number | null;
  cpvs?: KimdisCpv[] | null;
};

export type KimdisOrganization = {
  key?: string | null;
  value?: string | null;
};

export type KimdisRequestRecord = {
  title?: string | null;
  referenceNumber: string;
  signedDate?: string | null;
  submissionDate?: string | null;
  organization?: KimdisOrganization | null;
  totalCostWithVAT?: number | null;
  totalCostWithoutVAT?: number | null;
  objectDetails?: KimdisObjectDetail[] | null;
  approvalRefNo?: string[] | null;
  noticeRefNo?: string[] | null;
  auctionRefNo?: string[] | null;
  contractRefNo?: string[] | null;
  cancelled?: boolean | null;
  contractTypes?: Array<{ contractType?: KimdisKeyValue | null }> | null;
};

export type KimdisNoticeRecord = KimdisRequestRecord & {
  finalSubmissionDate?: string | null;
};

export type KimdisPage<T> = {
  content: T[];
  last?: boolean;
  totalElements?: number;
  totalPages?: number;
  number?: number;
  numberOfElements?: number;
  empty?: boolean;
};

export type RequestSearchBody = {
  dateFrom: string;
  dateTo: string;
  contractType: string;
  isInitial: boolean;
  isApproved: boolean;
  isApproval: boolean;
  totalCostFrom?: number;
  totalCostTo?: number;
};

export type NoticeSearchBody = {
  dateFrom: string;
  dateTo: string;
  contractType: string;
  totalCostFrom?: number;
  totalCostTo?: number;
};
