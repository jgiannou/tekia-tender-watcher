import { useCallback, useState } from "react";
import {
  Alert,
  Linking,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { useSessionContext } from "@/auth/SessionProvider";
import {
  ErrorState,
  LoadingState,
  Screen,
} from "@/components/ui";
import { saasApi, type KimdisSearchItem, type TenderWorkflow } from "@/lib/api";
import { formatDay, formatMoney } from "@/lib/format";
import { useTheme } from "@/theme/ThemeProvider";

export default function TenderDetailScreen() {
  const { colors } = useTheme();
  const { activeOrganization } = useSessionContext();
  const params = useLocalSearchParams<{ recordType: string; adam: string }>();
  const recordType =
    params.recordType === "PROC" || params.recordType === "REQ"
      ? params.recordType
      : "REQ";
  const adam = decodeURIComponent(String(params.adam || ""));
  const [item, setItem] = useState<KimdisSearchItem | null>(null);
  const [tenderId, setTenderId] = useState<string | null>(null);
  const [workflow, setWorkflow] = useState<TenderWorkflow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!activeOrganization || !adam) return;
    setError(null);
    try {
      const res = await saasApi.getKimdisRecord(
        activeOrganization.id,
        recordType,
        adam,
      );
      setItem(res.item);
      setTenderId(res.tender.id);
      try {
        const wf = await saasApi.getTenderWorkflow(
          activeOrganization.id,
          res.tender.id,
        );
        setWorkflow(wf.workflow);
      } catch {
        setWorkflow(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Αποτυχία φόρτωσης");
    } finally {
      setLoading(false);
    }
  }, [activeOrganization, adam, recordType]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load]),
  );

  const handleFollow = async () => {
    if (!activeOrganization || !tenderId) return;
    setBusy(true);
    try {
      await saasApi.followTender(activeOrganization.id, tenderId);
      Alert.alert("OK", "Προστέθηκε στα παρακολουθούμενα.");
      void load();
    } catch (err) {
      Alert.alert(
        "Σφάλμα",
        err instanceof Error ? err.message : "Αποτυχία follow",
      );
    } finally {
      setBusy(false);
    }
  };

  const handleUnfollow = async () => {
    if (!activeOrganization || !tenderId) return;
    setBusy(true);
    try {
      await saasApi.unfollowTender(activeOrganization.id, tenderId);
      Alert.alert("OK", "Αφαιρέθηκε από την παρακολούθηση.");
      void load();
    } catch (err) {
      Alert.alert(
        "Σφάλμα",
        err instanceof Error ? err.message : "Αποτυχία unfollow",
      );
    } finally {
      setBusy(false);
    }
  };

  const handleDismiss = async () => {
    if (!activeOrganization || !tenderId) return;
    setBusy(true);
    try {
      await saasApi.dismissTender(
        activeOrganization.id,
        tenderId,
        "NOT_INTERESTED",
      );
      Alert.alert("OK", "Απορρίφθηκε.");
      void load();
    } catch (err) {
      Alert.alert(
        "Σφάλμα",
        err instanceof Error ? err.message : "Αποτυχία dismiss",
      );
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <Screen>
        <LoadingState />
      </Screen>
    );
  }
  if (error || !item) {
    return (
      <Screen>
        <ErrorState
          message={error || "Δεν βρέθηκε η πράξη"}
          onRetry={() => void load()}
        />
      </Screen>
    );
  }

  const following = Boolean(workflow?.organizationTender?.following);

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 48, gap: 14 }}
      >
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <Chip label={item.recordType} color={colors.primary} />
          <Chip label={item.openState || "UNKNOWN"} color={colors.textMuted} />
          {following ? <Chip label="Following" color={colors.success} /> : null}
        </View>

        <Text style={{ color: colors.primary, fontWeight: "800", fontSize: 13 }}>
          {item.adam || adam}
        </Text>
        <Text
          style={{
            color: colors.text,
            fontSize: 22,
            fontWeight: "800",
            lineHeight: 30,
          }}
        >
          {item.title?.trim() || "Χωρίς τίτλο"}
        </Text>
        <Text style={{ color: colors.textMuted, fontSize: 14, lineHeight: 20 }}>
          {item.contractingAuthority?.trim() || "Χωρίς αναθέτουσα αρχή"}
        </Text>

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
          <DetailRow
            label="Προϋπολογισμός"
            value={formatMoney(item.budgetWithoutVat)}
          />
          <DetailRow
            label="Προθεσμία"
            value={formatDay(item.finalSubmissionDate || item.submissionDate)}
          />
          <DetailRow label="Υπογραφή" value={formatDay(item.signedDate)} />
          <DetailRow
            label="Διαδικασία"
            value={item.procedureType || item.contractTypeLabel || "—"}
          />
        </View>

        {workflow ? (
          <View
            style={{
              borderRadius: 16,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.bgElevated,
              padding: 14,
              gap: 8,
            }}
          >
            <Text style={{ color: colors.text, fontWeight: "800", fontSize: 15 }}>
              Επόμενο βήμα
            </Text>
            <Text style={{ color: colors.primary, fontWeight: "700" }}>
              {workflow.nextAction?.label ||
                workflow.organizationTender?.pipelineStage ||
                "—"}
            </Text>
            <Text style={{ color: colors.textMuted, lineHeight: 20 }}>
              {workflow.nextAction?.description ||
                "Δεν υπάρχει επιπλέον περιγραφή."}
            </Text>
          </View>
        ) : null}

        <ActionButton
          label={busy ? "…" : following ? "Unfollow" : "Follow"}
          tone="primary"
          disabled={busy}
          onPress={() => void (following ? handleUnfollow() : handleFollow())}
        />
        <ActionButton
          label="Dismiss"
          tone="danger"
          disabled={busy}
          onPress={() => void handleDismiss()}
        />
        {item.publicKimdisUrl ? (
          <ActionButton
            label="Άνοιγμα ΚΗΜΔΗΣ"
            tone="ghost"
            onPress={() =>
              void Linking.openURL(item.publicKimdisUrl).catch(() => undefined)
            }
          />
        ) : null}
        {item.officialPdfUrl ? (
          <ActionButton
            label="Επίσημο PDF"
            tone="ghost"
            onPress={() =>
              void Linking.openURL(item.officialPdfUrl).catch(() => undefined)
            }
          />
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const Chip = ({ label, color }: { label: string; color: string }) => (
  <View
    style={{
      borderRadius: 999,
      borderWidth: 1,
      borderColor: color,
      backgroundColor: `${color}22`,
      paddingHorizontal: 10,
      paddingVertical: 5,
    }}
  >
    <Text style={{ color, fontSize: 11, fontWeight: "700" }}>{label}</Text>
  </View>
);

const DetailRow = ({ label, value }: { label: string; value: string }) => {
  const { colors } = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        gap: 12,
      }}
    >
      <Text style={{ color: colors.textMuted, fontSize: 13 }}>{label}</Text>
      <Text
        style={{
          color: colors.text,
          fontSize: 14,
          fontWeight: "700",
          flexShrink: 1,
          textAlign: "right",
        }}
      >
        {value}
      </Text>
    </View>
  );
};

const ActionButton = ({
  label,
  onPress,
  tone,
  disabled,
}: {
  label: string;
  onPress: () => void;
  tone: "primary" | "danger" | "ghost";
  disabled?: boolean;
}) => {
  const { colors } = useTheme();
  const bg =
    tone === "primary"
      ? colors.primary
      : tone === "danger"
        ? colors.danger
        : "transparent";
  const fg =
    tone === "primary"
      ? colors.primaryFg
      : tone === "danger"
        ? "#fff"
        : colors.text;
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={label}
      activeOpacity={0.85}
      disabled={disabled}
      onPress={onPress}
      style={{
        minHeight: 52,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: tone === "ghost" ? colors.border : bg,
        backgroundColor: bg,
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <Text style={{ color: fg, fontWeight: "800", fontSize: 15 }}>{label}</Text>
    </TouchableOpacity>
  );
};
