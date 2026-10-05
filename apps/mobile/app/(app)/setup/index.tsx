import { useCallback, useState } from "react";
import { Alert, ScrollView, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSessionContext } from "@/auth/SessionProvider";
import {
  Body,
  Button,
  Card,
  Field,
  LoadingState,
  Screen,
  Subtitle,
  Title,
} from "@/components/ui";
import { saasApi, type CompanyProfile, type OrgSettings } from "@/lib/api";

export default function SetupScreen() {
  const router = useRouter();
  const { activeOrganization, refresh } = useSessionContext();
  const [settings, setSettings] = useState<OrgSettings | null>(null);
  const [legalName, setLegalName] = useState("");
  const [afm, setAfm] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!activeOrganization) {
      setLoading(false);
      return;
    }
    try {
      const res = await saasApi.getSettings(activeOrganization.id);
      setSettings(res.settings);
      setLegalName(res.settings.company?.legalName || "");
      setAfm(res.settings.company?.afm || "");
    } catch (err) {
      Alert.alert(
        "Σφάλμα",
        err instanceof Error ? err.message : "Αποτυχία φόρτωσης",
      );
    } finally {
      setLoading(false);
    }
  }, [activeOrganization]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load]),
  );

  const handleSave = async () => {
    if (!activeOrganization) return;
    setSaving(true);
    try {
      const company: Partial<CompanyProfile> = {
        legalName: legalName.trim(),
        afm: afm.trim() || null,
      };
      await saasApi.updateCompany(activeOrganization.id, company);
      await saasApi.updateOnboarding(activeOrganization.id, "COMPLETED");
      await refresh();
      Alert.alert("OK", "Η ρύθμιση ολοκληρώθηκε.");
      router.replace("/(app)/(tabs)");
    } catch (err) {
      Alert.alert(
        "Σφάλμα",
        err instanceof Error ? err.message : "Αποτυχία αποθήκευσης",
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Screen>
        <LoadingState />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
        <Title>Ρύθμιση επιχείρησης</Title>
        <Subtitle>
          Συμπληρώστε τα βασικά στοιχεία για καλύτερο matching και παρακολούθηση.
        </Subtitle>
        <Card>
          <Body muted>
            Onboarding: {settings?.onboardingStatus || "NOT_STARTED"}
          </Body>
        </Card>
        <Field
          label="Επωνυμία"
          value={legalName}
          onChangeText={setLegalName}
        />
        <Field label="ΑΦΜ" value={afm} onChangeText={setAfm} keyboardType="number-pad" />
        <View style={{ gap: 10 }}>
          <Button
            label={saving ? "Αποθήκευση…" : "Ολοκλήρωση setup"}
            loading={saving}
            onPress={() => void handleSave()}
          />
          <Button
            label="Αργότερα"
            variant="ghost"
            onPress={() => router.replace("/(app)/(tabs)")}
          />
        </View>
      </ScrollView>
    </Screen>
  );
}
