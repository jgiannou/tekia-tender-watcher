import { Alert, ScrollView, View } from "react-native";
import { Button, Screen, Subtitle, Title } from "@/components/ui";
import { useTheme } from "@/theme/ThemeProvider";
import type { ThemePreference } from "@/lib/api";

export default function AppearanceSettingsScreen() {
  const { theme, setTheme } = useTheme();

  const handleSelect = async (next: ThemePreference) => {
    try {
      await setTheme(next);
    } catch (err) {
      Alert.alert(
        "Σφάλμα",
        err instanceof Error ? err.message : "Αποτυχία αποθήκευσης",
      );
    }
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
        <Title>Εμφάνιση</Title>
        <Subtitle>Επιλέξτε θέμα εμφάνισης της εφαρμογής.</Subtitle>
        <View style={{ gap: 10 }}>
          {(
            [
              ["DARK", "Σκοτεινό"],
              ["LIGHT", "Φωτεινό"],
              ["SYSTEM", "Σύστημα"],
            ] as const
          ).map(([value, label]) => (
            <Button
              key={value}
              label={`${label}${theme === value ? " ✓" : ""}`}
              variant={theme === value ? "primary" : "secondary"}
              onPress={() => void handleSelect(value)}
            />
          ))}
        </View>
      </ScrollView>
    </Screen>
  );
}
