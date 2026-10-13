import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { TenderPrimaryAction } from "./TenderPrimaryActions";

type TenderNextActionCardProps = {
  title?: string;
  label: string;
  description?: string | null;
  monitoringActive?: boolean;
  hasOutreach?: boolean;
  outreachNote?: string | null;
  /** Subtle contextual CTA when header already shows the primary action. */
  contextualAction?: TenderPrimaryAction | null;
  busy?: boolean;
  className?: string;
};

export const TenderNextActionCard = ({
  title = "Τι περιμένουμε τώρα",
  label,
  description,
  monitoringActive,
  hasOutreach,
  outreachNote,
  contextualAction,
  busy,
  className,
}: TenderNextActionCardProps) => (
  <Card
    className={cn(
      "border-primary/35 bg-primary/[0.07] shadow-sm shadow-primary/5",
      className,
    )}
  >
    <CardContent className="space-y-3 px-4 py-4 sm:px-5 sm:py-5">
      <div className="text-xs font-semibold uppercase tracking-wider text-primary">
        {title}
      </div>
      <div className="text-lg font-semibold leading-snug tracking-tight text-foreground sm:text-xl">
        {label}
      </div>
      {description ? (
        <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>
      ) : null}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        {monitoringActive ? (
          <span className="inline-flex items-center gap-1.5 text-primary">
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
            Η αυτόματη παρακολούθηση είναι ενεργή
          </span>
        ) : null}
        {hasOutreach ? (
          <span className="text-muted-foreground">
            {outreachNote ?? "Η Εκδήλωση Ενδιαφέροντος έχει καταγραφεί."}
          </span>
        ) : null}
      </div>
      {contextualAction ? (
        <Button
          size="sm"
          variant="outline"
          className="border-primary/40 bg-background/40"
          disabled={busy}
          onClick={contextualAction.onClick}
        >
          {contextualAction.label}
        </Button>
      ) : null}
    </CardContent>
  </Card>
);
