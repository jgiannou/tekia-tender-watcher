const { contextBridge, ipcRenderer } = require("electron");

const api = {
  request: (payload) => ipcRenderer.invoke("tekia:api-request", payload),
  getOpportunities: (filter = "all") =>
    ipcRenderer.invoke("tekia:api-request", {
      path: `/api/operator/opportunities?filter=${encodeURIComponent(filter)}`,
      method: "GET",
    }),
  getTender: (referenceNumber) =>
    ipcRenderer.invoke("tekia:api-request", {
      path: `/api/operator/tenders/${encodeURIComponent(referenceNumber)}`,
      method: "GET",
    }),
  updateTender: (referenceNumber, body) =>
    ipcRenderer.invoke("tekia:api-request", {
      path: `/api/operator/tenders/${encodeURIComponent(referenceNumber)}`,
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  getSubmissions: (result = "all") =>
    ipcRenderer.invoke("tekia:api-request", {
      path: `/api/operator/submissions?result=${encodeURIComponent(result)}`,
      method: "GET",
    }),
  recordSubmission: (referenceNumber, body) =>
    ipcRenderer.invoke("tekia:api-request", {
      path: `/api/operator/tenders/${encodeURIComponent(referenceNumber)}/submission`,
      method: "POST",
      body: JSON.stringify(body),
    }),
};

const drive = {
  status: (opts) => ipcRenderer.invoke("tekia:drive-status", opts ?? {}),
  connect: () => ipcRenderer.invoke("tekia:drive-connect"),
  disconnect: () => ipcRenderer.invoke("tekia:drive-disconnect"),
  setRoot: (folderUrlOrId) =>
    ipcRenderer.invoke("tekia:drive-set-root", folderUrlOrId),
  refresh: () => ipcRenderer.invoke("tekia:drive-refresh"),
  chooseTemplate: (key, fileId) =>
    ipcRenderer.invoke("tekia:drive-choose-template", { key, fileId }),
  saveDocMeta: (meta) => ipcRenderer.invoke("tekia:drive-save-doc-meta", meta),
  checklist: () => ipcRenderer.invoke("tekia:drive-checklist"),
  packageReadiness: (referenceNumber) =>
    ipcRenderer.invoke("tekia:drive-package-readiness", referenceNumber),
  createWorkspace: (referenceNumber) =>
    ipcRenderer.invoke("tekia:drive-create-workspace", referenceNumber),
  copyTemplate: (referenceNumber, templateKey) =>
    ipcRenderer.invoke("tekia:drive-copy-template", {
      referenceNumber,
      templateKey,
    }),
};

const tekia = {
  isDesktop: true,
  platform: process.platform,
  api,
  drive,
  connection: {
    get: () => ipcRenderer.invoke("tekia:connection-get"),
    save: (input) => ipcRenderer.invoke("tekia:connection-save", input),
    test: (input) => ipcRenderer.invoke("tekia:connection-test", input ?? {}),
  },
  shell: {
    openExternal: (url) => ipcRenderer.invoke("tekia:open-external", url),
  },
  navigation: {
    onOpenTender: (callback) => {
      const listener = (_event, ref) => {
        callback(ref);
      };
      ipcRenderer.on("tekia:open-tender", listener);
      return () => ipcRenderer.removeListener("tekia:open-tender", listener);
    },
    onOpenSettings: (callback) => {
      const listener = () => callback();
      ipcRenderer.on("tekia:open-settings", listener);
      return () => ipcRenderer.removeListener("tekia:open-settings", listener);
    },
  },
};

contextBridge.exposeInMainWorld("tekia", tekia);
