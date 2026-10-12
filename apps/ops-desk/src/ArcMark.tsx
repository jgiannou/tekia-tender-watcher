import { useId } from "react";

type ArcMarkProps = {
  className?: string;
  title?: string;
};

/** Official ARC mark (same icon as ARC Tenders saas-web). */
export const ArcMark = ({ className, title = "ARC" }: ArcMarkProps) => {
  const gradId = useId().replace(/:/g, "");

  return (
    <svg
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label={title}
      width={28}
      height={28}
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
