import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { Eye, EyeOff } from "lucide-react-native";
import { AuthShell, authFieldStyles } from "@/components/AuthShell";
import { authClient } from "@/lib/auth-client";

const MUTED = "#8b979c";

export default function LoginScreen() {
  const router = useRouter();
  const { refetch } = authClient.useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      Alert.alert("Σύνδεση", "Συμπληρώστε email και κωδικό.");
      return;
    }
    setSubmitting(true);
    try {
      const result = await authClient.signIn.email({
        email: email.trim(),
        password,
      });
      if (result.error) {
        throw new Error(result.error.message || "Αποτυχία σύνδεσης");
      }
      await refetch();
      const session = await authClient.getSession();
      if (!session.data?.user) {
        throw new Error("Η συνεδρία δεν δημιουργήθηκε. Δοκιμάστε ξανά.");
      }
      router.replace("/(app)/(tabs)");
    } catch (error) {
      Alert.alert(
        "Σφάλμα",
        error instanceof Error ? error.message : "Αποτυχία σύνδεσης",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      mode="login"
      title="Καλώς ήρθατε"
      subtitle="Βρείτε διαγωνισμούς ΚΗΜΔΗΣ που σας αφορούν και ενημερωθείτε έγκαιρα για κάθε εξέλιξη."
      footer={
        <TouchableOpacity
          accessibilityRole="button"
          onPress={() => router.push("/(auth)/forgot-password")}
          style={{ paddingVertical: 10 }}
        >
          <Text style={authFieldStyles.linkMuted}>
            Ξεχάσατε τον κωδικό σας;
          </Text>
        </TouchableOpacity>
      }
    >
      <View>
        <Text style={authFieldStyles.label}>Email</Text>
        <TextInput
          accessibilityLabel="Email"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          autoComplete="email"
          value={email}
          onChangeText={setEmail}
          placeholder="email@example.com"
          placeholderTextColor="#5a656a"
          style={authFieldStyles.input}
        />
      </View>

      <View>
        <Text style={authFieldStyles.label}>Κωδικός</Text>
        <View style={{ position: "relative" }}>
          <TextInput
            accessibilityLabel="Κωδικός πρόσβασης"
            secureTextEntry={!showPassword}
            autoComplete="password"
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            placeholderTextColor="#5a656a"
            style={[authFieldStyles.input, { paddingRight: 48 }]}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              showPassword ? "Απόκρυψη κωδικού" : "Εμφάνιση κωδικού"
            }
            onPress={() => setShowPassword((v) => !v)}
            hitSlop={8}
            style={{
              position: "absolute",
              right: 14,
              top: 0,
              bottom: 0,
              justifyContent: "center",
            }}
          >
            {showPassword ? (
              <EyeOff size={20} color={MUTED} />
            ) : (
              <Eye size={20} color={MUTED} />
            )}
          </Pressable>
        </View>
      </View>

      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Σύνδεση"
        activeOpacity={0.85}
        disabled={submitting}
        onPress={() => void handleLogin()}
        style={[authFieldStyles.primaryBtn, { opacity: submitting ? 0.7 : 1 }]}
      >
        {submitting ? (
          <ActivityIndicator color="#071014" />
        ) : (
          <Text style={authFieldStyles.primaryBtnText}>Σύνδεση</Text>
        )}
      </TouchableOpacity>
    </AuthShell>
  );
}
