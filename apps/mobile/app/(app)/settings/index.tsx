import { Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import { Card, Screen, Subtitle, Title } from "@/components/ui";
import { useTheme } from "@/theme/ThemeProvider";

const items = [
  { href: "/(app)/settings/profile", label: "Προφίλ" },
  { href: "/(app)/settings/appearance", label: "Εμφάνιση" },
  { href: "/(app)/settings/company", label: "Εταιρεία" },
  { href: "/(app)/settings/team", label: "Ομάδα" },
  { href: "/(app)/settings/activities", label: "Δραστηριότητες / ΚΑΔ" },
  { href: "/(app)/settings/notifications", label: "Ειδοποιήσεις" },
  { href: "/(app)/settings/legal", label: "Νομικά" },
] as const;

export default function SettingsIndexScreen() {
  const { colors } = useTheme();
  const router = useRouter();

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <Title>Ρυθμίσεις</Title>
        <Subtitle>Διαχείριση λογαριασμού, οργανισμού και προτιμήσεων.</Subtitle>
        {items.map((item) => (
          <Pressable
            key={item.href}
            accessibilityRole="button"
            accessibilityLabel={item.label}
            onPress={() => router.push(item.href)}
          >
            <Card>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <Text style={{ color: colors.text, fontWeight: "600", fontSize: 16 }}>
                  {item.label}
                </Text>
                <ChevronRight color={colors.textMuted} size={18} />
              </View>
            </Card>
          </Pressable>
        ))}
      </ScrollView>
    </Screen>
  );
}
