import { useId } from "react";
import { cn } from "@/lib/utils";

type ArcMarkProps = {
  className?: string;
  title?: string;
};

/** Official ARC mark (same icon as ARC Procurement / ARC Tenders). */
export const ArcMark = ({
  className,
  title = "ARC",
}: ArcMarkProps) => {
  const gradId = useId().replace(/:/g, "");

  return (
    <svg
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0", className)}
      role="img"
      aria-label={title}
    >
      <title>{title}</title>
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#FF6B6B" />
          <stop offset="50%" stopColor="#A78BFA" />
          <stop offset="100%" stopColor="#FF6B6B" />
        </linearGradient>
      </defs>
      <path
        d="M 10 35 Q 30 15, 50 35 T 90 35"
        fill="none"
        stroke={`url(#${gradId})`}
        strokeWidth="10"
        strokeLinecap="round"
      />
      <path
        d="M 10 60 Q 30 80, 50 60 T 90 60"
        fill="none"
        stroke="#94a3b8"
        strokeWidth="8"
        strokeLinecap="round"
      />
      <circle cx="10" cy="35" r="6" fill="#FF6B6B" />
      <circle cx="90" cy="35" r="6" fill="#A78BFA" />
    </svg>
  );
};

type ArcBrandProps = {
  className?: string;
  markClassName?: string;
  compact?: boolean;
  productName?: string;
};

export const ArcBrand = ({
  className,
  markClassName,
  compact = false,
  productName = "Tenders",
}: ArcBrandProps) => (
  <span className={cn("inline-flex items-center gap-2", className)}>
    <ArcMark className={cn(compact ? "h-6 w-6" : "h-7 w-7", markClassName)} />
    <span className="inline-flex items-baseline gap-1.5 leading-none">
      <span className="font-mono text-sm font-semibold tracking-tight text-foreground">
        ARC
      </span>
      <span className="text-sm font-medium tracking-tight text-muted-foreground">
        {productName}
      </span>
    </span>
  </span>
);
