import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

type MetricProps = {
  label: string;
  value: ReactNode;
  hint?: string;
  to?: string;
  className?: string;
};

/** Compact KPI cell — no card chrome. */
export const Metric = ({ label, value, hint, to, className }: MetricProps) => {
  const body = (
    <>
      <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-xl font-semibold tabular-nums tracking-tight text-foreground">
        {value}
      </div>
      {hint ? (
        <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div>
      ) : null}
    </>
  );

  if (to) {
    return (
      <Link
        to={to}
        className={cn(
          "block rounded-md px-3 py-2 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          className,
        )}
      >
        {body}
      </Link>
    );
  }

  return <div className={cn("px-3 py-2", className)}>{body}</div>;
};

type MetricStripProps = {
  children: ReactNode;
  className?: string;
};

export const MetricStrip = ({ children, className }: MetricStripProps) => (
  <div
    className={cn(
      "grid grid-cols-2 gap-1 divide-y divide-border/60 rounded-lg border border-border/60 bg-card/40 sm:grid-cols-4 sm:divide-x sm:divide-y-0",
      className,
    )}
  >
    {children}
  </div>
);
