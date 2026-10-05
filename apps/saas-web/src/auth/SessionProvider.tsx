import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { authClient } from "@/lib/auth-client";
import {
  saasApi,
  type SaasMeResponse,
  type SaasOrganization,
  type SaasUser,
  type ThemePreference,
} from "@/lib/api";
import { ThemeProvider } from "@/theme/ThemeProvider";

type SessionContextValue = {
  loading: boolean;
  error: string | null;
  userId: string | null;
  user: SaasUser | null;
  theme: ThemePreference | null;
  gemiConfigured: boolean;
  organizations: SaasOrganization[];
  activeOrganization: SaasOrganization | null;
  refresh: () => Promise<void>;
  setActiveOrganizationId: (organizationId: string) => Promise<void>;
  createOrganization: (name: string) => Promise<{ id: string; name: string }>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export const SessionProvider = ({ children }: { children: ReactNode }) => {
  const { data: session, isPending: authPending } = authClient.useSession();
  const [me, setMe] = useState<SaasMeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!session?.user) {
      setMe(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const next = await saasApi.me();
      setMe(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Αποτυχία φόρτωσης συνεδρίας");
      setMe(null);
    } finally {
      setLoading(false);
    }
  }, [session?.user]);

  useEffect(() => {
    if (authPending) return;
    void refresh();
  }, [authPending, refresh]);

  const activeOrganization = useMemo(() => {
    if (!me) return null;
    return (
      me.organizations.find((org) => org.id === me.activeOrganizationId) ??
      me.organizations[0] ??
      null
    );
  }, [me]);

  const setActiveOrganizationId = useCallback(
    async (organizationId: string) => {
      await saasApi.setActiveOrganization(organizationId);
      await refresh();
    },
    [refresh],
  );

  const createOrganization = useCallback(
    async (name: string) => {
      const { organization } = await saasApi.createOrganization(name);
      await refresh();
      return { id: organization.id, name: organization.name };
    },
    [refresh],
  );

  const signOut = useCallback(async () => {
    await authClient.signOut();
    setMe(null);
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({
      loading: authPending || loading,
      error,
      userId: me?.userId ?? session?.user?.id ?? null,
      user:
        me?.user ??
        (session?.user
          ? {
              id: session.user.id,
              name: session.user.name ?? "",
              email: session.user.email ?? "",
              image: session.user.image ?? null,
              emailVerified: Boolean(session.user.emailVerified),
            }
          : null),
      theme: me?.theme ?? null,
      gemiConfigured: me?.gemiConfigured ?? false,
      organizations: me?.organizations ?? [],
      activeOrganization,
      refresh,
      setActiveOrganizationId,
      createOrganization,
      signOut,
    }),
    [
      authPending,
      loading,
      error,
      me,
      session?.user,
      activeOrganization,
      refresh,
      setActiveOrganizationId,
      createOrganization,
      signOut,
    ],
  );

  return (
    <SessionContext.Provider value={value}>
      <ThemeProvider serverTheme={me?.theme ?? null}>{children}</ThemeProvider>
    </SessionContext.Provider>
  );
};

export const useSessionContext = () => {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSessionContext must be used within SessionProvider");
  return ctx;
};
