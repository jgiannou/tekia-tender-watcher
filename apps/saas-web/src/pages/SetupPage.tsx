import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useSessionContext } from "@/auth/SessionProvider";
import { ActivityList } from "@/components/ActivityList";
import { EmptyState, ErrorState, PageSkeleton } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  saasApi,
  type CompanyRegistryRecord,
  type OrganizationActivity,
  type WatchSuggestion,
} from "@/lib/api";
import { cn } from "@/lib/utils";

type SetupStep = "company" | "activities" | "interests" | "watch" | "done";

const STEPS: SetupStep[] = ["company", "activities", "interests", "watch"];

const isSetupStep = (value: string | null | undefined): value is SetupStep =>
  value === "done" || (typeof value === "string" && STEPS.includes(value as SetupStep));

const stepRank = (value: SetupStep): number => {
  if (value === "done") return STEPS.length;
  const index = STEPS.indexOf(value);
  return index < 0 ? 0 : index;
};

export const SetupPage = () => {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { activeOrganization, gemiConfigured, user, refresh } = useSessionContext();
  // URL is the source of truth — duplicate React state was desyncing after GEMI confirm
  // (toast + ?step=activities while UI stayed on step 1).
  const stepParam = params.get("step");
  const step: SetupStep = isSetupStep(stepParam) ? stepParam : "company";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState(false);
  const [afm, setAfm] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [match, setMatch] = useState<CompanyRegistryRecord | null>(null);
  const [legalName, setLegalName] = useState("");
  const [activities, setActivities] = useState<OrganizationActivity[]>([]);
  const [kadCode, setKadCode] = useState("");
  const [kadDesc, setKadDesc] = useState("");
  const [suggestions, setSuggestions] = useState<WatchSuggestion>({
    cpvs: [],
    keywords: [],
    categories: [],
  });
  const [selectedCpvs, setSelectedCpvs] = useState<string[]>([]);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [keywordDraft, setKeywordDraft] = useState("");
  const [watchName, setWatchName] = useState("Web & Digital");
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [createdWatchName, setCreatedWatchName] = useState<string | null>(null);

  const setStep = (next: SetupStep) => {
    setMatch(null);
    setParams(next === "company" ? {} : { step: next }, { replace: true });
  };

  const stepIndex = Math.max(0, STEPS.indexOf(step === "done" ? "watch" : step));

  const load = async () => {
    if (!activeOrganization) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [settingsRes, suggestionsRes] = await Promise.all([
        saasApi.getSettings(activeOrganization.id),
        saasApi.watchSuggestions(activeOrganization.id).catch(() => ({
          suggestions: { cpvs: [], keywords: [], categories: [] },
        })),
      ]);
      setLegalName(settingsRes.settings.company.legalName || activeOrganization.name);
      setAfm(settingsRes.settings.company.afm ?? "");
      setActivities(settingsRes.settings.activities);
      setSuggestions(suggestionsRes.suggestions);
      setSelectedCpvs(suggestionsRes.suggestions.cpvs.map((c) => c.code));
      setKeywords(suggestionsRes.suggestions.keywords);
      setEmailEnabled(settingsRes.settings.notifications.emailEnabled);
      setManual(!settingsRes.gemiConfigured && !settingsRes.settings.company.afm);

      const metaRaw = settingsRes.settings.onboardingMeta?.step;
      const metaAsString = typeof metaRaw === "string" ? metaRaw : null;
      const persistedStep: SetupStep | null = isSetupStep(metaAsString)
        ? metaAsString
        : null;
      const urlRaw = params.get("step");
      const urlStep: SetupStep = isSetupStep(urlRaw) ? urlRaw : "company";
      // Prefer the furthest of URL vs persisted onboarding — never regress after confirm.
      const resolved: SetupStep =
        persistedStep && stepRank(persistedStep) > stepRank(urlStep)
          ? persistedStep
          : urlStep;
      if (resolved !== urlStep) {
        setParams(
          resolved === "company" ? {} : { step: resolved },
          { replace: true },
        );
      }

      if (settingsRes.settings.onboardingStatus !== "COMPLETED") {
        await saasApi.updateOnboarding(
          activeOrganization.id,
          "IN_PROGRESS",
          resolved,
        );
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

  const title = useMemo(() => {
    if (step === "company") return "Ρύθμιση επιχείρησης";
    if (step === "activities") return "Δραστηριότητες επιχείρησης";
    if (step === "interests") return "Τι είδους διαγωνισμούς σας ενδιαφέρουν;";
    if (step === "watch") return "Πρώτη αποθηκευμένη αναζήτηση";
    return "Η αρχική ρύθμιση ολοκληρώθηκε";
  }, [step]);

  const handleLookup = async () => {
    if (!activeOrganization) return;
    setLookupLoading(true);
    setMatch(null);
    try {
      const result = await saasApi.gemiLookup(activeOrganization.id, { afm });
      if (result.status === "not_configured") {
        setManual(true);
        toast.message("Το ΓΕΜΗ δεν είναι ρυθμισμένο — συμπληρώστε χειροκίνητα.");
        return;
      }
      if (result.status === "unavailable") {
        toast.error("Δεν ήταν δυνατή η αυτόματη ανάκτηση στοιχείων.");
        return;
      }
      if (result.status === "not_found" || result.companies.length === 0) {
        toast.error("Δεν βρέθηκε επιχείρηση με αυτό το ΑΦΜ.");
        return;
      }
      setMatch(result.companies[0]!);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Αποτυχία αναζήτησης ΓΕΜΗ");
    } finally {
      setLookupLoading(false);
    }
  };

  const handleConfirmGemi = async () => {
    if (!activeOrganization || !match) return;
    setConfirming(true);
    try {
      const data = await saasApi.gemiConfirm(activeOrganization.id, match);
      setActivities(data.settings.activities);
      setSuggestions(data.watchSuggestions);
      setSelectedCpvs(data.watchSuggestions.cpvs.map((c) => c.code));
      setKeywords(data.watchSuggestions.keywords);
      setLegalName(data.settings.company.legalName);
      setAfm(data.settings.company.afm ?? "");
      // Advance URL first so remounts / refresh cannot snap back to step 1.
      setStep("activities");
      await saasApi.updateOnboarding(activeOrganization.id, "IN_PROGRESS", "activities");
      toast.success("Η επιχείρηση αποθηκεύτηκε");
      void refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Αποτυχία επιβεβαίωσης");
    } finally {
      setConfirming(false);
    }
  };

  const handleSaveManualCompany = async () => {
    if (!activeOrganization || !legalName.trim()) return;
    try {
      await saasApi.updateCompany(activeOrganization.id, {
        legalName: legalName.trim(),
        afm: afm || null,
        source: "MANUAL",
      });
      setStep("activities");
      await saasApi.updateOnboarding(activeOrganization.id, "IN_PROGRESS", "activities");
      void refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Αποτυχία αποθήκευσης");
    }
  };

  const handleSaveActivities = async () => {
    if (!activeOrganization) return;
    try {
      const data = await saasApi.updateActivities(activeOrganization.id, activities);
      setActivities(data.settings.activities);
      setSuggestions(data.watchSuggestions);
      setSelectedCpvs(data.watchSuggestions.cpvs.map((c) => c.code));
      setKeywords(data.watchSuggestions.keywords);
      await saasApi.updateOnboarding(activeOrganization.id, "IN_PROGRESS", "interests");
      setStep("interests");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Αποτυχία αποθήκευσης");
    }
  };

  const handleContinueInterests = async () => {
    if (!activeOrganization) return;
    await saasApi.updateOnboarding(activeOrganization.id, "IN_PROGRESS", "watch");
    setStep("watch");
  };

  const handleCreateWatchProfile = async () => {
    if (!activeOrganization) return;
    try {
      const name = watchName.trim() || "Web & Digital";
      await saasApi.createWatchProfile(activeOrganization.id, {
        name,
        keywords,
        cpvs: selectedCpvs,
        source: "SETUP_RECOMMENDATION",
      });
      if (user?.email) {
        await saasApi.updateNotifications(activeOrganization.id, {
          emailEnabled,
          recipients: [user.email],
          digestHours: ["08:00"],
          events: {
            newOpportunity: true,
            relatedActOnFollowed: true,
            postSubmissionUpdate: true,
            deadlineRadar: false,
          },
        });
      }
      setCreatedWatchName(name);
      await saasApi.updateOnboarding(activeOrganization.id, "COMPLETED", "done");
      toast.success("Δημιουργήθηκε η αποθηκευμένη αναζήτηση");
      setStep("done");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Αποτυχία δημιουργίας");
    }
  };

  const handleSkipWatch = async () => {
    if (!activeOrganization) return;
    await saasApi.updateOnboarding(activeOrganization.id, "COMPLETED", "done");
    setCreatedWatchName(null);
    setStep("done");
  };

  if (loading) return <PageSkeleton />;
  if (!activeOrganization) {
    return (
      <EmptyState
        title="Χρειάζεται οργανισμός"
        description="Δημιουργήστε οργανισμό πριν τη ρύθμιση επιχείρησης."
      />
    );
  }
  if (error) return <ErrorState description={error} onRetry={() => void load()} />;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          {step !== "done" ? (
            <div className="text-xs text-muted-foreground">
              Βήμα {stepIndex + 1} από {STEPS.length} · Προαιρετική ρύθμιση
            </div>
          ) : null}
          <h2 className="mt-1 text-2xl font-semibold tracking-tight">{title}</h2>
        </div>
        <Button variant="ghost" size="sm" onClick={() => navigate("/app")}>
          Έξοδος από τη ρύθμιση
        </Button>
      </div>

      {step !== "done" ? (
        <div className="flex gap-1">
          {STEPS.map((s, i) => (
            <div
              key={s}
              className={cn(
                "h-1 flex-1 rounded-full",
                i <= stepIndex ? "bg-primary" : "bg-muted",
              )}
            />
          ))}
        </div>
      ) : null}

      {step === "company" ? (
        <Card>
          <CardHeader>
            <CardTitle>{match ? "Βρήκαμε την επιχείρησή σας" : "ΑΦΜ επιχείρησης"}</CardTitle>
            <CardDescription>
              {match
                ? "Επιβεβαιώστε τα στοιχεία πριν συνεχίσετε. Δεν γίνεται αυτόματη σύνδεση με ασαφή ονόματα."
                : gemiConfigured
                  ? "Αναζήτηση με ακριβές ΑΦΜ στο ΓΕΜΗ."
                  : "Το ΓΕΜΗ δεν είναι ρυθμισμένο — συμπληρώστε χειροκίνητα."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {match && !manual ? (
              <>
                <dl className="grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-muted-foreground">Επωνυμία</dt>
                    <dd className="font-medium">{match.legalName}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Διακριτικός τίτλος</dt>
                    <dd className="font-medium">{match.distinctiveTitle ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">ΑΦΜ</dt>
                    <dd className="font-mono">{match.afm}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Αριθμός ΓΕΜΗ</dt>
                    <dd className="font-mono">{match.gemiNumber}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Κατάσταση</dt>
                    <dd>{match.status ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Υπηρεσία ΓΕΜΗ</dt>
                    <dd>{match.gemiService ?? "—"}</dd>
                  </div>
                </dl>
                {match.activities.length > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Θα εισαχθούν {match.activities.length} δραστηριότητες (ΚΑΔ) μετά την επιβεβαίωση.
                  </p>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <Button disabled={confirming} onClick={() => void handleConfirmGemi()}>
                    {confirming ? "Αποθήκευση…" : "Επιβεβαίωση & συνέχεια"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setMatch(null);
                    }}
                  >
                    Δεν είναι αυτή
                  </Button>
                </div>
              </>
            ) : !manual ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="afm">ΑΦΜ επιχείρησης</Label>
                  <Input
                    id="afm"
                    value={afm}
                    onChange={(e) => setAfm(e.target.value)}
                    placeholder="9 ψηφία"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={() => void handleLookup()}
                    disabled={lookupLoading || afm.replace(/\D/g, "").length < 9}
                  >
                    {lookupLoading ? "Αναζήτηση…" : "Αναζήτηση στο ΓΕΜΗ"}
                  </Button>
                  <Button variant="ghost" onClick={() => setManual(true)}>
                    Δεν θέλω να χρησιμοποιήσω το ΓΕΜΗ
                  </Button>
                  <Button variant="outline" onClick={() => setStep("activities")}>
                    Παράλειψη
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="legalName">Επωνυμία</Label>
                  <Input
                    id="legalName"
                    value={legalName}
                    onChange={(e) => setLegalName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="manual-afm">ΑΦΜ (προαιρετικό)</Label>
                  <Input
                    id="manual-afm"
                    value={afm}
                    onChange={(e) => setAfm(e.target.value)}
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => void handleSaveManualCompany()}>
                    Αποθήκευση & συνέχεια
                  </Button>
                  {gemiConfigured ? (
                    <Button variant="ghost" onClick={() => setManual(false)}>
                      Χρήση ΓΕΜΗ
                    </Button>
                  ) : null}
                  <Button variant="outline" onClick={() => setStep("activities")}>
                    Παράλειψη
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      ) : null}

      {step === "activities" ? (
        <Card>
          <CardHeader>
            <CardTitle>Δραστηριότητες επιχείρησης</CardTitle>
            <CardDescription>
              Οι ΚΑΔ περιγράφουν τις δραστηριότητες της επιχείρησης και μας βοηθούν να προτείνουμε
              σχετικές κατηγορίες διαγωνισμών. Δεν είναι το ίδιο με CPV. Αλλαγές εδώ ισχύουν μόνο
              στο ARC — όχι στο ΓΕΜΗ/ΑΑΔΕ.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ActivityList
              activities={activities}
              onRemove={(code) =>
                setActivities((prev) => prev.filter((a) => a.code !== code))
              }
              onSetPrimary={(code) =>
                setActivities((prev) =>
                  prev.map((a) => ({ ...a, isPrimary: a.code === code })),
                )
              }
            />
            <div className="grid gap-3 md:grid-cols-[1fr_2fr_auto]">
              <Input
                placeholder="Κωδικός ΚΑΔ"
                value={kadCode}
                onChange={(e) => setKadCode(e.target.value)}
              />
              <Input
                placeholder="Αναζήτηση ΚΑΔ ή δραστηριότητας…"
                value={kadDesc}
                onChange={(e) => setKadDesc(e.target.value)}
              />
              <Button
                variant="outline"
                onClick={() => {
                  if (!kadCode.trim()) return;
                  setActivities((prev) => [
                    ...prev.filter((a) => a.code !== kadCode.trim()),
                    {
                      code: kadCode.trim(),
                      description: kadDesc.trim() || kadCode.trim(),
                      isPrimary: prev.length === 0,
                      source: "MANUAL",
                    },
                  ]);
                  setKadCode("");
                  setKadDesc("");
                }}
              >
                Προσθήκη
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setStep("company")}>
                Πίσω
              </Button>
              <Button onClick={() => void handleSaveActivities()}>Αποθήκευση & συνέχεια</Button>
              <Button variant="ghost" onClick={() => setStep("interests")}>
                Παράλειψη
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {step === "interests" ? (
        <Card>
          <CardHeader>
            <CardTitle>Προτεινόμενες κατηγορίες</CardTitle>
            <CardDescription>
              Προτάσεις με βάση τους ΚΑΔ — όχι επίσημη αντιστοίχιση και όχι κανόνες επιλεξιμότητας.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="text-sm font-medium">CPVs</div>
              {suggestions.cpvs.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Δεν υπάρχουν προτάσεις CPV ακόμη. Προσθέστε λέξεις-κλειδιά παρακάτω.
                </p>
              ) : (
                suggestions.cpvs.map((cpv) => {
                  const checked = selectedCpvs.includes(cpv.code);
                  return (
                    <label
                      key={cpv.code}
                      className="flex items-start gap-3 rounded-md border border-border px-3 py-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setSelectedCpvs((prev) =>
                            checked
                              ? prev.filter((c) => c !== cpv.code)
                              : [...prev, cpv.code],
                          )
                        }
                      />
                      <span>
                        <span className="font-mono">{cpv.code}</span>
                        <span className="mt-0.5 block text-muted-foreground">{cpv.label}</span>
                      </span>
                    </label>
                  );
                })
              )}
            </div>

            <div>
              <div className="mb-2 text-sm font-medium">Λέξεις-κλειδιά</div>
              <div className="mb-2 flex flex-wrap gap-2">
                {keywords.map((keyword) => (
                  <Badge key={keyword} variant="secondary">
                    {keyword}
                    <button
                      type="button"
                      className="ml-2"
                      aria-label={`Αφαίρεση ${keyword}`}
                      onClick={() =>
                        setKeywords((prev) => prev.filter((k) => k !== keyword))
                      }
                    >
                      ×
                    </button>
                  </Badge>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  value={keywordDraft}
                  onChange={(e) => setKeywordDraft(e.target.value)}
                  placeholder="π.χ. ιστοσελίδα"
                />
                <Button
                  variant="outline"
                  onClick={() => {
                    const value = keywordDraft.trim();
                    if (!value) return;
                    setKeywords((prev) => (prev.includes(value) ? prev : [...prev, value]));
                    setKeywordDraft("");
                  }}
                >
                  Προσθήκη
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setStep("activities")}>
                Πίσω
              </Button>
              <Button onClick={() => void handleContinueInterests()}>Συνέχεια</Button>
              <Button variant="ghost" onClick={() => setStep("watch")}>
                Παράλειψη
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {step === "watch" ? (
        <Card>
          <CardHeader>
            <CardTitle>Δημιουργία πρώτης αποθηκευμένης αναζήτησης</CardTitle>
            <CardDescription>
              Προαιρετικό. Μετατρέπει τα ενδιαφέροντά σας σε αποθηκευμένη αναζήτηση.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="watch-name">Όνομα</Label>
              <Input
                id="watch-name"
                value={watchName}
                onChange={(e) => setWatchName(e.target.value)}
              />
            </div>
            <div className="text-sm text-muted-foreground">
              CPV: {selectedCpvs.length || "—"} · Λέξεις: {keywords.join(", ") || "—"}
            </div>
            <label className="flex items-center justify-between gap-4 rounded-md border border-border px-3 py-3">
              <span className="text-sm">
                Email ειδοποιήσεις{user?.email ? ` (${user.email})` : ""}
              </span>
              <Switch
                checked={emailEnabled}
                onCheckedChange={setEmailEnabled}
                aria-label="Email ειδοποιήσεις"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setStep("interests")}>
                Πίσω
              </Button>
              <Button onClick={() => void handleCreateWatchProfile()}>
                Δημιουργία αναζήτησης
              </Button>
              <Button variant="ghost" onClick={() => void handleSkipWatch()}>
                Παράλειψη προς το παρόν
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {step === "done" ? (
        <Card>
          <CardHeader>
            <CardTitle>Η αρχική ρύθμιση ολοκληρώθηκε</CardTitle>
            <CardDescription>Μπορείτε να συνεχίσετε την εξερεύνηση του ΚΗΜΔΗΣ.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div>
              <div className="text-muted-foreground">Επιχείρηση</div>
              <div className="font-medium">{legalName}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Δραστηριότητες</div>
              <div className="font-medium">{activities.length} ΚΑΔ</div>
            </div>
            <div>
              <div className="text-muted-foreground">Παρακολούθηση</div>
              <div className="font-medium">{createdWatchName ?? "Δεν δημιουργήθηκε ακόμη"}</div>
            </div>
            <div className="flex flex-wrap gap-2 pt-2">
              <Button onClick={() => navigate("/app")}>Μετάβαση στην Επισκόπηση</Button>
              <Button variant="outline" onClick={() => navigate("/app/search")}>
                Αναζήτηση ΚΗΜΔΗΣ
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
};
