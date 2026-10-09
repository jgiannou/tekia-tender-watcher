import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { useSessionContext } from "@/auth/SessionProvider";
import { ActivityList } from "@/components/ActivityList";
import { EmptyState, ErrorState, PageSkeleton } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trackAnalyticsEvent } from "@/lib/analytics";
import {
  saasApi,
  type OrganizationActivity,
  type WatchSuggestion,
} from "@/lib/api";

const emptySuggestions = (): WatchSuggestion => ({
  cpvs: [],
  keywords: [],
  categories: [],
});

export const ActivitiesSettingsPage = () => {
  const { activeOrganization } = useSessionContext();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activities, setActivities] = useState<OrganizationActivity[]>([]);
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [suggestions, setSuggestions] = useState<WatchSuggestion | null>(null);

  const load = async () => {
    if (!activeOrganization) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [settingsData, suggestionsData] = await Promise.all([
        saasApi.getSettings(activeOrganization.id),
        saasApi.watchSuggestions(activeOrganization.id).catch(() => ({
          suggestions: emptySuggestions(),
        })),
      ]);
      setActivities(settingsData.settings.activities);
      setSuggestions(suggestionsData.suggestions);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Αποτυχία φόρτωσης");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [activeOrganization?.id]);

  const handleAdd = () => {
    const nextCode = code.trim();
    if (!nextCode) return;
    if (activities.some((a) => a.code === nextCode)) {
      toast.error("Ο ΚΑΔ υπάρχει ήδη");
      return;
    }
    setActivities((prev) => [
      ...prev,
      {
        code: nextCode,
        description: description.trim() || nextCode,
        isPrimary: prev.length === 0,
        source: "MANUAL",
      },
    ]);
    setCode("");
    setDescription("");
  };

  const handleSave = async () => {
    if (!activeOrganization) return;
    setSaving(true);
    try {
      const data = await saasApi.updateActivities(activeOrganization.id, activities);
      setActivities(data.settings.activities);
      setSuggestions(data.watchSuggestions);
      toast.success("Οι δραστηριότητες αποθηκεύτηκαν");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Αποτυχία αποθήκευσης");
    } finally {
      setSaving(false);
    }
  };

  const handleCreateSavedSearch = async () => {
    if (!activeOrganization || !suggestions) return;
    const keywords = suggestions.keywords.slice(0, 6);
    const cpvs = suggestions.cpvs.map((cpv) => cpv.code).slice(0, 4);
    if (keywords.length === 0 && cpvs.length === 0) {
      toast.error("Δεν υπάρχουν προτάσεις για αποθηκευμένη αναζήτηση.");
      return;
    }
    const category = suggestions.categories[0] ?? "Δραστηριότητες";
    setCreating(true);
    try {
      await saasApi.createWatchProfile(activeOrganization.id, {
        name: `Από ΚΑΔ · ${category}`,
        enabled: true,
        matchingMode: "BALANCED",
        recordTypes: ["PROC"],
        keywords,
        cpvs,
        source: "SETUP_RECOMMENDATION",
      });
      trackAnalyticsEvent("watch_profile_created", { source: "SETUP_RECOMMENDATION" });
      toast.success("Δημιουργήθηκε αποθηκευμένη αναζήτηση από τις προτάσεις ΚΑΔ.");
      window.location.href = "/app/saved-searches";
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Αποτυχία δημιουργίας αναζήτησης");
    } finally {
      setCreating(false);
    }
  };

  if (loading) return <PageSkeleton />;
  if (!activeOrganization) {
    return (
      <EmptyState
        title="Χωρίς οργανισμό"
        description="Δημιουργήστε οργανισμό για διαχείριση ΚΑΔ."
      />
    );
  }
  if (error) return <ErrorState description={error} onRetry={() => void load()} />;

  const hasSuggestions = Boolean(
    suggestions && (suggestions.cpvs.length > 0 || suggestions.keywords.length > 0),
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Δραστηριότητες / ΚΑΔ</CardTitle>
          <CardDescription>
            Ο ΚΑΔ περιγράφει τι κάνει η επιχείρηση. Δεν είναι το ίδιο με CPV διαγωνισμών.
            Η προτεραιότητα και οι αλλαγές ισχύουν μόνο μέσα στο ARC — δεν αλλάζουν τον επίσημο
            ΚΑΔ στο ΓΕΜΗ/ΑΑΔΕ ούτε τις αποθηκευμένες αναζητήσεις αυτόματα.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ActivityList
            activities={activities}
            onRemove={(kadCode) =>
              setActivities((prev) => {
                const next = prev.filter((a) => a.code !== kadCode);
                if (next.length > 0 && !next.some((a) => a.isPrimary)) {
                  next[0] = { ...next[0]!, isPrimary: true };
                }
                return next;
              })
            }
            onSetPrimary={(kadCode) =>
              setActivities((prev) =>
                prev.map((a) => ({ ...a, isPrimary: a.code === kadCode })),
              )
            }
          />

          <div className="grid gap-3 md:grid-cols-[1fr_2fr_auto]">
            <div className="space-y-2">
              <Label htmlFor="kad-code">Κωδικός ΚΑΔ</Label>
              <Input
                id="kad-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="π.χ. 62.01"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="kad-desc">Περιγραφή</Label>
              <Input
                id="kad-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Αναζήτηση ΚΑΔ ή δραστηριότητας…"
              />
            </div>
            <div className="flex items-end">
              <Button type="button" variant="outline" onClick={handleAdd}>
                Προσθήκη
              </Button>
            </div>
          </div>

          <Button onClick={() => void handleSave()} disabled={saving}>
            {saving ? "Αποθήκευση…" : "Αποθήκευση"}
          </Button>
        </CardContent>
      </Card>

      {hasSuggestions ? (
        <Card>
          <CardHeader>
            <CardTitle>Προτεινόμενα ενδιαφέροντα προμηθειών</CardTitle>
            <CardDescription>
              Προτάσεις βάσει αποθηκευμένων δραστηριοτήτων — όχι επίσημη αντιστοίχιση ΚΑΔ→CPV.
              Επιβεβαιώστε πριν δημιουργηθεί αποθηκευμένη αναζήτηση.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {suggestions?.categories.map((category) => (
              <div key={category} className="font-medium">
                {category}
              </div>
            ))}
            {suggestions?.cpvs.map((cpv) => (
              <div key={cpv.code}>
                <span className="font-mono">{cpv.code}</span> — {cpv.label}
              </div>
            ))}
            <div className="flex flex-wrap gap-2 pt-1">
              {suggestions?.keywords.map((keyword) => (
                <Badge key={keyword} variant="secondary">
                  {keyword}
                </Badge>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 pt-2">
              <Button
                onClick={() => void handleCreateSavedSearch()}
                disabled={creating}
              >
                {creating ? "Δημιουργία…" : "Δημιουργία αποθηκευμένης αναζήτησης"}
              </Button>
              <Button variant="outline" asChild>
                <Link to="/app/setup?step=interests">Επισκόπηση στο setup</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : activities.length > 0 ? (
        <Card className="border-dashed">
          <CardContent className="space-y-2 px-6 py-8 text-sm text-muted-foreground">
            <p>
              Δεν υπάρχουν ακόμη προτάσεις ενδιαφερόντων για τους αποθηκευμένους ΚΑΔ. Προσθέστε
              ΚΑΔ κατασκευών (π.χ. 41.20) ή πληροφορικής (π.χ. 62.01) και πατήστε Αποθήκευση.
            </p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
};
