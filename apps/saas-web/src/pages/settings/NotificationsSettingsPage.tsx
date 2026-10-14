import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { useSessionContext } from "@/auth/SessionProvider";
import { EmptyState, ErrorState, PageSkeleton } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader, SectionHeader } from "@/components/ui/page-header";
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

const WEEKDAY_EL = [
  "Κυριακή",
  "Δευτέρα",
  "Τρίτη",
  "Τετάρτη",
  "Πέμπτη",
  "Παρασκευή",
  "Σάββατο",
] as const;

const defaultPrefs = (email: string): NotificationPreferences => ({
  emailEnabled: true,
  recipients: email ? [email] : [],
  digestHours: [],
  emailDeliveryMode: "DIGEST",
  weeklyEmailEnabled: true,
  weeklyRecipient: null,
  weeklyDigestWeekday: 1,
  weeklyDigestHour: "08:00",
  weeklyLastSentAt: null,
  events: {
    newOpportunity: true,
    relatedActOnFollowed: true,
    postSubmissionUpdate: true,
    deadlineRadar: false,
  },
});

const formatNextSend = (iso: string | null | undefined): string | null => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("el-GR", {
    timeZone: "Europe/Athens",
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
};

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
  const [nextWeeklyIso, setNextWeeklyIso] = useState<string | null>(null);

  const emailCadence =
    entitlements?.entitlements.emailCadence ??
    entitlements?.plan?.features?.emailCadence ??
    (entitlements?.scanAccess.planKey === "free" ? "WEEKLY" : "DIGEST_HOURS");
  const isWeekly = emailCadence === "WEEKLY";
  const maxHours =
    entitlements?.entitlements.maxDigestHoursPerDay ??
    entitlements?.entitlements.periodicScansPerDay ??
    entitlements?.scanAccess.limits.periodicScansPerDay ??
    0;
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
      const next = {
        ...defaultPrefs(user?.email ?? ""),
        ...data.settings.notifications,
        events: {
          ...defaultPrefs(user?.email ?? "").events,
          ...data.settings.notifications.events,
        },
      };
      if (!next.recipients.length && user?.email) {
        next.recipients = [user.email];
      }
      if (!next.weeklyRecipient && user?.email) {
        next.weeklyRecipient = user.email;
      }
      setPrefs(next);
      setEntitlements(ent);
      const weekday = next.weeklyDigestWeekday ?? 1;
      const hour = next.weeklyDigestHour ?? "08:00";
      // Approximate next send for display (client-side, Europe/Athens).
      const now = new Date();
      for (let i = 0; i < 60 * 24 * 8; i += 30) {
        const candidate = new Date(now.getTime() + i * 60_000);
        const parts = new Intl.DateTimeFormat("en-GB", {
          timeZone: "Europe/Athens",
          weekday: "short",
          hour: "2-digit",
          hourCycle: "h23",
        }).formatToParts(candidate);
        const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
        const wdMap: Record<string, number> = {
          Sun: 0,
          Mon: 1,
          Tue: 2,
          Wed: 3,
          Thu: 4,
          Fri: 5,
          Sat: 6,
        };
        const w = wdMap[map.weekday ?? "Mon"] ?? 1;
        const h = `${String(map.hour ?? "0").padStart(2, "0")}:00`;
        if (w === weekday && h === hour && candidate.getTime() > now.getTime()) {
          setNextWeeklyIso(candidate.toISOString());
          break;
        }
      }
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
          toast.error(`Το πακέτο σας επιτρέπει έως ${maxHours} ώρες/ημέρα`);
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
    if (!isWeekly && prefs.digestHours.length === 0) {
      toast.error("Επιλέξτε τουλάχιστον μία ώρα");
      return;
    }
    setSaving(true);
    try {
      const payload: NotificationPreferences = {
        ...prefs,
        digestHours: isWeekly ? [] : prefs.digestHours.slice(0, maxHours),
        events: {
          ...prefs.events,
          deadlineRadar: deadlineRadarAllowed ? prefs.events.deadlineRadar : false,
        },
      };
      const data = await saasApi.updateNotifications(
        activeOrganization.id,
        payload,
      );
      setPrefs({
        ...defaultPrefs(user?.email ?? ""),
        ...data.settings.notifications,
        events: {
          ...defaultPrefs(user?.email ?? "").events,
          ...data.settings.notifications.events,
        },
      });
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
        title="Χωρίς εταιρεία"
        description="Δημιουργήστε εταιρεία για ρυθμίσεις ειδοποιήσεων."
      />
    );
  }
  if (error) return <ErrorState description={error} onRetry={() => void load()} />;

  const weekday =
    typeof prefs.weeklyDigestWeekday === "number" ? prefs.weeklyDigestWeekday : 1;
  const weekdayLabel = WEEKDAY_EL[((weekday % 7) + 7) % 7] ?? "Δευτέρα";
  const nextLabel = formatNextSend(nextWeeklyIso);

  const eventToggleRowClass =
    "flex items-center justify-between gap-4 border-b border-border/50 py-3 text-sm last:border-b-0";

  return (
    <div className="space-y-8">
      <PageHeader
        title="Ειδοποιήσεις"
        description={
          isWeekly
            ? "Έως μία εβδομαδιαία σύνοψη email όταν υπάρχουν νέα. Οι ενημερώσεις εμφανίζονται στην εφαρμογή χωρίς να περιμένετε το email."
            : `Τρόπος ενημέρωσης μέσω email για την εταιρεία σας. Επιλέξτε έως ${maxHours} ώρες την ημέρα (ώρα Ελλάδας).`
        }
      />

      <section aria-labelledby="notifications-email-heading">
        <SectionHeader
          title="Email"
          description="Παραλήπτες, συχνότητα και ώρες αποστολής."
        />
        <Card>
          <CardContent className="p-5">
            <div className={cn(eventToggleRowClass, "pt-0")}>
              <div>
                <div id="notifications-email-heading" className="font-medium">
                  Email ειδοποιήσεις
                </div>
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

            {isWeekly ? (
              <div className="space-y-4 pt-4">
                <div>
                  <div className="text-sm font-medium">Εβδομαδιαία σύνοψη</div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Συγκεντρωμένες νέες ευκαιρίες και εξελίξεις. Αν δεν υπάρχουν νέα,
                    δεν στέλνουμε email.
                  </p>
                </div>
                <label className="flex items-center justify-between gap-4 text-sm">
                  <span>Λήψη εβδομαδιαίας σύνοψης</span>
                  <Switch
                    checked={prefs.weeklyEmailEnabled !== false}
                    onCheckedChange={(checked) =>
                      setPrefs((p) => ({ ...p, weeklyEmailEnabled: checked }))
                    }
                    aria-label="Λήψη εβδομαδιαίας σύνοψης"
                  />
                </label>
                <div className="space-y-1.5">
                  <Label htmlFor="weeklyRecipient">Παραλήπτης εβδομαδιαίας σύνοψης</Label>
                  <Input
                    id="weeklyRecipient"
                    value={prefs.weeklyRecipient ?? ""}
                    onChange={(e) =>
                      setPrefs((p) => ({
                        ...p,
                        weeklyRecipient: e.target.value.trim() || null,
                      }))
                    }
                    aria-label="Παραλήπτης εβδομαδιαίας σύνοψης"
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-foreground">
                    Προγραμματισμένη αποστολή: κάθε {weekdayLabel}, στις{" "}
                    {prefs.weeklyDigestHour}, ώρα Ελλάδας.
                  </p>
                  {nextLabel ? (
                    <p className="text-xs text-muted-foreground">
                      Επόμενη αποστολή: {nextLabel}
                    </p>
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground">
                  Θέλετε συχνότερα email; Με το Basic επιλέγετε έως 2 καθημερινές ώρες
                  ενημέρωσης ή άμεσες ειδοποιήσεις για σημαντικές εξελίξεις.{" "}
                  <Link
                    to="/app/subscription"
                    className="text-foreground underline underline-offset-2"
                  >
                    Δείτε τα πακέτα
                  </Link>
                </p>
              </div>
            ) : (
              <div className="space-y-5 pt-4">
                <div className="space-y-2">
                  <div className="text-sm font-medium">Τρόπος ενημέρωσης</div>
                  <div
                    className="inline-flex rounded-md bg-muted/40 p-0.5"
                    role="group"
                    aria-label="Τρόπος ενημέρωσης"
                  >
                    {(
                      [
                        ["DIGEST", "Συγκεντρωτική"],
                        ["IMMEDIATE", "Άμεσες"],
                      ] as const
                    ).map(([mode, label]) => {
                      const selected = (prefs.emailDeliveryMode ?? "DIGEST") === mode;
                      return (
                        <button
                          key={mode}
                          type="button"
                          tabIndex={0}
                          aria-pressed={selected}
                          aria-label={label}
                          onClick={() =>
                            setPrefs((p) => ({ ...p, emailDeliveryMode: mode }))
                          }
                          className={cn(
                            "rounded px-3 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            selected
                              ? "bg-background font-medium text-foreground shadow-sm"
                              : "text-muted-foreground hover:text-foreground",
                          )}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {(prefs.emailDeliveryMode ?? "DIGEST") === "IMMEDIATE"
                      ? "Οι άμεσες ενημερώσεις αποστέλλονται αφού εντοπιστεί η εξέλιξη. Κοντινές χρονικά ενημερώσεις μπορεί να ομαδοποιούνται σε ένα email."
                      : "Οι ενημερώσεις από όλες τις αναζητήσεις σας συγκεντρώνονται στο ίδιο email. Αν δεν υπάρχουν νέα, δεν στέλνουμε σύνοψη."}
                  </p>
                </div>

                <div className="space-y-1.5">
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

                <div className="space-y-2">
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="text-sm font-medium">Ώρες αποστολής (ώρα Ελλάδας)</div>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {prefs.digestHours.length}/{maxHours} επιλεγμένες
                    </span>
                  </div>
                  <div
                    className="grid grid-cols-6 gap-1 sm:grid-cols-9"
                    role="group"
                    aria-label="Ώρες αποστολής"
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
                            "rounded px-1 py-1 text-xs tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            selected
                              ? "bg-primary/20 font-medium text-primary"
                              : "bg-muted/30 text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                          )}
                        >
                          {hour}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <section>
        <SectionHeader
          title="In-app"
          description="Γεγονότα που εμφανίζονται στην εφαρμογή."
        />
        <Card>
          <CardContent className="p-5 py-2">
            {(
              [
                ["newOpportunity", "Νέα σχετική ευκαιρία"],
                ["relatedActOnFollowed", "Νέα επίσημη πράξη για κάτι που παρακολουθώ"],
                ["postSubmissionUpdate", "Νέα εξέλιξη μετά από υποβολή"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className={eventToggleRowClass}>
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
              <label className={eventToggleRowClass}>
                <span>Επερχόμενες προθεσμίες (έως 7 ημέρες) μέσω email</span>
                <Switch
                  checked={prefs.events.deadlineRadar}
                  onCheckedChange={(checked) =>
                    setPrefs((p) => ({
                      ...p,
                      events: { ...p.events, deadlineRadar: checked },
                    }))
                  }
                  aria-label="Επερχόμενες προθεσμίες"
                />
              </label>
            ) : (
              <p className={cn(eventToggleRowClass, "text-muted-foreground")}>
                <span>
                  Συγκεντρωτική προβολή επερχόμενων προθεσμιών μέσω email — διαθέσιμο
                  στο{" "}
                  <Link
                    to="/app/subscription"
                    className="text-foreground underline underline-offset-2"
                  >
                    Pro
                  </Link>
                  .
                </span>
              </p>
            )}
          </CardContent>
        </Card>
      </section>

      <Button onClick={() => void handleSave()} disabled={saving}>
        {saving ? "Αποθήκευση…" : "Αποθήκευση"}
      </Button>
    </div>
  );
};
