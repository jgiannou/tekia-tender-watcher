import { FormEvent, useEffect, useState } from "react";
import { isDesktop } from "../api";

type ConnectionRecord = { apiUrl: string; hasToken: boolean };

export const DesktopConnectionPanel = () => {
  const [conn, setConn] = useState<ConnectionRecord | null>(null);
  const [status, setStatus] = useState<string>("disconnected");
  const [message, setMessage] = useState<string>("");
  const [apiUrl, setApiUrl] = useState("");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isDesktop() || !window.tekia) return;
    void window.tekia.connection.get().then((value) => {
      setConn(value);
      setApiUrl(value.apiUrl);
    });
  }, []);

  if (!isDesktop() || !window.tekia) return null;

  const handleTest = async () => {
    setBusy(true);
    try {
      const result = await window.tekia!.connection.test({
        apiUrl: apiUrl || undefined,
        token: token.trim() ? token.trim() : undefined,
      });
      setStatus(result.status);
      setMessage(result.message);
    } catch (err) {
      setStatus("unreachable");
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleSave = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const saved = await window.tekia!.connection.save({
        apiUrl,
        token: token.trim() ? token.trim() : null,
      });
      setConn(saved);
      setToken("");
      const result = await window.tekia!.connection.test();
      setStatus(result.status);
      setMessage(
        result.status === "connected"
          ? "Saved and connected. Token is stored securely and will not be shown again."
          : `Saved. ${result.message}`,
      );
    } catch (err) {
      setStatus("unreachable");
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const statusLabel =
    status === "connected"
      ? "Connected"
      : status === "invalid_token"
        ? "Invalid Token"
        : status === "not_configured"
          ? "Disconnected"
          : status === "unreachable"
            ? "API Unreachable"
            : "Disconnected";

  return (
    <section className="card form-grid">
      <h2>Desktop Connection</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        Cloud Watcher API credentials stay in the Electron main process (encrypted
        with macOS safeStorage). The renderer never receives the raw token.
      </p>
      <div className="meta-grid">
        <div className="meta-item">
          <span className="k">Status</span>
          <span className="v">{statusLabel}</span>
        </div>
        <div className="meta-item">
          <span className="k">Token on disk</span>
          <span className="v">{conn?.hasToken ? "Saved (hidden)" : "Not set"}</span>
        </div>
      </div>
      <form className="form-grid" onSubmit={(e) => void handleSave(e)}>
        <label>
          Watcher API URL
          <input
            value={apiUrl}
            onChange={(e) => setApiUrl(e.target.value)}
            placeholder="https://tenders-api.tekia.gr"
            required
          />
        </label>
        <label>
          Operator API Token
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={conn?.hasToken ? "•••••••• (leave blank to keep)" : ""}
            autoComplete="off"
          />
        </label>
        {message ? (
          <div className={status === "connected" ? "alert-box" : "error"}>
            {message}
          </div>
        ) : null}
        <div className="actions">
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() => void handleTest()}
          >
            Test Connection
          </button>
          <button type="submit" className="btn primary" disabled={busy}>
            Save
          </button>
        </div>
      </form>
    </section>
  );
};
