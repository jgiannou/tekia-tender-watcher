import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import {
  Bookmark,
  CreditCard,
  FileText,
  FolderOpen,
  LogOut,
  Send,
  Settings,
  Bell,
} from "lucide-react-native";
import { useSessionContext } from "@/auth/SessionProvider";
import { Body, Card, Screen, Subtitle, Title } from "@/components/ui";
import { useTheme } from "@/theme/ThemeProvider";

const links = [
  { href: "/(app)/notifications", label: "Ειδοποιήσεις", icon: Bell },
  { href: "/(app)/submissions", label: "Υποβολές", icon: Send },
  { href: "/(app)/documents", label: "Έγγραφα", icon: FolderOpen },
  {
    href: "/(app)/saved-searches",
    label: "Αποθηκευμένες Αναζητήσεις",
    icon: Bookmark,
  },
  { href: "/(app)/subscription", label: "Συνδρομή", icon: CreditCard },
  { href: "/(app)/setup", label: "Ρύθμιση επιχείρησης", icon: FileText },
  { href: "/(app)/settings", label: "Ρυθμίσεις", icon: Settings },
] as const;

export default function MoreScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { user, signOut } = useSessionContext();

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <Title>Περισσότερα</Title>
        <Subtitle>{user?.email}</Subtitle>
        {links.map((item) => {
          const Icon = item.icon;
          return (
            <Pressable
              key={item.href}
              accessibilityRole="button"
              accessibilityLabel={item.label}
              onPress={() => router.push(item.href)}
            >
              <Card>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <Icon color={colors.primary} size={18} />
                  <Text style={{ color: colors.text, fontWeight: "600", fontSize: 16 }}>
                    {item.label}
                  </Text>
                </View>
              </Card>
            </Pressable>
          );
        })}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Αποσύνδεση"
          onPress={() => {
            Alert.alert("Αποσύνδεση", "Θέλετε να αποσυνδεθείτε;", [
              { text: "Άκυρο", style: "cancel" },
              {
                text: "Αποσύνδεση",
                style: "destructive",
                onPress: () => {
                  void signOut().then(() => router.replace("/(auth)/login"));
                },
              },
            ]);
          }}
        >
          <Card>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <LogOut color={colors.danger} size={18} />
              <Text style={{ color: colors.danger, fontWeight: "700", fontSize: 16 }}>
                Αποσύνδεση
              </Text>
            </View>
            <Body muted>Έξοδος από τον λογαριασμό ARC Tenders.</Body>
          </Card>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}
