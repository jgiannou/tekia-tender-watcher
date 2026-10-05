import { useCallback, useState } from "react";
import { Alert, FlatList, RefreshControl, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { useSessionContext } from "@/auth/SessionProvider";
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Field,
  ListRow,
  LoadingState,
  Screen,
} from "@/components/ui";
import { saasApi, type WatchProfile } from "@/lib/api";
import { formatRelative } from "@/lib/format";
import { useTheme } from "@/theme/ThemeProvider";

export default function SavedSearchesScreen() {
  const { colors } = useTheme();
  const { activeOrganization } = useSessionContext();
  const [profiles, setProfiles] = useState<WatchProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [name, setName] = useState("");
  const [keywords, setKeywords] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    if (!activeOrganization) return;
    setError(null);
    try {
      const res = await saasApi.listWatchProfiles(activeOrganization.id);
      setProfiles(res.profiles);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Αποτυχία φόρτωσης");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeOrganization]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load]),
  );

  const handleCreate = async () => {
    if (!activeOrganization || !name.trim()) return;
    setCreating(true);
    try {
      await saasApi.createWatchProfile(activeOrganization.id, {
        name: name.trim(),
        keywords: keywords
          .split(",")
          .map((k) => k.trim())
          .filter(Boolean),
        enabled: true,
        matchingMode: "BALANCED",
      });
      setName("");
      setKeywords("");
      void load();
    } catch (err) {
      Alert.alert(
        "Σφάλμα",
        err instanceof Error ? err.message : "Αποτυχία δημιουργίας",
      );
    } finally {
      setCreating(false);
    }
  };

  const handleToggle = async (profile: WatchProfile) => {
    if (!activeOrganization) return;
    try {
      await saasApi.setWatchProfileEnabled(
        activeOrganization.id,
        profile.id,
        !profile.enabled,
      );
      void load();
    } catch (err) {
      Alert.alert(
        "Σφάλμα",
        err instanceof Error ? err.message : "Αποτυχία ενημέρωσης",
      );
    }
  };

  const handleScan = async (profile: WatchProfile) => {
    if (!activeOrganization) return;
    try {
      await saasApi.scanWatchProfile(activeOrganization.id, profile.id);
      Alert.alert("OK", "Η σάρωση ξεκίνησε.");
      void load();
    } catch (err) {
      Alert.alert(
        "Σφάλμα",
        err instanceof Error ? err.message : "Αποτυχία σάρωσης",
      );
    }
  };

  if (loading) {
    return (
      <Screen>
        <LoadingState />
      </Screen>
    );
  }
  if (error) {
    return (
      <Screen>
        <ErrorState message={error} onRetry={() => void load()} />
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={{ padding: 12, gap: 8 }}>
        <Field label="Όνομα προφίλ" value={name} onChangeText={setName} />
        <Field
          label="Λέξεις-κλειδιά (κόμμα)"
          value={keywords}
          onChangeText={setKeywords}
        />
        <Button
          label={creating ? "Δημιουργία…" : "Νέο προφίλ"}
          loading={creating}
          onPress={() => void handleCreate()}
        />
      </View>
      <FlatList
        data={profiles}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={colors.primary}
            onRefresh={() => {
              setRefreshing(true);
              void load();
            }}
          />
        }
        ListEmptyComponent={
          <EmptyState
            title="Χωρίς προφίλ"
            description="Δημιουργήστε αποθηκευμένες αναζητήσεις για αυτόματη παρακολούθηση."
          />
        }
        renderItem={({ item }) => (
          <ListRow
            title={item.name}
            subtitle={`Τελευταία σάρωση: ${formatRelative(item.lastScannedAt)}`}
            meta={item.scanState || undefined}
            right={
              <View style={{ gap: 6, width: 110 }}>
                <Badge
                  label={item.enabled ? "Ενεργό" : "Ανενεργό"}
                  tone={item.enabled ? "success" : "default"}
                />
                <Button
                  label={item.enabled ? "Pause" : "Enable"}
                  variant="secondary"
                  onPress={() => void handleToggle(item)}
                />
                <Button
                  label="Scan"
                  variant="ghost"
                  onPress={() => void handleScan(item)}
                />
              </View>
            }
          />
        )}
      />
    </Screen>
  );
}
