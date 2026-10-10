import type { PrismaClient } from "@prisma/client";
import { toNuts2 } from "../geo/nuts.js";

export type PriceMemorySample = {
  referenceNumber: string;
  title: string | null;
  winnerName: string | null;
  awardAmount: number | null;
  budgetWithoutVat: number | null;
  /** Award / budget, only when both amounts exist. */
  ratio: number | null;
  signedDate: string | null;
  publicKimdisUrl: string | null;
};

export type PriceMemory = {
  cpv: string | null;
  regionCode: string | null;
  samples: PriceMemorySample[];
  thin: boolean;
  note: string | null;
  /** Honest coverage of what this surface includes today. */
  coverage: {
    source: "kimdis_awrd";
    complete: false;
    descriptionEl: string;
  };
};

const COVERAGE = {
  source: "kimdis_awrd" as const,
  complete: false as const,
  descriptionEl:
    "Δείγματα από κατακυρώσεις ΚΗΜΔΗΣ (AWRD) με κοινό CPV/περιοχή στην τοπική βάση. Δεν είναι πλήρες δημόσιο ιστορικό όλων των αναδόχων ή πηγών (TED/Διαύγεια).",
};

const THIN_BELOW = 3;

const cpvPrefix = (cpvs: unknown): string | null => {
  if (!Array.isArray(cpvs) || cpvs.length === 0) return null;
  const raw = String(cpvs[0] ?? "").replace(/\s/g, "");
  if (raw.length < 2) return null;
  return raw.slice(0, 8);
};

const ratioFor = (
  award: number | null,
  budget: number | null,
): number | null => {
  if (award == null || budget == null || budget <= 0) return null;
  return Math.round((award / budget) * 1000) / 1000;
};

export const buildPriceMemory = (input: {
  cpv: string | null;
  regionCode: string | null;
  samples: PriceMemorySample[];
}): PriceMemory => {
  const thin = input.samples.length < THIN_BELOW;
  return {
    cpv: input.cpv,
    regionCode: input.regionCode,
    samples: input.samples,
    thin,
    note: thin ? "λίγες κατακυρώσεις" : null,
    coverage: COVERAGE,
  };
};

export const loadPriceMemory = async (
  prisma: PrismaClient,
  tenderId: string,
): Promise<PriceMemory> => {
  const tender = await prisma.tender.findUnique({ where: { id: tenderId } });
  if (!tender) {
    return buildPriceMemory({ cpv: null, regionCode: null, samples: [] });
  }
  const prefix = cpvPrefix(tender.cpvs);
  const regionCode = toNuts2(tender.nutsCode);
  if (!prefix) {
    return buildPriceMemory({ cpv: null, regionCode, samples: [] });
  }

  const awards = await prisma.tender.findMany({
    where: {
      recordType: "AWRD",
      id: { not: tender.id },
      winnerName: { not: null },
    },
    orderBy: [{ signedDate: "desc" }, { submissionDate: "desc" }],
    take: 200,
  });

  const samples: PriceMemorySample[] = [];
  for (const award of awards) {
    const awardPrefix = cpvPrefix(award.cpvs);
    if (!awardPrefix || !awardPrefix.startsWith(prefix.slice(0, 5))) continue;
    const awardRegion = toNuts2(award.nutsCode);
    if (regionCode && awardRegion !== regionCode) continue;
    if (regionCode && !awardRegion) continue;
    samples.push({
      referenceNumber: award.referenceNumber,
      title: award.title,
      winnerName: award.winnerName,
      awardAmount: award.awardAmount,
      budgetWithoutVat: award.budgetWithoutVat,
      ratio: ratioFor(award.awardAmount, award.budgetWithoutVat),
      signedDate: (award.signedDate ?? award.submissionDate)?.toISOString() ?? null,
      publicKimdisUrl: award.publicKimdisUrl,
    });
    if (samples.length >= 8) break;
  }

  return buildPriceMemory({ cpv: prefix, regionCode, samples });
};
