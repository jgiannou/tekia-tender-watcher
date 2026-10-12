const { app, BrowserWindow, shell, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");

const isDev = !app.isPackaged;
const DEV_URL = process.env.OPS_DESK_DEV_URL || "http://127.0.0.1:5190";
const PROTOCOL = "arctenders-ops";
/** Shared with ARC Pulse WidgetKit extension (Personal Team App Group). */
const PULSE_APP_GROUP = "group.37ZNXDS49B.arc.tenders.pulse";

const pulseGroupDir = () =>
  path.join(os.homedir(), "Library/Group Containers", PULSE_APP_GROUP);

const writePulseCache = (snapshot) => {
  const dir = pulseGroupDir();
  fs.mkdirSync(dir, { recursive: true });
  const cachePath = path.join(dir, "pulse-cache.json");
  const payload = {
    generatedAt: Number(snapshot?.generatedAt) || Date.now() / 1000,
    users: Number(snapshot?.users) || 0,
    organizations: Number(snapshot?.organizations) || 0,
    paying: Number(snapshot?.paying) || 0,
    errors: Number(snapshot?.errors) || 0,
    healthy: Boolean(snapshot?.healthy),
    statusText: String(snapshot?.statusText || (snapshot?.healthy ? "API + DB OK" : "DOWN")),
  };
  fs.writeFileSync(cachePath, `${JSON.stringify(payload)}\n`, "utf8");

  // Persist API credentials so the widget can fetch on its own (Ops Desk can quit).
  const apiUrl = String(snapshot?.apiUrl || "").trim();
  const adminToken = String(snapshot?.adminToken || "").trim();
  if (apiUrl && adminToken) {
    fs.writeFileSync(
      path.join(dir, "pulse-config.json"),
      `${JSON.stringify({ apiUrl, adminToken })}\n`,
      "utf8",
    );
  }

  const prefsDir = path.join(dir, "Library/Preferences");
  fs.mkdirSync(prefsDir, { recursive: true });
  const plistPath = path.join(prefsDir, `${PULSE_APP_GROUP}.plist`);
  try {
    const { execFileSync } = require("child_process");
    const domain = plistPath;
    execFileSync("defaults", ["write", domain, "pulseUsers", "-int", String(payload.users)], {
      stdio: "ignore",
    });
    execFileSync("defaults", ["write", domain, "pulseOrgs", "-int", String(payload.organizations)], {
      stdio: "ignore",
    });
    execFileSync("defaults", ["write", domain, "pulsePaying", "-int", String(payload.paying)], {
      stdio: "ignore",
    });
    execFileSync("defaults", ["write", domain, "pulseErrors", "-int", String(payload.errors)], {
      stdio: "ignore",
    });
    execFileSync("defaults", ["write", domain, "pulseHealthy", "-bool", payload.healthy ? "YES" : "NO"], {
      stdio: "ignore",
    });
    execFileSync("defaults", ["write", domain, "pulseStatus", "-string", payload.statusText], {
      stdio: "ignore",
    });
    execFileSync("defaults", ["write", domain, "pulseGeneratedAt", "-float", String(payload.generatedAt)], {
      stdio: "ignore",
    });
    if (apiUrl) {
      execFileSync("defaults", ["write", domain, "apiUrl", "-string", apiUrl], { stdio: "ignore" });
    }
    if (adminToken) {
      execFileSync("defaults", ["write", domain, "adminToken", "-string", adminToken], {
        stdio: "ignore",
      });
    }
  } catch {
    /* JSON files are enough */
  }

  return { ok: true, path: cachePath };
};

/** @type {BrowserWindow | null} */
let mainWindow = null;

const focusMainWindow = () => {
  if (!mainWindow) {
    createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
};

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    title: "ARC Tenders Ops",
    backgroundColor: "#0a0a0a",
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

const registerProtocolClient = () => {
  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [
        path.resolve(process.argv[1]),
      ]);
    }
  } else {
    app.setAsDefaultProtocolClient(PROTOCOL);
  }
};

if (process.defaultApp || isDev) {
  // Deep-link registration in unpacked/dev builds.
  registerProtocolClient();
}

const focusFromDeepLink = () => {
  if (app.isReady()) focusMainWindow();
  else void app.whenReady().then(() => focusMainWindow());
};

// Must bind before ready so cold-start widget / `open arctenders-ops://` works.
app.on("will-finish-launching", () => {
  app.on("open-url", (event) => {
    event.preventDefault();
    focusFromDeepLink();
  });
});

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv) => {
    if (argv.some((a) => String(a).startsWith(`${PROTOCOL}:`))) {
      focusFromDeepLink();
      return;
    }
    focusMainWindow();
  });

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

  ipcMain.handle("ops:write-pulse-cache", async (_event, snapshot) => {
    try {
      return writePulseCache(snapshot || {});
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  /** One-shot: hand credentials to ARC Pulse host (sandboxed App Group writer). */
  ipcMain.handle("ops:sync-pulse-widget", async (_event, payload) => {
    try {
      const apiUrl = String(payload?.apiUrl || "").trim();
      const token = String(payload?.adminToken || payload?.token || "").trim();
      if (!apiUrl || !token) {
        return { ok: false, error: "missing apiUrl/token" };
      }
      writePulseCache({
        generatedAt: Date.now() / 1000,
        users: 0,
        organizations: 0,
        paying: 0,
        errors: 0,
        healthy: true,
        statusText: "Syncing…",
        apiUrl,
        adminToken: token,
      });
      const u = new URL("arcpulse://sync");
      u.searchParams.set("apiUrl", apiUrl);
      u.searchParams.set("token", token);
      await shell.openExternal(u.toString());
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  app.whenReady().then(() => {
    registerProtocolClient();
    createWindow();
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
