import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { authClient } from "@/lib/auth-client";

export const ResetPasswordPage = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = useMemo(() => params.get("token") ?? "", [params]);
  const error = params.get("error");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token) {
      toast.error("Λείπει ή είναι άκυρο το token επαναφοράς.");
      return;
    }
    setSubmitting(true);
    try {
      const result = await authClient.resetPassword({
        newPassword: password,
        token,
      });
      if (result.error) {
        throw new Error(result.error.message || "Αποτυχία επαναφοράς");
      }
      toast.success("Ο κωδικός ενημερώθηκε. Συνδεθείτε.");
      navigate("/login", { replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Αποτυχία επαναφοράς κωδικού");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      title="Νέος κωδικός"
      description="Ορίστε νέο κωδικό για τον λογαριασμό σας."
      footer={
        <p className="text-center text-sm text-muted-foreground">
          <Link
            className="font-medium text-primary underline-offset-4 hover:underline"
            to="/login"
          >
            Σύνδεση
          </Link>
        </p>
      }
    >
      {error || !token ? (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Ο σύνδεσμος επαναφοράς είναι άκυρος ή έληξε. Ζητήστε νέο σύνδεσμο.
          </p>
          <Button asChild className="w-full">
            <Link to="/forgot-password">Νέος σύνδεσμος</Link>
          </Button>
        </div>
      ) : (
        <form className="space-y-4" onSubmit={(e) => void handleSubmit(e)}>
          <div className="space-y-2">
            <Label htmlFor="password">Νέος κωδικός</Label>
            <PasswordInput
              id="password"
              autoComplete="new-password"
              minLength={8}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-label="Νέος κωδικός"
            />
          </div>
          <Button className="w-full" disabled={submitting} type="submit">
            {submitting ? "Αποθήκευση…" : "Αποθήκευση κωδικού"}
          </Button>
        </form>
      )}
    </AuthShell>
  );
};
