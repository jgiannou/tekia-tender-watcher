/** Exact CPVs we care about most. Edit this list to tune matching. */
export const STRONG_CPVS = [
  "72000000-5",
  "72200000-7",
  "72230000-6",
  "72262000-9",
  "72261000-2",
  "72267000-4",
  "72413000-8",
  "72415000-2",
  "72416000-9",
  "72420000-0",
  "72212224-5",
  "72212316-7",
] as const;

/** CPVs that strongly suggest website/internet work (still need web text gate). */
export const HIGH_CONFIDENCE_WEB_CPVS = [
  "72413000-8",
  "72415000-2",
  "72416000-9",
  "72420000-0",
  "72212224-5",
] as const;

/** Broad IT CPVs — never enough alone for relevance. */
export const BROAD_IT_CPVS = [
  "72000000-5",
  "72200000-7",
  "72261000-2",
  "72267000-4",
] as const;

const normalizeCpv = (cpv: string): string => cpv.trim().toUpperCase();

export const isStrongCpv = (cpv: string): boolean => {
  const normalized = normalizeCpv(cpv);
  return STRONG_CPVS.some((item) => item.toUpperCase() === normalized);
};

export const isHighConfidenceWebCpv = (cpv: string): boolean => {
  const normalized = normalizeCpv(cpv);
  return HIGH_CONFIDENCE_WEB_CPVS.some(
    (item) => item.toUpperCase() === normalized,
  );
};

export const isBroadItCpv = (cpv: string): boolean => {
  const normalized = normalizeCpv(cpv);
  return BROAD_IT_CPVS.some((item) => item.toUpperCase() === normalized);
};

/** CPV codes under the 72xxxxxx IT / software family. */
export const isItFamilyCpv = (cpv: string): boolean => {
  const digits = cpv.replace(/[^0-9]/g, "");
  return digits.startsWith("72");
};

export const classifyCpvs = (
  cpvs: string[],
): {
  strong: boolean;
  itFamily: boolean;
  highConfidenceWeb: boolean;
  broadOnly: boolean;
} => {
  let strong = false;
  let itFamily = false;
  let highConfidenceWeb = false;
  let anyBroad = false;

  for (const cpv of cpvs) {
    if (isStrongCpv(cpv)) strong = true;
    if (isItFamilyCpv(cpv)) itFamily = true;
    if (isHighConfidenceWebCpv(cpv)) highConfidenceWeb = true;
    if (isBroadItCpv(cpv)) anyBroad = true;
  }

  return {
    strong,
    itFamily,
    highConfidenceWeb,
    broadOnly: anyBroad && !highConfidenceWeb,
  };
};
