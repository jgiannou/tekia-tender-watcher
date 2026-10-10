import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { useSessionContext } from "@/auth/SessionProvider";
import { EmptyState, ErrorState, PageSkeleton } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  saasApi,
  type NotificationPreferences,
  type SaasEntitlementsResponse,
} from "@/lib/api";
import { cn } from "@/lib/utils";

const DIGEST_HOUR_OPTIONS = [
  "06:00",
  "07:00",
  "08:00",
  "09:00",
  "10:00",
  "11:00",
  "12:00",
  "13:00",
  "14:00",
  "15:00",
  "16:00",
  "17:00",
  "18:00",
  "19:00",
  "20:00",
  "21:00",
  "22:00",
] as const;

const defaultPrefs = (email: string): NotificationPreferences => ({
  emailEnabled: true,
  recipients: email ? [email] : [],
  digestHours: ["08:00"],
  events: {
    newOpportunity: true,
    relatedActOnFollowed: true,
    postSubmissionUpdate: true,
    deadlineRadar: false,
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
  const [entitlements, setEntitlements] = useState<SaasEntitlementsResponse | null>(
    null,
  );

  const maxHours =
    entitlements?.entitlements.periodicScansPerDay ??
    entitlements?.scanAccess.limits.periodicScansPerDay ??
    1;
  const deadlineRadarAllowed =
    entitlements?.entitlements.deadlineRadar === true ||
    entitlements?.plan?.features?.deadlineRadar === true;

  const load = async () => {
    if (!activeOrganization) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [data, ent] = await Promise.all([
        saasApi.getSettings(activeOrganization.id),
        saasApi.getEntitlements(activeOrganization.id),
      ]);
      const next = data.settings.notifications;
      if (!next.recipients.length && user?.email) {
        next.recipients = [user.email];
      }
      if (!Array.isArray(next.digestHours) || next.digestHours.length === 0) {
        next.digestHours = ["08:00"];
      }
      if (!next.events.deadlineRadar) {
        next.events.deadlineRadar = false;
      }
      setPrefs(next);
      setEntitlements(ent);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Αποτυχία φόρτωσης");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [activeOrganization?.id]);

  const handleToggleHour = (hour: string) => {
    setPrefs((prev) => {
      const selected = new Set(prev.digestHours);
      if (selected.has(hour)) {
        if (selected.size <= 1) {
          toast.error("Χρειάζεται τουλάχιστον μία ώρα");
          return prev;
        }
        selected.delete(hour);
      } else {
        if (selected.size >= maxHours) {
          toast.error(`Το πλάνο σας επιτρέπει έως ${maxHours} ώρες/ημέρα`);
          return prev;
        }
        selected.add(hour);
      }
      return {
        ...prev,
        digestHours: [...selected].sort(),
      };
    });
  };

  const handleSave = async () => {
    if (!activeOrganization) return;
    if (prefs.digestHours.length === 0) {
      toast.error("Επιλέξτε τουλάχιστον μία ώρα");
      return;
    }
    setSaving(true);
    try {
      const payload: NotificationPreferences = {
        ...prefs,
        digestHours: prefs.digestHours.slice(0, maxHours),
        events: {
          ...prefs.events,
          deadlineRadar: deadlineRadarAllowed ? prefs.events.deadlineRadar : false,
        },
      };
      const data = await saasApi.updateNotifications(
        activeOrganization.id,
        payload,
      );
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
          Λειτουργικά email οργανισμού (όχι marketing). Επιλέγετε ώρες Europe/Athens —
          έως {maxHours} την ημέρα σύμφωνα με το πακέτο σας. Σε κάθε ώρα ελέγχου
          λαμβάνετε digest με νέα ευρήματα, ή σύνοψη με τις ενεργές αντιστοιχίες αν
          δεν υπάρχει κάτι νέο.
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
          <div>
            <div className="text-sm font-medium">Ώρες email (Europe/Athens)</div>
            <p className="text-xs text-muted-foreground">
              Επιλεγμένες: {prefs.digestHours.length}/{maxHours}
            </p>
          </div>
          <div
            className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6"
            role="group"
            aria-label="Ώρες email"
          >
            {DIGEST_HOUR_OPTIONS.map((hour) => {
              const selected = prefs.digestHours.includes(hour);
              return (
                <button
                  key={hour}
                  type="button"
                  tabIndex={0}
                  aria-pressed={selected}
                  aria-label={`Ώρα ${hour}`}
                  onClick={() => handleToggleHour(hour)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      handleToggleHour(hour);
                    }
                  }}
                  className={cn(
                    "rounded-md border px-2 py-2 text-sm tabular-nums transition-colors",
                    selected
                      ? "border-primary bg-primary/15 text-foreground"
                      : "border-border bg-background text-muted-foreground hover:border-primary/40",
                  )}
                >
                  {hour}
                </button>
              );
            })}
          </div>
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

          {deadlineRadarAllowed ? (
            <label className="flex items-center justify-between gap-4 rounded-md border border-border px-3 py-2 text-sm">
              <span>
                Deadline radar — επερχόμενες προθεσμίες (έως 7 ημέρες)
              </span>
              <Switch
                checked={prefs.events.deadlineRadar}
                onCheckedChange={(checked) =>
                  setPrefs((p) => ({
                    ...p,
                    events: { ...p.events, deadlineRadar: checked },
                  }))
                }
                aria-label="Deadline radar"
              />
            </label>
          ) : (
            <div className="rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">
              Deadline radar (επερχόμενες προθεσμίες) — διαθέσιμο στο{" "}
              <Link
                to="/app/subscription"
                className="text-foreground underline underline-offset-2"
              >
                Pro
              </Link>
              .
            </div>
          )}
        </div>

        <Button onClick={() => void handleSave()} disabled={saving}>
          {saving ? "Αποθήκευση…" : "Αποθήκευση"}
        </Button>
      </CardContent>
    </Card>
  );
};
