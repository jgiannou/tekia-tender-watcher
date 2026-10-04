import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { OrganizationActivity } from "@/lib/api";
import { cn } from "@/lib/utils";

type ActivityListProps = {
  activities: OrganizationActivity[];
  onRemove?: (code: string) => void;
  onSetPrimary?: (code: string) => void;
  className?: string;
};

export const ActivityList = ({
  activities,
  onRemove,
  onSetPrimary,
  className,
}: ActivityListProps) => {
  const primary = activities.find((a) => a.isPrimary) ?? activities[0] ?? null;
  const secondary = activities.filter((a) => a.code !== primary?.code);

  if (activities.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Δεν έχουν οριστεί δραστηριότητες ακόμη.
      </p>
    );
  }

  return (
    <div className={cn("space-y-5", className)}>
      <p className="text-xs text-muted-foreground">
        Η σήμανση προτεραιότητας ισχύει μόνο μέσα στο ARC Tenders για οργάνωση της λίστας.
        Δεν αλλάζει τον επίσημο ΚΑΔ στο ΓΕΜΗ ή την ΑΑΔΕ.
      </p>

      {primary ? (
        <section className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Προτεραιότητα στο ARC
          </h4>
          <ActivityRow
            activity={{ ...primary, isPrimary: true }}
            onRemove={onRemove}
          />
        </section>
      ) : null}

      {secondary.length > 0 ? (
        <section className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Άλλες δραστηριότητες
          </h4>
          <div className="space-y-2">
            {secondary.map((activity) => (
              <ActivityRow
                key={activity.code}
                activity={activity}
                onRemove={onRemove}
                onSetPrimary={onSetPrimary}
              />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
};

const ActivityRow = ({
  activity,
  onRemove,
  onSetPrimary,
}: {
  activity: OrganizationActivity;
  onRemove?: (code: string) => void;
  onSetPrimary?: (code: string) => void;
}) => (
  <div className="flex items-start justify-between gap-3 rounded-md border border-border bg-card px-3 py-3">
    <div className="min-w-0 space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="font-mono">
          {activity.code}
        </Badge>
        {activity.isPrimary ? <Badge>Προτεραιότητα</Badge> : null}
      </div>
      <p className="text-sm leading-snug text-foreground">{activity.description}</p>
    </div>
    <div className="flex shrink-0 flex-col gap-1">
      {!activity.isPrimary && onSetPrimary ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          aria-label={`Ορισμός ${activity.code} ως προτεραιότητας στο ARC`}
          title="Μόνο μέσα στο ARC — δεν αλλάζει τον επίσημο ΚΑΔ"
          onClick={() => onSetPrimary(activity.code)}
        >
          Ορισμός προτεραιότητας
        </Button>
      ) : null}
      {onRemove ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          aria-label={`Αφαίρεση ${activity.code}`}
          onClick={() => onRemove(activity.code)}
        >
          Αφαίρεση
        </Button>
      ) : null}
    </div>
  </div>
);
