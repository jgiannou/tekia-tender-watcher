import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { saasApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";

export const SignupPage = () => {
  const navigate = useNavigate();
  const { refetch } = authClient.useSession();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [organizationName, setOrganizationName] = useState("ARC Tenders");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      const result = await authClient.signUp.email({
        name,
        email,
        password,
      });
      if (result.error) throw new Error(result.error.message || "Αποτυχία εγγραφής");

      await refetch();
      const session = await authClient.getSession();
      if (!session.data?.user) {
        throw new Error("Η συνεδρία δεν δημιουργήθηκε. Δοκιμάστε σύνδεση.");
      }
      if (session.data) {
        authClient.hydrateSession(session.data);
      }

      await saasApi.createOrganization(organizationName.trim() || "ARC Tenders");
      toast.success("Ο λογαριασμός δημιουργήθηκε");
      navigate("/app", { replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Αποτυχία εγγραφής");
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
          <CardTitle className="text-2xl">Εγγραφή</CardTitle>
          <CardDescription>
            Δημιουργήστε λογαριασμό και ξεκινήστε την παρακολούθηση διαγωνισμών.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={(e) => void handleSubmit(e)}>
            <div className="space-y-2">
              <Label htmlFor="name">Ονοματεπώνυμο</Label>
              <Input
                id="name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="org">Οργανισμός</Label>
              <Input
                id="org"
                required
                value={organizationName}
                onChange={(e) => setOrganizationName(e.target.value)}
              />
            </div>
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
              <Label htmlFor="password">Κωδικός</Label>
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
              {submitting ? "Δημιουργία…" : "Δημιουργία λογαριασμού"}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            Έχετε ήδη λογαριασμό;{" "}
            <Link className="font-medium text-primary underline-offset-4 hover:underline" to="/login">
              Σύνδεση
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
};
