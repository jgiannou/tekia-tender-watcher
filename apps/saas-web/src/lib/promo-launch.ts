import { useEffect, useState } from "react";
import { saasApi, type ArcProLaunchPublicMeta } from "@/lib/api";

export const PROMO_LAUNCH_PATH = "/pro-30";
export const PROMO_ACTIVATE_QUERY = "promo=arc-pro-launch-30";

/** Short TTL so remaining slots / enable flips stay accurate across navigations. */
const AVAILABILITY_TTL_MS = 20_000;

let cachedAvailability: ArcProLaunchPublicMeta | null = null;
let cachedAt = 0;
let inFlight: Promise<ArcProLaunchPublicMeta> | null = null;

export const fetchArcProLaunchAvailability = async (
  force = false,
): Promise<ArcProLaunchPublicMeta> => {
  const fresh =
    cachedAvailability && Date.now() - cachedAt < AVAILABILITY_TTL_MS;
  if (!force && fresh) return cachedAvailability!;
  if (!force && inFlight) return inFlight;
  inFlight = saasApi
    .getArcProLaunchMeta()
    .then((meta) => {
      cachedAvailability = meta;
      cachedAt = Date.now();
      return meta;
    })
    .catch(() => {
      // Do not cache hard failures as permanently disabled — allow retry.
      const fallback: ArcProLaunchPublicMeta = {
        promotionKey: "ARC_PRO_LAUNCH_30",
        promotionActive: false,
        acceptingRedemptions: false,
        totalSlots: 25,
        redeemedSlots: 0,
        remainingSlots: 0,
        durationDays: 30,
        requiresCard: false,
        autoBilling: false,
        returnsTo: "free",
        proMonthlyEur: null,
        redeemBy: null,
      };
      return fallback;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
};

export const useArcProLaunchAvailability = () => {
  const [meta, setMeta] = useState<ArcProLaunchPublicMeta | null>(
    cachedAvailability,
  );
  const [loading, setLoading] = useState(!cachedAvailability);

  useEffect(() => {
    let cancelled = false;
    // Always revalidate on mount (TTL / force) so enable flips and slot counts
    // are not stuck on a stale module cache from a prior API-down response.
    void fetchArcProLaunchAvailability(true).then((value) => {
      if (cancelled) return;
      setMeta(value);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return { meta, loading };
};
