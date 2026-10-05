import { useCallback, useState } from "react";
import { FlatList, RefreshControl, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSessionContext } from "@/auth/SessionProvider";
import { TenderCard } from "@/components/TenderCard";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  Screen,
} from "@/components/ui";
import { saasApi, type MonitoringPipelineRow } from "@/lib/api";
import { formatDay, tenderHref } from "@/lib/format";
import { useTheme } from "@/theme/ThemeProvider";

export default function MonitoringScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { activeOrganization } = useSessionContext();
  const [rows, setRows] = useState<MonitoringPipelineRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!activeOrganization) return;
    setError(null);
    try {
      const res = await saasApi.monitoringState(activeOrganization.id);
      setRows(
        res.organizationTenders.filter(
          (row) => row.following || row.monitoringActive,
        ),
      );
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
      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingTop: 12, paddingBottom: 28 }}
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
        ListHeaderComponent={
          <View style={{ paddingHorizontal: 16, marginBottom: 8 }}>
            <Text style={{ color: colors.textMuted, fontSize: 13 }}>
              {rows.length} παρακολουθούμεν
              {rows.length === 1 ? "ο" : "α"}
            </Text>
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            title="Κενό"
            description="Ακολουθήστε διαγωνισμούς από τις Ευκαιρίες ή την Αναζήτηση."
          />
        }
        renderItem={({ item }) => (
          <TenderCard
            reference={item.tender?.referenceNumber || item.tenderId}
            title={item.tender?.title}
            authority={item.tender?.contractingAuthority}
            deadlineLabel={formatDay(item.tender?.finalSubmissionDate)}
            recordType={item.tender?.recordType}
            statusLabel={[
              item.stageLabel || item.pipelineStage,
              item.nextAction?.label,
            ]
              .filter(Boolean)
              .join(" · ")}
            onPress={() =>
              router.push(
                tenderHref(
                  item.tender?.recordType,
                  item.tender?.referenceNumber || item.tenderId,
                ),
              )
            }
          />
        )}
      />
    </Screen>
  );
}
