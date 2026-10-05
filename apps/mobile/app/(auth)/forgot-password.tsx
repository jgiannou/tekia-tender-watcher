import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { AuthShell, authFieldStyles } from "@/components/AuthShell";
import { authClient } from "@/lib/auth-client";

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    const trimmed = email.trim();
    if (!trimmed) {
      Alert.alert("Email", "Συμπληρώστε το email σας.");
      return;
    }
    setSubmitting(true);
    try {
      const result = await authClient.requestPasswordReset({
        email: trimmed,
        redirectTo: "arctenders://reset-password",
      });
      if (result.error) {
        throw new Error(result.error.message || "Αποτυχία αποστολής");
      }
      Alert.alert(
        "Αίτημα καταχωρήθηκε",
        "Αν υπάρχει λογαριασμός με αυτό το email, θα λάβετε σύνδεσμο επαναφοράς.",
      );
    } catch (error) {
      Alert.alert(
        "Σφάλμα",
        error instanceof Error ? error.message : "Αποτυχία αποστολής",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      title="Επαναφορά κωδικού"
      subtitle="Βάλε το email σου και θα σου στείλουμε σύνδεσμο επαναφοράς."
      footer={
        <TouchableOpacity
          onPress={() => router.replace("/(auth)/login")}
          style={{ paddingVertical: 10 }}
        >
          <Text style={authFieldStyles.linkPrimary}>Πίσω στη σύνδεση</Text>
        </TouchableOpacity>
      }
    >
      <View>
        <Text style={authFieldStyles.label}>Email</Text>
        <TextInput
          accessibilityLabel="Email"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          placeholder="email@example.com"
          placeholderTextColor="#5a656a"
          style={authFieldStyles.input}
        />
      </View>

      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Αποστολή συνδέσμου"
        activeOpacity={0.85}
        disabled={submitting}
        onPress={() => void handleSubmit()}
        style={[authFieldStyles.primaryBtn, { opacity: submitting ? 0.7 : 1 }]}
      >
        {submitting ? (
          <ActivityIndicator color="#071014" />
        ) : (
          <Text style={authFieldStyles.primaryBtnText}>Αποστολή συνδέσμου</Text>
        )}
      </TouchableOpacity>
    </AuthShell>
  );
}
