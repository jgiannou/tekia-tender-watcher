import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useSessionContext } from "@/auth/SessionProvider";
import { EmptyState, ErrorState, PageSkeleton } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { saasApi, type NotificationPreferences } from "@/lib/api";

const defaultPrefs = (email: string): NotificationPreferences => ({
  emailEnabled: true,
  recipients: email ? [email] : [],
  events: {
    newOpportunity: true,
    relatedActOnFollowed: true,
    postSubmissionUpdate: true,
  },
});

export const NotificationsSettingsPage = () => {
  const { activeOrganization, user } = useSessionContext();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<NotificationPreferences>(
    defaultPrefs(user?.email ?? ""),
  );

  const load = async () => {
    if (!activeOrganization) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await saasApi.getSettings(activeOrganization.id);
      const next = data.settings.notifications;
      if (!next.recipients.length && user?.email) {
        next.recipients = [user.email];
      }
      setPrefs(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Αποτυχία φόρτωσης");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [activeOrganization?.id]);

  const handleSave = async () => {
    if (!activeOrganization) return;
    setSaving(true);
    try {
      const data = await saasApi.updateNotifications(activeOrganization.id, prefs);
      setPrefs(data.settings.notifications);
      toast.success("Οι ειδοποιήσεις αποθηκεύτηκαν");
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
        description="Δημιουργήστε οργανισμό για ρυθμίσεις ειδοποιήσεων."
      />
    );
  }
  if (error) return <ErrorState description={error} onRetry={() => void load()} />;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ειδοποιήσεις</CardTitle>
        <CardDescription>
          Email όταν υπάρχουν νέες ευκαιρίες ή εξελίξεις. Basic: συγκεντρωτικά
          (digest). Pro: άμεσα ανά αντιστοίχιση.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-center justify-between gap-4 rounded-md border border-border px-3 py-3">
          <div>
            <div className="text-sm font-medium">Email ειδοποιήσεις</div>
            <div className="text-xs text-muted-foreground">
              {user?.email ? `Προεπιλογή: ${user.email}` : "Χωρίς email χρήστη"}
            </div>
          </div>
          <Switch
            checked={prefs.emailEnabled}
            onCheckedChange={(checked) =>
              setPrefs((p) => ({ ...p, emailEnabled: checked }))
            }
            aria-label="Email ειδοποιήσεις"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="recipients">Παραλήπτες (διαχωρισμός με κόμμα)</Label>
          <Input
            id="recipients"
            value={prefs.recipients.join(", ")}
            onChange={(e) =>
              setPrefs((p) => ({
                ...p,
                recipients: e.target.value
                  .split(",")
                  .map((v) => v.trim())
                  .filter(Boolean),
              }))
            }
          />
        </div>

        <div className="space-y-3">
          <div className="text-sm font-medium">Γεγονότα</div>
          {(
            [
              ["newOpportunity", "Νέα σχετική ευκαιρία"],
              ["relatedActOnFollowed", "Νέα επίσημη πράξη για κάτι που παρακολουθώ"],
              ["postSubmissionUpdate", "Νέα εξέλιξη μετά από υποβολή"],
            ] as const
          ).map(([key, label]) => (
            <label
              key={key}
              className="flex items-center justify-between gap-4 rounded-md border border-border px-3 py-2 text-sm"
            >
              <span>{label}</span>
              <Switch
                checked={prefs.events[key]}
                onCheckedChange={(checked) =>
                  setPrefs((p) => ({
                    ...p,
                    events: { ...p.events, [key]: checked },
                  }))
                }
                aria-label={label}
              />
            </label>
          ))}
        </div>

        <Button onClick={() => void handleSave()} disabled={saving}>
          {saving ? "Αποθήκευση…" : "Αποθήκευση"}
        </Button>
      </CardContent>
    </Card>
  );
};
