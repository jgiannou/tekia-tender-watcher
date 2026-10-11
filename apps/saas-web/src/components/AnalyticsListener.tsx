import { useEffect } from "react";
import { useSessionContext } from "@/auth/SessionProvider";
import {
  flushPendingSignUpTracking,
  handleAnalyticsClick,
  setAnalyticsUserId,
} from "@/lib/analytics";

/**
 * Attaches the signed-in account id and records button/link clicks.
 * Page views are already sent by the Google tag on browser history changes.
 * Nothing is sent until the visitor accepts analytics cookies.
 * Also flushes a pending signup conversion if consent arrives after register.
 */
export const AnalyticsListener = () => {
  const { userId } = useSessionContext();

  useEffect(() => {
    setAnalyticsUserId(userId);
    flushPendingSignUpTracking(userId);
  }, [userId]);

  useEffect(() => {
    document.addEventListener("click", handleAnalyticsClick, true);
    return () => document.removeEventListener("click", handleAnalyticsClick, true);
  }, []);

  return null;
};
