import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useSessionContext } from "@/auth/SessionProvider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isSaasRequestError, saasApi } from "@/lib/api";

const deleteErrorMessage = (err: unknown): string => {
  if (isSaasRequestError(err)) {
    switch (err.code) {
      case "password_required":
        return "Απαιτείται ο κωδικός σας για επιβεβαίωση.";
      case "invalid_password":
        return "Λάθος κωδικός.";
      case "cannot_delete_while_owning_org_with_members":
        return "Δεν μπορείτε να διαγράψετε τον λογαριασμό όσο είστε ιδιοκτήτης οργανισμού με άλλα μέλη. Μεταφέρετε την ιδιοκτησία ή αφαιρέστε τα μέλη πρώτα.";
      case "confirm_required":
        return "Πληκτρολογήστε DELETE για επιβεβαίωση.";
      default:
        break;
    }
  }
  return err instanceof Error ? err.message : "Αποτυχία διαγραφής λογαριασμού";
};

export const ProfileSettingsPage = () => {
  const navigate = useNavigate();
  const { user, refresh, signOut } = useSessionContext();
  const [name, setName] = useState(user?.name ?? "");
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [password, setPassword] = useState("");
  const [deleting, setDeleting] = useState(false);

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

  const handleCloseDeleteDialog = (open: boolean) => {
    if (deleting) return;
    setDeleteOpen(open);
    if (!open) {
      setConfirmText("");
      setPassword("");
    }
  };

  const handleDeleteAccount = async () => {
    if (confirmText !== "DELETE" || !password.trim()) return;
    setDeleting(true);
    try {
      await saasApi.deleteAccount({
        confirm: "DELETE",
        password: password.trim(),
      });
      toast.success("Ο λογαριασμός διαγράφηκε");
      setDeleteOpen(false);
      await signOut();
      navigate("/login", { replace: true });
    } catch (err) {
      toast.error(deleteErrorMessage(err));
    } finally {
      setDeleting(false);
    }
  };

  const canConfirmDelete = confirmText === "DELETE" && password.trim().length > 0;

  return (
    <div className="space-y-6">
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

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="text-destructive">Διαγραφή λογαριασμού</CardTitle>
          <CardDescription>
            Οριστική ενέργεια. Διαγράφονται ο λογαριασμός σας και οι οργανισμοί που
            κατέχετε μόνοι σας (δεδομένα, vault, παρακολουθήσεις). Αν είστε ιδιοκτήτης
            οργανισμού με άλλα μέλη, πρέπει πρώτα να μεταφέρετε την ιδιοκτησία.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="destructive"
            onClick={() => setDeleteOpen(true)}
            aria-label="Άνοιγμα διαλόγου διαγραφής λογαριασμού"
          >
            Διαγραφή λογαριασμού
          </Button>
        </CardContent>
      </Card>

      <Dialog open={deleteOpen} onOpenChange={handleCloseDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Οριστική διαγραφή λογαριασμού;</DialogTitle>
            <DialogDescription>
              Θα διαγραφούν οριστικά ο λογαριασμός «{user?.email}» και οι οργανισμοί
              χωρίς άλλα μέλη που κατέχετε. Η ενέργεια δεν αναιρείται.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="delete-confirm">
                Πληκτρολογήστε <span className="font-mono font-semibold">DELETE</span> για
                επιβεβαίωση
              </Label>
              <Input
                id="delete-confirm"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                autoComplete="off"
                aria-label="Επιβεβαίωση διαγραφής με DELETE"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="delete-password">Κωδικός λογαριασμού</Label>
              <Input
                id="delete-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                aria-label="Κωδικός για διαγραφή λογαριασμού"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                disabled={deleting}
                onClick={() => handleCloseDeleteDialog(false)}
              >
                Ακύρωση
              </Button>
              <Button
                variant="destructive"
                disabled={!canConfirmDelete || deleting}
                onClick={() => void handleDeleteAccount()}
                aria-label="Επιβεβαίωση οριστικής διαγραφής λογαριασμού"
              >
                {deleting ? "Διαγραφή…" : "Διαγραφή οριστικά"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
