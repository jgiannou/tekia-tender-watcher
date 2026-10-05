const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("arcTendersOps", {
  isElectron: true,
  fetch: (payload) => ipcRenderer.invoke("ops:fetch", payload),
  openExternal: (url) => ipcRenderer.invoke("ops:open-external", url),
});
