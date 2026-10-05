/** Match-score color bands for UI (0–100). */
export type ScoreTone = "excellent" | "strong" | "moderate" | "low";

export const scoreTone = (score: number): ScoreTone => {
  if (score >= 90) return "excellent";
  if (score >= 70) return "strong";
  if (score >= 50) return "moderate";
  return "low";
};

/** Tailwind classes for badge / text score coloring. */
export const scoreToneClassName = (score: number): string => {
  switch (scoreTone(score)) {
    case "excellent":
      return "border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
    case "strong":
      return "border-transparent bg-orange-500/15 text-orange-700 dark:text-orange-300";
    case "moderate":
      return "border-transparent bg-amber-500/15 text-amber-800 dark:text-amber-200";
    default:
      return "border-transparent bg-slate-500/15 text-slate-600 dark:text-slate-300";
  }
};
