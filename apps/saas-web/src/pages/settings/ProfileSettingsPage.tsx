import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useSessionContext } from "@/auth/SessionProvider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saasApi } from "@/lib/api";

export const ProfileSettingsPage = () => {
  const { user, refresh } = useSessionContext();
  const [name, setName] = useState(user?.name ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(user?.name ?? "");
  }, [user?.name]);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await saasApi.updateProfile(name.trim());
      await refresh();
      toast.success("Το προφίλ ενημερώθηκε");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Αποτυχία αποθήκευσης");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Προφίλ</CardTitle>
        <CardDescription>
          Στοιχεία χρήστη. Δεν σχετίζονται με τα στοιχεία της επιχείρησης.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="display-name">Ονοματεπώνυμο</Label>
          <Input
            id="display-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label="Ονοματεπώνυμο"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" value={user?.email ?? ""} disabled aria-label="Email" />
        </div>
        <Button onClick={() => void handleSave()} disabled={saving}>
          {saving ? "Αποθήκευση…" : "Αποθήκευση"}
        </Button>
      </CardContent>
    </Card>
  );
};
