import { Badge } from "@/components/ui/badge";
import { scoreToneClassName } from "@/lib/score";
import { cn } from "@/lib/utils";

type ScoreBadgeProps = {
  score: number;
  label?: string;
  className?: string;
};

export const ScoreBadge = ({ score, label, className }: ScoreBadgeProps) => {
  const value = Math.round(Number.isFinite(score) ? score : 0);
  const text =
    label === "συνάφεια"
      ? `Συνάφεια με τα κριτήριά σας: ${value}%`
      : label
        ? `${value}% ${label}`
        : `${value}%`;
  return (
    <Badge
      variant="secondary"
      className={cn(scoreToneClassName(value), className)}
      aria-label={`Σκορ συνάφειας ${value}%`}
    >
      {text}
    </Badge>
  );
};
