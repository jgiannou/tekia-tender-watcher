/** Machine / seed reason codes → readable Greek copy. */
const REASON_CODE_LABELS: Record<string, string> = {
  title_specific_work: "Ισχυρή αντιστοίχιση τίτλου",
  budget_above_2000: "Οικονομικό αντικείμενο άνω των 2.000 €",
  strong_keyword_match: "Λέξεις-κλειδιά: ισχυρή αντιστοίχιση",
  actionable_work: "Ενεργό αντικείμενο εργασίας",
  funding_act: "Πράξη χρηματοδότησης",
};

/** Normalize stored match-reason copy for display (legacy + current). */
export const formatMatchReason = (reason: string): string => {
  const trimmed = reason.trim();

  const codeLabel = REASON_CODE_LABELS[trimmed];
  if (codeLabel) return codeLabel;

  const titleContainsCode = trimmed.match(/^title_contains_(.+)$/i);
  if (titleContainsCode) {
    return `Ο τίτλος περιέχει τον όρο «${titleContainsCode[1]}…»`;
  }

  const legacyTitle = trimmed.match(/^λέξη-κλειδί [«"](.+?)[»"] στον τίτλο$/i);
  if (legacyTitle) return `Ο τίτλος περιέχει τον όρο «${legacyTitle[1]}».`;

  const legacyBody = trimmed.match(/^λέξη-κλειδί [«"](.+?)[»"] στο κείμενο$/i);
  if (legacyBody) return `Το κείμενο περιέχει τον όρο «${legacyBody[1]}».`;

  const legacyExtraTitle = trimmed.match(/^επιπλέον θέμα [«"](.+?)[»"] στον τίτλο$/i);
  if (legacyExtraTitle) {
    return `Ο τίτλος περιέχει επίσης τον όρο «${legacyExtraTitle[1]}».`;
  }

  const legacyExtraBody = trimmed.match(/^επιπλέον θέμα [«"](.+?)[»"] στο κείμενο$/i);
  if (legacyExtraBody) {
    return `Το κείμενο περιέχει επίσης τον όρο «${legacyExtraBody[1]}».`;
  }

  if (trimmed === "Αίτημα με λέξη-κλειδί στον τίτλο") {
    return "Αίτημα με όρο αναζήτησης στον τίτλο";
  }

  return trimmed;
};
