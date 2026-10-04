/**
 * Suggestion layer only — NOT an official KAD→CPV mapping.
 * KAD = what the business does. CPV = what procurement buys.
 *
 * Supports both classic dotted KAD (62.01) and GEMI kad_2026 style (62202000).
 */

export type WatchSuggestion = {
  cpvs: Array<{ code: string; label: string }>;
  keywords: string[];
  categories: string[];
};

const SUGGESTIONS: Record<string, WatchSuggestion> = {
  "41": {
    cpvs: [
      { code: "45000000-7", label: "Κατασκευαστικές εργασίες" },
      { code: "45210000-2", label: "Κατασκευαστικές εργασίες κτιρίων" },
      { code: "45220000-5", label: "Κατασκευαστικές εργασίες τεχνικών έργων και οικοδομικών έργων" },
      { code: "71000000-8", label: "Αρχιτεκτονικές, κατασκευαστικές, μηχανικές και επιθεωρητικές υπηρεσίες" },
    ],
    keywords: ["κατασκευή", "οικοδομή", "κτίριο", "τεχνικό έργο", "ανακαίνιση"],
    categories: ["Κατασκευές / Τεχνικά έργα"],
  },
  "42": {
    cpvs: [
      { code: "45230000-8", label: "Κατασκευαστικές εργασίες αγωγών, γραμμών επικοινωνίας και ηλεκτρισμού, αυτοκινητοδρόμων, οδών, αεροδρομίων και σιδηροδρόμων· ισοπέδωση" },
      { code: "45233000-9", label: "Κατασκευαστικές εργασίες, θεμελιώσεις και επιφανειακές εργασίες για αυτοκινητοδρόμους, οδούς" },
    ],
    keywords: ["οδός", "υποδομή", "τεχνικό έργο"],
    categories: ["Πολιτικός μηχανικός / Υποδομές"],
  },
  "43": {
    cpvs: [
      { code: "45300000-0", label: "Εργασίες εγκατάστασης σε κτίρια" },
      { code: "45400000-1", label: "Εργασίες αποπεράτωσης κτιρίων" },
    ],
    keywords: ["ηλεκτρολογικές", "υδραυλικές", "αποπεράτωση"],
    categories: ["Εγκαταστάσεις / Αποπεράτωση"],
  },
  "62": {
    cpvs: [
      { code: "72212000-4", label: "Υπηρεσίες προγραμματισμού λογισμικού εφαρμογών" },
      { code: "72413000-8", label: "Υπηρεσίες σχεδιασμού ιστοτόπων" },
      { code: "72220000-3", label: "Υπηρεσίες συμβούλων συστημάτων και τεχνικές συμβουλευτικές υπηρεσίες" },
      { code: "72000000-5", label: "Υπηρεσίες ΤΠΕ: συμβουλευτικές, ανάπτυξη λογισμικού, Διαδίκτυο και υποστήριξη" },
    ],
    keywords: ["ιστοσελίδα", "website", "web εφαρμογή", "portal", "λογισμικό", "πληροφορική"],
    categories: ["Πληροφορική / Ψηφιακές υπηρεσίες"],
  },
  "63": {
    cpvs: [
      { code: "72400000-4", label: "Υπηρεσίες διαδικτύου" },
      { code: "72300000-8", label: "Υπηρεσίες δεδομένων" },
    ],
    keywords: ["hosting", "cloud", "data center"],
    categories: ["Υποδομές δεδομένων"],
  },
  "58": {
    cpvs: [
      { code: "72212100-0", label: "Υπηρεσίες ανάπτυξης λογισμικού για συγκεκριμένες εφαρμογές" },
      { code: "48000000-8", label: "Πακέτα λογισμικού και συστήματα πληροφορικής" },
    ],
    keywords: ["λογισμικό", "εφαρμογή", "software"],
    categories: ["Λογισμικό"],
  },
  "73": {
    cpvs: [
      { code: "79340000-9", label: "Υπηρεσίες διαφήμισης και μάρκετινγκ" },
      { code: "79341100-7", label: "Υπηρεσίες διαφημιστικών εκστρατειών" },
    ],
    keywords: ["διαφήμιση", "μάρκετινγκ", "επικοινωνία"],
    categories: ["Επικοινωνία / Μάρκετινγκ"],
  },
};

/** Normalize GEMI/legacy KAD codes to a 2-digit division key when possible. */
const divisionKey = (kad: string): string | null => {
  const raw = kad.trim();
  if (!raw) return null;
  const dotted = raw.match(/^(\d{2})\./);
  if (dotted) return dotted[1]!;
  const digits = raw.replace(/\D/g, "");
  if (digits.length >= 2) return digits.slice(0, 2);
  return null;
};

const prefixMatch = (kad: string): WatchSuggestion | null => {
  const key = divisionKey(kad);
  if (!key) return null;
  return SUGGESTIONS[key] ?? null;
};

export const suggestWatchInterestsFromKads = (
  activities: Array<{ code: string; description?: string }>,
): WatchSuggestion => {
  const cpvs = new Map<string, string>();
  const keywords = new Set<string>();
  const categories = new Set<string>();

  for (const activity of activities) {
    const suggestion = prefixMatch(activity.code);
    if (!suggestion) {
      // Fall back: use activity description tokens as soft keyword hints only.
      const desc = activity.description?.toLowerCase() ?? "";
      if (desc.includes("ιστοσελ") || desc.includes("διαδικτ")) {
        keywords.add("ιστοσελίδα");
        keywords.add("website");
      }
      if (desc.includes("λογισμ") || desc.includes("συστημ")) {
        keywords.add("λογισμικό");
      }
      if (
        desc.includes("κατασκευ") ||
        desc.includes("οικοδομ") ||
        desc.includes("τεχνικ") ||
        desc.includes("μηχανικ")
      ) {
        keywords.add("κατασκευή");
        keywords.add("οικοδομή");
        keywords.add("τεχνικό έργο");
      }
      continue;
    }
    for (const cpv of suggestion.cpvs) cpvs.set(cpv.code, cpv.label);
    for (const keyword of suggestion.keywords) keywords.add(keyword);
    for (const category of suggestion.categories) categories.add(category);
  }

  return {
    cpvs: [...cpvs.entries()].map(([code, label]) => ({ code, label })),
    keywords: [...keywords],
    categories: [...categories],
  };
};
