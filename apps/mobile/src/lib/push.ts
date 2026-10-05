import { Platform } from "react-native";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { saasApi } from "@/lib/api";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

let cachedToken: string | null = null;
let listenersAttached = false;

const projectId = (): string | undefined => {
  const fromEas = Constants.easConfig?.projectId;
  const fromExtra = Constants.expoConfig?.extra?.eas?.projectId as
    | string
    | undefined;
  const id = fromEas || fromExtra;
  // Expo expects a UUID; ignore placeholder slug values.
  if (id && /^[0-9a-f-]{36}$/i.test(id)) return id;
  return undefined;
};

export const ensureAndroidChannel = async () => {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync("arc-tenders-alerts", {
    name: "ARC Tenders Alerts",
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#00f3ff",
    sound: "default",
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
};

export const registerForPushNotifications = async (): Promise<string | null> => {
  if (!Device.isDevice) {
    console.warn("[push] Physical device required for remote push");
    return null;
  }

  await ensureAndroidChannel();

  const current = await Notifications.getPermissionsAsync();
  let status = current.status;
  if (status !== "granted") {
    const asked = await Notifications.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowBadge: true,
        allowSound: true,
        allowDisplayInCarPlay: false,
      },
    });
    status = asked.status;
  }
  if (status !== "granted") return null;

  const id = projectId();
  const tokenResponse = id
    ? await Notifications.getExpoPushTokenAsync({ projectId: id })
    : await Notifications.getExpoPushTokenAsync();
  cachedToken = tokenResponse.data;

  const platform =
    Platform.OS === "ios"
      ? "ios"
      : Platform.OS === "android"
        ? "android"
        : "web";

  await saasApi.registerPushDevice({
    token: cachedToken,
    platform,
    enabled: true,
  });

  return cachedToken;
};

export const unregisterPushNotifications = async () => {
  const token =
    cachedToken ||
    (await Notifications.getExpoPushTokenAsync().catch(() => null))?.data;
  if (!token) return;
  await saasApi.unregisterPushDevice(token);
  cachedToken = null;
};

export const getCachedPushToken = () => cachedToken;

/** Local notification with sound — works on simulator for UX testing. */
export const sendLocalTestNotification = async () => {
  await ensureAndroidChannel();
  const current = await Notifications.getPermissionsAsync();
  if (current.status !== "granted") {
    const asked = await Notifications.requestPermissionsAsync();
    if (asked.status !== "granted") {
      throw new Error("Δεν δόθηκε άδεια ειδοποιήσεων");
    }
  }
  await Notifications.scheduleNotificationAsync({
    content: {
      title: "ARC Tenders",
      body: "Δοκιμαστική ειδοποίηση — ήχος & lock screen OK.",
      sound: "default",
      priority: Notifications.AndroidNotificationPriority.MAX,
      data: { test: true },
    },
    trigger: null,
  });
};

/**
 * Register device (if possible) then ask the API to send a remote Expo push.
 * Falls back to a local notification when running on simulator.
 */
export const sendPushSelfTest = async (): Promise<{
  mode: "remote" | "local";
  detail: string;
}> => {
  await ensureAndroidChannel();

  if (!Device.isDevice) {
    await sendLocalTestNotification();
    return {
      mode: "local",
      detail: "Simulator: τοπική ειδοποίηση με ήχο.",
    };
  }

  const token = await registerForPushNotifications();
  if (!token) {
    await sendLocalTestNotification();
    return {
      mode: "local",
      detail: "Χωρίς push token — τοπική ειδοποίηση.",
    };
  }

  try {
    const res = await saasApi.sendPushTest();
    return {
      mode: "remote",
      detail: `Remote Expo push σε ${res.sent} συσκευή(ές).`,
    };
  } catch (err) {
    await sendLocalTestNotification();
    return {
      mode: "local",
      detail:
        err instanceof Error
          ? `Remote απέτυχε (${err.message}) — τοπική ειδοποίηση.`
          : "Remote απέτυχε — τοπική ειδοποίηση.",
    };
  }
};

export const attachPushResponseListeners = (
  onOpenUrl?: (url: string) => void,
) => {
  if (listenersAttached) return () => undefined;
  listenersAttached = true;

  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data as
      | { url?: string }
      | undefined;
    if (data?.url && onOpenUrl) onOpenUrl(data.url);
  });

  return () => {
    sub.remove();
    listenersAttached = false;
  };
};
