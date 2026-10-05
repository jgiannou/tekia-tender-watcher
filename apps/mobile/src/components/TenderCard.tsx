import { Text, TouchableOpacity, View } from "react-native";
import { ChevronRight } from "lucide-react-native";
import { useTheme } from "@/theme/ThemeProvider";

export type TenderCardProps = {
  reference: string;
  title?: string | null;
  authority?: string | null;
  budgetLabel?: string | null;
  deadlineLabel?: string | null;
  recordType?: string | null;
  statusLabel?: string | null;
  score?: number | null;
  actionLabel?: string | null;
  onPress?: () => void;
  onActionPress?: () => void;
};

export const TenderCard = ({
  reference,
  title,
  authority,
  budgetLabel,
  deadlineLabel,
  recordType,
  statusLabel,
  score,
  actionLabel,
  onPress,
  onActionPress,
}: TenderCardProps) => {
  const { colors } = useTheme();

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={title || reference}
      activeOpacity={0.88}
      onPress={onPress}
      disabled={!onPress}
      style={{
        marginHorizontal: 16,
        marginBottom: 12,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.bgElevated,
        padding: 16,
        gap: 12,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, flex: 1 }}>
          {recordType ? (
            <Chip label={recordType} color={colors.primary} />
          ) : null}
          {statusLabel ? (
            <Chip label={statusLabel} color={colors.warning} />
          ) : null}
          {score != null ? (
            <Chip label={`Score ${Math.round(score)}`} color={colors.success} />
          ) : null}
        </View>
        <ChevronRight size={18} color={colors.textMuted} />
      </View>

      <View style={{ gap: 4 }}>
        <Text
          style={{
            color: colors.primary,
            fontSize: 13,
            fontWeight: "700",
            letterSpacing: 0.2,
          }}
        >
          {reference}
        </Text>
        <Text
          style={{
            color: colors.text,
            fontSize: 17,
            fontWeight: "700",
            lineHeight: 24,
          }}
          numberOfLines={3}
        >
          {title?.trim() || "Χωρίς τίτλο"}
        </Text>
        {authority ? (
          <Text
            style={{ color: colors.textMuted, fontSize: 13, lineHeight: 18 }}
            numberOfLines={2}
          >
            {authority}
          </Text>
        ) : null}
      </View>

      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 10,
          paddingTop: 4,
        }}
      >
        {budgetLabel ? (
          <MetaBlock label="Προϋπολογισμός" value={budgetLabel} />
        ) : null}
        {deadlineLabel ? (
          <MetaBlock label="Προθεσμία" value={deadlineLabel} />
        ) : null}
      </View>

      {actionLabel && onActionPress ? (
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          activeOpacity={0.85}
          onPress={(e) => {
            e.stopPropagation?.();
            onActionPress();
          }}
          style={{
            marginTop: 4,
            alignSelf: "flex-start",
            minHeight: 40,
            paddingHorizontal: 14,
            borderRadius: 10,
            backgroundColor: colors.primary,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text
            style={{
              color: colors.primaryFg,
              fontWeight: "800",
              fontSize: 13,
            }}
          >
            {actionLabel}
          </Text>
        </TouchableOpacity>
      ) : null}
    </TouchableOpacity>
  );
};

const Chip = ({ label, color }: { label: string; color: string }) => (
  <View
    style={{
      borderRadius: 999,
      borderWidth: 1,
      borderColor: color,
      backgroundColor: `${color}22`,
      paddingHorizontal: 10,
      paddingVertical: 4,
    }}
  >
    <Text style={{ color, fontSize: 11, fontWeight: "700" }}>{label}</Text>
  </View>
);

const MetaBlock = ({ label, value }: { label: string; value: string }) => {
  const { colors } = useTheme();
  return (
    <View
      style={{
        minWidth: "46%",
        flexGrow: 1,
        backgroundColor: colors.bgMuted,
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 10,
      }}
    >
      <Text style={{ color: colors.textMuted, fontSize: 11, marginBottom: 2 }}>
        {label}
      </Text>
      <Text style={{ color: colors.text, fontSize: 14, fontWeight: "700" }}>
        {value}
      </Text>
    </View>
  );
};
