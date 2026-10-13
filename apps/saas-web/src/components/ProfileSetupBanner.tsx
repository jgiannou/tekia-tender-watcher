import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import type { OrgProfileProgress } from "@/lib/org-profile";

type ProfileSetupBannerProps = {
  progress: OrgProfileProgress;
  canEdit: boolean;
  onDismiss?: () => void;
  compact?: boolean;
};

export const ProfileSetupBanner = ({
  progress,
  canEdit,
  onDismiss,
  compact = false,
}: ProfileSetupBannerProps) => {
  if (progress.profileComplete) return null;

  if (!canEdit) {
    return (
      <div
        className={
          compact
            ? "rounded-lg border border-border/80 bg-muted/20 px-3 py-2.5 text-sm text-muted-foreground"
            : "rounded-lg border border-border/80 bg-muted/20 px-4 py-3 text-sm text-muted-foreground"
        }
        role="status"
      >
        Το προφίλ της επιχείρησης είναι ημιτελές. Ζητήστε από διαχειριστή του οργανισμού να
        συμπληρώσει τα στοιχεία και τη δραστηριότητα.
      </div>
    );
  }

  if (compact) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/80 bg-muted/20 px-3 py-2.5 text-sm">
        <span className="text-muted-foreground">
          Ολοκληρώστε το προφίλ επιχείρησης για καλύτερες προτάσεις.
        </span>
        <Button size="sm" variant="outline" asChild>
          <Link to={progress.setupPath}>Ολοκλήρωση προφίλ</Link>
        </Button>
      </div>
    );
  }

  return (
    <section
      className="rounded-lg border border-primary/35 bg-primary/[0.07] px-4 py-3.5 sm:px-5"
      aria-labelledby="profile-setup-banner-title"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1">
          <h3
            id="profile-setup-banner-title"
            className="text-sm font-semibold tracking-tight text-foreground"
          >
            Ολοκλήρωσε το προφίλ της επιχείρησής σου
          </h3>
          <p className="text-sm text-muted-foreground">
            Συμπλήρωσε τα στοιχεία και τη δραστηριότητα της επιχείρησής σου, ώστε το ARC Tenders
            να εντοπίζει πιο σχετικές ευκαιρίες για εσένα.
          </p>
          {progress.completedSteps > 0 ? (
            <p className="text-xs text-muted-foreground">
              Πρόοδος: {progress.completedSteps}/{progress.totalSteps}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button asChild>
            <Link to={progress.setupPath}>Ολοκλήρωση προφίλ</Link>
          </Button>
          {onDismiss ? (
            <Button type="button" variant="ghost" onClick={onDismiss}>
              Αργότερα
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  );
};
