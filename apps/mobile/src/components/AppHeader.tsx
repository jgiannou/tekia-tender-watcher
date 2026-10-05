import { useEffect, useState } from "react";
import {
  Modal,
  Pressable,
  Text,
  View,
  Alert,
  useWindowDimensions,
} from "react-native";
import { useRouter } from "expo-router";
import { Bell, Check, ChevronsUpDown, Plus } from "lucide-react-native";
import { useSessionContext } from "@/auth/SessionProvider";
import { saasApi } from "@/lib/api";
import { Button, Field } from "@/components/ui";
import { useTheme } from "@/theme/ThemeProvider";

const orgInitials = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
};

/**
 * Org switcher chip for the header left slot.
 * Shows initials + name in a pill — never clipped by a fixed header height.
 */
export const OrgAvatarButton = () => {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const {
    organizations,
    activeOrganization,
    setActiveOrganizationId,
    createOrganization,
  } = useSessionContext();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const maxChipWidth = Math.min(Math.max(width * 0.38, 120), 168);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await createOrganization(name.trim());
      setName("");
      setCreating(false);
      setOpen(false);
    } catch (err) {
      Alert.alert(
        "Σφάλμα",
        err instanceof Error ? err.message : "Αποτυχία δημιουργίας",
      );
    } finally {
      setBusy(false);
    }
  };

  const label = activeOrganization?.name || "Οργανισμός";

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Οργανισμός: ${label}`}
        onPress={() => setOpen(true)}
        style={{
          marginLeft: 4,
          maxWidth: maxChipWidth,
          height: 36,
          paddingLeft: 4,
          paddingRight: 8,
          borderRadius: 18,
          backgroundColor: colors.bgMuted,
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
        }}
      >
        <View
          style={{
            width: 28,
            height: 28,
            borderRadius: 14,
            backgroundColor: `${colors.primary}22`,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text
            style={{
              color: colors.primary,
              fontWeight: "800",
              fontSize: 11,
            }}
          >
            {orgInitials(label)}
          </Text>
        </View>
        <Text
          numberOfLines={1}
          ellipsizeMode="tail"
          style={{
            color: colors.text,
            fontWeight: "700",
            fontSize: 13,
            flexShrink: 1,
            maxWidth: maxChipWidth - 56,
          }}
        >
          {label}
        </Text>
        <ChevronsUpDown size={13} color={colors.textMuted} />
      </Pressable>

      <Modal visible={open} animationType="slide" transparent>
        <Pressable
          style={{
            flex: 1,
            backgroundColor: "#00000088",
            justifyContent: "flex-end",
          }}
          onPress={() => setOpen(false)}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{
              backgroundColor: colors.bgElevated,
              borderTopLeftRadius: 22,
              borderTopRightRadius: 22,
              padding: 20,
              gap: 10,
              maxHeight: "75%",
            }}
          >
            <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: "600" }}>
              ΧΩΡΟΣ ΕΡΓΑΣΙΑΣ
            </Text>
            <Text style={{ color: colors.text, fontSize: 20, fontWeight: "800" }}>
              Οργανισμοί
            </Text>
            {organizations.map((org) => {
              const active = org.id === activeOrganization?.id;
              return (
                <Pressable
                  key={org.id}
                  accessibilityRole="button"
                  onPress={() => {
                    void setActiveOrganizationId(org.id).then(() => setOpen(false));
                  }}
                  style={{
                    padding: 14,
                    borderRadius: 14,
                    backgroundColor: active ? `${colors.primary}18` : colors.bgMuted,
                    borderWidth: 1,
                    borderColor: active ? colors.primary : colors.border,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <View
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 12,
                      backgroundColor: active
                        ? `${colors.primary}28`
                        : colors.bgElevated,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text
                      style={{
                        color: colors.primary,
                        fontWeight: "800",
                        fontSize: 14,
                      }}
                    >
                      {orgInitials(org.name)}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{ color: colors.text, fontWeight: "700", fontSize: 15 }}
                    >
                      {org.name}
                    </Text>
                    <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                      {org.role}
                    </Text>
                  </View>
                  {active ? <Check size={18} color={colors.primary} /> : null}
                </Pressable>
              );
            })}
            {creating ? (
              <View style={{ gap: 10, marginTop: 4 }}>
                <Field label="Νέος οργανισμός" value={name} onChangeText={setName} />
                <Button
                  label={busy ? "Δημιουργία…" : "Δημιουργία"}
                  loading={busy}
                  onPress={() => void handleCreate()}
                />
              </View>
            ) : (
              <Pressable
                accessibilityRole="button"
                onPress={() => setCreating(true)}
                style={{
                  marginTop: 4,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  paddingVertical: 12,
                }}
              >
                <Plus size={18} color={colors.primary} />
                <Text style={{ color: colors.primary, fontWeight: "700" }}>
                  Νέος οργανισμός
                </Text>
              </Pressable>
            )}
            <Button label="Κλείσιμο" variant="ghost" onPress={() => setOpen(false)} />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
};

/** Centered page title — separate from the org chip so nothing fights for space. */
export const AppHeaderTitle = ({ title }: { title: string }) => {
  const { colors } = useTheme();
  return (
    <Text
      numberOfLines={1}
      style={{
        color: colors.text,
        fontWeight: "700",
        fontSize: 17,
        letterSpacing: -0.2,
        textAlign: "center",
      }}
    >
      {title}
    </Text>
  );
};

/** @deprecated use OrgAvatarButton */
export const OrgSwitcher = () => <OrgAvatarButton />;

export const NotificationBell = () => {
  const { colors } = useTheme();
  const router = useRouter();
  const { activeOrganization } = useSessionContext();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!activeOrganization) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await saasApi.attention(activeOrganization.id, {
          limit: 30,
          unreadOnly: true,
          light: true,
        });
        if (!cancelled) setUnread(res.events.length);
      } catch {
        if (!cancelled) setUnread(0);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeOrganization]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Ειδοποιήσεις"
      onPress={() => router.push("/(app)/notifications")}
      style={{
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: colors.bgMuted,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Bell size={18} color={colors.text} />
      {unread > 0 ? (
        <View
          style={{
            position: "absolute",
            right: 2,
            top: 2,
            minWidth: 16,
            height: 16,
            borderRadius: 8,
            backgroundColor: colors.danger,
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 3,
          }}
        >
          <Text style={{ color: "#fff", fontSize: 10, fontWeight: "700" }}>
            {unread > 9 ? "9+" : unread}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
};
