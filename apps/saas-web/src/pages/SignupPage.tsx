import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { saasApi } from "@/lib/api";
import { currentLegalAcceptancePayload } from "@/legal";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";

export const SignupPage = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get("next")?.trim() || "/app";
  const inviteFlow = next.startsWith("/accept-invite");
  const { refetch } = authClient.useSession();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [organizationName, setOrganizationName] = useState("ARC Tenders");
  const [acceptedLegal, setAcceptedLegal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!acceptedLegal) {
      toast.error("Πρέπει να αποδεχτείτε τους Όρους Χρήσης και την Πολιτική Απορρήτου.");
      return;
    }
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

      // Persist acceptance proof (version + timestamp + request metadata on server).
      const legalVersions = currentLegalAcceptancePayload();
      let acceptanceSaved = false;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          await saasApi.acceptLegal({ ...legalVersions, source: "signup" });
          acceptanceSaved = true;
          break;
        } catch {
          await new Promise((resolve) => window.setTimeout(resolve, 250 * (attempt + 1)));
        }
      }
      if (!acceptanceSaved) {
        throw new Error(
          "Ο λογαριασμός δημιουργήθηκε αλλά η αποδοχή όρων απέτυχε. Συνδεθείτε και δοκιμάστε ξανά από τις Ρυθμίσεις → Νομικά.",
        );
      }

      if (!inviteFlow) {
        // Session cookie can lag one tick after sign-up; retry org create once.
        let organization: { id: string } | null = null;
        for (let attempt = 0; attempt < 3; attempt += 1) {
          try {
            const created = await saasApi.createOrganization(
              organizationName.trim() || "ARC Tenders",
            );
            organization = created.organization;
            break;
          } catch (err) {
            if (attempt === 2) throw err;
            await new Promise((resolve) => window.setTimeout(resolve, 250 * (attempt + 1)));
          }
        }
        if (organization?.id) {
          await saasApi.setActiveOrganization(organization.id).catch(() => null);
        }
      }

      toast.success(
        inviteFlow
          ? "Ο λογαριασμός δημιουργήθηκε. Αποδεχτείτε την πρόσκληση."
          : "Ο λογαριασμός δημιουργήθηκε. Ελέγξτε το email σας για επιβεβαίωση.",
      );
      navigate(next.startsWith("/") ? next : "/app", { replace: true });
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
            {!inviteFlow ? (
              <div className="space-y-2">
                <Label htmlFor="org">Οργανισμός</Label>
                <Input
                  id="org"
                  required
                  value={organizationName}
                  onChange={(e) => setOrganizationName(e.target.value)}
                />
              </div>
            ) : (
              <p className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                Εγγραφή μέσω πρόσκλησης — θα ενταχθείτε στον οργανισμό μετά την αποδοχή.
              </p>
            )}
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

            <div className="rounded-md border border-border/70 bg-muted/20 px-3 py-3">
              <label
                htmlFor="accept-legal"
                className="flex cursor-pointer items-start gap-3 text-sm leading-snug"
              >
                <input
                  id="accept-legal"
                  type="checkbox"
                  checked={acceptedLegal}
                  onChange={(e) => setAcceptedLegal(e.target.checked)}
                  required
                  className="mt-1 h-4 w-4 shrink-0 rounded border-border accent-primary"
                  aria-label="Αποδοχή Όρων Χρήσης και Πολιτικής Απορρήτου"
                />
                <span className="text-muted-foreground">
                  Αποδέχομαι τους{" "}
                  <Link
                    className="font-medium text-primary underline-offset-4 hover:underline"
                    to="/legal/terms"
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Όρους Χρήσης
                  </Link>{" "}
                  και την{" "}
                  <Link
                    className="font-medium text-primary underline-offset-4 hover:underline"
                    to="/legal/privacy"
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Πολιτική Απορρήτου
                  </Link>
                  . Έχω ενημερωθεί για τα{" "}
                  <Link
                    className="font-medium text-primary underline-offset-4 hover:underline"
                    to="/legal/cookies"
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                  >
                    cookies
                  </Link>
                  .
                </span>
              </label>
            </div>

            <Button
              className="w-full"
              disabled={submitting || !acceptedLegal}
              type="submit"
            >
              {submitting ? "Δημιουργία…" : "Δημιουργία λογαριασμού"}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            Έχετε ήδη λογαριασμό;{" "}
            <Link
              className="font-medium text-primary underline-offset-4 hover:underline"
              to={inviteFlow ? `/login?next=${encodeURIComponent(next)}` : "/login"}
            >
              Σύνδεση
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
};
