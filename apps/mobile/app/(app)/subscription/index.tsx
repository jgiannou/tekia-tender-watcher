import { useCallback, useState } from "react";
import { Alert, Linking, ScrollView, Text, View } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { useFocusEffect } from "expo-router";
import { useSessionContext } from "@/auth/SessionProvider";
import {
  Badge,
  Body,
  Button,
  Card,
  ErrorState,
  LoadingState,
  Screen,
  Subtitle,
  Title,
} from "@/components/ui";
import {
  saasApi,
  type BillingCatalogResponse,
  type BillingStatusResponse,
} from "@/lib/api";
import { useTheme } from "@/theme/ThemeProvider";

export default function SubscriptionScreen() {
  const { colors } = useTheme();
  const { activeOrganization } = useSessionContext();
  const [catalog, setCatalog] = useState<BillingCatalogResponse | null>(null);
  const [status, setStatus] = useState<BillingStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!activeOrganization) return;
    setError(null);
    try {
      const [c, s] = await Promise.all([
        saasApi.billingCatalog(),
        saasApi.billingStatus(activeOrganization.id),
      ]);
      setCatalog(c);
      setStatus(s);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Αποτυχία φόρτωσης");
    } finally {
      setLoading(false);
    }
  }, [activeOrganization]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load]),
  );

  const openUrl = async (url: string | null | undefined) => {
    if (!url) {
      Alert.alert("Σφάλμα", "Δεν υπάρχει διαθέσιμο URL.");
      return;
    }
    await WebBrowser.openBrowserAsync(url);
  };

  const handleCheckout = async (plan: "basic" | "pro") => {
    if (!activeOrganization) return;
    setBusy(true);
    try {
      const res = await saasApi.billingCheckout(activeOrganization.id, {
        plan,
        interval: "monthly",
      });
      await openUrl(res.url);
    } catch (err) {
      Alert.alert(
        "Σφάλμα",
        err instanceof Error ? err.message : "Αποτυχία checkout",
      );
    } finally {
      setBusy(false);
    }
  };

  const handlePortal = async () => {
    if (!activeOrganization) return;
    setBusy(true);
    try {
      const res = await saasApi.billingPortal(activeOrganization.id);
      await openUrl(res.url);
    } catch (err) {
      Alert.alert(
        "Σφάλμα",
        err instanceof Error ? err.message : "Αποτυχία portal",
      );
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <Screen>
        <LoadingState />
      </Screen>
    );
  }
  if (error) {
    return (
      <Screen>
        <ErrorState message={error} onRetry={() => void load()} />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
        <Title>Συνδρομή</Title>
        <Subtitle>Διαχείριση πλάνου και πληρωμών μέσω Stripe.</Subtitle>
        <Card>
          <Text style={{ color: colors.text, fontWeight: "700" }}>Τρέχουσα κατάσταση</Text>
          <Badge label={status?.planKey || status?.status || "—"} tone="primary" />
          <Body muted>
            Trial έως: {status?.trialEndsAt || "—"}
          </Body>
          <Button
            label="Stripe Customer Portal"
            variant="secondary"
            loading={busy}
            onPress={() => void handlePortal()}
          />
        </Card>
        {(catalog?.plans || []).map((plan) => (
          <Card key={plan.key}>
            <Text style={{ color: colors.text, fontWeight: "700", fontSize: 16 }}>
              {plan.labelEl || plan.label}
            </Text>
            <Body muted>{plan.positioningEl || plan.positioning}</Body>
            <Body>
              {plan.monthlyEur != null ? `${plan.monthlyEur}€ / μήνα` : "Custom"}
            </Body>
            {(plan.key === "basic" || plan.key === "pro") && (
              <Button
                label={`Επιλογή ${plan.labelEl || plan.label}`}
                loading={busy}
                onPress={() => void handleCheckout(plan.key as "basic" | "pro")}
              />
            )}
          </Card>
        ))}
        <Button
          label="Άνοιγμα τιμοκαταλόγου web"
          variant="ghost"
          onPress={() => void Linking.openURL("https://arctenders.com/pricing").catch(() => undefined)}
        />
      </ScrollView>
    </Screen>
  );
}
