import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";

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
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-md border-border/80 shadow-lg shadow-primary/5">
        <CardHeader>
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
            ARC Tenders
          </div>
          <CardTitle className="text-2xl">Νέος κωδικός</CardTitle>
          <CardDescription>
            Ορίστε νέο κωδικό για τον λογαριασμό σας.
          </CardDescription>
        </CardHeader>
        <CardContent>
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
                />
              </div>
              <Button className="w-full" disabled={submitting} type="submit">
                {submitting ? "Αποθήκευση…" : "Αποθήκευση κωδικού"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
