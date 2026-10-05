import { useState } from "react";
import { Alert, ScrollView, Text } from "react-native";
import { Link, useLocalSearchParams, useRouter } from "expo-router";
import { authClient } from "@/lib/auth-client";
import { Button, Field, Screen, Subtitle, Title } from "@/components/ui";
import { useTheme } from "@/theme/ThemeProvider";

export default function ResetPasswordScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string }>();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (password.length < 8) {
      Alert.alert("Σφάλμα", "Ο κωδικός πρέπει να έχει τουλάχιστον 8 χαρακτήρες.");
      return;
    }
    if (password !== confirm) {
      Alert.alert("Σφάλμα", "Οι κωδικοί δεν ταιριάζουν.");
      return;
    }
    const token = typeof params.token === "string" ? params.token : "";
    if (!token) {
      Alert.alert("Σφάλμα", "Λείπει το token επαναφοράς.");
      return;
    }
    setSubmitting(true);
    try {
      const result = await authClient.resetPassword({
        newPassword: password,
        token,
      });
      if (result.error) {
        throw new Error(result.error.message || "Αποτυχία επαναφοράς");
      }
      Alert.alert("Επιτυχία", "Ο κωδικός ενημερώθηκε.");
      router.replace("/(auth)/login");
    } catch (error) {
      Alert.alert(
        "Σφάλμα",
        error instanceof Error ? error.message : "Αποτυχία επαναφοράς",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 24, gap: 16 }}>
        <Title>Νέος κωδικός</Title>
        <Subtitle>Ορίστε τον νέο κωδικό πρόσβασης για τον λογαριασμό σας.</Subtitle>
        <Field
          label="Νέος κωδικός"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />
        <Field
          label="Επιβεβαίωση"
          secureTextEntry
          value={confirm}
          onChangeText={setConfirm}
        />
        <Button
          label={submitting ? "Αποθήκευση…" : "Αποθήκευση"}
          loading={submitting}
          onPress={() => void handleSubmit()}
        />
        <Link href="/(auth)/login">
          <Text style={{ color: colors.primary }}>Πίσω στη σύνδεση</Text>
        </Link>
      </ScrollView>
    </Screen>
  );
}
