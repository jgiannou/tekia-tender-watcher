import { useCallback, useState } from "react";
import { Alert, FlatList, RefreshControl, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSessionContext } from "@/auth/SessionProvider";
import { TenderCard } from "@/components/TenderCard";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  Screen,
} from "@/components/ui";
import { saasApi, type Opportunity } from "@/lib/api";
import { formatDay, formatMoney, tenderHref } from "@/lib/format";
import { useTheme } from "@/theme/ThemeProvider";

export default function OpportunitiesScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { activeOrganization } = useSessionContext();
  const [items, setItems] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!activeOrganization) return;
    setError(null);
    try {
      const res = await saasApi.listOpportunities(activeOrganization.id, {
        limit: 50,
      });
      setItems(res.opportunities);
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

  const handleFollow = async (opportunity: Opportunity) => {
    if (!activeOrganization) return;
    try {
      await saasApi.followTender(activeOrganization.id, opportunity.tender.id);
      Alert.alert("OK", "Προστέθηκε στα παρακολουθούμενα.");
      void load();
    } catch (err) {
      Alert.alert(
        "Σφάλμα",
        err instanceof Error ? err.message : "Αποτυχία follow",
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
      <FlatList
        data={items}
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
              {items.length} ευκαιρ{items.length === 1 ? "ία" : "ίες"}
            </Text>
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            title="Καμία ευκαιρία"
            description="Όταν τα προφίλ σας βρουν matches, θα εμφανιστούν εδώ."
          />
        }
        renderItem={({ item }) => (
          <TenderCard
            reference={item.tender.referenceNumber}
            title={item.tender.title}
            authority={item.tender.contractingAuthority}
            budgetLabel={formatMoney(item.tender.budgetWithoutVat)}
            deadlineLabel={formatDay(
              item.tender.finalSubmissionDate || item.tender.submissionDate,
            )}
            recordType={item.tender.recordType}
            statusLabel={item.following ? "Following" : undefined}
            score={item.score}
            actionLabel={item.following ? undefined : "Follow"}
            onActionPress={
              item.following ? undefined : () => void handleFollow(item)
            }
            onPress={() =>
              router.push(
                tenderHref(item.tender.recordType, item.tender.referenceNumber),
              )
            }
          />
        )}
      />
    </Screen>
  );
}
