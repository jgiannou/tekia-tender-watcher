import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { authClient } from "@/lib/auth-client";

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
    <AuthShell
      title="Σύνδεση"
      description="Συνδεθείτε για να δείτε τις ευκαιρίες σας, τους διαγωνισμούς που παρακολουθείτε και τα έγγραφα της επιχείρησής σας."
      footer={
        <p className="text-center text-sm text-muted-foreground">
          Δεν έχετε λογαριασμό;{" "}
          <Link
            className="font-medium text-primary underline-offset-4 hover:underline"
            to="/signup"
          >
            Δωρεάν δοκιμή 7 ημερών
          </Link>
        </p>
      }
    >
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
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="password">Κωδικός πρόσβασης</Label>
            <Link
              className="text-xs font-medium text-primary underline-offset-4 hover:underline"
              to="/forgot-password"
            >
              Ξεχάσατε τον κωδικό σας;
            </Link>
          </div>
          <PasswordInput
            id="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-label="Κωδικός πρόσβασης"
          />
        </div>
        <Button className="w-full" disabled={submitting} type="submit">
          {submitting ? "Σύνδεση…" : "Σύνδεση"}
        </Button>
      </form>
    </AuthShell>
  );
};
