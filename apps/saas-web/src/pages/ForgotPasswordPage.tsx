import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-md border-border/80 shadow-lg shadow-primary/5">
        <CardHeader>
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
            ARC Tenders
          </div>
          <CardTitle className="text-2xl">Επαναφορά κωδικού</CardTitle>
          <CardDescription>
            Θα σας στείλουμε σύνδεσμο επαναφοράς αν υπάρχει λογαριασμός με αυτό το email.
          </CardDescription>
        </CardHeader>
        <CardContent>
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
                />
              </div>
              <Button className="w-full" disabled={submitting} type="submit">
                {submitting ? "Αποστολή…" : "Αποστολή συνδέσμου"}
              </Button>
            </form>
          )}
          <p className="mt-4 text-center text-sm text-muted-foreground">
            <Link
              className="font-medium text-primary underline-offset-4 hover:underline"
              to="/login"
            >
              Σύνδεση
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
};
