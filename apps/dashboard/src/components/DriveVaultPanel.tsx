import { FormEvent, useCallback, useEffect, useState } from "react";
import { isDesktop, openExternalUrl } from "../api";

type DriveStatus = {
  configured: boolean;
  connected: boolean;
  accountEmail: string | null;
  scope: string | null;
  configSource: string | null;
  rootFolderId: string | null;
  rootFolderName: string | null;
  health: {
    root: { name: string; ok: boolean; folderId: string | null };
    top: Array<{ name: string; ok: boolean; folderId: string | null }>;
    companyDocuments: Array<{ name: string; ok: boolean; folderId: string | null }>;
    templates: Array<{ name: string; ok: boolean; folderId: string | null }>;
    missing: string[];
  };
  templates: Array<{
    key: string;
    folderName: string;
    selection:
      | { status: "READY"; file: { id: string; name: string; webViewLink: string } }
      | { status: "MISSING" }
      | {
          status: "NEEDS_CONFIGURATION";
          candidates: Array<{ id: string; name: string; webViewLink: string }>;
        };
  }>;
  companyDocuments: Array<{
    key: string;
    folderName: string;
    files: Array<{
      id: string;
      name: string;
      mimeType: string;
      modifiedTime: string | null;
      webViewLink: string;
      validity: string;
      validUntil: string | null;
    }>;
  }>;
  missing: string[];
  lastError: string | null;
  scopeWarning: string | null;
  __tekiaError?: boolean;
  message?: string;
};

const mark = (ok: boolean) => (ok ? "✓" : "⚠");

export const DriveVaultPanel = () => {
  const [status, setStatus] = useState<DriveStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [folderInput, setFolderInput] = useState("");

  const load = useCallback(async (refresh = false) => {
    if (!isDesktop() || !window.tekia?.drive) {
      setStatus(null);
      return;
    }
    setBusy(true);
    try {
      const next = (await (refresh
        ? window.tekia.drive.refresh()
        : window.tekia.drive.status({ refresh: false }))) as DriveStatus;
      if (next?.__tekiaError) {
        setError(next.message ?? "Drive error");
      } else {
        setStatus(next);
        setError(next.lastError);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load(true);
  }, [load]);

  if (!isDesktop()) {
    return (
      <section className="card">
        <h2>Google Drive Vault</h2>
        <p className="muted">
          Google Drive connects only in the Electron desktop app. Open TEKIA Tender
          Watcher desktop to connect OAuth and select TEKIA / Tenders.
        </p>
      </section>
    );
  }

  const handleConnect = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const result = (await window.tekia!.drive.connect()) as {
        email?: string | null;
        __tekiaError?: boolean;
        message?: string;
      };
      if (result?.__tekiaError) {
        setError(result.message ?? "Connect failed");
      } else {
        setMessage(`Connected${result.email ? ` as ${result.email}` : ""}.`);
        await load(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnect = async () => {
    setBusy(true);
    try {
      await window.tekia!.drive.disconnect();
      setMessage("Disconnected. Drive files were not deleted.");
      await load(false);
    } finally {
      setBusy(false);
    }
  };

  const handleSetRoot = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const next = (await window.tekia!.drive.setRoot(folderInput)) as DriveStatus;
      if (next?.__tekiaError) {
        setError(next.message ?? "Failed to set root folder");
      } else {
        setStatus(next);
        setMessage("Vault root configured. Child folders discovered automatically.");
        setFolderInput("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card stack">
      <h2>Google Drive Vault</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        Configure only ONE root folder: <strong>TEKIA / Tenders</strong>. Child folders
        are discovered automatically. OAuth tokens never leave Electron Main.
      </p>

      {message ? <div className="alert-box">{message}</div> : null}
      {error ? <div className="error">{error}</div> : null}
      {status?.scopeWarning ? (
        <div className="error" role="status">
          {status.scopeWarning}
        </div>
      ) : null}

      <div className="meta-grid">
        <div className="meta-item">
          <span className="k">OAuth config</span>
          <span className="v">
            {status?.configured
              ? `Ready (${status.configSource ?? "local"})`
              : "Missing — set GOOGLE_OAUTH_CLIENT_ID in apps/desktop/.env"}
          </span>
        </div>
        <div className="meta-item">
          <span className="k">Status</span>
          <span className="v">
            {status?.connected ? "● Connected" : "○ Not connected"}
          </span>
        </div>
        <div className="meta-item">
          <span className="k">Account</span>
          <span className="v">{status?.accountEmail ?? "—"}</span>
        </div>
        <div className="meta-item">
          <span className="k">Scope</span>
          <span className="v">
            <code style={{ fontSize: 12 }}>{status?.scope ?? "drive.readonly + drive.file"}</code>
          </span>
        </div>
        <div className="meta-item">
          <span className="k">Root folder</span>
          <span className="v">{status?.rootFolderName ?? "Not configured"}</span>
        </div>
      </div>

      <div className="actions">
        {!status?.connected ? (
          <button
            type="button"
            className="btn primary"
            disabled={busy || !status?.configured}
            onClick={() => void handleConnect()}
          >
            Connect Google Drive
          </button>
        ) : (
          <>
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => void load(true)}
            >
              Refresh Vault
            </button>
            {status.rootFolderId ? (
              <button
                type="button"
                className="btn ghost"
                onClick={() =>
                  void openExternalUrl(
                    `https://drive.google.com/drive/folders/${status.rootFolderId}`,
                  )
                }
              >
                Open in Drive
              </button>
            ) : null}
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => void handleDisconnect()}
            >
              Disconnect Google Drive
            </button>
          </>
        )}
      </div>

      {status?.connected ? (
        <form className="form-grid" onSubmit={(e) => void handleSetRoot(e)}>
          <label>
            Select TEKIA / Tenders root (paste folder URL or ID — only this once)
            <input
              value={folderInput}
              onChange={(e) => setFolderInput(e.target.value)}
              placeholder="https://drive.google.com/drive/folders/..."
              aria-label="Vault root folder URL or ID"
            />
          </label>
          <div className="actions">
            <button type="submit" className="btn primary" disabled={busy || !folderInput.trim()}>
              {status.rootFolderId ? "Change Folder" : "Select TEKIA / Tenders"}
            </button>
          </div>
        </form>
      ) : null}

      {status?.rootFolderId ? (
        <>
          <h3>Vault Structure</h3>
          <ul className="checklist">
            {status.health.top.map((item) => (
              <li key={item.name}>
                {mark(item.ok)} {item.name}
                {!item.ok ? " — MISSING" : ""}
              </li>
            ))}
          </ul>

          <h3>Company Documents</h3>
          <ul className="checklist">
            {status.health.companyDocuments.map((item) => (
              <li key={item.name}>
                {mark(item.ok)} {item.name}
                {!item.ok ? " — MISSING" : ""}
              </li>
            ))}
          </ul>

          <div className="stack" style={{ gap: 8 }}>
            {status.companyDocuments.map((folder) => (
              <div key={folder.key}>
                <strong>{folder.folderName}</strong>
                {folder.files.length === 0 ? (
                  <div className="muted">No files</div>
                ) : (
                  <ul className="checklist">
                    {folder.files.map((file) => (
                      <li key={file.id}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                          <span>
                            {file.name}{" "}
                            <span className="muted">
                              ({file.validity}
                              {file.validUntil ? ` · until ${file.validUntil}` : ""})
                            </span>
                          </span>
                          <button
                            type="button"
                            className="btn ghost"
                            onClick={() => void openExternalUrl(file.webViewLink)}
                          >
                            Open in Drive
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>

          <h3>Templates</h3>
          <ul className="checklist">
            {status.templates.map((template) => (
              <li key={template.key}>
                {template.selection.status === "READY" ? (
                  <>
                    ✓ {template.folderName} — {template.selection.file.name}{" "}
                    <button
                      type="button"
                      className="btn ghost"
                      onClick={() =>
                        void openExternalUrl(template.selection.status === "READY"
                          ? template.selection.file.webViewLink
                          : "")
                      }
                    >
                      Open
                    </button>
                  </>
                ) : template.selection.status === "NEEDS_CONFIGURATION" ? (
                  <div>
                    ⚠ {template.folderName} — Needs Configuration
                    <select
                      aria-label={`Select master ${template.folderName}`}
                      defaultValue=""
                      onChange={(e) => {
                        const fileId = e.target.value;
                        if (!fileId) return;
                        void window.tekia!.drive
                          .chooseTemplate(template.key, fileId)
                          .then(() => load(false));
                      }}
                    >
                      <option value="">Select master template…</option>
                      {template.selection.candidates.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <>⚠ {template.folderName} — MISSING</>
                )}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
};
