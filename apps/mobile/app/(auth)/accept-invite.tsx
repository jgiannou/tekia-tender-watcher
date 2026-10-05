import { useEffect, useState } from "react";
import { Alert, ScrollView, Text, View } from "react-native";
import { Link, useLocalSearchParams, useRouter } from "expo-router";
import { saasApi } from "@/lib/api";
import { useSessionContext } from "@/auth/SessionProvider";
import {
  Body,
  Button,
  Card,
  ErrorState,
  LoadingState,
  Screen,
  Subtitle,
  Title,
} from "@/components/ui";
import { useTheme } from "@/theme/ThemeProvider";

export default function AcceptInviteScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { user, refresh } = useSessionContext();
  const params = useLocalSearchParams<{ token?: string }>();
  const token = typeof params.token === "string" ? params.token : "";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [invite, setInvite] = useState<{
    email: string;
    role: string;
    organization: { name: string };
  } | null>(null);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    if (!token) {
      setError("Λείπει το token πρόσκλησης.");
      setLoading(false);
      return;
    }
    void (async () => {
      try {
        const res = await saasApi.peekInvitation(token);
        setInvite(res.invitation);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Άκυρη πρόσκληση");
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const handleAccept = async () => {
    if (!user) {
      router.replace(`/(auth)/login?next=${encodeURIComponent(`/(auth)/accept-invite?token=${token}`)}`);
      return;
    }
    setAccepting(true);
    try {
      await saasApi.acceptInvitation(token);
      await refresh();
      Alert.alert("Καλωσήρθατε", "Η πρόσκληση έγινε αποδεκτή.");
      router.replace("/(app)/(tabs)");
    } catch (err) {
      Alert.alert(
        "Σφάλμα",
        err instanceof Error ? err.message : "Αποτυχία αποδοχής",
      );
    } finally {
      setAccepting(false);
    }
  };

  if (loading) {
    return (
      <Screen>
        <LoadingState />
      </Screen>
    );
  }

  if (error || !invite) {
    return (
      <Screen>
        <ErrorState message={error || "Άκυρη πρόσκληση"} />
        <Link href="/(auth)/login">
          <Text style={{ color: colors.primary, textAlign: "center" }}>Σύνδεση</Text>
        </Link>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 24, gap: 16 }}>
        <Title>Πρόσκληση ομάδας</Title>
        <Subtitle>Σας προσκάλεσαν να συμμετάσχετε σε οργανισμό.</Subtitle>
        <Card>
          <Body>Οργανισμός: {invite.organization.name}</Body>
          <Body muted>Email: {invite.email}</Body>
          <Body muted>Ρόλος: {invite.role}</Body>
        </Card>
        <Button
          label={accepting ? "Αποδοχή…" : user ? "Αποδοχή πρόσκλησης" : "Σύνδεση για αποδοχή"}
          loading={accepting}
          onPress={() => void handleAccept()}
        />
        <View>
          <Link href="/(auth)/login">
            <Text style={{ color: colors.primary }}>Πίσω στη σύνδεση</Text>
          </Link>
        </View>
      </ScrollView>
    </Screen>
  );
}
