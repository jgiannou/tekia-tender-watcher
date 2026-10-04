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
  chooseCompanyProfile: (fileId) =>
    ipcRenderer.invoke("tekia:drive-choose-company-profile", fileId),
  syncCompanyProfile: () =>
    ipcRenderer.invoke("tekia:drive-sync-company-profile"),
  saveDocMeta: (meta) => ipcRenderer.invoke("tekia:drive-save-doc-meta", meta),
  checklist: () => ipcRenderer.invoke("tekia:drive-checklist"),
  packageReadiness: (referenceNumber) =>
    ipcRenderer.invoke("tekia:drive-package-readiness", referenceNumber),
  createWorkspace: (referenceNumber) =>
    ipcRenderer.invoke("tekia:drive-create-workspace", referenceNumber),
  copyTemplate: (referenceNumber, templateKey, operatorValues, outreachContent) =>
    ipcRenderer.invoke("tekia:drive-copy-template", {
      referenceNumber,
      templateKey,
      operatorValues: operatorValues ?? {},
      outreachContent,
    }),
  syncOutreachContent: (referenceNumber, subject, body) =>
    ipcRenderer.invoke("tekia:drive-sync-outreach", {
      referenceNumber,
      subject,
      body,
    }),
  tenderDocuments: (referenceNumber) =>
    ipcRenderer.invoke("tekia:drive-tender-documents", referenceNumber),
  markDocumentReady: (documentId) =>
    ipcRenderer.invoke("tekia:drive-mark-document-ready", documentId),
  readDocument: (documentId) =>
    ipcRenderer.invoke("tekia:drive-read-document", documentId),
  remergeDocument: (documentId, operatorValues) =>
    ipcRenderer.invoke("tekia:drive-remerge-document", {
      documentId,
      operatorValues,
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
  companySettings: {
    get: () => ipcRenderer.invoke("tekia:company-settings-get"),
    save: (company) =>
      ipcRenderer.invoke("tekia:company-settings-save", company),
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
