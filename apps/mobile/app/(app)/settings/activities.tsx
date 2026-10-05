import { useCallback, useState } from "react";
import { Alert, ScrollView } from "react-native";
import { useFocusEffect } from "expo-router";
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
import { saasApi } from "@/lib/api";
import type { OrganizationActivity } from "@/lib/api";

export default function ActivitiesSettingsScreen() {
  const { activeOrganization } = useSessionContext();
  const [activities, setActivities] = useState<OrganizationActivity[]>([]);
  const [kad, setKad] = useState("");
  const [label, setLabel] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!activeOrganization) return;
    try {
      const res = await saasApi.getSettings(activeOrganization.id);
      setActivities(res.settings.activities || []);
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

  const handleAdd = () => {
    if (!kad.trim()) return;
      setActivities((prev) => [
      ...prev,
      {
        code: kad.trim(),
        description: label.trim() || kad.trim(),
        isPrimary: prev.length === 0,
        source: "MANUAL",
      },
    ]);
    setKad("");
    setLabel("");
  };

  const handleSave = async () => {
    if (!activeOrganization) return;
    setSaving(true);
    try {
      await saasApi.updateActivities(activeOrganization.id, activities);
      Alert.alert("OK", "Οι δραστηριότητες αποθηκεύτηκαν.");
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
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <Title>Δραστηριότητες / ΚΑΔ</Title>
        <Subtitle>Χρησιμοποιούνται για προτάσεις watch profiles.</Subtitle>
        {activities.map((activity, index) => (
          <Card key={`${activity.code}-${index}`}>
            <Body>
              {activity.code} — {activity.description}
              {activity.isPrimary ? " (κύρια)" : ""}
            </Body>
          </Card>
        ))}
        <Field label="ΚΑΔ" value={kad} onChangeText={setKad} />
        <Field label="Περιγραφή" value={label} onChangeText={setLabel} />
        <Button label="Προσθήκη" variant="secondary" onPress={handleAdd} />
        <Button
          label={saving ? "Αποθήκευση…" : "Αποθήκευση"}
          loading={saving}
          onPress={() => void handleSave()}
        />
      </ScrollView>
    </Screen>
  );
}
