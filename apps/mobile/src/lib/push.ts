import { Platform } from "react-native";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { saasApi, type AttentionEvent } from "@/lib/api";

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

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );

const projectId = (): string | undefined => {
  const fromEas = Constants.easConfig?.projectId;
  const fromExtra = Constants.expoConfig?.extra?.eas?.projectId as
    | string
    | undefined;
  const id = fromEas || fromExtra;
  if (id && isUuid(id)) return id;
  return undefined;
};

const hintForType = (type: string, title: string) => {
  if (type === "NEW_OPPORTUNITY" || type === "OPPORTUNITY_DIGEST") {
    return "Νέα ευκαιρία στο inbox σας.";
  }
  if (type.startsWith("RELATED_")) {
    return "Νέα εξέλιξη σε παρακολουθούμενο διαγωνισμό.";
  }
  if (type.startsWith("DEADLINE_")) return "Ενημέρωση προθεσμίας.";
  if (type === "SUBMISSION_RECORDED") return "Καταχωρήθηκε υποβολή.";
  return title;
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

const ensurePermission = async () => {
  const current = await Notifications.getPermissionsAsync();
  if (current.status === "granted") return true;
  const asked = await Notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowBadge: true,
      allowSound: true,
      allowDisplayInCarPlay: false,
    },
  });
  return asked.status === "granted";
};

const fetchExpoPushToken = async (): Promise<string> => {
  const id = projectId();
  if (!id) {
    throw new Error(
      "Λείπει το EAS projectId (UUID). Τρέξε `eas init` στο apps/mobile.",
    );
  }
  try {
    const tokenResponse = await Notifications.getExpoPushTokenAsync({
      projectId: id,
    });
    return tokenResponse.data;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Expo push token: ${message}`);
  }
};

export const registerForPushNotifications = async (): Promise<string | null> => {
  if (!Device.isDevice) {
    console.warn("[push] Physical device required for remote push");
    return null;
  }

  await ensureAndroidChannel();
  if (!(await ensurePermission())) return null;

  cachedToken = await fetchExpoPushToken();

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
  try {
    const token = cachedToken || (await fetchExpoPushToken().catch(() => null));
    if (!token) return;
    await saasApi.unregisterPushDevice(token);
  } finally {
    cachedToken = null;
  }
};

export const getCachedPushToken = () => cachedToken;

const fallbackDemoEvents = (): Array<{
  title: string;
  type: string;
  url: string;
}> => [
  {
    title:
      "Πρόσκληση για υποβολή προσφοράς για Πακέτα λογισμικού και συστήματα πληροφορικής",
    type: "NEW_OPPORTUNITY",
    url: "arctenders://notifications",
  },
  {
    title: "Σχετική κατακύρωση εντοπίστηκε σε παρακολουθούμενο διαγωνισμό",
    type: "RELATED_AWARD_DISCOVERED",
    url: "arctenders://notifications",
  },
  {
    title: "Λήγει σε 3 ημέρες — τελική υποβολή",
    type: "DEADLINE_APPROACHING",
    url: "arctenders://notifications",
  },
];

const samplesFromAttention = (events: AttentionEvent[]) =>
  events.slice(0, 3).map((event) => {
    const tender =
      event.organizationTender?.tender ?? event.relatedTender ?? null;
    const referenceNumber = tender?.referenceNumber;
    const recordType = tender?.recordType;
    return {
      title: event.title,
      type: event.type,
      url:
        recordType && referenceNumber
          ? `arctenders://tenders/${recordType}/${encodeURIComponent(referenceNumber)}`
          : "arctenders://notifications",
      attentionEventId: event.id,
      referenceNumber,
      recordType,
    };
  });

/** Schedule lock-screen notifications with real attention titles + sound. */
export const sendLocalDemoNotifications = async (organizationId?: string | null) => {
  await ensureAndroidChannel();
  if (!(await ensurePermission())) {
    throw new Error("Δεν δόθηκε άδεια ειδοποιήσεων");
  }

  let samples = fallbackDemoEvents().map((s) => ({
    ...s,
    attentionEventId: undefined as string | undefined,
    referenceNumber: undefined as string | undefined,
    recordType: undefined as string | undefined,
  }));

  if (organizationId) {
    try {
      const res = await saasApi.attention(organizationId, {
        limit: 3,
        light: true,
      });
      if (res.events.length > 0) {
        samples = samplesFromAttention(res.events);
      }
    } catch {
      // Keep fallback samples.
    }
  }

  for (let i = 0; i < samples.length; i += 1) {
    const sample = samples[i]!;
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "ARC Tenders",
        body: `${sample.title}\n${hintForType(sample.type, sample.title)}`,
        sound: "default",
        priority: Notifications.AndroidNotificationPriority.MAX,
        data: {
          test: true,
          type: sample.type,
          attentionEventId: sample.attentionEventId,
          referenceNumber: sample.referenceNumber,
          recordType: sample.recordType,
          url: sample.url,
        },
      },
      trigger:
        i === 0
          ? null
          : {
              type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
              seconds: i * 2,
              repeats: false,
            },
    });
  }

  return samples.length;
};

/**
 * Prefer remote Expo push when available; always fall back to local demos
 * built from real attention events so lock-screen UX can be verified in Expo Go.
 */
export const sendPushSelfTest = async (organizationId?: string | null): Promise<{
  mode: "remote" | "local";
  detail: string;
}> => {
  await ensureAndroidChannel();

  if (!Device.isDevice) {
    const count = await sendLocalDemoNotifications(organizationId);
    return {
      mode: "local",
      detail: `Simulator: ${count} τοπικές ειδοποιήσεις με πραγματικά data.`,
    };
  }

  let token: string | null = null;
  let tokenError: string | null = null;
  try {
    token = await registerForPushNotifications();
  } catch (err) {
    tokenError = err instanceof Error ? err.message : String(err);
  }

  if (token) {
    try {
      const res = await saasApi.sendPushTest();
      return {
        mode: "remote",
        detail: `Remote Expo push σε ${res.sent} συσκευή(ές) με πραγματικά attention data.`,
      };
    } catch (err) {
      const count = await sendLocalDemoNotifications(organizationId);
      return {
        mode: "local",
        detail:
          err instanceof Error
            ? `Remote απέτυχε (${err.message}). Έστειλα ${count} τοπικές με πραγματικά data.`
            : `Remote απέτυχε. Έστειλα ${count} τοπικές με πραγματικά data.`,
      };
    }
  }

  const count = await sendLocalDemoNotifications(organizationId);
  return {
    mode: "local",
    detail: tokenError
      ? `Expo Go περιορίζει remote push (${tokenError}). Έστειλα ${count} τοπικές με πραγματικά data — κλείδωσε την οθόνη.`
      : `Έστειλα ${count} τοπικές ειδοποιήσεις με πραγματικά data — κλείδωσε την οθόνη.`,
  };
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
