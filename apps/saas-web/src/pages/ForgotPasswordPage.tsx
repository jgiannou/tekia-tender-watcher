import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

export const ForgotPasswordPage = () => {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      const result = await authClient.requestPasswordReset({
        email,
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (result.error) {
        throw new Error(result.error.message || "Αποτυχία αποστολής");
      }
      setSent(true);
      toast.success("Αν υπάρχει λογαριασμός, στάλθηκε σύνδεσμος επαναφοράς.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Αποτυχία αποστολής συνδέσμου",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      title="Επαναφορά κωδικού"
      description="Θα σας στείλουμε σύνδεσμο επαναφοράς αν υπάρχει λογαριασμός με αυτό το email."
      footer={
        <p className="text-center text-sm text-muted-foreground">
          <Link
            className="font-medium text-primary underline-offset-4 hover:underline"
            to="/login"
          >
            Επιστροφή στη σύνδεση
          </Link>
        </p>
      }
    >
      {sent ? (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Ελέγξτε τα εισερχόμενά σας και ακολουθήστε τον σύνδεσμο.
          </p>
          <Button asChild className="w-full" variant="outline">
            <Link to="/login">Επιστροφή στη σύνδεση</Link>
          </Button>
        </div>
      ) : (
        <form className="space-y-4" onSubmit={(e) => void handleSubmit(e)}>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-label="Email"
            />
          </div>
          <Button className="w-full" disabled={submitting} type="submit">
            {submitting ? "Αποστολή…" : "Αποστολή συνδέσμου"}
          </Button>
        </form>
      )}
    </AuthShell>
  );
};
