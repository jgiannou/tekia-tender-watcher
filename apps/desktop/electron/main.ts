import {
  app,
  BrowserWindow,
  Menu,
  shell,
  ipcMain,
  dialog,
  type MenuItemConstructorOptions,
} from "electron";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CloudApiError, requestCloudApi, testConnection } from "./cloud-api.js";
import { assertDesktopCannotAutoSend } from "./no-auto-send.js";
import {
  getLocalCompanySettings,
  hasLocalCompanySettings,
  saveLocalCompanySettings,
  type LocalCompanySettings,
} from "./company-settings-store.js";
import {
  getConnectionPublic,
  saveConnection,
} from "./secure-store.js";
import { isAllowedExternalUrl, parseDeepLink } from "./url-safety.js";
import {
  isOnScreen,
  loadWindowState,
  trackWindowState,
} from "./window-state.js";
import {
  chooseCompanyProfileDoc,
  chooseTemplateMaster,
  connectGoogleDrive,
  copyTemplateForTender,
  createTenderWorkspace,
  disconnectDrive,
  getChecklistFromVault,
  getDriveStatus,
  getTenderDriveDocuments,
  markTenderDocumentReady,
  preparePackageReadiness,
  readTenderDocumentContent,
  remergeOperatorValuesIntoCopy,
  saveVaultDocumentMeta,
  setVaultRootFromInput,
  syncCompanyProfileFromSettings,
} from "./google/vault-service.js";
import type { VaultDocumentMeta } from "./google/vault-store.js";

assertDesktopCannotAutoSend();

app.setName("TEKIA Tender Watcher");

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const isDev = !app.isPackaged;
const RENDERER_DEV_URL =
  process.env.ELECTRON_RENDERER_URL ?? "http://127.0.0.1:5173";

let mainWindow: BrowserWindow | null = null;
let pendingDeepLink: string | null = null;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv) => {
    const deepLink = argv.find((arg) => arg.startsWith("tekia-tender://"));
    if (deepLink) {
      handleDeepLink(deepLink);
    }
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

const preloadPath = join(__dirname, "preload.cjs");

const createWindow = async (): Promise<void> => {
  const state = loadWindowState();
  const usePosition = isOnScreen(state);

  mainWindow = new BrowserWindow({
    width: state.width,
    height: state.height,
    minWidth: 1100,
    minHeight: 700,
    ...(usePosition ? { x: state.x, y: state.y } : {}),
    show: false,
    title: "TEKIA Tender Watcher",
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  trackWindowState(mainWindow);

  mainWindow.on("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void openExternalSafe(url);
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    const isAppDev = isDev && url.startsWith(RENDERER_DEV_URL);
    const isAppFile = url.startsWith("file:");
    if (isAppDev || isAppFile) return;
    event.preventDefault();
    void openExternalSafe(url);
  });

  if (isDev) {
    await mainWindow.loadURL(RENDERER_DEV_URL);
  } else {
    const indexHtml = join(__dirname, "..", "renderer-dist", "index.html");
    if (!existsSync(indexHtml)) {
      console.error("[desktop] Missing renderer-dist/index.html — run desktop:build");
    }
    await mainWindow.loadFile(indexHtml);
  }

  if (pendingDeepLink) {
    handleDeepLink(pendingDeepLink);
    pendingDeepLink = null;
  }
};

const openExternalSafe = async (
  url: string,
): Promise<{ ok: boolean; error?: string }> => {
  if (
    !isAllowedExternalUrl(url, {
      allowHttpLocalhost: isDev,
    })
  ) {
    console.warn("[desktop] blocked external URL:", url);
    return { ok: false, error: "URL not allowed" };
  }
  try {
    await shell.openExternal(url);
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[desktop] openExternal failed:", message);
    return { ok: false, error: message };
  }
};

const sendToRenderer = (channel: string, ...args: unknown[]): void => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send(channel, ...args);
};

const handleDeepLink = (url: string): void => {
  const parsed = parseDeepLink(url);
  if (!parsed) {
    console.warn("[desktop] ignored deep link:", url);
    return;
  }
  if (!mainWindow) {
    pendingDeepLink = url;
    return;
  }
  sendToRenderer("tekia:open-tender", parsed.referenceNumber);
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
};

const buildMenu = (): void => {
  const isMac = process.platform === "darwin";

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: "TEKIA Tender Watcher",
            submenu: [
              {
                label: "About TEKIA Tender Watcher",
                click: () => {
                  void dialog.showMessageBox({
                    type: "info",
                    title: "About",
                    message: "TEKIA Tender Watcher",
                    detail:
                      "Local operator desktop for reviewing KIMDIS opportunities.\nCloud watcher continues independently.\nNo automatic external sending.",
                  });
                },
              },
              { type: "separator" as const },
              {
                label: "Settings…",
                accelerator: "CmdOrCtrl+,",
                click: () => sendToRenderer("tekia:open-settings"),
              },
              { type: "separator" as const },
              { role: "hide" as const },
              { role: "hideOthers" as const },
              { role: "unhide" as const },
              { type: "separator" as const },
              { role: "quit" as const },
            ],
          } satisfies MenuItemConstructorOptions,
        ]
      : []),
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        ...(isDev
          ? ([
              { role: "reload" },
              { role: "toggleDevTools" },
              { type: "separator" },
            ] as MenuItemConstructorOptions[])
          : []),
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Window",
      submenu: [{ role: "minimize" }, { role: "close" }],
    },
  ];

  if (!isMac) {
    template.unshift({
      label: "File",
      submenu: [
        {
          label: "Settings…",
          accelerator: "CmdOrCtrl+,",
          click: () => sendToRenderer("tekia:open-settings"),
        },
        { type: "separator" },
        { role: "quit" },
      ],
    });
  }

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
};

const registerIpc = (): void => {
  ipcMain.handle("tekia:connection-get", () => getConnectionPublic());

  ipcMain.handle(
    "tekia:connection-save",
    (_event, input: { apiUrl: string; token?: string | null }) => {
      if (!input?.apiUrl || typeof input.apiUrl !== "string") {
        throw new Error("apiUrl is required");
      }
      return saveConnection({
        apiUrl: input.apiUrl,
        token: input.token,
      });
    },
  );

  ipcMain.handle(
    "tekia:connection-test",
    async (
      _event,
      input: { apiUrl?: string; token?: string } = {},
    ) => testConnection(input),
  );

  ipcMain.handle("tekia:company-settings-get", () => {
    const local = getLocalCompanySettings();
    return {
      company: local.company,
      updatedAt: local.updatedAt,
      source: "local" as const,
      hasLocalData: hasLocalCompanySettings(),
    };
  });

  ipcMain.handle(
    "tekia:company-settings-save",
    async (_event, company: LocalCompanySettings) => {
      if (!company || typeof company !== "object") {
        throw new Error("company settings payload required");
      }
      const saved = saveLocalCompanySettings(company);

      // Best-effort mirror to cloud watcher (local remains source of truth)
      let cloudSynced = false;
      let cloudError: string | null = null;
      try {
        const current = await requestCloudApi<{
          company: LocalCompanySettings;
          drive: Record<string, string>;
          documents: unknown[];
        }>("/api/operator/settings");
        await requestCloudApi("/api/operator/settings", {
          method: "PUT",
          body: JSON.stringify({
            ...current,
            company: saved.company,
          }),
        });
        cloudSynced = true;
      } catch (error) {
        cloudError = error instanceof Error ? error.message : String(error);
      }

      return {
        company: saved.company,
        updatedAt: saved.updatedAt,
        source: "local" as const,
        cloudSynced,
        cloudError,
      };
    },
  );

  ipcMain.handle(
    "tekia:api-request",
    async (
      _event,
      payload: { path: string; method?: string; body?: string | null },
    ) => {
      if (!payload?.path || typeof payload.path !== "string") {
        throw new CloudApiError(0, "error", "Invalid API path");
      }
      if (!payload.path.startsWith("/api/operator/")) {
        throw new CloudApiError(0, "error", "Only operator API paths are allowed");
      }
      try {
        return await requestCloudApi(payload.path, {
          method: payload.method,
          body: payload.body,
        });
      } catch (error) {
        if (error instanceof CloudApiError) {
          return {
            __tekiaError: true,
            status: error.status,
            code: error.code,
            message: error.message,
            body: error.body,
          };
        }
        throw error;
      }
    },
  );

  ipcMain.handle("tekia:open-external", async (_event, url: string) =>
    openExternalSafe(String(url ?? "")),
  );

  const driveError = (error: unknown) => ({
    __tekiaError: true,
    status: 0,
    code: "drive_error",
    message: error instanceof Error ? error.message : String(error),
    body: null,
  });

  ipcMain.handle("tekia:drive-status", async (_event, opts?: { refresh?: boolean }) => {
    try {
      return await getDriveStatus({ refresh: Boolean(opts?.refresh) });
    } catch (error) {
      return driveError(error);
    }
  });

  ipcMain.handle("tekia:drive-connect", async () => {
    try {
      return await connectGoogleDrive();
    } catch (error) {
      return driveError(error);
    }
  });

  ipcMain.handle("tekia:drive-disconnect", () => {
    disconnectDrive();
    return { ok: true };
  });

  ipcMain.handle(
    "tekia:drive-set-root",
    async (_event, folderUrlOrId: string) => {
      try {
        return await setVaultRootFromInput(String(folderUrlOrId ?? ""));
      } catch (error) {
        return driveError(error);
      }
    },
  );

  ipcMain.handle("tekia:drive-refresh", async () => {
    try {
      return await getDriveStatus({ refresh: true });
    } catch (error) {
      return driveError(error);
    }
  });

  ipcMain.handle(
    "tekia:drive-choose-template",
    (_event, payload: { key: string; fileId: string }) => {
      try {
        chooseTemplateMaster(
          payload.key as
            | "earlyOutreach"
            | "technicalOffer"
            | "economicOffer"
            | "declarations",
          payload.fileId,
        );
        return { ok: true };
      } catch (error) {
        return driveError(error);
      }
    },
  );

  ipcMain.handle(
    "tekia:drive-choose-company-profile",
    (_event, fileId: string) => {
      try {
        chooseCompanyProfileDoc(String(fileId ?? ""));
        return { ok: true };
      } catch (error) {
        return driveError(error);
      }
    },
  );

  ipcMain.handle("tekia:drive-sync-company-profile", async () => {
    try {
      return await syncCompanyProfileFromSettings();
    } catch (error) {
      return driveError(error);
    }
  });

  ipcMain.handle(
    "tekia:drive-save-doc-meta",
    (
      _event,
      meta: {
        driveFileId: string;
        documentType: VaultDocumentMeta["documentType"];
        validFrom: string | null;
        validUntil: string | null;
        notes: string | null;
      },
    ) => {
      try {
        saveVaultDocumentMeta(meta);
        return { ok: true };
      } catch (error) {
        return driveError(error);
      }
    },
  );

  ipcMain.handle("tekia:drive-checklist", async () => {
    try {
      return await getChecklistFromVault();
    } catch (error) {
      return driveError(error);
    }
  });

  ipcMain.handle(
    "tekia:drive-package-readiness",
    async (_event, referenceNumber: string) => {
      try {
        return await preparePackageReadiness(String(referenceNumber ?? ""));
      } catch (error) {
        return driveError(error);
      }
    },
  );

  ipcMain.handle(
    "tekia:drive-create-workspace",
    async (_event, referenceNumber: string) => {
      try {
        return await createTenderWorkspace(String(referenceNumber ?? ""));
      } catch (error) {
        return driveError(error);
      }
    },
  );

  ipcMain.handle(
    "tekia:drive-copy-template",
    async (
      _event,
      payload: {
        referenceNumber: string;
        templateKey:
          | "earlyOutreach"
          | "technicalOffer"
          | "economicOffer"
          | "declarations";
        operatorValues?: Record<string, string>;
      },
    ) => {
      try {
        return await copyTemplateForTender(payload);
      } catch (error) {
        return driveError(error);
      }
    },
  );

  ipcMain.handle(
    "tekia:drive-tender-documents",
    (_event, referenceNumber: string) => {
      try {
        return getTenderDriveDocuments(String(referenceNumber ?? ""));
      } catch (error) {
        return driveError(error);
      }
    },
  );

  ipcMain.handle(
    "tekia:drive-mark-document-ready",
    (_event, documentId: string) => {
      try {
        return markTenderDocumentReady(String(documentId ?? ""));
      } catch (error) {
        return driveError(error);
      }
    },
  );

  ipcMain.handle(
    "tekia:drive-read-document",
    async (_event, documentId: string) => {
      try {
        return await readTenderDocumentContent(String(documentId ?? ""));
      } catch (error) {
        return driveError(error);
      }
    },
  );

  ipcMain.handle(
    "tekia:drive-remerge-document",
    async (
      _event,
      payload: { documentId: string; operatorValues: Record<string, string> },
    ) => {
      try {
        return await remergeOperatorValuesIntoCopy(payload);
      } catch (error) {
        return driveError(error);
      }
    },
  );
};

app.whenReady().then(async () => {
  console.log("[desktop] app start");
  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      app.setAsDefaultProtocolClient("tekia-tender", process.execPath, [
        join(process.argv[1]),
      ]);
    }
  } else {
    app.setAsDefaultProtocolClient("tekia-tender");
  }

  registerIpc();
  buildMenu();
  await createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });
});

app.on("open-url", (event, url) => {
  event.preventDefault();
  handleDeepLink(url);
});

app.on("window-all-closed", () => {
  // Quit on close — cloud watcher continues independently.
  app.quit();
});

process.on("uncaughtException", (error) => {
  console.error("[desktop] unexpected main-process error:", error.message);
});
