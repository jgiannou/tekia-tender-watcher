import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type PageHeaderProps = {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  meta?: ReactNode;
  className?: string;
};

/** Standard app page title block — typography over borders. */
export const PageHeader = ({
  title,
  description,
  actions,
  meta,
  className,
}: PageHeaderProps) => (
  <div
    className={cn(
      "flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between",
      className,
    )}
  >
    <div className="min-w-0 space-y-1.5">
      <h2 className="text-2xl font-semibold tracking-tight text-foreground">
        {title}
      </h2>
      {description ? (
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      ) : null}
      {meta ? (
        <div className="pt-1 text-xs text-muted-foreground">{meta}</div>
      ) : null}
    </div>
    {actions ? (
      <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
    ) : null}
  </div>
);

type SectionHeaderProps = {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
};

export const SectionHeader = ({
  title,
  description,
  action,
  className,
}: SectionHeaderProps) => (
  <div
    className={cn(
      "mb-4 flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between",
      className,
    )}
  >
    <div className="min-w-0">
      <h3 className="text-sm font-semibold tracking-tight text-foreground">
        {title}
      </h3>
      {description ? (
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      ) : null}
    </div>
    {action}
  </div>
);
