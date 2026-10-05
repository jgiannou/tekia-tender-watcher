import { useCallback, useState } from "react";
import {
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSessionContext } from "@/auth/SessionProvider";
import {
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  Screen,
} from "@/components/ui";
import { saasApi, type SaasOverview } from "@/lib/api";
import { formatDay, formatRelative, tenderHref } from "@/lib/format";
import { useTheme } from "@/theme/ThemeProvider";

export default function OverviewScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { activeOrganization, user, createOrganization } = useSessionContext();
  const [overview, setOverview] = useState<SaasOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (silent?: boolean) => {
      if (!activeOrganization) {
        setLoading(false);
        return;
      }
      if (!silent) setLoading(true);
      setError(null);
      try {
        const data = await saasApi.loadOverview(
          activeOrganization.id,
          user?.name,
        );
        setOverview(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Αποτυχία φόρτωσης");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [activeOrganization, user?.name],
  );

  useFocusEffect(
    useCallback(() => {
      void load(true);
    }, [load]),
  );

  if (!activeOrganization) {
    return (
      <Screen>
        <View style={{ flex: 1, padding: 24, justifyContent: "center", gap: 16 }}>
          <Text style={{ color: colors.text, fontSize: 24, fontWeight: "800" }}>
            Καλωσήρθατε
          </Text>
          <Text style={{ color: colors.textMuted, lineHeight: 20 }}>
            Δημιουργήστε οργανισμό για να ξεκινήσετε την παρακολούθηση.
          </Text>
          <Button
            label="Δημιουργία οργανισμού"
            onPress={() => {
              void createOrganization("Η επιχείρησή μου").then(() =>
                router.push("/(app)/setup"),
              );
            }}
          />
        </View>
      </Screen>
    );
  }

  if (loading && !overview) {
    return (
      <Screen>
        <LoadingState />
      </Screen>
    );
  }

  if (error && !overview) {
    return (
      <Screen>
        <ErrorState message={error} onRetry={() => void load()} />
      </Screen>
    );
  }

  const metrics = overview?.metrics;
  const greeting = overview?.greetingName || user?.name;

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={colors.primary}
            onRefresh={() => {
              setRefreshing(true);
              void load(true);
            }}
          />
        }
      >
        <Text style={{ color: colors.text, fontSize: 26, fontWeight: "800" }}>
          {greeting ? `Γεια σας, ${greeting}` : "Γεια σας"}
        </Text>
        <Text
          style={{
            color: colors.textMuted,
            fontSize: 14,
            marginTop: 6,
            marginBottom: 18,
          }}
        >
          Συνεχής παρακολούθηση ΚΗΜΔΗΣ για την ομάδα σας.
        </Text>

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          {[
            {
              label: "Νέες ευκαιρίες",
              value: metrics?.newOpportunities ?? 0,
              href: "/(app)/(tabs)/opportunities" as const,
            },
            {
              label: "Παρακολούθηση",
              value: metrics?.monitoringActive ?? 0,
              href: "/(app)/(tabs)/monitoring" as const,
            },
            {
              label: "Προφίλ",
              value: overview?.watchUsage?.active ?? 0,
              href: "/(app)/saved-searches" as const,
            },
            {
              label: "Υποβολές",
              value: metrics?.submissionsActive ?? 0,
              href: "/(app)/submissions" as const,
            },
          ].map((item) => (
            <TouchableOpacity
              key={item.label}
              activeOpacity={0.88}
              onPress={() => router.push(item.href)}
              style={{
                width: "47%",
                minWidth: 140,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.bgElevated,
                padding: 16,
              }}
            >
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                {item.label}
              </Text>
              <Text
                style={{
                  color: colors.primary,
                  fontSize: 30,
                  fontWeight: "800",
                  marginTop: 6,
                }}
              >
                {item.value}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Section title="Επόμενες ενέργειες" colors={colors}>
          {(overview?.nextActions?.length ?? 0) === 0 ? (
            <Text style={{ color: colors.textMuted }}>
              Δεν υπάρχουν επείγουσες ενέργειες.
            </Text>
          ) : (
            overview?.nextActions.map((action) => (
              <TouchableOpacity
                key={action.id}
                activeOpacity={0.85}
                onPress={() =>
                  router.push(
                    tenderHref(action.recordType, action.referenceNumber),
                  )
                }
                style={{
                  paddingVertical: 12,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.border,
                  gap: 4,
                }}
              >
                <Text style={{ color: colors.text, fontWeight: "700", fontSize: 15 }}>
                  {action.actionLabel || "Ενέργεια"}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                  {action.referenceNumber} · {action.title || "Χωρίς τίτλο"}
                </Text>
              </TouchableOpacity>
            ))
          )}
        </Section>

        <Section
          title={`Προθεσμίες (7ημ.) · ${overview?.deadlines?.length ?? 0}`}
          colors={colors}
        >
          {(overview?.deadlines?.length ?? 0) === 0 ? (
            <Text style={{ color: colors.textMuted }}>
              Καμία προθεσμία αυτή την εβδομάδα.
            </Text>
          ) : (
            overview?.deadlines.map((d) => (
              <TouchableOpacity
                key={d.tenderId}
                activeOpacity={0.85}
                onPress={() =>
                  router.push(tenderHref("REQ", d.referenceNumber))
                }
                style={{
                  paddingVertical: 12,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.border,
                  gap: 4,
                }}
              >
                <Text style={{ color: colors.text, fontWeight: "700" }}>
                  {d.referenceNumber}
                </Text>
                <Text style={{ color: colors.warning, fontSize: 13 }}>
                  {formatDay(d.finalSubmissionDate)} · {d.daysRemaining} ημέρες
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                  {d.title || "Χωρίς τίτλο"}
                </Text>
              </TouchableOpacity>
            ))
          )}
        </Section>

        <Section title="Πρόσφατη προσοχή" colors={colors}>
          {(overview?.attention?.length ?? 0) === 0 ? (
            <EmptyState title="Καθαρά" description="Καμία νέα ειδοποίηση." />
          ) : (
            overview?.attention.slice(0, 6).map((event) => (
              <TouchableOpacity
                key={event.id}
                activeOpacity={0.85}
                onPress={() => router.push("/(app)/notifications")}
                style={{
                  paddingVertical: 12,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.border,
                  gap: 4,
                }}
              >
                <Text style={{ color: colors.text, fontWeight: "700" }}>
                  {event.title || event.type}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                  {formatRelative(event.createdAt)}
                </Text>
              </TouchableOpacity>
            ))
          )}
          <View style={{ marginTop: 12 }}>
            <Button
              label="Όλες οι ειδοποιήσεις"
              variant="secondary"
              onPress={() => router.push("/(app)/notifications")}
            />
          </View>
        </Section>
      </ScrollView>
    </Screen>
  );
}

const Section = ({
  title,
  children,
  colors,
}: {
  title: string;
  children: React.ReactNode;
  colors: { text: string; border: string; bgElevated: string };
}) => (
  <View
    style={{
      marginTop: 16,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bgElevated,
      padding: 14,
    }}
  >
    <Text
      style={{
        color: colors.text,
        fontWeight: "800",
        fontSize: 16,
        marginBottom: 8,
      }}
    >
      {title}
    </Text>
    {children}
  </View>
);
