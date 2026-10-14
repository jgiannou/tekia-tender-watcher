import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type DataColumnProps = {
  label: string;
  children: ReactNode;
  className?: string;
};

/**
 * Cell inside a DataRow grid. The label is only visible below `lg`, where the
 * column header row is hidden.
 */
export const DataColumn = ({ label, children, className }: DataColumnProps) => (
  <div className={cn("min-w-0", className)}>
    <div className="mb-0.5 text-[11px] uppercase tracking-wider text-muted-foreground lg:hidden">
      {label}
    </div>
    {children}
  </div>
);

type DataColumnHeaderProps = {
  gridClassName: string;
  labels: string[];
};

/** Desktop-only column header aligned with a DataRow grid. */
export const DataColumnHeader = ({ gridClassName, labels }: DataColumnHeaderProps) => (
  <div
    className={cn(
      "hidden border-b border-border/60 pb-2 text-[11px] uppercase tracking-wider text-muted-foreground lg:grid",
      gridClassName,
    )}
    aria-hidden
  >
    {labels.map((label, index) => (
      <span key={`${label}-${index}`}>{label}</span>
    ))}
  </div>
);
