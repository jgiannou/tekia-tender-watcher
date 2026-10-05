import type { ReactNode } from "react";
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const BG = "#07090c";
const PRIMARY = "#00f3ff";
const TEXT = "#f4f7f8";
const MUTED = "#8b979c";

export const AuthModeSwitch = ({
  active,
}: {
  active: "login" | "signup";
}) => {
  const router = useRouter();

  return (
    <View
      accessibilityRole="tablist"
      style={{
        flexDirection: "row",
        backgroundColor: "rgba(255,255,255,0.06)",
        borderRadius: 14,
        padding: 4,
        marginBottom: 22,
        width: "100%",
      }}
    >
      {(
        [
          { key: "login" as const, label: "Σύνδεση", href: "/(auth)/login" },
          { key: "signup" as const, label: "Εγγραφή", href: "/(auth)/signup" },
        ] as const
      ).map((tab) => {
        const selected = tab.key === active;
        return (
          <Pressable
            key={tab.key}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={tab.label}
            onPress={() => {
              if (!selected) router.replace(tab.href);
            }}
            style={{
              flex: 1,
              height: 42,
              borderRadius: 11,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: selected ? PRIMARY : "transparent",
            }}
          >
            <Text
              style={{
                color: selected ? "#071014" : MUTED,
                fontFamily: selected
                  ? "IBMPlexSans_700Bold"
                  : "IBMPlexSans_500Medium",
                fontSize: 15,
              }}
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
};

export const AuthShell = ({
  children,
  mode,
  title,
  subtitle,
  footer,
}: {
  children: ReactNode;
  mode?: "login" | "signup";
  title: string;
  subtitle: string;
  footer?: ReactNode;
}) => {
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: -80,
          right: -60,
          width: 260,
          height: 260,
          borderRadius: 130,
          backgroundColor: "rgba(0, 243, 255, 0.14)",
        }}
      />
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: 180,
          left: -100,
          width: 220,
          height: 220,
          borderRadius: 110,
          backgroundColor: "rgba(0, 140, 160, 0.12)",
        }}
      />
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          bottom: 40,
          right: -40,
          width: 180,
          height: 180,
          borderRadius: 90,
          backgroundColor: "rgba(0, 243, 255, 0.06)",
        }}
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            flexGrow: 1,
            paddingTop: Math.max(insets.top, 20) + 28,
            paddingHorizontal: 24,
            paddingBottom: Math.max(insets.bottom, 28) + 12,
          }}
        >
          <View style={{ alignItems: "flex-start", marginBottom: 24 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                marginBottom: 24,
              }}
            >
              <Image
                source={require("../../assets/brand/icon.png")}
                style={{ width: 44, height: 44, borderRadius: 12 }}
                resizeMode="contain"
                accessibilityIgnoresInvertColors
              />
              <View>
                <Text
                  style={{
                    color: PRIMARY,
                    fontFamily: "IBMPlexSans_700Bold",
                    fontSize: 18,
                    letterSpacing: 0.4,
                  }}
                >
                  ARC Tenders
                </Text>
                <Text
                  style={{
                    color: MUTED,
                    fontFamily: "IBMPlexSans_400Regular",
                    fontSize: 12,
                    marginTop: 1,
                  }}
                >
                  Δημόσιοι διαγωνισμοί, στο κινητό
                </Text>
              </View>
            </View>

            {mode ? <AuthModeSwitch active={mode} /> : null}

            <Text
              style={{
                color: TEXT,
                fontFamily: "IBMPlexSans_700Bold",
                fontSize: 28,
                letterSpacing: -0.5,
                lineHeight: 34,
                marginBottom: 8,
              }}
            >
              {title}
            </Text>
            <Text
              style={{
                color: MUTED,
                fontFamily: "IBMPlexSans_400Regular",
                fontSize: 15,
                lineHeight: 22,
                maxWidth: 340,
              }}
            >
              {subtitle}
            </Text>
          </View>

          <View
            style={{
              borderRadius: 22,
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.08)",
              backgroundColor: "rgba(18, 22, 26, 0.92)",
              padding: 20,
              gap: 16,
              shadowColor: "#00f3ff",
              shadowOpacity: 0.08,
              shadowRadius: 24,
              shadowOffset: { width: 0, height: 8 },
            }}
          >
            {children}
          </View>

          {footer ? <View style={{ marginTop: 22, gap: 4 }}>{footer}</View> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

export const authFieldStyles = {
  label: {
    color: MUTED,
    fontFamily: "IBMPlexSans_500Medium" as const,
    fontSize: 13,
    marginBottom: 6,
  },
  input: {
    height: 54,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(0,0,0,0.35)",
    borderRadius: 14,
    paddingHorizontal: 14,
    color: TEXT,
    fontSize: 16,
    fontFamily: "IBMPlexSans_400Regular" as const,
  },
  primaryBtn: {
    height: 56,
    borderRadius: 16,
    backgroundColor: PRIMARY,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    marginTop: 4,
  },
  primaryBtnText: {
    color: "#071014",
    fontSize: 17,
    fontFamily: "IBMPlexSans_700Bold" as const,
  },
  linkMuted: {
    color: MUTED,
    fontSize: 15,
    fontFamily: "IBMPlexSans_400Regular" as const,
  },
  linkPrimary: {
    color: PRIMARY,
    fontFamily: "IBMPlexSans_700Bold" as const,
  },
};
