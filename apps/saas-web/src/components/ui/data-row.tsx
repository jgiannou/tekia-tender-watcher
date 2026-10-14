import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type DataRowProps = {
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
  interactive?: boolean;
  onClick?: () => void;
};

/**
 * Compact list row — subtle separator, no nested card borders.
 */
export const DataRow = ({
  children,
  actions,
  className,
  interactive,
  onClick,
}: DataRowProps) => {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "group flex w-full flex-col gap-3 border-b border-border/50 py-3.5 text-left last:border-b-0 sm:flex-row sm:items-start sm:justify-between sm:gap-4",
        interactive && "transition-colors hover:bg-muted/30",
        onClick && "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      <div className="min-w-0 flex-1">{children}</div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:pt-0.5">
          {actions}
        </div>
      ) : null}
    </Comp>
  );
};

type DataListProps = {
  children: ReactNode;
  className?: string;
};

export const DataList = ({ children, className }: DataListProps) => (
  <div className={cn("divide-y-0", className)}>{children}</div>
);
