import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useSessionContext } from "@/auth/SessionProvider";
import { PageLoading } from "@/components/states";
import { authClient } from "@/lib/auth-client";

export const RequireAuth = () => {
  const location = useLocation();
  const { data: session, isPending, isRefetching } = authClient.useSession();
  const { loading } = useSessionContext();

  // Only block on refetch when we do not yet have a user — otherwise background
  // session refresh would flash the loading screen. This also covers Better Auth's
  // post sign-in signal (setTimeout 10ms) before the atom is populated.
  if (isPending || loading || (isRefetching && !session?.user)) {
    return <PageLoading label="Έλεγχος συνεδρίας…" />;
  }
  if (!session?.user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
};
