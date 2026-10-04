import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useSessionContext } from "@/auth/SessionProvider";
import { ActivityList } from "@/components/ActivityList";
import { EmptyState, ErrorState, PageSkeleton } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  saasApi,
  type OrganizationActivity,
  type WatchSuggestion,
} from "@/lib/api";

export const ActivitiesSettingsPage = () => {
  const { activeOrganization } = useSessionContext();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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
      const data = await saasApi.getSettings(activeOrganization.id);
      setActivities(data.settings.activities);
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

      {suggestions && (suggestions.cpvs.length > 0 || suggestions.keywords.length > 0) ? (
        <Card>
          <CardHeader>
            <CardTitle>Προτεινόμενες κατηγορίες παρακολούθησης</CardTitle>
            <CardDescription>
              Προτάσεις βάσει δραστηριοτήτων — όχι επίσημη αντιστοίχιση ΚΑΔ→CPV.
              Μπορείτε να δημιουργήσετε ή να ενημερώσετε αποθηκευμένες αναζητήσεις χειροκίνητα.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {suggestions.cpvs.map((cpv) => (
              <div key={cpv.code}>
                {cpv.code} — {cpv.label}
              </div>
            ))}
            <div className="flex flex-wrap gap-2 pt-2">
              {suggestions.keywords.map((keyword) => (
                <Badge key={keyword} variant="secondary">
                  {keyword}
                </Badge>
              ))}
            </div>
            <Button
              className="mt-2"
              variant="outline"
              onClick={() => {
                window.location.href = "/app/setup?step=interests";
              }}
            >
              Επισκόπηση προτάσεων
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
};
