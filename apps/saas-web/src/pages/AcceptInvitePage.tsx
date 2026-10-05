import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useSessionContext } from "@/auth/SessionProvider";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { saasApi } from "@/lib/api";
import { humanSaasError } from "@/lib/labels";

export const AcceptInvitePage = () => {
  const [params] = useSearchParams();
  const token = params.get("token")?.trim() ?? "";
  const nextPath = token
    ? `/accept-invite?token=${encodeURIComponent(token)}`
    : "/accept-invite";
  const navigate = useNavigate();
  const { user, loading, refresh } = useSessionContext();
  const [peek, setPeek] = useState<{
    email: string;
    role: string;
    organization: { name: string };
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    if (!token) {
      setError("Λείπει το token πρόσκλησης.");
      return;
    }
    void saasApi
      .peekInvitation(token)
      .then((res) => setPeek(res.invitation))
      .catch((err) =>
        setError(
          err instanceof Error ? humanSaasError(err.message) : "Άκυρη πρόσκληση",
        ),
      );
  }, [token]);

  const handleAccept = async () => {
    if (!token) return;
    setAccepting(true);
    try {
      const result = await saasApi.acceptInvitation(token);
      await refresh();
      toast.success(`Μπήκατε στον οργανισμό «${result.organization.name}»`);
      navigate("/app", { replace: true });
    } catch (err) {
      toast.error(
        err instanceof Error ? humanSaasError(err.message) : "Αποτυχία αποδοχής",
      );
    } finally {
      setAccepting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Πρόσκληση ομάδας</CardTitle>
          <CardDescription>
            {peek
              ? `Πρόσκληση για ${peek.email} στον οργανισμό «${peek.organization.name}».`
              : "Ελέγχος πρόσκλησης…"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}

          {loading ? (
            <p className="text-sm text-muted-foreground">Έλεγχος συνεδρίας…</p>
          ) : !user ? (
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>
                Συνδεθείτε ή εγγραφείτε με το email της πρόσκλησης
                {peek ? ` (${peek.email})` : ""} και επιστρέψτε σε αυτή τη σελίδα.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button asChild>
                  <Link to={`/login?next=${encodeURIComponent(nextPath)}`}>
                    Σύνδεση
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <Link to={`/signup?next=${encodeURIComponent(nextPath)}`}>
                    Εγγραφή
                  </Link>
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Συνδεδεμένος ως {user.email}. Πατήστε αποδοχή για να ενταχθείτε
                στην ομάδα.
              </p>
              <Button
                type="button"
                disabled={!token || Boolean(error) || accepting}
                onClick={() => void handleAccept()}
                aria-label="Αποδοχή πρόσκλησης"
              >
                {accepting ? "Αποδοχή…" : "Αποδοχή πρόσκλησης"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
