import type { Repository, TenderRow } from "../db/repository.js";
import type { PdfClassification } from "../pdf/classify.js";
import { isOutreachSent } from "../operator/outreach-monitoring.js";
import {
  assessInvitation,
  type InvitationAssessment,
} from "./invitation-identity.js";
import {
  matchProcToReqs,
  type RelationCandidate,
  type RelationResult,
} from "./req-proc-match.js";

const parseCpvs = (raw: string | null): string[] => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
};

const descriptionFromRaw = (rawJson: string | null): string => {
  if (!rawJson) return "";
  try {
    const parsed = JSON.parse(rawJson) as {
      objectDetails?: Array<{ shortDescription?: string | null }> | null;
      noticeRefNo?: string[] | null;
      approvalRefNo?: string[] | null;
    };
    return (parsed.objectDetails ?? [])
      .map((d) => d.shortDescription ?? "")
      .filter(Boolean)
      .join("\n");
  } catch {
    return "";
  }
};

const explicitRefsFromRaw = (rawJson: string | null): string[] => {
  if (!rawJson) return [];
  try {
    const parsed = JSON.parse(rawJson) as {
      noticeRefNo?: string[] | null;
      approvalRefNo?: string[] | null;
      auctionRefNo?: string[] | null;
      contractRefNo?: string[] | null;
    };
    return [
      ...(parsed.noticeRefNo ?? []),
      ...(parsed.approvalRefNo ?? []),
      ...(parsed.auctionRefNo ?? []),
      ...(parsed.contractRefNo ?? []),
    ]
      .map(String)
      .filter(Boolean);
  } catch {
    return [];
  }
};

export const rowToRelationCandidate = (row: TenderRow): RelationCandidate => ({
  referenceNumber: row.reference_number,
  recordType: row.record_type,
  title: row.title,
  organization: row.organization,
  budgetWithoutVat: row.budget_without_vat,
  cpvs: parseCpvs(row.cpvs),
  description: descriptionFromRaw(row.raw_json),
  submissionDate: row.submission_date,
  explicitRefs: explicitRefsFromRaw(row.raw_json),
});

export const rowToWatchedRelationCandidate = (
  row: TenderRow,
  parseDrafts: (raw: string | null) => { outreach: { status: string } },
): RelationCandidate => ({
  ...rowToRelationCandidate(row),
  watched: isOutreachSent(parseDrafts(row.drafts_json).outreach),
});

export type ApplyProcRelationResult = {
  relation: RelationResult;
  invitation: InvitationAssessment;
  linkedParent: string | null;
};

/**
 * After a new PROC is stored: assess invitation + try REQ link.
 * Never sets operational status to LOST.
 */
export const applyProcRelationAndInvitation = (
  repo: Repository,
  procAdam: string,
  pdf: PdfClassification,
  options?: {
    corpusText?: string;
    pdfExtracted?: boolean;
  },
): ApplyProcRelationResult | null => {
  const proc = repo.findByAdam(procAdam);
  if (!proc || proc.record_type !== "PROC") return null;

  const settings = repo.getOperatorSettings();
  const invitation = assessInvitation(pdf, {
    legalName: settings.company.legal_name,
    vatNumber: settings.company.vat_number,
    brandName: settings.company.brand_name,
    tradingName: settings.company.trading_name,
    distinctiveTitleConfirmed: settings.company.distinctive_title_confirmed,
  });

  // If PDF was not extracted, don't claim OPEN
  if (!options?.pdfExtracted && invitation.invitationType === "OPEN") {
    invitation.invitationType = "UNKNOWN";
    invitation.ourInvitationStatus = "UNKNOWN";
  }

  const reqs = repo
    .listRecentReqs(300)
    .map((row) => rowToWatchedRelationCandidate(row, repo.parseDrafts));
  const procCandidate = rowToRelationCandidate(proc);
  const corpus =
    options?.corpusText ??
    `${proc.title ?? ""}\n${descriptionFromRaw(proc.raw_json)}`;

  const relation = matchProcToReqs(procCandidate, reqs, { corpusText: corpus });

  let parentTenderId: string | null = null;
  let relationCandidateId: string | null = null;

  if (relation.decision === "AUTO_LINK" && relation.parentAdam) {
    parentTenderId = relation.parentAdam;
    relationCandidateId = null;
    repo.addEvent(
      relation.parentAdam,
      "RELATED_PROC",
      `Εντοπίστηκε σχετική πρόσκληση ${procAdam} (${relation.method}, score ${relation.score})`,
    );
    repo.addEvent(
      procAdam,
      "RELATED_PROC",
      `Linked to parent REQ ${relation.parentAdam} (${relation.method}, score ${relation.score})`,
    );
    repo.addEvent(
      procAdam,
      "INVITATION_CLASSIFIED",
      `Invitation ${invitation.invitationType} — TEKIA ${invitation.ourInvitationStatus}${
        invitation.invitedVendorName ? ` (${invitation.invitedVendorName})` : ""
      }`,
    );
    repo.addEvent(
      relation.parentAdam,
      "INVITATION_CLASSIFIED",
      `Σχετική πρόσκληση ${procAdam}: ${invitation.invitationType} / ${invitation.ourInvitationStatus}`,
    );
  } else if (relation.decision === "POSSIBLE_RELATION" && relation.parentAdam) {
    parentTenderId = null;
    relationCandidateId = relation.parentAdam;
  }

  repo.updateRelationAndInvitation(procAdam, {
    parentTenderId,
    relationCandidateId,
    relationConfidence: relation.confidence,
    relationMethod: relation.method,
    relationScore: relation.score,
    relationReasons: relation.reasons,
    invitationType: invitation.invitationType,
    invitedVendorName: invitation.invitedVendorName,
    ourInvitationStatus: invitation.ourInvitationStatus,
  });

  return {
    relation,
    invitation,
    linkedParent: parentTenderId,
  };
};
