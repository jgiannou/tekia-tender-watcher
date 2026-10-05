import { Pressable, Text, View } from "react-native";
import { Tabs, useRouter } from "expo-router";
import {
  Binoculars,
  ChevronLeft,
  LayoutDashboard,
  Menu,
  Radar,
  Search,
} from "lucide-react-native";
import {
  AppHeaderTitle,
  NotificationBell,
  OrgAvatarButton,
} from "@/components/AppHeader";
import { useTheme } from "@/theme/ThemeProvider";

export default function TabsLayout() {
  const { colors } = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerStyle: {
          backgroundColor: colors.bg,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        },
        headerShadowVisible: false,
        headerTintColor: colors.text,
        headerTitleAlign: "center",
        headerLeftContainerStyle: {
          paddingLeft: 8,
          paddingVertical: 6,
        },
        headerRightContainerStyle: {
          paddingRight: 12,
          paddingVertical: 6,
        },
        headerTitleContainerStyle: {
          paddingHorizontal: 4,
        },
        headerLeft: () => <OrgAvatarButton />,
        headerRight: () => <NotificationBell />,
        tabBarStyle: {
          backgroundColor: colors.bgElevated,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 64,
          paddingTop: 6,
          paddingBottom: 8,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "600",
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Επισκόπηση",
          tabBarLabel: "Αρχική",
          headerTitle: () => <AppHeaderTitle title="Επισκόπηση" />,
          tabBarIcon: ({ color, size }) => (
            <LayoutDashboard color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="opportunities/index"
        options={{
          title: "Ευκαιρίες",
          tabBarLabel: "Ευκαιρίες",
          headerTitle: () => <AppHeaderTitle title="Ευκαιρίες" />,
          tabBarIcon: ({ color, size }) => <Radar color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="monitoring/index"
        options={{
          title: "Παρακολουθούμενα",
          tabBarLabel: "Follow",
          headerTitle: () => <AppHeaderTitle title="Παρακολουθούμενα" />,
          tabBarIcon: ({ color, size }) => (
            <Binoculars color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="search/index"
        options={{
          title: "Αναζήτηση",
          tabBarLabel: "Αναζήτηση",
          headerTitle: () => <AppHeaderTitle title="Αναζήτηση" />,
          tabBarIcon: ({ color, size }) => <Search color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="more/index"
        options={{
          title: "Περισσότερα",
          tabBarLabel: "Περισσότερα",
          headerTitle: () => <AppHeaderTitle title="Περισσότερα" />,
          tabBarIcon: ({ color, size }) => <Menu color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="tenders/[recordType]/[adam]/index"
        options={{
          href: null,
          title: "Πράξη ΚΗΜΔΗΣ",
          headerLeft: () => <TenderBackButton />,
          headerTitle: () => <AppHeaderTitle title="Πράξη ΚΗΜΔΗΣ" />,
          headerRight: () => null,
        }}
      />
    </Tabs>
  );
}

const TenderBackButton = () => {
  const { colors } = useTheme();
  const router = useRouter();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Πίσω"
      onPress={() => {
        if (router.canGoBack()) router.back();
        else router.replace("/(app)/(tabs)/opportunities");
      }}
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingLeft: 8,
        paddingVertical: 8,
        paddingRight: 4,
        gap: 2,
      }}
    >
      <ChevronLeft size={22} color={colors.primary} />
      <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 16 }}>
        Πίσω
      </Text>
    </Pressable>
  );
};
