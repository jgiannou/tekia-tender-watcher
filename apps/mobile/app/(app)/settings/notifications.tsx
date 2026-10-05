import { useCallback, useState } from "react";
import { Alert, ScrollView, Switch, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { useSessionContext } from "@/auth/SessionProvider";
import {
  Button,
  LoadingState,
  Screen,
  Subtitle,
  Title,
} from "@/components/ui";
import { saasApi, type NotificationPreferences } from "@/lib/api";
import { sendPushSelfTest } from "@/lib/push";
import { useTheme } from "@/theme/ThemeProvider";

export default function NotificationSettingsScreen() {
  const { colors } = useTheme();
  const {
    activeOrganization,
    mobilePushEnabled,
    setMobilePushEnabled,
  } = useSessionContext();
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [pushEnabled, setPushEnabled] = useState(mobilePushEnabled);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [testing, setTesting] = useState(false);

  const load = useCallback(async () => {
    if (!activeOrganization) return;
    try {
      const res = await saasApi.getSettings(activeOrganization.id);
      setPrefs(res.settings.notifications);
      setPushEnabled(mobilePushEnabled);
    } catch (err) {
      Alert.alert(
        "Σφάλμα",
        err instanceof Error ? err.message : "Αποτυχία φόρτωσης",
      );
    } finally {
      setLoading(false);
    }
  }, [activeOrganization, mobilePushEnabled]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load]),
  );

  const handleTogglePush = async (value: boolean) => {
    setPushBusy(true);
    setPushEnabled(value);
    try {
      await setMobilePushEnabled(value);
      Alert.alert(
        value ? "Push ενεργό" : "Push ανενεργό",
        value
          ? "Θα λαμβάνετε ειδοποιήσεις με ήχο στην οθόνη κλειδώματος."
          : "Οι mobile ειδοποιήσεις απενεργοποιήθηκαν.",
      );
    } catch (err) {
      setPushEnabled(!value);
      Alert.alert(
        "Σφάλμα",
        err instanceof Error ? err.message : "Αποτυχία ενημέρωσης push",
      );
    } finally {
      setPushBusy(false);
    }
  };

  const handleTestPush = async () => {
    setTesting(true);
    try {
      const result = await sendPushSelfTest();
      Alert.alert(
        result.mode === "remote" ? "Remote push OK" : "Τοπική δοκιμή OK",
        result.detail,
      );
    } catch (err) {
      Alert.alert(
        "Σφάλμα δοκιμής",
        err instanceof Error ? err.message : "Αποτυχία δοκιμής",
      );
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    if (!activeOrganization || !prefs) return;
    setSaving(true);
    try {
      await saasApi.updateNotifications(activeOrganization.id, prefs);
      Alert.alert("OK", "Οι προτιμήσεις ειδοποιήσεων αποθηκεύτηκαν.");
    } catch (err) {
      Alert.alert(
        "Σφάλμα",
        err instanceof Error ? err.message : "Αποτυχία αποθήκευσης",
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading || !prefs) {
    return (
      <Screen>
        <LoadingState />
      </Screen>
    );
  }

  const eventRows: Array<{
    key: keyof NotificationPreferences["events"];
    label: string;
  }> = [
    { key: "newOpportunity", label: "Νέες ευκαιρίες" },
    { key: "relatedActOnFollowed", label: "Σχετικές πράξεις" },
    { key: "postSubmissionUpdate", label: "Ενημερώσεις μετά την υποβολή" },
    { key: "deadlineRadar", label: "Radar προθεσμιών (Pro)" },
  ];

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
        <Title>Ειδοποιήσεις</Title>
        <Subtitle>
          Push στο κινητό (ήχος + οθόνη κλειδώματος) και email προτιμήσεις.
        </Subtitle>

        <View
          style={{
            borderRadius: 16,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.bgElevated,
            padding: 14,
            gap: 12,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontWeight: "700", fontSize: 15 }}>
                Push στο κινητό
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 4 }}>
                Νέα αιτήματα, εξελίξεις και προθεσμίες με ήχο στην lock screen.
              </Text>
            </View>
            <Switch
              value={pushEnabled}
              disabled={pushBusy}
              onValueChange={(value) => void handleTogglePush(value)}
              trackColor={{ true: colors.primary }}
            />
          </View>
          <Button
            label={testing ? "Δοκιμή…" : "Δοκιμή ειδοποίησης"}
            loading={testing}
            variant="secondary"
            onPress={() => void handleTestPush()}
          />
        </View>

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingVertical: 8,
          }}
        >
          <Text style={{ color: colors.text, flex: 1 }}>Email ειδοποιήσεις</Text>
          <Switch
            value={prefs.emailEnabled}
            onValueChange={(value) =>
              setPrefs((prev) => (prev ? { ...prev, emailEnabled: value } : prev))
            }
            trackColor={{ true: colors.primary }}
          />
        </View>
        {eventRows.map((row) => (
          <View
            key={row.key}
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingVertical: 8,
            }}
          >
            <Text style={{ color: colors.text, flex: 1 }}>{row.label}</Text>
            <Switch
              value={prefs.events[row.key]}
              onValueChange={(value) =>
                setPrefs((prev) =>
                  prev
                    ? {
                        ...prev,
                        events: { ...prev.events, [row.key]: value },
                      }
                    : prev,
                )
              }
              trackColor={{ true: colors.primary }}
            />
          </View>
        ))}
        <Button
          label={saving ? "Αποθήκευση…" : "Αποθήκευση email προτιμήσεων"}
          loading={saving}
          onPress={() => void handleSave()}
        />
      </ScrollView>
    </Screen>
  );
}
