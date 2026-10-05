import { useCallback, useState } from "react";
import { FlatList, RefreshControl } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSessionContext } from "@/auth/SessionProvider";
import {
  Badge,
  EmptyState,
  ErrorState,
  ListRow,
  LoadingState,
  Screen,
} from "@/components/ui";
import { saasApi, type FormalSubmissionRow } from "@/lib/api";
import { formatDay, formatMoney, tenderHref } from "@/lib/format";
import { useTheme } from "@/theme/ThemeProvider";

export default function SubmissionsScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { activeOrganization } = useSessionContext();
  const [rows, setRows] = useState<FormalSubmissionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!activeOrganization) return;
    setError(null);
    try {
      const res = await saasApi.listSubmissions(activeOrganization.id);
      setRows(res.submissions);
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
            title="Καμία υποβολή"
            description="Οι επίσημες υποβολές θα εμφανιστούν εδώ."
          />
        }
        renderItem={({ item }) => (
          <ListRow
            title={item.tender.referenceNumber}
            subtitle={item.tender.title}
            meta={`${formatDay(item.submittedAt)} · ${formatMoney(item.amountWithoutVat)}`}
            onPress={() =>
              router.push(
                tenderHref(item.tender.recordType, item.tender.referenceNumber),
              )
            }
            right={<Badge label={item.result || item.submissionMethod} />}
          />
        )}
      />
    </Screen>
  );
}
