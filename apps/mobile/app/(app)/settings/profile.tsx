import { useState } from "react";
import { Alert, ScrollView } from "react-native";
import { useSessionContext } from "@/auth/SessionProvider";
import { Button, Field, Screen, Subtitle, Title } from "@/components/ui";
import { saasApi } from "@/lib/api";

export default function ProfileSettingsScreen() {
  const { user, refresh } = useSessionContext();
  const [name, setName] = useState(user?.name || "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await saasApi.updateProfile(name.trim());
      await refresh();
      Alert.alert("OK", "Το προφίλ ενημερώθηκε.");
    } catch (err) {
      Alert.alert(
        "Σφάλμα",
        err instanceof Error ? err.message : "Αποτυχία αποθήκευσης",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
        <Title>Προφίλ</Title>
        <Subtitle>{user?.email}</Subtitle>
        <Field label="Ονοματεπώνυμο" value={name} onChangeText={setName} />
        <Button
          label={saving ? "Αποθήκευση…" : "Αποθήκευση"}
          loading={saving}
          onPress={() => void handleSave()}
        />
      </ScrollView>
    </Screen>
  );
}
