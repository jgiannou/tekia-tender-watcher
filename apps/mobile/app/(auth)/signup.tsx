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
import { saasApi } from "@/lib/api";

const MUTED = "#8b979c";
const PRIMARY = "#00f3ff";

export default function SignupScreen() {
  const router = useRouter();
  const { refetch } = authClient.useSession();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [orgName, setOrgName] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSignup = async () => {
    if (!accepted) {
      Alert.alert("Απαιτείται αποδοχή", "Πρέπει να αποδεχτείτε τους όρους χρήσης.");
      return;
    }
    if (!email.trim() || password.length < 8) {
      Alert.alert("Εγγραφή", "Συμπληρώστε email και κωδικό (τουλάχιστον 8 χαρακτήρες).");
      return;
    }
    setSubmitting(true);
    try {
      const result = await authClient.signUp.email({
        email: email.trim(),
        password,
        name: name.trim() || email.split("@")[0] || "User",
      });
      if (result.error) {
        throw new Error(result.error.message || "Αποτυχία εγγραφής");
      }
      await refetch();
      try {
        await saasApi.acceptLegal({
          termsVersion: "1.0",
          privacyVersion: "1.0",
          source: "signup",
        });
      } catch {
        // Legal may already be accepted or endpoint gated.
      }
      if (orgName.trim()) {
        await saasApi.createOrganization(orgName.trim());
      }
      router.replace("/(app)/setup");
    } catch (error) {
      Alert.alert(
        "Σφάλμα",
        error instanceof Error ? error.message : "Αποτυχία εγγραφής",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      mode="signup"
      title="Δημιουργία λογαριασμού"
      subtitle="Ξεκινήστε δωρεάν για 7 ημέρες και ρυθμίστε την ομάδα σας σε λίγα λεπτά."
    >
      <View>
        <Text style={authFieldStyles.label}>Ονοματεπώνυμο</Text>
        <TextInput
          accessibilityLabel="Ονοματεπώνυμο"
          autoComplete="name"
          value={name}
          onChangeText={setName}
          placeholder="π.χ. Μαρία Παπαδοπούλου"
          placeholderTextColor="#5a656a"
          style={authFieldStyles.input}
        />
      </View>

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
        <Text style={authFieldStyles.label}>Κωδικός (min 8)</Text>
        <View style={{ position: "relative" }}>
          <TextInput
            accessibilityLabel="Κωδικός πρόσβασης"
            secureTextEntry={!showPassword}
            autoComplete="new-password"
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

      <View>
        <Text style={authFieldStyles.label}>Όνομα οργανισμού</Text>
        <TextInput
          accessibilityLabel="Όνομα οργανισμού"
          value={orgName}
          onChangeText={setOrgName}
          placeholder="π.χ. ΤΕΚΙΑ Α.Ε."
          placeholderTextColor="#5a656a"
          style={authFieldStyles.input}
        />
      </View>

      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: accepted }}
        onPress={() => setAccepted((v) => !v)}
        style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}
      >
        <View
          style={{
            width: 22,
            height: 22,
            marginTop: 1,
            borderRadius: 6,
            borderWidth: 1.5,
            borderColor: accepted ? PRIMARY : "rgba(255,255,255,0.2)",
            backgroundColor: accepted ? PRIMARY : "transparent",
          }}
        />
        <Text
          style={{
            color: MUTED,
            flex: 1,
            fontSize: 13,
            lineHeight: 19,
            fontFamily: "IBMPlexSans_400Regular",
          }}
        >
          Αποδέχομαι τους Όρους Χρήσης και την Πολιτική Απορρήτου.
        </Text>
      </Pressable>

      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Εγγραφή"
        activeOpacity={0.85}
        disabled={submitting}
        onPress={() => void handleSignup()}
        style={[authFieldStyles.primaryBtn, { opacity: submitting ? 0.7 : 1 }]}
      >
        {submitting ? (
          <ActivityIndicator color="#071014" />
        ) : (
          <Text style={authFieldStyles.primaryBtnText}>Ξεκινήστε δωρεάν</Text>
        )}
      </TouchableOpacity>
    </AuthShell>
  );
}
