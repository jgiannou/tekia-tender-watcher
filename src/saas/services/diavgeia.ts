import type { PrismaClient } from "@prisma/client";
import {
  diavgeiaPublicUrl,
  fetchDiavgeiaDecisionByAda,
  getDiavgeiaAdapterStatus,
  parseDiavgeiaSearchPayload,
  searchDiavgeiaDecisions,
} from "../sources/diavgeia-adapter.js";

/**
 * Enrichment: link a KIMDIS ADAM to a Diavgeia ADA when possible.
 * Full discovery search is available via the Diavgeia adapter when enabled.
 */

const DIAVGEIA_SEARCH = "https://diavgeia.gov.gr/luminapi/opendata/search.json";

export type DiavgeiaLink = {
  ada: string;
  url: string;
  subject?: string | null;
};

export const diavgeiaUrlForAda = (ada: string): string => diavgeiaPublicUrl(ada);

export const parseDiavgeiaSearch = (
  payload: unknown,
  adam: string,
): DiavgeiaLink | null => {
  const decisions = parseDiavgeiaSearchPayload(payload);
  const needle = adam.trim().toUpperCase();
  for (const decision of decisions) {
    const subject = decision.subject ?? "";
    if (!subject.toUpperCase().includes(needle)) continue;
    return {
      ada: decision.ada,
      url: decision.documentUrl || decision.url || diavgeiaUrlForAda(decision.ada),
      subject: decision.subject,
    };
  }
  return null;
};

export const lookupDiavgeiaByAdam = async (
  adam: string,
  fetchImpl: typeof fetch = fetch,
): Promise<DiavgeiaLink | null> => {
  const status = getDiavgeiaAdapterStatus();
  if (status.enabled) {
    const result = await searchDiavgeiaDecisions(
      { term: adam, page: 0, size: 5 },
      fetchImpl,
    );
    const viaAdapter = parseDiavgeiaSearch({ decisions: result.decisions }, adam);
    if (viaAdapter) return viaAdapter;
  }

  const url = `${DIAVGEIA_SEARCH}?term=${encodeURIComponent(adam)}&page=0&size=5`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetchImpl(url, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as unknown;
    return parseDiavgeiaSearch(payload, adam);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
};

export const resolveDiavgeiaForTender = async (
  prisma: PrismaClient,
  tenderId: string,
): Promise<DiavgeiaLink | null> => {
  const tender = await prisma.tender.findUnique({
    where: { id: tenderId },
    select: {
      id: true,
      referenceNumber: true,
      diavgeiaAda: true,
      diavgeiaUrl: true,
    },
  });
  if (!tender) return null;
  if (tender.diavgeiaAda) {
    const enriched = await fetchDiavgeiaDecisionByAda(tender.diavgeiaAda);
    return {
      ada: tender.diavgeiaAda,
      url:
        enriched?.documentUrl ||
        enriched?.url ||
        tender.diavgeiaUrl ||
        diavgeiaUrlForAda(tender.diavgeiaAda),
      subject: enriched?.subject ?? null,
    };
  }
  const found = await lookupDiavgeiaByAdam(tender.referenceNumber);
  if (!found) return null;
  await prisma.tender.update({
    where: { id: tender.id },
    data: { diavgeiaAda: found.ada, diavgeiaUrl: found.url },
  });
  return found;
};
