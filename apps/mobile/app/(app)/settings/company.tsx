import { useCallback, useState } from "react";
import { Alert, ScrollView } from "react-native";
import { useFocusEffect } from "expo-router";
import { useSessionContext } from "@/auth/SessionProvider";
import {
  Button,
  Field,
  LoadingState,
  Screen,
  Subtitle,
  Title,
} from "@/components/ui";
import { saasApi } from "@/lib/api";

export default function CompanySettingsScreen() {
  const { activeOrganization } = useSessionContext();
  const [legalName, setLegalName] = useState("");
  const [afm, setAfm] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!activeOrganization) return;
    try {
      const res = await saasApi.getSettings(activeOrganization.id);
      setLegalName(res.settings.company?.legalName || "");
      setAfm(res.settings.company?.afm || "");
      setEmail(res.settings.company?.email || "");
      setPhone(res.settings.company?.phone || "");
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
      await saasApi.updateCompany(activeOrganization.id, {
        legalName: legalName.trim(),
        afm: afm.trim() || null,
        email: email.trim() || null,
        phone: phone.trim() || null,
      });
      Alert.alert("OK", "Τα στοιχεία εταιρείας ενημερώθηκαν.");
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
        <Title>Εταιρεία</Title>
        <Subtitle>Στοιχεία οργανισμού για προφίλ και έγγραφα.</Subtitle>
        <Field label="Επωνυμία" value={legalName} onChangeText={setLegalName} />
        <Field label="ΑΦΜ" value={afm} onChangeText={setAfm} />
        <Field
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <Field label="Τηλέφωνο" value={phone} onChangeText={setPhone} />
        <Button
          label={saving ? "Αποθήκευση…" : "Αποθήκευση"}
          loading={saving}
          onPress={() => void handleSave()}
        />
      </ScrollView>
    </Screen>
  );
}
