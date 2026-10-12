/**
 * Minimal Google Picker loader (https://developers.google.com/drive/picker).
 * The OAuth access token is passed straight to the Picker and is never stored
 * (no localStorage / sessionStorage / cookies) by this module.
 */

const GOOGLE_API_SCRIPT_URL = "https://apis.google.com/js/api.js";

type PickerDocument = {
  id: string;
  name?: string;
  mimeType?: string;
  sizeBytes?: number;
};

type PickerResponse = {
  action: string;
  docs?: PickerDocument[];
};

type PickerBuilderInstance = {
  addView: (viewId: string) => PickerBuilderInstance;
  enableFeature: (feature: string) => PickerBuilderInstance;
  setOAuthToken: (token: string) => PickerBuilderInstance;
  setDeveloperKey: (key: string) => PickerBuilderInstance;
  setAppId: (appId: string) => PickerBuilderInstance;
  setLocale: (locale: string) => PickerBuilderInstance;
  setMaxItems: (max: number) => PickerBuilderInstance;
  setCallback: (callback: (data: PickerResponse) => void) => PickerBuilderInstance;
  build: () => { setVisible: (visible: boolean) => void; dispose?: () => void };
};

type GooglePickerNamespace = {
  PickerBuilder: new () => PickerBuilderInstance;
  ViewId: { DOCS: string };
  Feature: { MULTISELECT_ENABLED: string };
  Action: { PICKED: string; CANCEL: string };
};

type GapiNamespace = {
  load: (api: string, callback: () => void) => void;
};

declare global {
  interface Window {
    gapi?: GapiNamespace;
    google?: { picker?: GooglePickerNamespace };
  }
}

let pickerLoadPromise: Promise<GooglePickerNamespace> | null = null;

const loadScript = (src: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${src}"]`,
    );
    if (existing && window.gapi) {
      resolve();
      return;
    }
    const script = existing ?? document.createElement("script");
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener(
      "error",
      () => reject(new Error("google_picker_script_failed")),
      { once: true },
    );
    if (!existing) {
      script.src = src;
      script.async = true;
      document.head.appendChild(script);
    }
  });

export const loadGooglePicker = (): Promise<GooglePickerNamespace> => {
  if (pickerLoadPromise) return pickerLoadPromise;
  pickerLoadPromise = (async () => {
    await loadScript(GOOGLE_API_SCRIPT_URL);
    const gapi = window.gapi;
    if (!gapi) throw new Error("google_picker_script_failed");
    await new Promise<void>((resolve) => gapi.load("picker", resolve));
    const picker = window.google?.picker;
    if (!picker) throw new Error("google_picker_script_failed");
    return picker;
  })().catch((error) => {
    pickerLoadPromise = null;
    throw error;
  });
  return pickerLoadPromise;
};

export type PickedDriveFile = {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes?: number;
};

/** Opens the Picker; resolves with the picked files, or `null` when cancelled. */
export const openGoogleFilePicker = async (input: {
  accessToken: string;
  developerKey: string;
  appId: string;
  maxItems: number;
}): Promise<PickedDriveFile[] | null> => {
  const picker = await loadGooglePicker();
  return new Promise((resolve) => {
    const instance = new picker.PickerBuilder()
      .addView(picker.ViewId.DOCS)
      .enableFeature(picker.Feature.MULTISELECT_ENABLED)
      .setOAuthToken(input.accessToken)
      .setDeveloperKey(input.developerKey)
      .setAppId(input.appId)
      .setLocale("el")
      .setMaxItems(input.maxItems)
      .setCallback((data) => {
        if (data.action === picker.Action.PICKED) {
          const files = (data.docs ?? []).map((doc) => ({
            id: doc.id,
            name: doc.name ?? doc.id,
            mimeType: doc.mimeType ?? "",
            sizeBytes:
              typeof doc.sizeBytes === "number" ? doc.sizeBytes : undefined,
          }));
          resolve(files);
          return;
        }
        if (data.action === picker.Action.CANCEL) resolve(null);
      })
      .build();
    instance.setVisible(true);
  });
};
