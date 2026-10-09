import type { PrismaClient } from "@prisma/client";

/**
 * Enrichment only: an ADA next to the same ADAM.
 * Not a Diavgeia search product.
 */

const DIAVGEIA_SEARCH = "https://diavgeia.gov.gr/luminapi/opendata/search.json";

export type DiavgeiaLink = {
  ada: string;
  url: string;
};

type DiavgeiaDecision = {
  ada?: string;
  documentUrl?: string;
  url?: string;
  subject?: string;
};

export const diavgeiaUrlForAda = (ada: string): string =>
  `https://diavgeia.gov.gr/decision/view/${encodeURIComponent(ada)}`;

export const parseDiavgeiaSearch = (
  payload: unknown,
  adam: string,
): DiavgeiaLink | null => {
  if (!payload || typeof payload !== "object") return null;
  const decisions = (payload as { decisions?: DiavgeiaDecision[] }).decisions;
  if (!Array.isArray(decisions)) return null;
  const needle = adam.trim().toUpperCase();
  for (const decision of decisions) {
    const ada = decision.ada?.trim();
    if (!ada) continue;
    const subject = decision.subject ?? "";
    const mentionsAdam = subject.toUpperCase().includes(needle);
    if (!mentionsAdam) continue;
    return {
      ada,
      url: decision.documentUrl || decision.url || diavgeiaUrlForAda(ada),
    };
  }
  return null;
};

export const lookupDiavgeiaByAdam = async (
  adam: string,
  fetchImpl: typeof fetch = fetch,
): Promise<DiavgeiaLink | null> => {
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
    return {
      ada: tender.diavgeiaAda,
      url: tender.diavgeiaUrl || diavgeiaUrlForAda(tender.diavgeiaAda),
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
