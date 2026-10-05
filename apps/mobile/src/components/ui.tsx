import { useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  TextInput,
  Text,
  TouchableOpacity,
  View,
  type TextInputProps,
  type ViewStyle,
} from "react-native";
import { Eye, EyeOff } from "lucide-react-native";
import { useTheme } from "@/theme/ThemeProvider";

export const Screen = ({
  children,
  style,
}: {
  children: ReactNode;
  style?: ViewStyle;
}) => {
  const { colors } = useTheme();
  return (
    <View style={[{ flex: 1, backgroundColor: colors.bg }, style]}>
      {children}
    </View>
  );
};

export const Card = ({
  children,
  style,
}: {
  children: ReactNode;
  style?: ViewStyle;
}) => {
  const { colors } = useTheme();
  return (
    <View
      style={[
        {
          borderWidth: 1,
          borderRadius: 14,
          padding: 14,
          gap: 8,
          backgroundColor: colors.bgElevated,
          borderColor: colors.border,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
};

export const Title = ({ children }: { children: ReactNode }) => {
  const { colors } = useTheme();
  return (
    <Text
      accessibilityRole="header"
      style={{
        fontSize: 22,
        fontWeight: "700",
        letterSpacing: -0.3,
        color: colors.text,
      }}
    >
      {children}
    </Text>
  );
};

export const Subtitle = ({ children }: { children: ReactNode }) => {
  const { colors } = useTheme();
  return (
    <Text style={{ fontSize: 14, lineHeight: 20, color: colors.textMuted }}>
      {children}
    </Text>
  );
};

export const Body = ({
  children,
  muted,
}: {
  children: ReactNode;
  muted?: boolean;
}) => {
  const { colors } = useTheme();
  return (
    <Text
      style={{
        fontSize: 14,
        lineHeight: 20,
        color: muted ? colors.textMuted : colors.text,
      }}
    >
      {children}
    </Text>
  );
};

export const Field = ({
  label,
  ...props
}: TextInputProps & { label: string }) => {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontSize: 13, fontWeight: "500", color: colors.textMuted }}>
        {label}
      </Text>
      <TextInput
        placeholderTextColor={colors.textMuted}
        accessibilityLabel={label}
        {...props}
        style={[
          {
            borderWidth: 1,
            borderRadius: 12,
            paddingHorizontal: 14,
            paddingVertical: 12,
            minHeight: 48,
            fontSize: 16,
            color: colors.text,
            borderColor: colors.border,
            backgroundColor: colors.bgMuted,
          },
          props.style,
        ]}
      />
    </View>
  );
};

/** Password input with show/hide eye toggle. */
export const PasswordField = ({
  label,
  ...props
}: Omit<TextInputProps, "secureTextEntry"> & { label: string }) => {
  const { colors } = useTheme();
  const [visible, setVisible] = useState(false);

  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontSize: 13, fontWeight: "500", color: colors.textMuted }}>
        {label}
      </Text>
      <View style={{ position: "relative" }}>
        <TextInput
          placeholderTextColor={colors.textMuted}
          accessibilityLabel={label}
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="password"
          {...props}
          secureTextEntry={!visible}
          style={[
            {
              borderWidth: 1,
              borderRadius: 12,
              paddingHorizontal: 14,
              paddingRight: 48,
              paddingVertical: 12,
              minHeight: 48,
              fontSize: 16,
              color: colors.text,
              borderColor: colors.border,
              backgroundColor: colors.bgMuted,
            },
            props.style,
          ]}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={visible ? "Απόκρυψη κωδικού" : "Εμφάνιση κωδικού"}
          onPress={() => setVisible((v) => !v)}
          hitSlop={8}
          style={{
            position: "absolute",
            right: 12,
            top: 0,
            bottom: 0,
            justifyContent: "center",
          }}
        >
          {visible ? (
            <EyeOff size={20} color={colors.textMuted} />
          ) : (
            <Eye size={20} color={colors.textMuted} />
          )}
        </Pressable>
      </View>
    </View>
  );
};

export const Button = ({
  label,
  onPress,
  disabled,
  variant = "primary",
  loading,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  loading?: boolean;
}) => {
  const { colors } = useTheme();
  const bg =
    variant === "primary"
      ? colors.primary
      : variant === "danger"
        ? colors.danger
        : variant === "secondary"
          ? colors.bgMuted
          : "transparent";
  const fg =
    variant === "primary"
      ? colors.primaryFg
      : variant === "danger"
        ? "#fff"
        : colors.text;

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled || loading}
      activeOpacity={0.85}
      onPress={onPress}
      style={{
        minHeight: 52,
        borderWidth: 1,
        borderRadius: 12,
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 14,
        backgroundColor: bg,
        borderColor: variant === "ghost" ? colors.border : bg,
        opacity: disabled || loading ? 0.5 : 1,
      }}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <Text style={{ fontSize: 15, fontWeight: "700", color: fg }}>
          {label}
        </Text>
      )}
    </TouchableOpacity>
  );
};

export const Badge = ({
  label,
  tone = "default",
}: {
  label: string;
  tone?: "default" | "success" | "warning" | "danger" | "primary";
}) => {
  const { colors } = useTheme();
  const color =
    tone === "success"
      ? colors.success
      : tone === "warning"
        ? colors.warning
        : tone === "danger"
          ? colors.danger
          : tone === "primary"
            ? colors.primary
            : colors.textMuted;
  return (
    <View
      style={{
        alignSelf: "flex-start",
        borderWidth: 1,
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderColor: color,
        backgroundColor: `${color}22`,
      }}
    >
      <Text style={{ fontSize: 11, fontWeight: "700", color }}>{label}</Text>
    </View>
  );
};

export const EmptyState = ({
  title,
  description,
}: {
  title: string;
  description?: string;
}) => (
  <View
    style={{
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
      gap: 8,
    }}
  >
    <Title>{title}</Title>
    {description ? <Subtitle>{description}</Subtitle> : null}
  </View>
);

export const ErrorState = ({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) => {
  const { colors } = useTheme();
  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        gap: 8,
      }}
    >
      <Text style={{ color: colors.danger, fontSize: 16, fontWeight: "600" }}>
        {message}
      </Text>
      {onRetry ? (
        <View style={{ marginTop: 12, alignSelf: "stretch" }}>
          <Button label="Δοκιμή ξανά" onPress={onRetry} variant="secondary" />
        </View>
      ) : null}
    </View>
  );
};

export const LoadingState = ({ label = "Φόρτωση…" }: { label?: string }) => {
  const { colors } = useTheme();
  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <ActivityIndicator color={colors.primary} size="large" />
      <Text style={{ color: colors.textMuted, marginTop: 12 }}>{label}</Text>
    </View>
  );
};

export const ListRow = ({
  title,
  subtitle,
  meta,
  onPress,
  right,
}: {
  title: string;
  subtitle?: string | null;
  meta?: string | null;
  onPress?: () => void;
  right?: ReactNode;
}) => {
  const { colors } = useTheme();
  const content = (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        backgroundColor: colors.bgElevated,
      }}
    >
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={{ color: colors.text, fontWeight: "600", fontSize: 15 }}>
          {title}
        </Text>
        {subtitle ? (
          <Text
            style={{ color: colors.textMuted, fontSize: 13 }}
            numberOfLines={2}
          >
            {subtitle}
          </Text>
        ) : null}
        {meta ? (
          <Text style={{ color: colors.primary, fontSize: 12 }}>{meta}</Text>
        ) : null}
      </View>
      {right}
    </View>
  );
  if (!onPress) return content;
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={title}
      activeOpacity={0.85}
      onPress={onPress}
    >
      {content}
    </TouchableOpacity>
  );
};
