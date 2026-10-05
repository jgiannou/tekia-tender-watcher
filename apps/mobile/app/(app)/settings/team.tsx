import { useCallback, useState } from "react";
import { Alert, FlatList, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { useSessionContext } from "@/auth/SessionProvider";
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Field,
  ListRow,
  LoadingState,
  Screen,
  Subtitle,
  Title,
} from "@/components/ui";
import { saasApi } from "@/lib/api";

type Member = {
  id: string;
  userId: string;
  role: string;
  user: { id: string; name: string; email: string };
};

type Invitation = {
  id: string;
  email: string;
  role: string;
  status: string;
};

export default function TeamSettingsScreen() {
  const { activeOrganization } = useSessionContext();
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);

  const load = useCallback(async () => {
    if (!activeOrganization) return;
    setError(null);
    try {
      const res = await saasApi.getTeam(activeOrganization.id);
      setMembers(res.members as Member[]);
      setInvitations(res.invitations as Invitation[]);
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

  const handleInvite = async () => {
    if (!activeOrganization || !email.trim()) return;
    setInviting(true);
    try {
      await saasApi.inviteMember(activeOrganization.id, {
        email: email.trim(),
        role: "MEMBER",
      });
      setEmail("");
      Alert.alert("OK", "Η πρόσκληση στάλθηκε.");
      void load();
    } catch (err) {
      Alert.alert(
        "Σφάλμα",
        err instanceof Error ? err.message : "Αποτυχία πρόσκλησης",
      );
    } finally {
      setInviting(false);
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
      <View style={{ padding: 16, gap: 10 }}>
        <Title>Ομάδα</Title>
        <Subtitle>Μέλη και προσκλήσεις οργανισμού.</Subtitle>
        <Field
          label="Email πρόσκλησης"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <Button
          label={inviting ? "Αποστολή…" : "Πρόσκληση μέλους"}
          loading={inviting}
          onPress={() => void handleInvite()}
        />
      </View>
      <FlatList
        data={[
          ...members.map((m) => ({
            key: m.id,
            title: m.user.name || m.user.email,
            subtitle: m.user.email,
            meta: m.role,
            kind: "member" as const,
          })),
          ...invitations.map((i) => ({
            key: i.id,
            title: i.email,
            subtitle: i.status,
            meta: i.role,
            kind: "invite" as const,
          })),
        ]}
        keyExtractor={(item) => item.key}
        ListEmptyComponent={<EmptyState title="Κενή ομάδα" />}
        renderItem={({ item }) => (
          <ListRow
            title={item.title}
            subtitle={item.subtitle}
            right={<Badge label={`${item.kind === "invite" ? "Invite · " : ""}${item.meta}`} />}
          />
        )}
      />
    </Screen>
  );
}
