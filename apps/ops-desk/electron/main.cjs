const { app, BrowserWindow, shell, ipcMain } = require("electron");
const path = require("path");

const isDev = !app.isPackaged;
const DEV_URL = process.env.OPS_DESK_DEV_URL || "http://127.0.0.1:5190";

/** @type {BrowserWindow | null} */
let mainWindow = null;

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    title: "ARC Tenders Ops",
    backgroundColor: "#0c1117",
    icon: path.join(__dirname, "..", "build", "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (process.platform === "darwin" && app.dock) {
    try {
      app.dock.setIcon(path.join(__dirname, "..", "build", "icon.png"));
    } catch {
      /* ignore */
    }
  }

  if (isDev) {
    void mainWindow.loadURL(DEV_URL);
  } else {
    void mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
};

ipcMain.handle("ops:fetch", async (_event, payload) => {
  const url = String(payload?.url || "");
  const method = String(payload?.method || "GET");
  const headers = payload?.headers || {};
  const body = payload?.body;

  const response = await fetch(url, {
    method,
    headers,
    body: body || undefined,
  });
  const text = await response.text();
  const responseHeaders = {};
  response.headers.forEach((value, key) => {
    responseHeaders[key] = value;
  });
  return {
    status: response.status,
    body: text,
    headers: responseHeaders,
  };
});

ipcMain.handle("ops:open-external", async (_event, url) => {
  await shell.openExternal(String(url || ""));
});

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
