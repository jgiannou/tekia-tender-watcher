import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type InvitationIssuedBadgeProps = {
  relatedProcAdam?: string | null;
  className?: string;
  /** Compact label for dense cards (Overview / saved-search summaries). */
  compact?: boolean;
};

/**
 * Caution flag: this REQ already has a published official invitation (PROC).
 * Helps teams avoid spending time on early requests that already moved on.
 */
export const InvitationIssuedBadge = ({
  relatedProcAdam,
  className,
  compact = false,
}: InvitationIssuedBadgeProps) => {
  const title = relatedProcAdam
    ? `Έχει ήδη δημοσιευτεί επίσημη πρόσκληση (${relatedProcAdam}). Ελέγξτε αν αφορά άλλον οικονομικό φορέα πριν αφιερώσετε χρόνο.`
    : "Έχει ήδη δημοσιευτεί επίσημη πρόσκληση στο ΚΗΜΔΗΣ. Ελέγξτε αν αφορά άλλον οικονομικό φορέα πριν αφιερώσετε χρόνο.";

  return (
    <Badge
      variant="destructive"
      className={cn(
        "border border-destructive/30 bg-destructive/10 font-semibold tracking-wide text-destructive",
        className,
      )}
      title={title}
      aria-label={title}
    >
      {compact ? "Πρόσκληση εκδόθηκε" : "Έχει ήδη πρόσκληση"}
    </Badge>
  );
};
