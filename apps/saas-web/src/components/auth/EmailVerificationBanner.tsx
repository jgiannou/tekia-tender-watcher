import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useSessionContext } from "@/auth/SessionProvider";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";

export const EmailVerificationBanner = () => {
  const { user, refresh } = useSessionContext();
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (user?.emailVerified !== false) return undefined;
    const handleFocus = () => {
      void refresh();
    };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [user?.emailVerified, refresh]);

  if (!user || user.emailVerified !== false) return null;

  const handleResend = async () => {
    setSending(true);
    try {
      const result = await authClient.sendVerificationEmail({
        email: user.email,
        callbackURL: `${window.location.origin}/app?verified=1`,
      });
      if (result.error) {
        throw new Error(result.error.message || "Αποτυχία αποστολής");
      }
      toast.success("Στάλθηκε email επιβεβαίωσης. Ελέγξτε τα εισερχόμενά σας.");
      await refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Αποτυχία αποστολής επιβεβαίωσης",
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className="mb-4 flex flex-col gap-3 rounded-lg border border-amber-500/40 bg-amber-500/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
      role="status"
      aria-live="polite"
    >
      <div className="min-w-0 space-y-1">
        <p className="text-sm font-medium">Επιβεβαιώστε το email σας</p>
        <p className="text-sm text-muted-foreground">
          Στείλαμε σύνδεσμο στο {user.email}. Μπορείτε να περιηγηθείτε και να κάνετε
          χειροκίνητη αναζήτηση ΚΗΜΔΗΣ· οι περιοδικές αποθηκευμένες αναζητήσεις
          ξεκλειδώνουν μετά την επιβεβαίωση.
        </p>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="shrink-0"
        disabled={sending}
        aria-label="Επαναποστολή email επιβεβαίωσης"
        onClick={() => void handleResend()}
      >
        {sending ? "Αποστολή…" : "Επαναποστολή"}
      </Button>
    </div>
  );
};
