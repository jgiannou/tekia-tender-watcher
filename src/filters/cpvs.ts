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

const normalizeCpv = (cpv: string): string => cpv.trim().toUpperCase();

export const isStrongCpv = (cpv: string): boolean => {
  const normalized = normalizeCpv(cpv);
  return STRONG_CPVS.some((item) => item.toUpperCase() === normalized);
};

/** CPV codes under the 72xxxxxx IT / software family. */
export const isItFamilyCpv = (cpv: string): boolean => {
  const digits = cpv.replace(/[^0-9]/g, "");
  return digits.startsWith("72");
};

export const classifyCpvs = (
  cpvs: string[],
): { strong: boolean; itFamily: boolean } => {
  let strong = false;
  let itFamily = false;

  for (const cpv of cpvs) {
    if (isStrongCpv(cpv)) strong = true;
    if (isItFamilyCpv(cpv)) itFamily = true;
  }

  return { strong, itFamily };
};
