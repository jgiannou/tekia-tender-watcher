import { Link } from "react-router-dom";
import { useArcProLaunchAvailability, PROMO_LAUNCH_PATH } from "@/lib/promo-launch";

/** Slim top bar — only when promotion is actively accepting redemptions. */
export const PromoAnnouncementBar = () => {
  const { meta } = useArcProLaunchAvailability();
  if (!meta?.promotionActive || !meta.acceptingRedemptions) return null;

  return (
    <div className="border-b border-primary/25 bg-primary/10">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-2 text-center text-xs sm:justify-between sm:text-left sm:text-sm">
        <p className="text-foreground/90">
          <span className="font-medium">
            30 ημέρες ARC Tenders Pro δωρεάν
          </span>
          <span className="text-muted-foreground">
            {" "}
            — Μόνο για {meta.totalSlots} λογαριασμούς
          </span>
        </p>
        <Link
          to={PROMO_LAUNCH_PATH}
          className="font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Δες την προσφορά →
        </Link>
      </div>
    </div>
  );
};
