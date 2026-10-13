import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useSessionContext } from "@/auth/SessionProvider";
import { ProfileSetupBanner } from "@/components/ProfileSetupBanner";
import { EmptyState, ErrorState, PageSkeleton } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saasApi, type CompanyProfile, type OrgSettings } from "@/lib/api";
import {
  canEditOrganizationProfile,
  getOrgProfileProgress,
} from "@/lib/org-profile";

export const CompanySettingsPage = () => {
  const { activeOrganization, gemiConfigured, refresh } = useSessionContext();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<OrgSettings | null>(null);
  const [form, setForm] = useState<Partial<CompanyProfile>>({});

  const load = async () => {
    if (!activeOrganization) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await saasApi.getSettings(activeOrganization.id);
      setSettings(data.settings);
      setForm(data.settings.company);
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
      const data = await saasApi.updateCompany(activeOrganization.id, {
        ...form,
        source: form.source ?? "MANUAL",
      });
      setSettings(data.settings);
      setForm(data.settings.company);
      await refresh();
      toast.success("Τα στοιχεία επιχείρησης αποθηκεύτηκαν");
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
        description="Δημιουργήστε οργανισμό για να επεξεργαστείτε τα στοιχεία επιχείρησης."
      />
    );
  }
  if (error) return <ErrorState description={error} onRetry={() => void load()} />;

  const progress = settings ? getOrgProfileProgress(settings) : null;
  const canEdit = canEditOrganizationProfile(activeOrganization.role);

  return (
    <div className="space-y-4">
      {progress && !progress.profileComplete ? (
        <ProfileSetupBanner progress={progress} canEdit={canEdit} compact />
      ) : null}
    <Card>
      <CardHeader>
        <CardTitle>Στοιχεία επιχείρησης</CardTitle>
        <CardDescription>
          Αποθηκευμένα στο TEKIA. Το ΓΕΜΗ χρησιμοποιείται μόνο για εμπλουτισμό, όχι ως βάση δεδομένων.
          {settings?.company.source === "GEMI" && settings.company.lastSyncedAt
            ? ` Τελευταίος συγχρονισμός: ${new Date(settings.company.lastSyncedAt).toLocaleString("el-GR")}`
            : null}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="legalName">Επωνυμία</Label>
            <Input
              id="legalName"
              value={form.legalName ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, legalName: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="distinctiveTitle">Διακριτικός τίτλος</Label>
            <Input
              id="distinctiveTitle"
              value={form.distinctiveTitle ?? ""}
              onChange={(e) =>
                setForm((f) => ({ ...f, distinctiveTitle: e.target.value || null }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="afm">ΑΦΜ</Label>
            <Input
              id="afm"
              value={form.afm ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, afm: e.target.value || null }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="gemiNumber">Αριθμός ΓΕΜΗ</Label>
            <Input
              id="gemiNumber"
              value={form.gemiNumber ?? ""}
              onChange={(e) =>
                setForm((f) => ({ ...f, gemiNumber: e.target.value || null }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="website">Ιστότοπος</Label>
            <Input
              id="website"
              value={form.website ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, website: e.target.value || null }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email επιχείρησης</Label>
            <Input
              id="email"
              value={form.email ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value || null }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Τηλέφωνο</Label>
            <Input
              id="phone"
              value={form.phone ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value || null }))}
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void handleSave()} disabled={saving}>
            {saving ? "Αποθήκευση…" : "Αποθήκευση"}
          </Button>
          {gemiConfigured ? (
            <Button
              variant="outline"
              onClick={() => {
                window.location.href = "/app/setup?step=company";
              }}
            >
              Ανανέωση στοιχείων από ΓΕΜΗ
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
    </div>
  );
};
