import { useCallback, useState } from "react";
import { Alert, FlatList, RefreshControl, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSessionContext } from "@/auth/SessionProvider";
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  ListRow,
  LoadingState,
  Screen,
} from "@/components/ui";
import { saasApi, type AttentionEvent } from "@/lib/api";
import { formatRelative, tenderHref } from "@/lib/format";
import { useTheme } from "@/theme/ThemeProvider";

export default function NotificationsScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { activeOrganization } = useSessionContext();
  const [events, setEvents] = useState<AttentionEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!activeOrganization) return;
    setError(null);
    try {
      const res = await saasApi.attention(activeOrganization.id, { limit: 50 });
      setEvents(res.events);
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

  const handleMarkAll = async () => {
    if (!activeOrganization) return;
    try {
      await saasApi.markAllAttentionRead(activeOrganization.id);
      void load();
    } catch (err) {
      Alert.alert(
        "Σφάλμα",
        err instanceof Error ? err.message : "Αποτυχία ενημέρωσης",
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
      <View style={{ padding: 12 }}>
        <Button label="Σήμανση όλων ως διαβασμένα" variant="secondary" onPress={() => void handleMarkAll()} />
      </View>
      <FlatList
        data={events}
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
          <EmptyState title="Καμία ειδοποίηση" description="Είστε ενημερωμένοι." />
        }
        renderItem={({ item }) => {
          const ref =
            item.relatedTender?.referenceNumber ||
            item.organizationTender?.tender?.referenceNumber;
          const recordType =
            item.relatedTender?.recordType ||
            item.organizationTender?.tender?.recordType;
          return (
            <ListRow
              title={item.title || item.type}
              subtitle={formatRelative(item.createdAt)}
              meta={ref || undefined}
              onPress={() => {
                if (activeOrganization && !item.readAt) {
                  void saasApi.markAttentionRead(activeOrganization.id, item.id);
                }
                if (ref) router.push(tenderHref(recordType, ref));
              }}
              right={
                !item.readAt ? <Badge label="Νέο" tone="primary" /> : undefined
              }
            />
          );
        }}
      />
    </Screen>
  );
}
