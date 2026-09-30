/**
 * Hard web-relevance gate.
 * CPVs alone are NEVER enough — especially broad ones like 72261000-2.
 */

export type WebCategory =
  | "WEBSITE"
  | "WEB_APPLICATION"
  | "WEB_PLATFORM"
  | "WEB_API_INTEGRATION"
  | "WEBSITE_SUPPORT"
  | "UNKNOWN";

export type RelevanceStatus = "RELEVANT" | "NEEDS_REVIEW" | "IRRELEVANT";

export type WebRelevanceInput = {
  title: string;
  description: string;
  cpvs?: string[];
  pdfText?: string;
};

export type WebRelevanceResult = {
  isWebRelevant: boolean;
  status: RelevanceStatus;
  category: WebCategory;
  ignoreReason: string | null;
  strongWebSignals: string[];
  exclusionSignals: string[];
  weakOnlySignals: string[];
  highConfidenceCpv: boolean;
};

/** High-confidence website/internet CPVs — still need title/desc confirmation when possible. */
export const HIGH_CONFIDENCE_WEB_CPVS = [
  "72413000-8", // website design services
  "72415000-2",
  "72416000-9",
  "72420000-0", // internet development
] as const;

/** Broad CPVs that MUST NOT pass relevance alone. */
export const BROAD_IT_CPVS = [
  "72000000-5",
  "72200000-7",
  "72261000-2",
  "72267000-4",
  "72230000-6",
  "72262000-9",
] as const;

export const STRONG_WEB_SIGNALS = [
  // Greek
  "ιστοσελίδα",
  "ιστότοπος",
  "ιστοχωροσ",
  "ιστοχώρος",
  "δικτυακός τόπος",
  "διαδικτυακή πύλη",
  "διαδικτυακη πυλη",
  "διαδικτυακή εφαρμογή",
  "διαδικτυακη εφαρμογη",
  "web εφαρμογή",
  "web εφαρμογη",
  "web app",
  "web portal",
  "portal",
  "ψηφιακή πλατφόρμα",
  "ψηφιακη πλατφορμα",
  "διαδικτυακή πλατφόρμα",
  "διαδικτυακη πλατφορμα",
  "web-based",
  "φυλλομετρητή",
  "φυλλομετρητη",
  "browser",
  "cms",
  "wordpress",
  "laravel",
  "responsive",
  "wcag",
  "frontend",
  "backend",
  "rest api",
  "web service",
  "διαδικτυακό πληροφοριακό σύστημα",
  "διαδικτυακο πληροφοριακο συστημα",
  "αναβάθμιση ιστοσελίδας",
  "αναβαθμιση ιστοσελιδας",
  "επανασχεδιασμός ιστοσελίδας",
  "επανασχεδιασμος ιστοσελιδας",
  "δημιουργία ιστοσελίδας",
  "δημιουργια ιστοσελιδας",
  "συντήρηση ιστοσελίδας",
  "συντηρηση ιστοσελιδας",
  "υποστήριξη ιστοσελίδας",
  "υποστηριξη ιστοσελιδας",
  "τεχνική υποστήριξη διαδικτυακής",
  "τεχνικη υποστηριξη διαδικτυακης",
  // English
  "website",
  "web application",
  "web portal",
  "online platform",
  "digital platform",
  "browser-based",
  "saas",
] as const;

/** Weak signals — NOT enough alone. */
export const WEAK_SIGNALS = [
  "λογισμικό",
  "λογισμικο",
  "εφαρμογή",
  "εφαρμογη",
  "πληροφοριακό σύστημα",
  "πληροφοριακο συστημα",
  "υποστήριξη",
  "υποστηριξη",
  "συντήρηση",
  "συντηρηση",
  "hosting",
  "φιλοξενία",
  "φιλοξενια",
  "cloud",
  "api",
  "software",
  "application",
  "platform",
  "maintenance",
  "support",
] as const;

export const HARD_EXCLUSION_SIGNALS = [
  // Greek
  "επισκευή η/υ",
  "επισκευη η/υ",
  "επισκευής η/υ",
  "επισκευης η/υ",
  "συντήρηση η/υ",
  "συντηρηση η/υ",
  "ηλεκτρονικό πρωτόκολλο",
  "ηλεκτρονικο πρωτοκολλο",
  "ηλεκτρονικού πρωτοκόλλου",
  "ηλεκτρονικου πρωτοκολλου",
  "μηχανογραφικό σύστημα",
  "μηχανογραφικο συστημα",
  "λογισμικό μισθοδοσίας",
  "λογισμικο μισθοδοσιας",
  "λογισμικό λογιστηρίου",
  "λογισμικο λογιστηριου",
  "erp",
  "ιατρικό λογισμικό",
  "ιατρικο λογισμικο",
  "νοσοκομειακό λογισμικό",
  "νοσοκομειακο λογισμικο",
  "άδειες λογισμικού",
  "αδειες λογισμικου",
  "antivirus",
  "microsoft office",
  "εξοπλισμός πληροφορικής",
  "εξοπλισμος πληροφορικης",
  "εκτυπωτές",
  "εκτυπωτες",
  "δικτυακός εξοπλισμός",
  "δικτυακος εξοπλισμος",
  "τηλεπικοινωνίες",
  "τηλεπικοινωνιες",
  "τηλεπικοινωνιακός εξοπλισμός",
  "cctv",
  "κάμερες ασφαλείας",
  "καμερες ασφαλειας",
  "social media",
  "διαχείριση social media",
  "διαχειριση social media",
  "ψηφιακό μάρκετινγκ",
  "ψηφιακο μαρκετινγκ",
  "παραγωγή περιεχομένου",
  "παραγωγη περιεχομενου",
  "διαφημιστική προβολή",
  "μισθοδοσία",
  "λογιστήριο",
  // English
  "pc repair",
  "computer repair",
  "hardware maintenance",
  "accounting software",
  "payroll software",
  "medical software",
  "network equipment",
  "server equipment",
  "licenses",
] as const;

const GENERIC_SOFTWARE_MAINTENANCE = [
  "συντήρηση εφαρμογών λογισμικού",
  "συντηρηση εφαρμογων λογισμικου",
  "συντήρηση λογισμικού",
  "συντηρηση λογισμικου",
  "υποστήριξη λογισμικού",
  "υποστηριξη λογισμικου",
  "επισκευής, συντήρησης και συναφών υπηρεσιών η/υ",
  "επισκευης, συντηρησης και συναφων υπηρεσιων η/υ",
  "επισκευή, συντήρηση και συναφείς υπηρεσίες η/υ",
] as const;

const HOSTING_ONLY_PATTERNS = [
  "φιλοξενία πληροφοριακών συστημάτων",
  "φιλοξενια πληροφοριακων συστηματων",
  "υπηρεσίες φιλοξενίας πληροφοριακών",
  "υπηρεσιες φιλοξενιας πληροφοριακων",
  "email hosting",
  "φιλοξενία email",
  "φιλοξενια email",
  "mail server",
] as const;

const INFO_SYSTEM_GENERIC = [
  "πληροφοριακό σύστημα",
  "πληροφοριακο συστημα",
  "ανάπτυξη πληροφοριακού συστήματος",
  "αναπτυξη πληροφοριακου συστηματος",
] as const;

const WEB_INFO_SYSTEM_CONFIRM = [
  "διαδικτυακό",
  "διαδικτυακο",
  "web",
  "website",
  "portal",
  "browser",
  "online",
  "saas",
  "φυλλομετρη",
  "ιστοσελ",
] as const;

export const normalizeText = (text: string): string =>
  text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/** Soften common Greek case endings so ιστοσελίδας ≈ ιστοσελίδα. */
export const softenGreekInflection = (text: string): string => {
  const normalized = normalizeText(text);
  // Avoid \\b — JS word boundaries are ASCII-only and break on Greek letters.
  return normalized
    .replace(/(^|[^\p{L}])([\p{L}]+?)ης(?=[^\p{L}]|$)/gu, "$1$2η")
    .replace(/(^|[^\p{L}])([\p{L}]+?)ας(?=[^\p{L}]|$)/gu, "$1$2α")
    .replace(/(^|[^\p{L}])([\p{L}]+?)ες(?=[^\p{L}]|$)/gu, "$1$2ε")
    .replace(/(^|[^\p{L}])([\p{L}]+?)ους(?=[^\p{L}]|$)/gu, "$1$2ο")
    .replace(/(^|[^\p{L}])([\p{L}]+?)ων(?=[^\p{L}]|$)/gu, "$1$2ο")
    .replace(/(^|[^\p{L}])([\p{L}]+?)ς(?=[^\p{L}]|$)/gu, "$1$2");
};

const findSignals = (
  haystackRaw: string,
  signals: readonly string[],
): string[] => {
  const haystack = softenGreekInflection(haystackRaw);
  const hits: string[] = [];
  for (const signal of signals) {
    const needle = softenGreekInflection(signal);
    if (needle && haystack.includes(needle)) hits.push(signal);
  }
  return hits;
};

const hasHighConfidenceWebCpv = (cpvs: string[]): boolean =>
  cpvs.some((cpv) =>
    HIGH_CONFIDENCE_WEB_CPVS.some(
      (item) => item.toUpperCase() === cpv.trim().toUpperCase(),
    ),
  );

const detectCategory = (
  combined: string,
  strongHits: string[],
): WebCategory => {
  if (
    /ιστοσελιδ|ιστοτοπ|ιστοχωρ|δικτυακος τοπος|website|web\s*site/.test(
      combined,
    )
  ) {
    if (
      /συντηρησ|υποστηριξ|φιλοξεν|maintenance|support|hosting/.test(combined)
    ) {
      return "WEBSITE_SUPPORT";
    }
    return "WEBSITE";
  }

  if (
    /διαδικτυακη εφαρμογ|web εφαρμογ|web\s*app|web application|browser-based|saas/.test(
      combined,
    )
  ) {
    return "WEB_APPLICATION";
  }

  if (
    /πυλη|portal|ψηφιακη πλατφορμα|διαδικτυακη πλατφορμα|online platform|digital platform/.test(
      combined,
    )
  ) {
    return "WEB_PLATFORM";
  }

  if (
    /rest api|web service|διασυνδεσ|api integration|web\/api/.test(combined) &&
    strongHits.length > 0
  ) {
    return "WEB_API_INTEGRATION";
  }

  if (/cms|wordpress|laravel|frontend|backend|responsive|wcag/.test(combined)) {
    return "WEB_APPLICATION";
  }

  return "UNKNOWN";
};

const categoryLabelReason = (category: WebCategory): string | null => {
  switch (category) {
    case "WEBSITE":
    case "WEB_APPLICATION":
    case "WEB_PLATFORM":
    case "WEB_API_INTEGRATION":
    case "WEBSITE_SUPPORT":
      return null;
    default:
      return "Could not confidently classify web category";
  }
};

export const isWebRelevant = (
  input: WebRelevanceInput,
): WebRelevanceResult => {
  const title = softenGreekInflection(input.title ?? "");
  const description = softenGreekInflection(input.description ?? "");
  const pdfText = softenGreekInflection(input.pdfText ?? "");
  const combined = `${title}\n${description}\n${pdfText}`;
  const cpvs = input.cpvs ?? [];

  const strongWebSignals = findSignals(combined, STRONG_WEB_SIGNALS);
  const exclusionSignals = findSignals(combined, HARD_EXCLUSION_SIGNALS);
  const weakOnlySignals = findSignals(combined, WEAK_SIGNALS);
  const highConfidenceCpv = hasHighConfidenceWebCpv(cpvs);

  // Generic software maintenance without web scope
  const genericMaintenance = findSignals(combined, GENERIC_SOFTWARE_MAINTENANCE);
  if (genericMaintenance.length > 0 && strongWebSignals.length === 0) {
    return {
      isWebRelevant: false,
      status: "IRRELEVANT",
      category: "UNKNOWN",
      ignoreReason: "Generic software maintenance — no web scope detected",
      strongWebSignals,
      exclusionSignals: [...exclusionSignals, ...genericMaintenance],
      weakOnlySignals,
      highConfidenceCpv,
    };
  }

  // Hosting-only without web scope
  const hostingOnly = findSignals(combined, HOSTING_ONLY_PATTERNS);
  const hostingWithWeb =
    /φιλοξεν/.test(combined) &&
    strongWebSignals.some((s) =>
      /ιστοσελιδ|website|web εφαρμογ|web app|portal|saas/i.test(s),
    );
  if (hostingOnly.length > 0 && !hostingWithWeb && strongWebSignals.length === 0) {
    return {
      isWebRelevant: false,
      status: "IRRELEVANT",
      category: "UNKNOWN",
      ignoreReason: "Hosting-only project",
      strongWebSignals,
      exclusionSignals: [...exclusionSignals, ...hostingOnly],
      weakOnlySignals,
      highConfidenceCpv,
    };
  }

  // Strong exclusions without strong web signals
  if (exclusionSignals.length > 0 && strongWebSignals.length === 0) {
    const hardware =
      /η\/υ|εξοπλισ|hardware|εκτυπω|pc repair|computer repair|δικτυακος εξοπλισ/.test(
        combined,
      );
    return {
      isWebRelevant: false,
      status: "IRRELEVANT",
      category: "UNKNOWN",
      ignoreReason: hardware
        ? "Hardware / IT support"
        : `Excluded scope — ${exclusionSignals[0]}`,
      strongWebSignals,
      exclusionSignals,
      weakOnlySignals,
      highConfidenceCpv,
    };
  }

  // Generic "πληροφοριακό σύστημα" needs web confirmation
  const genericInfoSystem = findSignals(title, INFO_SYSTEM_GENERIC);
  if (genericInfoSystem.length > 0 && strongWebSignals.length === 0) {
    const confirmed = WEB_INFO_SYSTEM_CONFIRM.some((token) =>
      combined.includes(softenGreekInflection(token)),
    );
    if (!confirmed) {
      return {
        isWebRelevant: false,
        status: "NEEDS_REVIEW",
        category: "UNKNOWN",
        ignoreReason:
          "Generic information system — no browser/web confirmation",
        strongWebSignals,
        exclusionSignals,
        weakOnlySignals,
        highConfidenceCpv,
      };
    }
  }

  // High-confidence CPV alone is not enough without any textual web signal
  // unless PDF/title/desc has strong web text. CPV can tip NEEDS_REVIEW → still no Slack.
  if (strongWebSignals.length === 0) {
    if (highConfidenceCpv) {
      return {
        isWebRelevant: false,
        status: "NEEDS_REVIEW",
        category: "UNKNOWN",
        ignoreReason:
          "Web CPV present but title/description/PDF lack clear web scope",
        strongWebSignals,
        exclusionSignals,
        weakOnlySignals,
        highConfidenceCpv,
      };
    }

    return {
      isWebRelevant: false,
      status: "IRRELEVANT",
      category: "UNKNOWN",
      ignoreReason:
        weakOnlySignals.length > 0
          ? "Weak IT/software terms only — no strong web signal"
          : "No strong web relevance signals",
      strongWebSignals,
      exclusionSignals,
      weakOnlySignals,
      highConfidenceCpv,
    };
  }

  const category = detectCategory(combined, strongWebSignals);
  if (category === "UNKNOWN") {
    return {
      isWebRelevant: false,
      status: "NEEDS_REVIEW",
      category: "UNKNOWN",
      ignoreReason: categoryLabelReason(category),
      strongWebSignals,
      exclusionSignals,
      weakOnlySignals,
      highConfidenceCpv,
    };
  }

  return {
    isWebRelevant: true,
    status: "RELEVANT",
    category,
    ignoreReason: null,
    strongWebSignals,
    exclusionSignals,
    weakOnlySignals,
    highConfidenceCpv,
  };
};

export const webCategorySlackLabel = (category: WebCategory): string => {
  switch (category) {
    case "WEBSITE":
      return "🌐 WEBSITE";
    case "WEB_APPLICATION":
      return "🖥 WEB APPLICATION";
    case "WEB_PLATFORM":
      return "🧩 WEB PLATFORM";
    case "WEB_API_INTEGRATION":
      return "🔌 WEB/API INTEGRATION";
    case "WEBSITE_SUPPORT":
      return "🛠 WEBSITE SUPPORT";
    default:
      return "UNKNOWN";
  }
};
