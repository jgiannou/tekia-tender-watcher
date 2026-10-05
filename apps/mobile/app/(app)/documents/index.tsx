import { useCallback, useState } from "react";
import { Alert, FlatList, RefreshControl, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { useFocusEffect } from "expo-router";
import { useSessionContext } from "@/auth/SessionProvider";
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  ListRow,
  LoadingState,
  Screen,
} from "@/components/ui";
import { saasApi, type VaultDocument, type VaultFolder } from "@/lib/api";
import { formatDay } from "@/lib/format";
import { useTheme } from "@/theme/ThemeProvider";

export default function DocumentsScreen() {
  const { colors } = useTheme();
  const { activeOrganization } = useSessionContext();
  const [documents, setDocuments] = useState<VaultDocument[]>([]);
  const [folders, setFolders] = useState<VaultFolder[]>([]);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    if (!activeOrganization) return;
    setError(null);
    try {
      const [docsRes, foldersRes] = await Promise.all([
        saasApi.vaultDocuments(activeOrganization.id, {
          folderId: folderId || undefined,
        }),
        saasApi.vaultFolders(activeOrganization.id),
      ]);
      setDocuments(docsRes.documents);
      setFolders(foldersRes.folders);
      if (!folderId && foldersRes.folders[0]) {
        setFolderId(foldersRes.folders[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Αποτυχία φόρτωσης");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeOrganization, folderId]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load]),
  );

  const handleUpload = async () => {
    if (!activeOrganization || !folderId) {
      Alert.alert("Σφάλμα", "Επιλέξτε φάκελο πρώτα.");
      return;
    }
    const picked = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (picked.canceled || !picked.assets?.[0]) return;
    const asset = picked.assets[0];
    setUploading(true);
    try {
      await saasApi.uploadVaultDocument(activeOrganization.id, {
        file: {
          uri: asset.uri,
          name: asset.name,
          mimeType: asset.mimeType,
        },
        folderId,
        name: asset.name,
      });
      Alert.alert("OK", "Το έγγραφο μεταφορτώθηκε.");
      void load();
    } catch (err) {
      Alert.alert(
        "Σφάλμα",
        err instanceof Error ? err.message : "Αποτυχία μεταφόρτωσης",
      );
    } finally {
      setUploading(false);
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
      <View style={{ padding: 12, gap: 8 }}>
        <FlatList
          horizontal
          data={folders}
          keyExtractor={(f) => f.id}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8 }}
          renderItem={({ item }) => (
            <Button
              label={item.name}
              variant={folderId === item.id ? "primary" : "secondary"}
              onPress={() => setFolderId(item.id)}
            />
          )}
        />
        <Button
          label={uploading ? "Μεταφόρτωση…" : "Μεταφόρτωση εγγράφου"}
          loading={uploading}
          onPress={() => void handleUpload()}
        />
      </View>
      <FlatList
        data={documents}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={colors.primary}
            onRefresh={() => {
              setRefreshing(true);
              void load();
            }}
          />
        }
        ListEmptyComponent={
          <EmptyState
            title="Κενό vault"
            description="Μεταφορτώστε εταιρικά έγγραφα για προσφορές."
          />
        }
        renderItem={({ item }) => (
          <ListRow
            title={item.name}
            subtitle={item.documentType || item.originalFilename}
            meta={`v${item.version} · ${formatDay(item.expiryDate)}`}
            right={
              <Badge
                label={item.status}
                tone={
                  item.status === "EXPIRED"
                    ? "danger"
                    : item.status === "EXPIRING_SOON"
                      ? "warning"
                      : "success"
                }
              />
            }
          />
        )}
      />
    </Screen>
  );
}
