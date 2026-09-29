/** Positive Greek keywords — edit to tune matching. */
export const POSITIVE_KEYWORDS_EL = [
  "ιστοσελίδα",
  "ιστότοπος",
  "δικτυακός τόπος",
  "διαδικτυακή πύλη",
  "λογισμικό",
  "ανάπτυξη λογισμικού",
  "εφαρμογή",
  "web εφαρμογή",
  "διαδικτυακή εφαρμογή",
  "πληροφοριακό σύστημα",
  "πλατφόρμα",
  "ψηφιακή πλατφόρμα",
  "ψηφιακές υπηρεσίες",
  "τεχνική υποστήριξη",
  "υποστήριξη ιστοσελίδας",
  "συντήρηση",
  "συντήρηση ιστοσελίδας",
  "αναβάθμιση ιστοσελίδας",
  "επανασχεδιασμός",
  "φιλοξενία",
  "hosting",
  "cloud",
  "cms",
  "wordpress",
  "laravel",
  "διασύνδεση",
  "api",
  "ψηφιακός βοηθός",
] as const;

/** Positive English keywords — edit to tune matching. */
export const POSITIVE_KEYWORDS_EN = [
  "website",
  "web",
  "software",
  "application",
  "platform",
  "hosting",
  "cloud",
  "cms",
  "wordpress",
  "laravel",
  "api",
  "maintenance",
  "support",
  "development",
  "redesign",
  "migration",
] as const;

/** Low-priority / negative terms — reduce score when dominant. */
export const NEGATIVE_KEYWORDS = [
  "social media",
  "διαχείριση social media",
  "παραγωγή περιεχομένου",
  "διαφημιστική προβολή",
  "επιστημονική τεκμηρίωση",
  "επιστημονικές έρευνες",
  "hardware",
  "εξοπλισμός",
  "η/υ",
  "εκτυπωτές",
  "τηλεπικοινωνιακός εξοπλισμός",
] as const;

export const HARDWARE_KEYWORDS = [
  "hardware",
  "εξοπλισμός",
  "η/υ",
  "εκτυπωτές",
  "τηλεπικοινωνιακός εξοπλισμός",
  "προμήθεια υπολογιστών",
  "φορητοί υπολογιστές",
  "οθόνες",
  "servers",
  "server",
] as const;

export const SOCIAL_MEDIA_KEYWORDS = [
  "social media",
  "διαχείριση social media",
  "παραγωγή περιεχομένου",
  "διαφημιστική προβολή",
  "facebook",
  "instagram",
  "tiktok",
] as const;

const normalizeText = (text: string): string =>
  text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();

export type KeywordHit = {
  keyword: string;
  inTitle: boolean;
  inDescription: boolean;
};

export const findKeywordHits = (
  title: string,
  description: string,
  keywords: readonly string[],
): KeywordHit[] => {
  const normalizedTitle = normalizeText(title);
  const normalizedDescription = normalizeText(description);
  const hits: KeywordHit[] = [];

  for (const keyword of keywords) {
    const needle = normalizeText(keyword);
    if (!needle) continue;
    const inTitle = normalizedTitle.includes(needle);
    const inDescription = normalizedDescription.includes(needle);
    if (inTitle || inDescription) {
      hits.push({ keyword, inTitle, inDescription });
    }
  }

  return hits;
};

export const POSITIVE_KEYWORDS = [
  ...POSITIVE_KEYWORDS_EL,
  ...POSITIVE_KEYWORDS_EN,
] as const;
