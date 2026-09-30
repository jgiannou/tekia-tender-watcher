import { FormEvent, useEffect, useState } from "react";
import { api, type OperatorSettings, type SafeConfig } from "../api";
import { DesktopConnectionPanel } from "../components/DesktopConnectionPanel";

export const SettingsPage = () => {
  const [settings, setSettings] = useState<OperatorSettings | null>(null);
  const [config, setConfig] = useState<SafeConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.settings(), api.config()])
      .then(([nextSettings, nextConfig]) => {
        setSettings(nextSettings);
        setConfig(nextConfig);
        setError(null);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!settings) return;
    const form = new FormData(event.currentTarget);

    const next: OperatorSettings = {
      company: {
        legal_name: String(form.get("legal_name") || ""),
        brand_name: String(form.get("brand_name") || ""),
        trading_name: String(form.get("trading_name") || ""),
        contact_name: String(form.get("contact_name") || ""),
        email: String(form.get("email") || ""),
        phone: String(form.get("phone") || ""),
        address: String(form.get("address") || ""),
        vat_number: String(form.get("vat_number") || ""),
        tax_office: String(form.get("tax_office") || ""),
        gemi_number: String(form.get("gemi_number") || ""),
        distinctive_title_confirmed: form.get("distinctive_title_confirmed") === "on",
      },
      drive: {
        company_documents_folder_url: String(
          form.get("company_documents_folder_url") || "",
        ),
        templates_folder_url: String(form.get("templates_folder_url") || ""),
        submissions_folder_url: String(form.get("submissions_folder_url") || ""),
      },
      documents: settings.documents.map((doc) => ({
        ...doc,
        drive_url: String(form.get(`doc_url_${doc.key}`) || ""),
        expiry_date: String(form.get(`doc_expiry_${doc.key}`) || "") || null,
        status: String(form.get(`doc_status_${doc.key}`) || doc.status),
      })),
    };

    try {
      const saved = await api.saveSettings(next);
      setSettings(saved);
      setMessage("Settings saved to cloud watcher DB.");
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  if (loading) {
    return (
      <div className="stack">
        <DesktopConnectionPanel />
        <p className="muted">Loading settings…</p>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="stack">
        <DesktopConnectionPanel />
        <div className="error" role="alert">
          {error ?? "Cloud settings unavailable. Save Desktop Connection first, then retry."}
        </div>
        <div className="actions">
          <button type="button" className="btn" onClick={() => window.location.reload()}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="stack">
      <DesktopConnectionPanel />
      <form className="stack" onSubmit={(e) => void handleSave(e)}>
      {message ? <div className="alert-box">{message}</div> : null}
      {error ? <div className="error">{error}</div> : null}

      <section className="card form-grid">
        <h2>Company</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Distinguish legal identity from brand / trading identity. TEKIA is brand
          unless you explicitly confirm otherwise.
        </p>
        <div className="grid-2">
          <label>
            Legal name
            <input name="legal_name" defaultValue={settings.company.legal_name} />
          </label>
          <label>
            Brand name
            <input name="brand_name" defaultValue={settings.company.brand_name} />
          </label>
          <label>
            Trading name
            <input name="trading_name" defaultValue={settings.company.trading_name} />
          </label>
          <label>
            Contact name
            <input name="contact_name" defaultValue={settings.company.contact_name} />
          </label>
          <label>
            Email
            <input name="email" defaultValue={settings.company.email} />
          </label>
          <label>
            Phone
            <input name="phone" defaultValue={settings.company.phone} />
          </label>
          <label>
            Address
            <input name="address" defaultValue={settings.company.address} />
          </label>
          <label>
            VAT number
            <input name="vat_number" defaultValue={settings.company.vat_number} />
          </label>
          <label>
            Tax office
            <input name="tax_office" defaultValue={settings.company.tax_office} />
          </label>
          <label>
            GEMI number
            <input name="gemi_number" defaultValue={settings.company.gemi_number} />
          </label>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="checkbox"
            name="distinctive_title_confirmed"
            defaultChecked={settings.company.distinctive_title_confirmed}
          />
          Confirmed registered distinctive title TEKIA
        </label>
      </section>

      <section className="card form-grid">
        <h2>Drive</h2>
        <label>
          Company Documents folder URL / ID
          <input
            name="company_documents_folder_url"
            defaultValue={settings.drive.company_documents_folder_url}
          />
        </label>
        <label>
          Templates folder URL / ID
          <input
            name="templates_folder_url"
            defaultValue={settings.drive.templates_folder_url}
          />
        </label>
        <label>
          Submissions folder URL / ID
          <input
            name="submissions_folder_url"
            defaultValue={settings.drive.submissions_folder_url}
          />
        </label>
      </section>

      <section className="card form-grid">
        <h2>Documents</h2>
        {settings.documents.map((doc) => (
          <div key={doc.key} className="grid-2" style={{ alignItems: "end" }}>
            <label>
              {doc.name} Drive URL
              <input name={`doc_url_${doc.key}`} defaultValue={doc.drive_url} />
            </label>
            <label>
              Expiry
              <input
                name={`doc_expiry_${doc.key}`}
                type="date"
                defaultValue={doc.expiry_date ?? ""}
              />
            </label>
            <label>
              Status
              <select name={`doc_status_${doc.key}`} defaultValue={doc.status}>
                {[
                  "AVAILABLE",
                  "MISSING",
                  "EXPIRED",
                  "REQUIRED",
                  "NOT_REQUIRED",
                  "UNKNOWN",
                ].map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ))}
      </section>

      <section className="card">
        <h2>Watcher config</h2>
        <p className="muted">Safe values only — secrets are never shown.</p>
        {config ? (
          <div className="meta-grid">
            <div className="meta-item">
              <span className="k">Poll interval</span>
              <span className="v">{config.pollIntervalMinutes} min</span>
            </div>
            <div className="meta-item">
              <span className="k">Lookback</span>
              <span className="v">{config.lookbackHours} h</span>
            </div>
            <div className="meta-item">
              <span className="k">Budget range</span>
              <span className="v">
                €{config.minBudget} – €{config.maxBudget}
              </span>
            </div>
            <div className="meta-item">
              <span className="k">Alert threshold</span>
              <span className="v">{config.alertScoreThreshold}</span>
            </div>
            <div className="meta-item">
              <span className="k">Local dashboard URL</span>
              <span className="v">{config.localDashboardUrl ?? "not set"}</span>
            </div>
            <div className="meta-item">
              <span className="k">Sending configured</span>
              <span className="v">{config.sendingConfigured ? "yes" : "no"}</span>
            </div>
          </div>
        ) : null}
      </section>

      <div className="actions">
        <button type="submit" className="btn primary">
          Save settings
        </button>
      </div>
    </form>
    </div>
  );
};
