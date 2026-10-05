import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Building2 } from "lucide-react";
import { useSessionContext } from "@/auth/SessionProvider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const MAX_OWNED_ORGANIZATIONS = 3;

type CreateOrganizationDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * Create a new organization (company workspace): named company, own trial
 * subscription, switch into it, then company setup — not a raw browser prompt.
 */
export const CreateOrganizationDialog = ({
  open,
  onOpenChange,
}: CreateOrganizationDialogProps) => {
  const navigate = useNavigate();
  const { createOrganization, organizations } = useSessionContext();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const ownedCount = useMemo(
    () => organizations.filter((org) => org.role === "OWNER").length,
    [organizations],
  );
  const atLimit = ownedCount >= MAX_OWNED_ORGANIZATIONS;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (atLimit) {
      toast.error(
        "Μπορείτε να δημιουργήσετε έως 3 οργανισμούς με τον ίδιο λογαριασμό.",
      );
      return;
    }
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Συμπληρώστε το όνομα του οργανισμού.");
      return;
    }
    setBusy(true);
    try {
      await createOrganization(trimmed);
      toast.success(
        `Δημιουργήθηκε «${trimmed}». Συνεχίστε με τη ρύθμιση της εταιρείας.`,
      );
      setName("");
      onOpenChange(false);
      navigate("/app/setup");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Αποτυχία δημιουργίας οργανισμού",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return;
        onOpenChange(next);
        if (!next) setName("");
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            Νέος οργανισμός
          </DialogTitle>
          <DialogDescription>
            Δημιουργείτε ξεχωριστή εταιρεία στο ARC Tenders, με δικά της δεδομένα και
            δική της συνδρομή.
          </DialogDescription>
        </DialogHeader>

        <ul className="space-y-2 rounded-md border border-border bg-muted/30 px-3 py-3 text-sm text-muted-foreground">
          <li>
            • Ξεκινά με{" "}
            <span className="text-foreground">δωρεάν δοκιμή 7 ημερών</span>
          </li>
          <li>
            • Παρακολουθήσεις, έγγραφα και μέλη δεν μοιράζονται με άλλους οργανισμούς
          </li>
          <li>• Η συνδρομή (Basic ή Pro) ισχύει ανά οργανισμό</li>
          <li>
            • Έως {MAX_OWNED_ORGANIZATIONS} οργανισμοί ανά λογαριασμό (
            {ownedCount}/{MAX_OWNED_ORGANIZATIONS})
          </li>
        </ul>

        {atLimit ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Έχετε ήδη φτάσει το όριο των {MAX_OWNED_ORGANIZATIONS} οργανισμών.
              Για επιπλέον εταιρείες επικοινωνήστε μαζί μας.
            </p>
            <div className="flex justify-end">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Κλείσιμο
              </Button>
            </div>
          </div>
        ) : (
          <form className="space-y-4" onSubmit={(e) => void handleSubmit(e)}>
            <div className="space-y-1.5">
              <Label htmlFor="new-org-name">Όνομα εταιρείας / οργανισμού</Label>
              <Input
                id="new-org-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="π.χ. TEKIA ΙΚΕ"
                autoFocus
                disabled={busy}
                maxLength={80}
                aria-label="Όνομα νέου οργανισμού"
              />
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => onOpenChange(false)}
              >
                Ακύρωση
              </Button>
              <Button type="submit" disabled={busy || !name.trim()}>
                {busy ? "Δημιουργία…" : "Δημιουργία και συνέχεια"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
};
