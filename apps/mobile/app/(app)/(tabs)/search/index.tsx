import { useState } from "react";
import { Alert, FlatList, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSessionContext } from "@/auth/SessionProvider";
import { TenderCard } from "@/components/TenderCard";
import {
  Button,
  EmptyState,
  Field,
  Screen,
} from "@/components/ui";
import { saasApi, type KimdisSearchItem } from "@/lib/api";
import { formatDay, formatMoney, tenderHref } from "@/lib/format";
import { useTheme } from "@/theme/ThemeProvider";

export default function SearchScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { activeOrganization } = useSessionContext();
  const [query, setQuery] = useState("");
  const [recordFamily, setRecordFamily] = useState<"REQ" | "PROC">("REQ");
  const [items, setItems] = useState<KimdisSearchItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = async () => {
    if (!activeOrganization) return;
    setSearching(true);
    try {
      const res = await saasApi.kimdisSearch(activeOrganization.id, {
        recordFamily,
        title: query.trim() || undefined,
        referenceNumber: query.trim() || undefined,
        page: 0,
        pageSize: 30,
        sort: "date_desc",
      });
      setItems(res.items);
      setSearched(true);
    } catch (err) {
      Alert.alert(
        "Σφάλμα",
        err instanceof Error ? err.message : "Αποτυχία αναζήτησης",
      );
    } finally {
      setSearching(false);
    }
  };

  const handleFollow = async (item: KimdisSearchItem) => {
    if (!activeOrganization) return;
    try {
      await saasApi.followKimdisItem(activeOrganization.id, item);
      Alert.alert("OK", "Προστέθηκε στην παρακολούθηση.");
    } catch (err) {
      Alert.alert(
        "Σφάλμα",
        err instanceof Error ? err.message : "Αποτυχία follow",
      );
    }
  };

  return (
    <Screen>
      <View style={{ padding: 16, gap: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <Text style={{ color: colors.text, fontSize: 22, fontWeight: "800" }}>
          Αναζήτηση ΚΗΜΔΗΣ
        </Text>
        <Text style={{ color: colors.textMuted, fontSize: 14 }}>
          Βρες αιτήματα και διαγωνισμούς με λέξεις-κλειδιά ή ΑΔΑΜ.
        </Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {(["REQ", "PROC"] as const).map((family) => (
            <View key={family} style={{ flex: 1 }}>
              <Button
                label={family === "REQ" ? "Αιτήματα" : "Διαγωνισμοί"}
                variant={recordFamily === family ? "primary" : "secondary"}
                onPress={() => setRecordFamily(family)}
              />
            </View>
          ))}
        </View>
        <Field
          label="Λέξεις-κλειδιά / ΑΔΑΜ"
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={() => void handleSearch()}
          returnKeyType="search"
        />
        <Button
          label={searching ? "Αναζήτηση…" : "Αναζήτηση"}
          loading={searching}
          onPress={() => void handleSearch()}
        />
      </View>
      <FlatList
        data={items}
        keyExtractor={(item) => `${item.recordType}-${item.adam}`}
        contentContainerStyle={{ paddingTop: 12, paddingBottom: 28 }}
        ListEmptyComponent={
          <EmptyState
            title={searched ? "Κανένα αποτέλεσμα" : "Αποτελέσματα"}
            description={
              searched
                ? "Δοκίμασε διαφορετικούς όρους."
                : "Εκτέλεσε αναζήτηση για να δεις πράξεις ΚΗΜΔΗΣ."
            }
          />
        }
        renderItem={({ item }) => (
          <TenderCard
            reference={item.adam}
            title={item.title}
            authority={item.contractingAuthority}
            budgetLabel={formatMoney(item.budgetWithoutVat)}
            deadlineLabel={formatDay(
              item.finalSubmissionDate || item.signedDate,
            )}
            recordType={item.recordType}
            statusLabel={item.openState}
            actionLabel="Follow"
            onActionPress={() => void handleFollow(item)}
            onPress={() => router.push(tenderHref(item.recordType, item.adam))}
          />
        )}
      />
    </Screen>
  );
}
