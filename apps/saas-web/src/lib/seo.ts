/** Canonical public origin for ARC Tenders marketing SEO. */
export const SITE_ORIGIN = "https://arc-tenders.tekia.gr";

export const SITE_NAME = "ARC Tenders";

export const DEFAULT_DESCRIPTION =
  "ARC Tenders — χώρος εργασίας για δημόσιους διαγωνισμούς: αυτόματες αναζητήσεις στο ΚΗΜΔΗΣ, ειδοποιήσεις για νέες πράξεις, έγγραφα και υποβολές σε ένα σημείο.";

export const DEFAULT_TITLE =
  "ARC Tenders | Δημόσιοι διαγωνισμοί, οργανωμένοι";

export const absoluteUrl = (path = "/"): string => {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${SITE_ORIGIN}${normalized === "/" ? "/" : normalized}`;
};

export type SeoConfig = {
  title: string;
  description?: string;
  path?: string;
  /** noindex for authenticated / private surfaces */
  noindex?: boolean;
  imagePath?: string;
};

export const MARKETING_SEO = {
  home: {
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    path: "/",
  },
  pricing: {
    title: "Τιμές | ARC Tenders",
    description:
      "Πλάνα Basic και Pro για παρακολούθηση δημόσιων διαγωνισμών στο ΚΗΜΔΗΣ. Δωρεάν δοκιμή 7 ημερών.",
    path: "/pricing",
  },
  login: {
    title: "Σύνδεση | ARC Tenders",
    description: "Συνδεθείτε στο ARC Tenders για τις ευκαιρίες και τη ροή εργασίας σας.",
    path: "/login",
  },
  signup: {
    title: "Εγγραφή | ARC Tenders",
    description:
      "Ξεκινήστε δωρεάν δοκιμή 7 ημερών στο ARC Tenders — αυτόματες αναζητήσεις ΚΗΜΔΗΣ και οργανωμένη ροή διαγωνισμών.",
    path: "/signup",
  },
} as const satisfies Record<string, SeoConfig>;
