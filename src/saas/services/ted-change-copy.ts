/** Human-readable TED monitoring change titles for attention + email. */

/**
 * TED returns offsets like `2026-10-15+03:00` (no `T`) which `Date.parse` rejects.
 * Normalize to a parseable ISO string.
 */
export const normalizeTedDateTime = (
  value: string | null | undefined,
): string | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\d{4}-\d{2}-\d{2}[+-]\d{2}:\d{2}$/.test(trimmed)) {
    return trimmed.replace(/^(\d{4}-\d{2}-\d{2})([+-]\d{2}:\d{2})$/, "$1T00:00:00$2");
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return `${trimmed}T00:00:00.000Z`;
  }
  return trimmed;
};

export const parseTedDate = (value: string | null | undefined): Date | null => {
  const normalized = normalizeTedDateTime(value);
  if (!normalized) return null;
  const ms = Date.parse(normalized);
  return Number.isFinite(ms) ? new Date(ms) : null;
};

export const formatDayEl = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const parsed = parseTedDate(value);
  if (parsed) return parsed.toLocaleDateString("el-GR");
  const trimmed = value.trim();
  const m = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return trimmed || null;
  return `${m[3]}/${m[2]}/${m[1]}`;
};

/** Compare TED / DB deadlines on calendar day only. */
export const deadlineDayKey = (value: string | null | undefined): string => {
  if (!value) return "";
  const parsed = parseTedDate(value);
  if (parsed) return parsed.toISOString().slice(0, 10);
  const m = value.trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return m?.[1] ?? value.trim();
};

export const tedDeadlineChangeTitle = (
  previousDeadline: string | null | undefined,
  nextDeadline: string | null | undefined,
): string => {
  const from = formatDayEl(previousDeadline);
  const to = formatDayEl(nextDeadline);
  if (from && to) return `Η προθεσμία άλλαξε από ${from} σε ${to}`;
  if (to && !from) return `Ορίστηκε προθεσμία υποβολής: ${to}`;
  if (from && !to) return `Αφαιρέθηκε η προθεσμία υποβολής (ήταν ${from})`;
  return "Αλλαγή προθεσμίας σε δημοσίευση TED που παρακολουθείτε";
};

export const tedNoticeUpdateTitle = (): string =>
  "Ενημερώθηκε η δημοσίευση TED που παρακολουθείτε";
