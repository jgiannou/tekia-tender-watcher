import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Eye, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import { useSessionContext } from "@/auth/SessionProvider";
import { IconAction } from "@/components/IconAction";
import { InvitationIssuedBadge } from "@/components/InvitationIssuedBadge";
import { Pagination, usePaginatedList } from "@/components/Pagination";
import { EmptyState, ErrorState, PageSkeleton } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DateInput } from "@/components/ui/date-input";
import { trackAnalyticsEvent, trackFirstSavedSearchIfNeeded } from "@/lib/analytics";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  isSaasRequestError,
  saasApi,
  WATCH_PROFILE_ACTIVE_LIMIT_CODE,
  type MatchingMode,
  type NotificationOverride,
  type SaasEntitlementsResponse,
  type WatchProfile,
  type WatchProfileInput,
} from "@/lib/api";
import { humanSaasError } from "@/lib/labels";
import { GREEK_NUTS2_REGIONS } from "@/lib/regions";

const asStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];

const formatRelative = (value?: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const deltaMs = Date.now() - date.getTime();
  const minutes = Math.round(deltaMs / 60000);
  if (minutes < 1) return "μόλις τώρα";
  if (minutes === 1) return "1 λεπτό πριν";
  if (minutes < 60) return `${minutes} λεπτά πριν`;
  const hours = Math.round(minutes / 60);
  if (hours === 1) return "1 ώρα πριν";
  if (hours < 48) return `${hours} ώρες πριν`;
  return date.toLocaleString("el-GR");
};

const matchingLabel = (mode?: string) => {
  switch ((mode ?? "BALANCED").toUpperCase()) {
    case "STRICT":
      return "Αυστηρή";
    case "BROAD":
      return "Ευρεία";
    default:
      return "Ισορροπημένη";
  }
};

const notificationLabel = (value?: string) => {
  switch ((value ?? "INHERIT").toUpperCase()) {
    case "DISABLED":
      return "Απενεργοποιημένες";
    case "IMMEDIATE":
      return "Άμεσο email";
    default:
      return "Σύμφωνα με τις ρυθμίσεις της εταιρείας σας";
  }
};

/** After the server hard budget, allow force-retry even while UI still shows RUNNING. */
const SCAN_FORCE_RETRY_MS = 3 * 60 * 1000;

const canForceRetryStuckScan = (profile: WatchProfile): boolean => {
  const state = (profile.scanState ?? "").toUpperCase();
  if (state !== "RUNNING" && state !== "PENDING") return false;
  const started = profile.updatedAt ? new Date(profile.updatedAt).getTime() : NaN;
  if (Number.isNaN(started)) return false;
  return Date.now() - started >= SCAN_FORCE_RETRY_MS;
};

const humanScanError = (error?: string | null) => {
  if (!error) return "";
  if (error === "email_not_verified" || error.includes("email_not_verified")) {
    return "απαιτείται επιβεβαίωση email για ενεργοποίηση";
  }
  if (error === "trial_expired" || error.includes("trial_expired")) {
    return "έληξε η δοκιμαστική περίοδος — αναβαθμίστε για ελέγχους";
  }
  if (error.includes("periodic_scan_quota") || error.includes("manual_scan_quota")) {
    return "έχετε φτάσει το ημερήσιο όριο ελέγχων";
  }
  if (error === "kimdis_not_configured") return "το ΚΗΜΔΗΣ δεν ήταν διαθέσιμο";
  if (error.includes("ted_disabled") || error.includes("TED_ENABLED")) {
    return "η πηγή TED δεν είναι διαθέσιμη αυτή τη στιγμή";
  }
  if (error.includes("diavgeia_disabled") || error.includes("DIAVGEIA_ENABLED")) {
    return "η πηγή Διαύγεια δεν είναι διαθέσιμη αυτή τη στιγμή";
  }
  if (error.startsWith("ted_http_") || error === "ted_request_failed") {
    return "αποτυχία επικοινωνίας με το TED — δοκιμάστε ξανά";
  }
  if (error.startsWith("diavgeia_http_") || error === "diavgeia_request_failed") {
    return "αποτυχία επικοινωνίας με τη Διαύγεια — δοκιμάστε ξανά";
  }
  if (error === "scan_timeout" || error.includes("scan_timeout")) {
    return "έληξε το χρονικό όριο ελέγχου (3 λεπτά) — δοκιμάστε Επανάληψη";
  }
  if (
    error === "scan_interrupted" ||
    error === "scan_interrupted_restart" ||
    error.includes("scan_interrupted")
  ) {
    return "ο έλεγχος διακόπηκε (επανεκκίνηση ή μεγάλος χρόνος) — δοκιμάστε Επανάληψη";
  }
  if (error.includes("Foreign key") || error.includes("watchProfileId_fkey")) {
    return "εσωτερικό σφάλμα συσχέτισης προφίλ — δοκιμάστε Επανάληψη";
  }
  if (error.includes("429") || error.toLowerCase().includes("rate")) {
    return "το ΚΗΜΔΗΣ περιόρισε προσωρινά τα αιτήματα — δοκιμάστε ξανά σε λίγο";
  }
  return error.length > 180 ? `${error.slice(0, 180)}…` : error;
};

const scanLabel = (profile: WatchProfile) => {
  const evaluated =
    typeof profile.scanEvaluatedCount === "number"
      ? profile.scanEvaluatedCount
      : profile.matchCount;
  const newCount =
    typeof profile.scanNewCount === "number" ? profile.scanNewCount : null;
  switch ((profile.scanState ?? "PENDING").toUpperCase()) {
    case "RUNNING": {
      const started = profile.updatedAt ? new Date(profile.updatedAt).getTime() : NaN;
      const elapsedSec = Number.isNaN(started)
        ? null
        : Math.max(0, Math.round((Date.now() - started) / 1000));
      return elapsedSec == null
        ? "Έλεγχος σε εξέλιξη…"
        : elapsedSec < 60
          ? `Έλεγχος σε εξέλιξη… (${elapsedSec} δευτ.)`
          : `Έλεγχος σε εξέλιξη… (${Math.round(elapsedSec / 60)} λεπ.)`;
    }
    case "FAILED":
      return profile.scanError
        ? `Αποτυχία ελέγχου · ${humanScanError(profile.scanError)}`
        : "Αποτυχία ελέγχου";
    case "COMPLETED": {
      if (!evaluated) return "Ολοκληρώθηκε · χωρίς αποτελέσματα";
      const base = `${evaluated} αποτελέσματα`;
      if (newCount == null) return base;
      return `${base} · ${newCount} νέ${newCount === 1 ? "ο" : "α"}`;
    }
    default:
      return "Εκκρεμεί έλεγχος";
  }
};

const emptyForm = (): WatchProfileInput & { id?: string } => ({
  name: "",
  keywords: [],
  negativeKeywords: [],
  cpvs: [],
  recordTypes: ["REQ", "PROC"],
  matchingMode: "BALANCED",
  notificationOverride: "INHERIT",
  authority: null,
  contractType: null,
  procedureType: null,
  minBudget: null,
  maxBudget: null,
  dateFrom: null,
  dateTo: null,
  regions: [],
  includeUnclassifiedRegion: false,
  enabled: true,
  dataSources: ["kimdis"],
});

const activeLimitMessage = (max: number) => {
  if (max <= 1) {
    return "Χρησιμοποιείτε τη 1 ενεργή αναζήτηση που περιλαμβάνει το δωρεάν πακέτο. Μπορείτε να αποθηκεύσετε νέα αναζήτηση σε παύση ή να παύσετε την ενεργή για να ενεργοποιήσετε άλλη.";
  }
  return `Έχετε φτάσει το όριο των ${max} ενεργών αποθηκευμένων αναζητήσεων. Παύστε ή συγχωνεύστε υπάρχουσες πριν ενεργοποιήσετε άλλη.`;
};

const usageCounterLabel = (input: {
  activeCount: number;
  maxActive: number;
  emailUnverified: boolean;
}) => {
  if (input.emailUnverified) {
    // Plan limits stay visible; verify gating is separate (banner CTA).
    return input.maxActive <= 1
      ? "Το δωρεάν πακέτο περιλαμβάνει 1 ενεργή αποθηκευμένη αναζήτηση."
      : `Το πακέτο σας περιλαμβάνει έως ${input.maxActive} ενεργές αποθηκευμένες αναζητήσεις.`;
  }
  return `Ενεργές αναζητήσεις: ${input.activeCount} από ${input.maxActive}`;
};

const profileToForm = (profile: WatchProfile): WatchProfileInput & { id: string } => ({
  id: profile.id,
  name: profile.name,
  keywords: asStringArray(profile.keywords),
  negativeKeywords: asStringArray(profile.negativeKeywords),
  cpvs: asStringArray(profile.cpvs),
  recordTypes: asStringArray(profile.recordTypes).length
    ? asStringArray(profile.recordTypes)
    : ["REQ", "PROC"],
  matchingMode: ((profile.matchingMode as MatchingMode) || "BALANCED") as MatchingMode,
  notificationOverride: ((profile.notificationOverride as NotificationOverride) ||
    "INHERIT") as NotificationOverride,
  authority: profile.authority ?? null,
  contractType: profile.contractType ?? null,
  procedureType: profile.procedureType ?? null,
  minBudget: profile.minBudget ?? null,
  maxBudget: profile.maxBudget ?? null,
  dateFrom: profile.dateFrom ?? null,
  dateTo: profile.dateTo ?? null,
  regions: asStringArray(profile.regions),
  includeUnclassifiedRegion: Boolean(profile.includeUnclassifiedRegion),
  enabled: profile.enabled,
  dataSources:
    profile.dataSources && profile.dataSources.length > 0
      ? profile.dataSources
      : ["kimdis"],
});

export const SavedSearchesPage = () => {
  const { activeOrganization, user } = useSessionContext();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<WatchProfile[]>([]);
  const [viewProfile, setViewProfile] = useState<WatchProfile | null>(null);
  const [editForm, setEditForm] = useState<(WatchProfileInput & { id?: string }) | null>(
    null,
  );
  const [deleteTarget, setDeleteTarget] = useState<WatchProfile | null>(null);
  const [busy, setBusy] = useState(false);
  const [keywordsText, setKeywordsText] = useState("");
  const [excludeText, setExcludeText] = useState("");
  const [cpvsText, setCpvsText] = useState("");
  const [entitlements, setEntitlements] = useState<SaasEntitlementsResponse | null>(
    null,
  );
  const paged = usePaginatedList(profiles);
  const hasLoadedRef = useRef(false);

  const load = async (opts?: { silent?: boolean }) => {
    if (!activeOrganization) {
      setLoading(false);
      return;
    }
    if (!opts?.silent) setLoading(true);
    try {
      const [data, ent] = await Promise.all([
        saasApi.listWatchProfiles(activeOrganization.id),
        saasApi.getEntitlements(activeOrganization.id),
      ]);
      setProfiles(data.profiles);
      setEntitlements(ent);
      setError(null);
      hasLoadedRef.current = true;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Αποτυχία φόρτωσης";
      if (hasLoadedRef.current || opts?.silent) {
        toast.error(message);
      } else {
        setError(message);
      }
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  };

  useEffect(() => {
    hasLoadedRef.current = false;
    void load();
  }, [activeOrganization?.id]);

  const scanInFlight = profiles.some((profile) =>
    ["PENDING", "RUNNING"].includes((profile.scanState ?? "").toUpperCase()),
  );

  useEffect(() => {
    if (!activeOrganization || !scanInFlight) return;
    const timer = window.setInterval(() => {
      void load({ silent: true });
    }, 2000);
    return () => window.clearInterval(timer);
  }, [activeOrganization?.id, scanInFlight]);

  const maxActive =
    entitlements?.entitlements.maxActiveWatchProfiles ?? 20;
  const activeCount =
    entitlements?.usage.activeWatchProfiles ??
    profiles.filter((p) => p.enabled).length;
  const scanAccess = entitlements?.scanAccess ?? null;
  const emailUnverified =
    user?.emailVerified === false || scanAccess?.status === "unverified";
  const atActiveLimit = !emailUnverified && activeCount >= maxActive && maxActive > 0;
  // Never show "near limit" when usage is zero or email is still unverified.
  const nearActiveLimit =
    !emailUnverified &&
    activeCount > 0 &&
    maxActive > 1 &&
    activeCount >= Math.ceil(maxActive * 0.9) &&
    !atActiveLimit;
  const advancedFiltersEnabled = Boolean(
    entitlements?.entitlements.advancedWatchProfileFilters,
  );
  const profileScansBlocked = scanAccess
    ? !scanAccess.canRunManualProfileScan
    : false;
  const pendingInitialProfiles = profiles.filter(
    (profile) =>
      profile.enabled && (profile.scanState ?? "PENDING").toUpperCase() === "PENDING",
  );
  const failedScanProfiles = profiles.filter(
    (profile) =>
      profile.enabled && (profile.scanState ?? "").toUpperCase() === "FAILED",
  );
  const runningScanProfiles = profiles.filter(
    (profile) =>
      profile.enabled && (profile.scanState ?? "").toUpperCase() === "RUNNING",
  );
  const retryableScanProfiles = [...pendingInitialProfiles, ...failedScanProfiles];

  const wouldExceedActiveLimit = (
    form: WatchProfileInput & { id?: string },
    enabling: boolean,
  ) => {
    if (!enabling) return false;
    if (form.id) {
      const existing = profiles.find((p) => p.id === form.id);
      if (existing?.enabled) return false;
    }
    return atActiveLimit;
  };

  const openCreate = () => {
    const form = emptyForm();
    // Unverified accounts may only save paused searches. At plan limit too.
    if (emailUnverified || atActiveLimit) {
      form.enabled = false;
    }
    setEditForm(form);
    setKeywordsText("");
    setExcludeText("");
    setCpvsText("");
  };

  const openEdit = (profile: WatchProfile) => {
    const form = profileToForm(profile);
    setEditForm(form);
    setKeywordsText((form.keywords ?? []).join(", "));
    setExcludeText((form.negativeKeywords ?? []).join(", "));
    setCpvsText((form.cpvs ?? []).join(", "));
  };

  const parseList = (value: string) =>
    value
      .split(/[,;\n]/)
      .map((v) => v.trim())
      .filter(Boolean);

  const handleSave = async () => {
    if (!activeOrganization || !editForm) return;
    const keywords = parseList(keywordsText);
    const cpvs = parseList(cpvsText);
    if (!editForm.name.trim() || (keywords.length === 0 && cpvs.length === 0)) {
      toast.error("Απαιτείται όνομα και τουλάχιστον μία λέξη-κλειδί ή CPV");
      return;
    }
    // Unverified: always persist paused — never attempt activation via API.
    const enabling = !emailUnverified && editForm.enabled !== false;
    if (wouldExceedActiveLimit(editForm, enabling)) {
      toast.error(activeLimitMessage(maxActive));
      return;
    }
    setBusy(true);
    try {
      const payload: WatchProfileInput = {
        ...editForm,
        enabled: enabling,
        name: editForm.name.trim(),
        keywords,
        negativeKeywords: parseList(excludeText),
        cpvs,
        source: editForm.id ? undefined : "MANUAL",
      };
      const editingId = editForm.id;
      if (editingId) {
        const { profile } = await saasApi.updateWatchProfile(
          activeOrganization.id,
          editingId,
          payload,
        );
        toast.success("Η αναζήτηση ενημερώθηκε");
        if (viewProfile?.id === profile.id) {
          setViewProfile(profile);
        }
      } else {
        const existingCount = profiles.length;
        await saasApi.createWatchProfile(activeOrganization.id, payload);
        trackAnalyticsEvent("watch_profile_created", { source: "MANUAL" });
        trackFirstSavedSearchIfNeeded(existingCount);
        toast.success(
          emailUnverified || !enabling
            ? "Η αποθηκευμένη αναζήτηση αποθηκεύτηκε σε παύση"
            : profileScansBlocked
              ? "Η αποθηκευμένη αναζήτηση δημιουργήθηκε · ο έλεγχος θα ξεκινήσει όταν το επιτρέπει ο λογαριασμός"
              : "Η αποθηκευμένη αναζήτηση δημιουργήθηκε · ξεκίνησε αρχικός έλεγχος",
        );
      }
      setEditForm(null);
      await load();
    } catch (err) {
      if (
        isSaasRequestError(err) &&
        err.code === WATCH_PROFILE_ACTIVE_LIMIT_CODE
      ) {
        toast.error(activeLimitMessage(maxActive));
      } else {
        toast.error(
          humanSaasError(err instanceof Error ? err.message : "Αποτυχία αποθήκευσης"),
        );
      }
    } finally {
      setBusy(false);
    }
  };

  const handleToggleEnabled = async (profile: WatchProfile) => {
    if (!activeOrganization) return;
    if (!profile.enabled && emailUnverified) {
      toast.error(
        "Επιβεβαιώστε το email σας για να ενεργοποιήσετε αποθηκευμένες αναζητήσεις.",
      );
      return;
    }
    if (!profile.enabled && atActiveLimit) {
      toast.error(activeLimitMessage(maxActive));
      return;
    }
    try {
      await saasApi.setWatchProfileEnabled(
        activeOrganization.id,
        profile.id,
        !profile.enabled,
      );
      toast.success(profile.enabled ? "Σε παύση" : "Ενεργοποιήθηκε");
      await load();
    } catch (err) {
      if (
        isSaasRequestError(err) &&
        err.code === WATCH_PROFILE_ACTIVE_LIMIT_CODE
      ) {
        toast.error(activeLimitMessage(maxActive));
      } else {
        toast.error(err instanceof Error ? err.message : "Αποτυχία");
      }
    }
  };

  const handleDelete = async () => {
    if (!activeOrganization || !deleteTarget) return;
    setBusy(true);
    try {
      await saasApi.deleteWatchProfile(activeOrganization.id, deleteTarget.id);
      toast.success("Διαγράφηκε. Τα παρακολουθούμενα νήματα παραμένουν.");
      setDeleteTarget(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Αποτυχία διαγραφής");
    } finally {
      setBusy(false);
    }
  };

  const handleRunPendingScans = async () => {
    if (!activeOrganization) return;
    setBusy(true);
    try {
      await Promise.all(
        retryableScanProfiles.map((profile) =>
          saasApi.scanWatchProfile(activeOrganization.id, profile.id),
        ),
      );
      toast.success("Ξεκίνησε η επανάληψη ελέγχων");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Αποτυχία ελέγχου");
    } finally {
      setBusy(false);
    }
  };

  const handleRescan = async (profile: WatchProfile) => {
    if (!activeOrganization) return;
    const state = (profile.scanState ?? "").toUpperCase();
    const force = canForceRetryStuckScan(profile);
    if ((state === "PENDING" || state === "RUNNING") && !force) {
      toast.message("Ο έλεγχος είναι ήδη σε εξέλιξη");
      return;
    }
    try {
      await saasApi.scanWatchProfile(activeOrganization.id, profile.id, {
        force,
      });
      toast.success(
        force ? "Επανεκκίνηση κολλημένου ελέγχου…" : "Ο έλεγχος ξεκίνησε",
      );
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Αποτυχία ελέγχου");
    }
  };

  if (loading) return <PageSkeleton />;
  if (!activeOrganization) {
    return (
      <EmptyState
        title="Χωρίς οργανισμό"
        description="Δημιουργήστε οργανισμό για αποθηκευμένες αναζητήσεις."
      />
    );
  }
  if (error) return <ErrorState description={error} onRetry={() => void load()} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Αποθηκευμένες αναζητήσεις</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Η εφαρμογή ελέγχει αυτόματα τις επιλεγμένες πηγές (ΚΗΜΔΗΣ / TED / Διαύγεια) και εμφανίζει τα νέα αποτελέσματα στις Ευκαιρίες.
          </p>
          <p className="mt-2 text-sm font-medium">
            {usageCounterLabel({ activeCount, maxActive, emailUnverified })}
          </p>
        </div>
        <Button onClick={openCreate}>Νέα αποθηκευμένη αναζήτηση</Button>
      </div>

      {runningScanProfiles.length > 0 ? (
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="py-3 text-sm">
            {runningScanProfiles.length === 1
              ? "1 έλεγχος σε εξέλιξη…"
              : `${runningScanProfiles.length} έλεγχοι σε εξέλιξη…`}
          </CardContent>
        </Card>
      ) : null}

      {pendingInitialProfiles.length > 0 ? (
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
            <span>
              {pendingInitialProfiles.length === 1
                ? "1 αναζήτηση εκκρεμεί αρχικό έλεγχο."
                : `${pendingInitialProfiles.length} αναζητήσεις εκκρεμούν αρχικό έλεγχο.`}
            </span>
            <Button size="sm" disabled={busy} onClick={() => void handleRunPendingScans()}>
              {busy ? "Έλεγχος…" : "Έλεγχος τώρα"}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {failedScanProfiles.length > 0 ? (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
            <div className="min-w-0 space-y-1">
              <div>
                {failedScanProfiles.length === 1
                  ? "Ο τελευταίος έλεγχος απέτυχε."
                  : `${failedScanProfiles.length} αναζητήσεις απέτυχαν στον τελευταίο έλεγχο.`}
              </div>
              {failedScanProfiles.slice(0, 2).map((profile) => (
                <div key={profile.id} className="text-xs text-muted-foreground">
                  {profile.name}
                  {profile.scanError
                    ? ` · ${humanScanError(profile.scanError)}`
                    : ""}
                  {profile.lastScannedAt
                    ? ` · τελευταία προσπάθεια ${formatRelative(profile.lastScannedAt)}`
                    : ""}
                </div>
              ))}
            </div>
            <Button size="sm" disabled={busy} onClick={() => void handleRunPendingScans()}>
              {busy ? "Έλεγχος…" : "Επανάληψη"}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {/* Email verify CTA lives in AppShell EmailVerificationBanner — avoid a
          second page-level banner with the same meaning. */}
      {scanAccess &&
      profileScansBlocked &&
      scanAccess.status !== "unverified" ? (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="space-y-1 py-3 text-sm">
            <p className="font-medium text-foreground">
              {scanAccess.status === "trial_expired"
                ? "Η δοκιμή έληξε"
                : "Έλεγχοι προσωρινά μη διαθέσιμοι"}
            </p>
            <p className="text-muted-foreground">
              {humanSaasError(scanAccess.blockCode ?? "manual_scan_blocked")}
              {scanAccess.status === "trial"
                ? ` Δοκιμή: έως ${scanAccess.limits.manualProfileScansPerDay} χειροκίνητους ελέγχους/ημέρα.`
                : ""}
              {scanAccess.status === "active" &&
              scanAccess.limits.periodicScansPerDay > 0
                ? ` Πακέτο: έως ${scanAccess.limits.periodicScansPerDay} συγκεντρωτικά email slots/ημέρα.`
                : ""}
            </p>
          </CardContent>
        </Card>
      ) : null}

      {scanAccess &&
      !profileScansBlocked &&
      (scanAccess.status === "trial" ||
        (scanAccess.status === "active" &&
          scanAccess.limits.manualProfileScansPerDay > 0 &&
          scanAccess.planKey !== "free")) ? (
        <Card className="border-border/80">
          <CardContent className="py-3 text-sm text-muted-foreground">
            Σημερινοί χειροκίνητοι έλεγχοι: {scanAccess.usage.manual} από{" "}
            {scanAccess.limits.manualProfileScansPerDay}
            {scanAccess.limits.periodicScansPerDay > 0
              ? ` · συγκεντρωτικά slots: ${scanAccess.usage.periodic} από ${scanAccess.limits.periodicScansPerDay}`
              : ""}
            {scanAccess.trialEndsAt
              ? ` · δοκιμή έως ${new Date(scanAccess.trialEndsAt).toLocaleDateString("el-GR")}`
              : ""}
          </CardContent>
        </Card>
      ) : null}

      {nearActiveLimit ? (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="py-3 text-sm text-muted-foreground">
            Πλησιάζετε το όριο ενεργών αναζητήσεων. Σκεφτείτε να παύσετε ή να
            συγχωνεύσετε υπάρχουσες πριν προσθέσετε νέες.
          </CardContent>
        </Card>
      ) : null}

      {atActiveLimit ? (
        <Card className="border-border/80 bg-muted/20">
          <CardContent className="space-y-1 py-3 text-sm">
            <p className="font-medium text-foreground">{activeLimitMessage(maxActive)}</p>
          </CardContent>
        </Card>
      ) : null}

      {profiles.length === 0 ? (
        <EmptyState
          title="Δεν έχετε αποθηκευμένες αναζητήσεις"
          description={
            emailUnverified
              ? "Αποθηκεύστε λέξεις-κλειδιά ή κωδικούς CPV για να βρίσκετε ευκαιρίες σχετικές με την επιχείρησή σας. Μπορείτε να την αποθηκεύσετε τώρα σε παύση."
              : "Αποθηκεύστε λέξεις-κλειδιά ή κωδικούς CPV για να βρίσκετε ευκαιρίες σχετικές με την επιχείρησή σας."
          }
          actionLabel="Δημιουργία αναζήτησης"
          onAction={openCreate}
        />
      ) : (
        <div className="space-y-3">
          {paged.pageItems.map((profile) => {
            const keywords = asStringArray(profile.keywords);
            const cpvs = asStringArray(profile.cpvs);
            const recordTypes = asStringArray(profile.recordTypes);
            return (
              <Card key={profile.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-base">{profile.name}</CardTitle>
                      <CardDescription className="mt-1">
                        {scanLabel(profile)}
                        {profile.scanState === "COMPLETED" && profile.scanPartial
                          ? ` · μερικός έλεγχος (${humanScanError(profile.scanError)})`
                          : ""}
                        {" · πηγές: "}
                        {(profile.dataSources ?? ["kimdis"])
                          .map((s) =>
                            s === "ted" ? "TED" : s === "diavgeia" ? "Διαύγεια" : "ΚΗΜΔΗΣ",
                          )
                          .join(", ")}
                        {profile.lastSourceFetchedAt
                          ? ` · ενημέρωση πηγών ${formatRelative(profile.lastSourceFetchedAt)}`
                          : ""}
                      </CardDescription>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={
                          profileScansBlocked ||
                          !profile.enabled ||
                          busy ||
                          (((profile.scanState ?? "").toUpperCase() === "PENDING" ||
                            (profile.scanState ?? "").toUpperCase() === "RUNNING") &&
                            !canForceRetryStuckScan(profile))
                        }
                        onClick={() => void handleRescan(profile)}
                        aria-label={`Έλεγχος τώρα για ${profile.name}`}
                      >
                        {((profile.scanState ?? "").toUpperCase() === "RUNNING" ||
                          (profile.scanState ?? "").toUpperCase() === "PENDING") &&
                        !canForceRetryStuckScan(profile)
                          ? "Έλεγχος…"
                          : canForceRetryStuckScan(profile)
                            ? "Επανεκκίνηση"
                            : "Έλεγχος τώρα"}
                      </Button>
                      <IconAction label="Προβολή" onClick={() => setViewProfile(profile)}>
                        <Eye />
                      </IconAction>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            size="icon"
                            variant="outline"
                            className="h-8 w-8"
                            aria-label="Περισσότερες ενέργειες"
                          >
                            <MoreHorizontal />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEdit(profile)}>
                            Επεξεργασία
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={
                              !profile.enabled && (atActiveLimit || emailUnverified)
                            }
                            onClick={() => void handleToggleEnabled(profile)}
                          >
                            {profile.enabled ? "Παύση" : "Ενεργοποίηση"}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={
                              profileScansBlocked ||
                              !profile.enabled ||
                              (((profile.scanState ?? "").toUpperCase() ===
                                "PENDING" ||
                                (profile.scanState ?? "").toUpperCase() ===
                                  "RUNNING") &&
                                !canForceRetryStuckScan(profile))
                            }
                            onClick={() => void handleRescan(profile)}
                          >
                            {canForceRetryStuckScan(profile)
                              ? "Επανεκκίνηση (κολλημένη)"
                              : "Επανάληψη ελέγχου"}
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link to={`/app/opportunities?profile=${encodeURIComponent(profile.id)}`}>
                              Προβολή ευκαιριών
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => setDeleteTarget(profile)}
                          >
                            Διαγραφή
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="grid gap-2 md:grid-cols-2">
                    <div>
                      <span className="text-muted-foreground">Κατάσταση: </span>
                      <Badge variant={profile.enabled ? "default" : "outline"}>
                        {profile.enabled ? "Ενεργή" : "Σε παύση"}
                      </Badge>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Τύποι πράξεων: </span>
                      {(recordTypes.length ? recordTypes : ["REQ", "PROC"]).join(" + ")}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Αντιστοίχιση αποτελεσμάτων: </span>
                      {matchingLabel(profile.matchingMode)}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Τελευταίος έλεγχος: </span>
                      {formatRelative(profile.lastScannedAt)}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Αποτελέσματα: </span>
                      {profile.matchCount ?? 0}
                    </div>
                    {(profile.invitationIssuedMatchCount ?? 0) > 0 ? (
                      <div className="flex flex-wrap items-center gap-2 md:col-span-2">
                        <InvitationIssuedBadge compact />
                        <span className="text-xs text-muted-foreground">
                          {profile.invitationIssuedMatchCount} από τα matches έχουν ήδη
                          επίσημη πρόσκληση — δείτε τα στις ευκαιρίες πριν αφιερώσετε χρόνο.
                        </span>
                      </div>
                    ) : null}
                    <div>
                      <span className="text-muted-foreground">Ειδοποιήσεις: </span>
                      {notificationLabel(profile.notificationOverride)}
                    </div>
                    <div className="md:col-span-2">
                      <span className="text-muted-foreground">Ημερομηνίες καταχώρισης: </span>
                      {profile.dateFrom && profile.dateTo
                        ? `${profile.dateFrom} – ${profile.dateTo}`
                        : profile.dateFrom
                          ? `Από ${profile.dateFrom}`
                          : profile.dateTo
                            ? `Έως ${profile.dateTo}`
                            : "Τελευταίες 30 ημέρες (προεπιλογή)"}
                    </div>
                  </div>
                  {keywords.length ? (
                    <div>
                      <div className="mb-1 text-muted-foreground">Λέξεις-κλειδιά</div>
                      <div className="flex flex-wrap gap-1">
                        {keywords.slice(0, 8).map((keyword) => (
                          <Badge key={keyword} variant="secondary">
                            {keyword}
                          </Badge>
                        ))}
                        {keywords.length > 8 ? (
                          <Badge variant="outline">+{keywords.length - 8}</Badge>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                  {cpvs.length ? (
                    <div>
                      <div className="mb-1 text-muted-foreground">CPVs</div>
                      <div className="flex flex-wrap gap-1">
                        {cpvs.slice(0, 6).map((cpv) => (
                          <Badge key={cpv} variant="outline" className="font-mono">
                            {cpv}
                          </Badge>
                        ))}
                        {cpvs.length > 6 ? (
                          <Badge variant="outline">+{cpvs.length - 6}</Badge>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
          <Pagination
            page={paged.page}
            totalPages={paged.totalPages}
            total={paged.total}
            pageSize={paged.pageSize}
            onPageChange={paged.setPage}
          />
        </div>
      )}

      <Dialog open={Boolean(viewProfile)} onOpenChange={(o) => !o && setViewProfile(null)}>
        <DialogContent className="max-w-lg">
          {viewProfile ? (
            <>
              <DialogHeader>
                <DialogTitle>{viewProfile.name}</DialogTitle>
                <DialogDescription>{scanLabel(viewProfile)}</DialogDescription>
              </DialogHeader>
              <div className="space-y-2 text-sm">
                <div>Κατάσταση: {viewProfile.enabled ? "Ενεργή" : "Σε παύση"}</div>
                <div>Αντιστοίχιση αποτελεσμάτων: {matchingLabel(viewProfile.matchingMode)}</div>
                <div>
                  Λέξεις-κλειδιά: {asStringArray(viewProfile.keywords).join(", ") || "—"}
                </div>
                <div>CPVs: {asStringArray(viewProfile.cpvs).join(", ") || "—"}</div>
                <div>Αρχή: {viewProfile.authority || "—"}</div>
                <div>
                  Ποσό: {viewProfile.minBudget ?? "—"} – {viewProfile.maxBudget ?? "—"}
                </div>
                <div>
                  Ημερομηνίες:{" "}
                  {viewProfile.dateFrom && viewProfile.dateTo
                    ? `${viewProfile.dateFrom} – ${viewProfile.dateTo}`
                    : viewProfile.dateFrom
                      ? `Από ${viewProfile.dateFrom}`
                      : viewProfile.dateTo
                        ? `Έως ${viewProfile.dateTo}`
                        : "Τελευταίες 30 ημέρες"}
                </div>
                <div className="flex flex-wrap gap-2 pt-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={
                      profileScansBlocked ||
                      !viewProfile.enabled ||
                      (((viewProfile.scanState ?? "").toUpperCase() === "PENDING" ||
                        (viewProfile.scanState ?? "").toUpperCase() === "RUNNING") &&
                        !canForceRetryStuckScan(viewProfile))
                    }
                    onClick={() => void handleRescan(viewProfile)}
                  >
                    {((viewProfile.scanState ?? "").toUpperCase() === "RUNNING" ||
                      (viewProfile.scanState ?? "").toUpperCase() === "PENDING") &&
                    !canForceRetryStuckScan(viewProfile)
                      ? "Έλεγχος…"
                      : canForceRetryStuckScan(viewProfile)
                        ? "Επανεκκίνηση"
                        : "Έλεγχος τώρα"}
                  </Button>
                  <Button size="sm" onClick={() => openEdit(viewProfile)}>
                    Επεξεργασία
                  </Button>
                  <Button size="sm" variant="outline" asChild>
                    <Link
                      to={`/app/opportunities?profile=${encodeURIComponent(viewProfile.id)}`}
                    >
                      Ευκαιρίες
                    </Link>
                  </Button>
                </div>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editForm)} onOpenChange={(o) => !o && setEditForm(null)}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          {editForm ? (
            <>
              <DialogHeader>
                <DialogTitle>
                  {editForm.id ? "Επεξεργασία αναζήτησης" : "Νέα αποθηκευμένη αναζήτηση"}
                </DialogTitle>
                <DialogDescription>
                  {emailUnverified
                    ? "Η αναζήτηση θα αποθηκευτεί σε παύση. Για να την ενεργοποιήσετε, επιβεβαιώστε το email σας."
                    : "Οι αλλαγές κριτηρίων ενεργοποιούν επαναξιολόγηση / έλεγχο."}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>Όνομα</Label>
                  <Input
                    value={editForm.name}
                    onChange={(e) =>
                      setEditForm((prev) => (prev ? { ...prev, name: e.target.value } : prev))
                    }
                  />
                </div>
                <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
                  <div>
                    <Label className="text-sm">Ενεργή αναζήτηση</Label>
                    <p className="text-xs text-muted-foreground">
                      {emailUnverified
                        ? "Διαθέσιμη μετά την επιβεβαίωση email. Σε παύση δεν μετράει στο όριο ενεργών."
                        : `Σε παύση δεν μετράει στο όριο ${maxActive} ενεργών αναζητήσεων.`}
                    </p>
                  </div>
                  <Switch
                    checked={!emailUnverified && editForm.enabled !== false}
                    disabled={
                      emailUnverified ||
                      (editForm.enabled === false && atActiveLimit)
                    }
                    onCheckedChange={(checked) => {
                      if (emailUnverified) return;
                      if (checked && wouldExceedActiveLimit(editForm, true)) {
                        toast.error(activeLimitMessage(maxActive));
                        return;
                      }
                      setEditForm((prev) => (prev ? { ...prev, enabled: checked } : prev));
                    }}
                    aria-label="Ενεργή αναζήτηση"
                  />
                </div>
                {!emailUnverified && atActiveLimit && editForm.enabled === false ? (
                  <p className="text-xs text-muted-foreground">
                    {activeLimitMessage(maxActive)}
                  </p>
                ) : null}
                <div className="space-y-2">
                  <Label>Πηγές δεδομένων</Label>
                  <p className="text-xs text-muted-foreground">
                    Επιλέξτε ποιες δημόσιες πηγές θα ελέγχονται αυτόματα. Αν μια
                    πηγή δεν είναι διαθέσιμη, ο έλεγχος συνεχίζει με τις υπόλοιπες.
                  </p>
                  <div className="flex flex-wrap gap-3">
                    {(
                      [
                        ["kimdis", "ΚΗΜΔΗΣ"],
                        ["ted", "TED"],
                        ["diavgeia", "Διαύγεια"],
                      ] as const
                    ).map(([id, label]) => {
                      const selected = (editForm.dataSources ?? ["kimdis"]).includes(id);
                      return (
                        <label
                          key={id}
                          className="flex cursor-pointer items-center gap-2 text-sm"
                        >
                          <input
                            type="checkbox"
                            className="h-3.5 w-3.5"
                            checked={selected}
                            onChange={() => {
                              setEditForm((prev) => {
                                if (!prev) return prev;
                                const current = prev.dataSources ?? ["kimdis"];
                                const next = selected
                                  ? current.filter((row) => row !== id)
                                  : [...current, id];
                                return {
                                  ...prev,
                                  dataSources: next.length ? next : ["kimdis"],
                                };
                              });
                            }}
                            aria-label={label}
                          />
                          <span>{label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Λέξεις-κλειδιά (κόμμα)</Label>
                  <Input
                    value={keywordsText}
                    onChange={(e) => setKeywordsText(e.target.value)}
                    placeholder="ιστοσελίδα, portal"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Λέξεις αποκλεισμού</Label>
                  <Input
                    value={excludeText}
                    onChange={(e) => setExcludeText(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>CPVs</Label>
                  <Input value={cpvsText} onChange={(e) => setCpvsText(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Περιφέρειες</Label>
                  <p className="text-xs text-muted-foreground">
                    Καμία επιλογή = όλη η Ελλάδα. Ταίριασμα μόνο από επίσημο πεδίο NUTS.
                  </p>
                  <div className="grid max-h-40 grid-cols-1 gap-1.5 overflow-y-auto rounded-md border border-border px-3 py-2 sm:grid-cols-2">
                    {GREEK_NUTS2_REGIONS.map((region) => {
                      const selected = (editForm.regions ?? []).includes(region.code);
                      return (
                        <label
                          key={region.code}
                          className="flex cursor-pointer items-center gap-2 text-sm"
                        >
                          <input
                            type="checkbox"
                            className="h-3.5 w-3.5"
                            checked={selected}
                            onChange={() => {
                              setEditForm((prev) => {
                                if (!prev) return prev;
                                const current = prev.regions ?? [];
                                const next = selected
                                  ? current.filter((code) => code !== region.code)
                                  : [...current, region.code];
                                return { ...prev, regions: next };
                              });
                            }}
                            aria-label={region.label}
                          />
                          <span>{region.label}</span>
                        </label>
                      );
                    })}
                  </div>
                  {(editForm.regions ?? []).length > 0 ? (
                    <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
                      <div>
                        <Label className="text-sm">Χωρίς δηλωμένη περιοχή</Label>
                        <p className="text-xs text-muted-foreground">
                          Συμπερίληψη πράξεων χωρίς επίσημο NUTS
                          {typeof editForm.id === "string" &&
                          (profiles.find((p) => p.id === editForm.id)
                            ?.unclassifiedRegionCount ?? 0) > 0
                            ? ` · ${profiles.find((p) => p.id === editForm.id)?.unclassifiedRegionCount} χωρίς περιοχή`
                            : ""}
                        </p>
                      </div>
                      <Switch
                        checked={Boolean(editForm.includeUnclassifiedRegion)}
                        onCheckedChange={(checked) =>
                          setEditForm((prev) =>
                            prev
                              ? { ...prev, includeUnclassifiedRegion: checked }
                              : prev,
                          )
                        }
                        aria-label="Συμπερίληψη χωρίς δηλωμένη περιοχή"
                      />
                    </div>
                  ) : null}
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Τρόπος αντιστοίχισης</Label>
                    <Select
                      value={editForm.matchingMode ?? "BALANCED"}
                      onChange={(e) =>
                        setEditForm((prev) =>
                          prev
                            ? {
                                ...prev,
                                matchingMode: e.target.value as MatchingMode,
                              }
                            : prev,
                        )
                      }
                    >
                      <option value="STRICT">Αυστηρή</option>
                      <option value="BALANCED">Ισορροπημένη</option>
                      <option value="BROAD">Ευρεία</option>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Ειδοποιήσεις</Label>
                    <Select
                      value={editForm.notificationOverride ?? "INHERIT"}
                      onChange={(e) =>
                        setEditForm((prev) =>
                          prev
                            ? {
                                ...prev,
                                notificationOverride: e.target
                                  .value as NotificationOverride,
                              }
                            : prev,
                        )
                      }
                    >
                      <option value="INHERIT">Προεπιλογές οργανισμού</option>
                      <option value="DISABLED">Απενεργοποίηση</option>
                      <option value="IMMEDIATE" disabled={!advancedFiltersEnabled}>
                        Άμεσο email{advancedFiltersEnabled ? "" : " (Pro)"}
                      </option>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Τύποι πράξεων</Label>
                    <Select
                      value={(editForm.recordTypes ?? ["REQ", "PROC"]).join("+")}
                      onChange={(e) => {
                        const map: Record<string, string[]> = {
                          REQ: ["REQ"],
                          PROC: ["PROC"],
                          "REQ+PROC": ["REQ", "PROC"],
                        };
                        setEditForm((prev) =>
                          prev
                            ? { ...prev, recordTypes: map[e.target.value] ?? ["REQ", "PROC"] }
                            : prev,
                        );
                      }}
                    >
                      <option value="REQ+PROC">REQ + PROC</option>
                      <option value="REQ">REQ</option>
                      <option value="PROC">PROC</option>
                    </Select>
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <p className="text-xs font-medium text-muted-foreground">
                      Προχωρημένα φίλτρα
                      {advancedFiltersEnabled
                        ? " · Pro"
                        : " · διαθέσιμα μόνο στο Pro"}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Αρχή (κωδ.)</Label>
                    <Input
                      value={editForm.authority ?? ""}
                      disabled={!advancedFiltersEnabled}
                      onChange={(e) =>
                        setEditForm((prev) =>
                          prev ? { ...prev, authority: e.target.value || null } : prev,
                        )
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Ποσό από</Label>
                    <Input
                      type="number"
                      value={editForm.minBudget ?? ""}
                      disabled={!advancedFiltersEnabled}
                      onChange={(e) =>
                        setEditForm((prev) =>
                          prev
                            ? {
                                ...prev,
                                minBudget: e.target.value ? Number(e.target.value) : null,
                              }
                            : prev,
                        )
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Ποσό έως</Label>
                    <Input
                      type="number"
                      value={editForm.maxBudget ?? ""}
                      disabled={!advancedFiltersEnabled}
                      onChange={(e) =>
                        setEditForm((prev) =>
                          prev
                            ? {
                                ...prev,
                                maxBudget: e.target.value ? Number(e.target.value) : null,
                              }
                            : prev,
                        )
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="date-from">Ημερομηνία καταχώρισης από</Label>
                    <DateInput
                      id="date-from"
                      value={editForm.dateFrom ?? ""}
                      onChange={(dateFrom) =>
                        setEditForm((prev) =>
                          prev ? { ...prev, dateFrom: dateFrom || null } : prev,
                        )
                      }
                      aria-label="Ημερομηνία καταχώρισης από"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="date-to">Ημερομηνία καταχώρισης έως</Label>
                    <DateInput
                      id="date-to"
                      value={editForm.dateTo ?? ""}
                      onChange={(dateTo) =>
                        setEditForm((prev) =>
                          prev ? { ...prev, dateTo: dateTo || null } : prev,
                        )
                      }
                      aria-label="Ημερομηνία καταχώρισης έως"
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Μπορείτε να ορίσετε μόνο «από», μόνο «έως», ή και τις δύο. Αν δεν ορίσετε
                  ημερομηνίες, ο έλεγχος χρησιμοποιεί τις τελευταίες 30 ημέρες.
                </p>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setEditForm(null)}>
                    Ακύρωση
                  </Button>
                  <Button disabled={busy} onClick={() => void handleSave()}>
                    {busy
                      ? "Αποθήκευση…"
                      : emailUnverified || editForm.enabled === false
                        ? "Αποθήκευση σε παύση"
                        : "Αποθήκευση"}
                  </Button>
                </div>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Διαγραφή αποθηκευμένης αναζήτησης;</DialogTitle>
            <DialogDescription>
              Η αναζήτηση «{deleteTarget?.name}» θα σταματήσει να βρίσκει νέες ευκαιρίες.
              Τα ήδη παρακολουθούμενα νήματα δεν θα διαγραφούν.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Ακύρωση
            </Button>
            <Button variant="destructive" disabled={busy} onClick={() => void handleDelete()}>
              Διαγραφή
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
