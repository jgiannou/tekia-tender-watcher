import { Redirect, Slot, useRouter, useSegments } from "expo-router";
import { useEffect } from "react";
import { useSessionContext } from "@/auth/SessionProvider";
import { LoadingState, Screen } from "@/components/ui";

export default function AuthLayout() {
  const { user, loading } = useSessionContext();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (user && segments[0] === "(auth)") {
      router.replace("/(app)/(tabs)");
    }
  }, [user, loading, segments, router]);

  if (loading) {
    return (
      <Screen>
        <LoadingState label="Έλεγχος συνεδρίας…" />
      </Screen>
    );
  }

  if (user) return <Redirect href="/(app)/(tabs)" />;

  return <Slot />;
}
