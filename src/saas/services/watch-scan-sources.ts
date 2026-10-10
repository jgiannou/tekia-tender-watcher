import type { PrismaClient, WatchProfile } from "@prisma/client";
import type { KimdisSearchItem } from "./kimdis-search.js";
import {
  getDiavgeiaAdapterStatus,
  searchDiavgeiaDecisions,
} from "../sources/diavgeia-adapter.js";
import {
  getTedAdapterStatus,
  searchTedNotices,
  type TedNoticeRef,
} from "../sources/ted-adapter.js";
import { upsertTenderFromDiavgeiaDecision } from "./diavgeia-notices.js";
import { parseDataSources, type TenderSourceSystem } from "./source-provenance.js";
import { upsertTenderFromTedNotice } from "./ted-notices.js";
import {
  scoreKimdisItemAgainstProfile,
  type WatchProfileCriteria,
} from "./watch-match.js";

export type SourceScanMatch = {
  tenderId: string;
  item: KimdisSearchItem;
  match: ReturnType<typeof scoreKimdisItemAgainstProfile>;
  sourceSystem: TenderSourceSystem;
};

export type SourceScanPhaseResult = {
  matches: SourceScanMatch[];
  errors: string[];
  evaluated: number;
  pagesFetched: number;
  sourceSystem: TenderSourceSystem;
  blocker: string | null;
  lastFetchedAt: string | null;
};

const MAX_TED_PAGES = 3;
const MAX_DIAVGEIA_PAGES = 2;

export const dataSourcesForProfile = (
  profile: WatchProfile,
): TenderSourceSystem[] => {
  const meta =
    typeof profile.customFilters === "object" && profile.customFilters
      ? (profile.customFilters as Record<string, unknown>)
      : {};
  return parseDataSources(meta.dataSources);
};

export const kimdisItemFromTedNotice = (notice: TedNoticeRef): KimdisSearchItem => ({
  adam: `TED:${notice.publicationNumber}`,
  recordType: "PROC",
  title: notice.title ?? "",
  contractingAuthority: notice.buyerName ?? "",
  description: notice.noticeType ?? "",
  cpvs: notice.cpvs,
  budgetWithoutVat: null,
  budgetWithVat: null,
  submissionDate: notice.publicationDate,
  signedDate: null,
  finalSubmissionDate: notice.deadline,
  procedureType: notice.noticeType,
  contractTypeLabel: null,
  cancelled: false,
  publicKimdisUrl: notice.url,
  officialPdfUrl: notice.pdfUrl ?? "",
  nutsCode: null,
  contractEndsAt: null,
  awardAmount: null,
  winnerName: null,
  diavgeiaAda: null,
  openState: "UNKNOWN",
});

export const scanTedForWatchProfile = async (input: {
  profile: WatchProfile;
  criteria: WatchProfileCriteria;
  seenRefs: Set<string>;
  assertBudget: () => void;
}): Promise<SourceScanPhaseResult> => {
  const status = getTedAdapterStatus();
  const nowIso = new Date().toISOString();
  if (!status.enabled) {
    return {
      matches: [],
      errors: status.blocker ? [status.blocker] : ["ted_disabled"],
      evaluated: 0,
      pagesFetched: 0,
      sourceSystem: "ted",
      blocker: status.blocker,
      lastFetchedAt: null,
    };
  }

  const keywords = input.criteria.keywords.slice(0, 6);
  const cpvs = input.criteria.cpvs.slice(0, 6);
  if (keywords.length === 0 && cpvs.length === 0) {
    return {
      matches: [],
      errors: [],
      evaluated: 0,
      pagesFetched: 0,
      sourceSystem: "ted",
      blocker: null,
      lastFetchedAt: nowIso,
    };
  }

  const matches: SourceScanMatch[] = [];
  const errors: string[] = [];
  let evaluated = 0;
  let pagesFetched = 0;

  for (let page = 1; page <= MAX_TED_PAGES; page += 1) {
    input.assertBudget();
    const result = await searchTedNotices({
      keywords,
      cpv: cpvs,
      buyerCountry: "GRC",
      limit: 20,
      page,
    });
    pagesFetched += 1;
    if (result.blocker) {
      errors.push(result.blocker);
      break;
    }
    if (result.notices.length === 0) break;

    for (const notice of result.notices) {
      input.assertBudget();
      const ref = `TED:${notice.publicationNumber}`;
      if (input.seenRefs.has(ref)) continue;
      input.seenRefs.add(ref);
      evaluated += 1;
      const item = kimdisItemFromTedNotice(notice);
      const match = scoreKimdisItemAgainstProfile(input.criteria, item, {
        id: input.profile.id,
        name: input.profile.name,
        sourceSystem: "ted",
      });
      if (!match.qualifies) continue;
      matches.push({
        tenderId: "", // filled by caller after upsert
        item,
        match,
        sourceSystem: "ted",
      });
      // Attach notice for upsert via item.adam + parallel map
      (item as KimdisSearchItem & { _tedNotice?: TedNoticeRef })._tedNotice =
        notice;
    }

    if (result.notices.length < 20) break;
  }

  return {
    matches,
    errors,
    evaluated,
    pagesFetched,
    sourceSystem: "ted",
    blocker: errors[0] ?? null,
    lastFetchedAt: nowIso,
  };
};

export const scanDiavgeiaForWatchProfile = async (input: {
  profile: WatchProfile;
  criteria: WatchProfileCriteria;
  seenRefs: Set<string>;
  assertBudget: () => void;
}): Promise<SourceScanPhaseResult> => {
  const status = getDiavgeiaAdapterStatus();
  const nowIso = new Date().toISOString();
  if (!status.enabled) {
    return {
      matches: [],
      errors: status.blocker ? [status.blocker] : ["diavgeia_disabled"],
      evaluated: 0,
      pagesFetched: 0,
      sourceSystem: "diavgeia",
      blocker: status.blocker,
      lastFetchedAt: null,
    };
  }

  const term = [...input.criteria.keywords, ...input.criteria.cpvs]
    .map((row) => row.trim())
    .filter(Boolean)
    .slice(0, 4)
    .join(" ");
  if (!term) {
    return {
      matches: [],
      errors: [],
      evaluated: 0,
      pagesFetched: 0,
      sourceSystem: "diavgeia",
      blocker: null,
      lastFetchedAt: nowIso,
    };
  }

  const matches: SourceScanMatch[] = [];
  const errors: string[] = [];
  let evaluated = 0;
  let pagesFetched = 0;

  for (let page = 0; page < MAX_DIAVGEIA_PAGES; page += 1) {
    input.assertBudget();
    const result = await searchDiavgeiaDecisions({ term, page, size: 20 });
    pagesFetched += 1;
    if (result.blocker) {
      errors.push(result.blocker);
      break;
    }
    if (result.decisions.length === 0) break;

    for (const decision of result.decisions) {
      input.assertBudget();
      const ref = `DIAVGEIA:${decision.ada}`;
      if (input.seenRefs.has(ref)) continue;
      input.seenRefs.add(ref);
      evaluated += 1;
      // Score as PROC-shaped item; persistence still uses recordType OTHER.
      const item: KimdisSearchItem & { _diavgeiaDecision?: typeof decision } = {
        adam: ref,
        recordType: "PROC",
        title: decision.subject ?? "",
        contractingAuthority: decision.organization ?? "",
        description: decision.subject ?? "",
        cpvs: [],
        budgetWithoutVat: null,
        budgetWithVat: null,
        submissionDate: decision.issueDate,
        signedDate: null,
        finalSubmissionDate: null,
        procedureType: decision.decisionTypeId,
        contractTypeLabel: null,
        cancelled: false,
        publicKimdisUrl: decision.url,
        officialPdfUrl: decision.documentUrl ?? "",
        nutsCode: null,
        contractEndsAt: null,
        awardAmount: null,
        winnerName: null,
        diavgeiaAda: decision.ada,
        openState: "UNKNOWN",
        _diavgeiaDecision: decision,
      };
      const match = scoreKimdisItemAgainstProfile(input.criteria, item, {
        id: input.profile.id,
        name: input.profile.name,
        sourceSystem: "diavgeia",
      });
      if (!match.qualifies) continue;
      matches.push({
        tenderId: "",
        item,
        match,
        sourceSystem: "diavgeia",
      });
    }

    if (result.decisions.length < 20) break;
  }

  return {
    matches,
    errors,
    evaluated,
    pagesFetched,
    sourceSystem: "diavgeia",
    blocker: errors[0] ?? null,
    lastFetchedAt: nowIso,
  };
};

export const upsertMatchedSourceItem = async (
  prisma: PrismaClient,
  item: KimdisSearchItem,
  sourceSystem: TenderSourceSystem,
) => {
  if (sourceSystem === "ted") {
    const notice = (item as KimdisSearchItem & { _tedNotice?: TedNoticeRef })
      ._tedNotice;
    if (!notice) {
      throw new Error("ted_notice_missing_on_scan_item");
    }
    return upsertTenderFromTedNotice(prisma, notice);
  }
  if (sourceSystem === "diavgeia") {
    const decision = (
      item as KimdisSearchItem & {
        _diavgeiaDecision?: Parameters<
          typeof upsertTenderFromDiavgeiaDecision
        >[1];
      }
    )._diavgeiaDecision;
    if (!decision) {
      throw new Error("diavgeia_decision_missing_on_scan_item");
    }
    return upsertTenderFromDiavgeiaDecision(prisma, decision);
  }
  throw new Error("unsupported_source_system");
};
