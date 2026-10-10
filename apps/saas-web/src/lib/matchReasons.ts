/** Normalize stored match-reason copy for display (legacy + current). */
export const formatMatchReason = (reason: string): string => {
  const trimmed = reason.trim();

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
