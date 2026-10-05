import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";

export const LoginPage = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get("next")?.trim() || "/app";
  const { refetch } = authClient.useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      const result = await authClient.signIn.email({ email, password });
      if (result.error) throw new Error(result.error.message || "Αποτυχία σύνδεσης");

      // Better Auth refreshes the session atom on a 10ms timeout after sign-in.
      // Wait for an explicit session fetch before navigating, otherwise RequireAuth
      // briefly sees session=null and bounces back to /login.
      await refetch();
      const session = await authClient.getSession();
      if (!session.data?.user) {
        throw new Error("Η συνεδρία δεν δημιουργήθηκε. Δοκιμάστε ξανά.");
      }
      if (session.data) {
        authClient.hydrateSession(session.data);
      }

      toast.success("Καλωσήρθατε");
      navigate(next.startsWith("/") ? next : "/app", { replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Αποτυχία σύνδεσης");
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
          <CardTitle className="text-2xl">Σύνδεση</CardTitle>
          <CardDescription>
            Συνδεθείτε για να δείτε ευκαιρίες και παρακολουθήσεις διαγωνισμών.
          </CardDescription>
        </CardHeader>
        <CardContent>
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
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="password">Κωδικός</Label>
                <Link
                  className="text-xs font-medium text-primary underline-offset-4 hover:underline"
                  to="/forgot-password"
                >
                  Ξεχάσατε τον κωδικό;
                </Link>
              </div>
              <PasswordInput
                id="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button className="w-full" disabled={submitting} type="submit">
              {submitting ? "Σύνδεση…" : "Σύνδεση"}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            Δεν έχετε λογαριασμό;{" "}
            <Link className="font-medium text-primary underline-offset-4 hover:underline" to="/signup">
              Εγγραφή
            </Link>
          </p>
          <p className="mt-3 text-center text-xs text-muted-foreground">
            <Link className="underline-offset-4 hover:underline" to="/legal/terms">
              Όροι Χρήσης
            </Link>
            {" · "}
            <Link className="underline-offset-4 hover:underline" to="/legal/privacy">
              Πολιτική Απορρήτου
            </Link>
            {" · "}
            <Link className="underline-offset-4 hover:underline" to="/legal/cookies">
              Cookies
            </Link>
            {" · "}
            <Link className="underline-offset-4 hover:underline" to="/legal/data-sources">
              Πηγές
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
};
