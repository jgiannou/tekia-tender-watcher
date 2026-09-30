/**
 * Hard web-relevance gate.
 * CPVs alone are NEVER enough — especially broad ones like 72261000-2.
 * Slack must stay clean: only genuine website / web-application scope.
 */

export type WebCategory =
  | "WEBSITE"
  | "WEB_APPLICATION"
  | "WEB_PLATFORM"
  | "WEB_API_INTEGRATION"
  | "WEBSITE_SUPPORT"
  | "UNKNOWN";

export type RelevanceStatus =
  | "RELEVANT"
  | "NEEDS_REVIEW"
  | "IRRELEVANT"
  | "EXPIRED"
  | "TARGETED";

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
  reviewReason: string | null;
  strongWebSignals: string[];
  exclusionSignals: string[];
  weakOnlySignals: string[];
  marketingSignals: string[];
  mixedMarketing: boolean;
  highConfidenceCpv: boolean;
};

/** High-confidence website/internet CPVs — still need title/desc confirmation. */
export const HIGH_CONFIDENCE_WEB_CPVS = [
  "72413000-8",
  "72415000-2",
  "72416000-9",
  "72420000-0",
  "72212224-5",
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
  "ιστοχώρος",
  "δικτυακός τόπος",
  "διαδικτυακή πύλη",
  "διαδικτυακή εφαρμογή",
  "web εφαρμογή",
  "web app",
  "web portal",
  "portal",
  "ψηφιακή πλατφόρμα",
  "διαδικτυακή πλατφόρμα",
  "διαδικτυακό πληροφοριακό σύστημα",
  "web-based",
  "φυλλομετρητή",
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
  "αναβάθμιση ιστοσελίδας",
  "επανασχεδιασμός ιστοσελίδας",
  "δημιουργία ιστοσελίδας",
  "κατασκευή ιστοσελίδας",
  "συντήρηση ιστοσελίδας",
  "υποστήριξη ιστοσελίδας",
  "τεχνική υποστήριξη διαδικτυακής",
  "μετανάστευση ιστοσελίδας",
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
  "εφαρμογή",
  "πληροφοριακό σύστημα",
  "υποστήριξη",
  "συντήρηση",
  "hosting",
  "φιλοξενία",
  "cloud",
  "api",
  "software",
  "application",
  "platform",
  "maintenance",
  "support",
] as const;

export const MARKETING_SOCIAL_SIGNALS = [
  "μέσα κοινωνικής δικτύωσης",
  "social media",
  "επικοινωνία δράσεων",
  "επικοινωνιακή προβολή",
  "διαφημιστική προβολή",
  "διαφήμιση",
  "παραγωγή περιεχομένου",
  "διαχείριση περιεχομένου",
  "προώθηση",
  "καμπάνια",
  "δημοσιότητα",
  "επικοινωνιακές υπηρεσίες",
  "ψηφιακό μάρκετινγκ",
  "διαχείριση social media",
  "communications",
  "marketing",
  "advertising",
  "campaign",
  "content production",
  "publicity",
] as const;

/** Substantial technical web scope — required to keep mixed marketing as Relevant. */
export const SUBSTANTIAL_TECH_WEB_SIGNALS = [
  "ανάπτυξη",
  "κατασκευή",
  "αναβάθμιση",
  "επανασχεδιασμός",
  "τεχνική υποστήριξη",
  "cms",
  "wordpress",
  "laravel",
  "wcag",
  "migration",
  "μετανάστευση",
  "web application",
  "web εφαρμογή",
  "διαδικτυακή εφαρμογή",
  "portal",
  "frontend",
  "backend",
  "rest api",
  "web service",
  "συντήρηση ιστοσελ",
  "υποστήριξη ιστοσελ",
] as const;

export const HARD_EXCLUSION_SIGNALS = [
  "επισκευή η/υ",
  "επισκευής η/υ",
  "συντήρηση η/υ",
  "ηλεκτρονικό πρωτόκολλο",
  "ηλεκτρονικού πρωτοκόλλου",
  "μηχανογραφικό σύστημα",
  "λογισμικό μισθοδοσίας",
  "λογισμικό λογιστηρίου",
  "erp",
  "ιατρικό λογισμικό",
  "νοσοκομειακό λογισμικό",
  "άδειες λογισμικού",
  "antivirus",
  "microsoft office",
  "εξοπλισμός πληροφορικής",
  "εκτυπωτές",
  "δικτυακός εξοπλισμός",
  "τηλεπικοινωνίες",
  "τηλεπικοινωνιακός εξοπλισμός",
  "cctv",
  "κάμερες ασφαλείας",
  "μισθοδοσία",
  "λογιστήριο",
  "pc repair",
  "computer repair",
  "hardware maintenance",
  "accounting software",
  "payroll software",
  "medical software",
  "network equipment",
  "server equipment",
  "licenses",
  "desktop application",
  "εφαρμογή γραφείου",
] as const;

const GENERIC_SOFTWARE_MAINTENANCE = [
  "συντήρηση εφαρμογών λογισμικού",
  "συντήρηση λογισμικού",
  "υποστήριξη λογισμικού",
  "επισκευής, συντήρησης και συναφών υπηρεσιών η/υ",
  "επισκευή, συντήρηση και συναφείς υπηρεσίες η/υ",
] as const;

const HOSTING_ONLY_PATTERNS = [
  "φιλοξενία πληροφοριακών συστημάτων",
  "υπηρεσίες φιλοξενίας πληροφοριακών",
  "email hosting",
  "φιλοξενία email",
  "mail server",
] as const;

const INFO_SYSTEM_GENERIC = [
  "πληροφοριακό σύστημα",
  "ανάπτυξη πληροφοριακού συστήματος",
] as const;

const WEB_INFO_SYSTEM_CONFIRM = [
  "διαδικτυακό",
  "web",
  "website",
  "portal",
  "browser",
  "online",
  "saas",
  "φυλλομετρη",
  "ιστοσελ",
] as const;

const WEBSITE_NOUN_SIGNALS = [
  "ιστοσελίδα",
  "ιστότοπος",
  "ιστοχώρος",
  "δικτυακός τόπος",
  "website",
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
  const marketingSignals = findSignals(combined, MARKETING_SOCIAL_SIGNALS);
  const substantialTech = findSignals(combined, SUBSTANTIAL_TECH_WEB_SIGNALS);
  const websiteNouns = findSignals(combined, WEBSITE_NOUN_SIGNALS);
  const highConfidenceCpv = hasHighConfidenceWebCpv(cpvs);

  const base = {
    strongWebSignals,
    exclusionSignals,
    weakOnlySignals,
    marketingSignals,
    mixedMarketing: false,
    highConfidenceCpv,
    reviewReason: null as string | null,
  };

  const genericMaintenance = findSignals(combined, GENERIC_SOFTWARE_MAINTENANCE);
  if (genericMaintenance.length > 0 && strongWebSignals.length === 0) {
    return {
      ...base,
      isWebRelevant: false,
      status: "IRRELEVANT",
      category: "UNKNOWN",
      ignoreReason: "Generic software maintenance — no web scope detected",
      exclusionSignals: [...exclusionSignals, ...genericMaintenance],
    };
  }

  const hostingOnly = findSignals(combined, HOSTING_ONLY_PATTERNS);
  const hostingWithWeb =
    /φιλοξεν/.test(combined) &&
    strongWebSignals.some((s) =>
      /ιστοσελιδ|website|web εφαρμογ|web app|portal|saas/i.test(s),
    );
  if (hostingOnly.length > 0 && !hostingWithWeb && strongWebSignals.length === 0) {
    return {
      ...base,
      isWebRelevant: false,
      status: "IRRELEVANT",
      category: "UNKNOWN",
      ignoreReason: "Hosting-only project",
      exclusionSignals: [...exclusionSignals, ...hostingOnly],
    };
  }

  if (exclusionSignals.length > 0 && strongWebSignals.length === 0) {
    const hardware =
      /η\/υ|εξοπλισ|hardware|εκτυπω|pc repair|computer repair|δικτυακος εξοπλισ/.test(
        combined,
      );
    return {
      ...base,
      isWebRelevant: false,
      status: "IRRELEVANT",
      category: "UNKNOWN",
      ignoreReason: hardware
        ? "Hardware / IT support"
        : `Excluded scope — ${exclusionSignals[0]}`,
    };
  }

  const genericInfoSystem = findSignals(title, INFO_SYSTEM_GENERIC);
  if (genericInfoSystem.length > 0 && strongWebSignals.length === 0) {
    const confirmed = WEB_INFO_SYSTEM_CONFIRM.some((token) =>
      combined.includes(softenGreekInflection(token)),
    );
    if (!confirmed) {
      return {
        ...base,
        isWebRelevant: false,
        status: "NEEDS_REVIEW",
        category: "UNKNOWN",
        ignoreReason: null,
        reviewReason:
          "Generic information system — web scope not confirmed",
      };
    }
  }

  if (strongWebSignals.length === 0) {
    if (highConfidenceCpv) {
      return {
        ...base,
        isWebRelevant: false,
        status: "NEEDS_REVIEW",
        category: "UNKNOWN",
        ignoreReason: null,
        reviewReason:
          "Web CPV present but title/description/PDF lack clear web scope",
      };
    }

    return {
      ...base,
      isWebRelevant: false,
      status: "IRRELEVANT",
      category: "UNKNOWN",
      ignoreReason:
        weakOnlySignals.length > 0
          ? "Weak IT/software terms only — no strong web signal"
          : "No strong web relevance signals",
    };
  }

  // Mixed marketing / social + weak website mention → Needs Review (no Slack)
  const mixedMarketingNoise =
    marketingSignals.length > 0 &&
    websiteNouns.length > 0 &&
    substantialTech.length === 0;

  if (mixedMarketingNoise) {
    return {
      ...base,
      isWebRelevant: false,
      status: "NEEDS_REVIEW",
      category: "UNKNOWN",
      ignoreReason: null,
      reviewReason:
        "Mixed marketing / social + website mention — technical web scope unclear",
      mixedMarketing: true,
    };
  }

  const mixedMarketing =
    marketingSignals.length > 0 &&
    websiteNouns.length > 0 &&
    substantialTech.length > 0;

  const category = detectCategory(combined, strongWebSignals);
  if (category === "UNKNOWN") {
    return {
      ...base,
      isWebRelevant: false,
      status: "NEEDS_REVIEW",
      category: "UNKNOWN",
      ignoreReason: null,
      reviewReason: "Could not confidently classify web category",
      mixedMarketing,
    };
  }

  return {
    ...base,
    isWebRelevant: true,
    status: "RELEVANT",
    category,
    ignoreReason: null,
    reviewReason: null,
    mixedMarketing,
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
