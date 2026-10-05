import { Redirect, Stack } from "expo-router";
import { useSessionContext } from "@/auth/SessionProvider";
import { LoadingState, Screen } from "@/components/ui";
import { useTheme } from "@/theme/ThemeProvider";

export default function AppLayout() {
  const { user, loading } = useSessionContext();
  const { colors } = useTheme();

  if (loading) {
    return (
      <Screen>
        <LoadingState label="Φόρτωση εφαρμογής…" />
      </Screen>
    );
  }

  if (!user) return <Redirect href="/(auth)/login" />;

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.bgElevated },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: "700" },
        headerBackTitle: "Πίσω",
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen
        name="(tabs)"
        options={{
          headerShown: false,
          // Prevent iOS back button from showing the route group name "(tabs)"
          title: "Αρχική",
        }}
      />
      <Stack.Screen name="notifications/index" options={{ title: "Ειδοποιήσεις" }} />
      <Stack.Screen name="submissions/index" options={{ title: "Υποβολές" }} />
      <Stack.Screen name="documents/index" options={{ title: "Έγγραφα" }} />
      <Stack.Screen
        name="saved-searches/index"
        options={{ title: "Αποθηκευμένες Αναζητήσεις" }}
      />
      <Stack.Screen name="subscription/index" options={{ title: "Συνδρομή" }} />
      <Stack.Screen name="setup/index" options={{ title: "Ρύθμιση επιχείρησης" }} />
      <Stack.Screen name="settings/index" options={{ title: "Ρυθμίσεις" }} />
      <Stack.Screen name="settings/profile" options={{ title: "Προφίλ" }} />
      <Stack.Screen name="settings/appearance" options={{ title: "Εμφάνιση" }} />
      <Stack.Screen name="settings/company" options={{ title: "Εταιρεία" }} />
      <Stack.Screen name="settings/team" options={{ title: "Ομάδα" }} />
      <Stack.Screen name="settings/activities" options={{ title: "Δραστηριότητες" }} />
      <Stack.Screen name="settings/notifications" options={{ title: "Ειδοποιήσεις" }} />
      <Stack.Screen name="settings/legal" options={{ title: "Νομικά" }} />
    </Stack>
  );
}
