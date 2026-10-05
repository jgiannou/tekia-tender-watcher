import { Redirect } from "expo-router";
import { useSessionContext } from "@/auth/SessionProvider";
import { LoadingState, Screen } from "@/components/ui";

export default function Index() {
  const { user, loading } = useSessionContext();
  if (loading) {
    return (
      <Screen>
        <LoadingState />
      </Screen>
    );
  }
  return <Redirect href={user ? "/(app)/(tabs)" : "/(auth)/login"} />;
}
