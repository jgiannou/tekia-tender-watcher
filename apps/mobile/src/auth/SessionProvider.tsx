import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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
import {
  registerForPushNotifications,
  unregisterPushNotifications,
  attachPushResponseListeners,
} from "@/lib/push";
import * as Linking from "expo-linking";

type SessionContextValue = {
  loading: boolean;
  error: string | null;
  userId: string | null;
  user: SaasUser | null;
  theme: ThemePreference | null;
  mobilePushEnabled: boolean;
  gemiConfigured: boolean;
  organizations: SaasOrganization[];
  activeOrganization: SaasOrganization | null;
  refresh: () => Promise<void>;
  setActiveOrganizationId: (organizationId: string) => Promise<void>;
  createOrganization: (name: string) => Promise<{ id: string; name: string }>;
  setMobilePushEnabled: (enabled: boolean) => Promise<void>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export const SessionProvider = ({ children }: { children: ReactNode }) => {
  const { data: session, isPending: authPending } = authClient.useSession();
  const [me, setMe] = useState<SaasMeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const meRef = useRef<SaasMeResponse | null>(null);
  meRef.current = me;

  const refresh = useCallback(async () => {
    if (!session?.user) {
      setMe(null);
      setLoading(false);
      return;
    }
    if (!meRef.current) setLoading(true);
    setError(null);
    try {
      const next = await saasApi.me();
      setMe(next);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Αποτυχία φόρτωσης συνεδρίας",
      );
      if (!meRef.current) setMe(null);
    } finally {
      setLoading(false);
    }
  }, [session?.user]);

  useEffect(() => {
    if (authPending) return;
    void refresh();
  }, [authPending, refresh]);

  useEffect(() => {
    if (!me?.userId) return;
    if (me.mobilePushEnabled === false) return;
    void registerForPushNotifications().catch(() => undefined);
  }, [me?.userId, me?.mobilePushEnabled]);

  useEffect(() => {
    return attachPushResponseListeners((url) => {
      void Linking.openURL(url).catch(() => undefined);
    });
  }, []);

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

  const setMobilePushEnabled = useCallback(
    async (enabled: boolean) => {
      await saasApi.setMobilePushEnabled(enabled);
      if (enabled) {
        await registerForPushNotifications().catch(() => undefined);
      } else {
        await unregisterPushNotifications().catch(() => undefined);
      }
      await refresh();
    },
    [refresh],
  );

  const signOut = useCallback(async () => {
    await unregisterPushNotifications().catch(() => undefined);
    await authClient.signOut();
    setMe(null);
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({
      loading: authPending || (loading && !me),
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
      mobilePushEnabled: me?.mobilePushEnabled !== false,
      gemiConfigured: me?.gemiConfigured ?? false,
      organizations: me?.organizations ?? [],
      activeOrganization,
      refresh,
      setActiveOrganizationId,
      createOrganization,
      setMobilePushEnabled,
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
      setMobilePushEnabled,
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
  if (!ctx) {
    throw new Error("useSessionContext must be used within SessionProvider");
  }
  return ctx;
};
