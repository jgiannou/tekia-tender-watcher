import { Linking, ScrollView, Text } from "react-native";
import { Body, Button, Card, Screen, Subtitle, Title } from "@/components/ui";
import { useTheme } from "@/theme/ThemeProvider";

export default function LegalSettingsScreen() {
  const { colors } = useTheme();
  const appUrl = (
    process.env.EXPO_PUBLIC_SAAS_APP_URL || "http://127.0.0.1:5174"
  ).replace(/\/$/, "");

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
        <Title>Νομικά</Title>
        <Subtitle>Όροι χρήσης και πολιτική απορρήτου ARC Tenders.</Subtitle>
        <Card>
          <Body>
            Τα νομικά κείμενα ανοίγουν στο web για την πιο ενημερωμένη έκδοση.
          </Body>
        </Card>
        <Button
          label="Όροι Χρήσης"
          variant="secondary"
          onPress={() =>
            void Linking.openURL(`${appUrl}/legal/terms`).catch(() => undefined)
          }
        />
        <Button
          label="Πολιτική Απορρήτου"
          variant="secondary"
          onPress={() =>
            void Linking.openURL(`${appUrl}/legal/privacy`).catch(
              () => undefined,
            )
          }
        />
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>
          Source: {appUrl}
        </Text>
      </ScrollView>
    </Screen>
  );
}
