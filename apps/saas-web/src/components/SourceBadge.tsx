import { Badge } from "@/components/ui/badge";

export type SourceSystem = "kimdis" | "ted" | "diavgeia";

export const sourceSystemFromReference = (
  referenceNumber: string | null | undefined,
): SourceSystem => {
  const ref = String(referenceNumber ?? "");
  if (ref.startsWith("TED:")) return "ted";
  if (ref.startsWith("DIAVGEIA:")) return "diavgeia";
  return "kimdis";
};

export const sourceLabelEl = (system: SourceSystem): string => {
  switch (system) {
    case "ted":
      return "TED";
    case "diavgeia":
      return "Διαύγεια";
    default:
      return "ΚΗΜΔΗΣ";
  }
};

type SourceBadgeProps = {
  referenceNumber?: string | null;
  system?: SourceSystem;
  className?: string;
};

export const SourceBadge = ({
  referenceNumber,
  system,
  className,
}: SourceBadgeProps) => {
  const resolved = system ?? sourceSystemFromReference(referenceNumber);
  return (
    <Badge variant="outline" className={className} aria-label={`Πηγή ${sourceLabelEl(resolved)}`}>
      {sourceLabelEl(resolved)}
    </Badge>
  );
};
