import { FormEvent, useEffect, useState } from "react";
import { api, isDesktop, type OperatorSettings, type SafeConfig } from "../api";
import { DesktopConnectionPanel } from "../components/DesktopConnectionPanel";
import { DriveVaultPanel } from "../components/DriveVaultPanel";

const emptyCompany = (): OperatorSettings["company"] => ({
  legal_name: "",
  brand_name: "TEKIA",
  trading_name: "TEKIA",
  contact_name: "",
  email: "",
  phone: "",
  address: "",
  vat_number: "",
  tax_office: "",
  gemi_number: "",
  distinctive_title_confirmed: false,
  legal_form: "",
  website: "",
  portfolio_references: "",
  tech_stack: "",
  public_sector_notes: "",
});

export const SettingsPage = () => {
  const [settings, setSettings] = useState<OperatorSettings | null>(null);
  const [config, setConfig] = useState<SafeConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [settingsSource, setSettingsSource] = useState<"local" | "cloud" | null>(
    null,
  );

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        if (isDesktop() && window.tekia?.companySettings) {
          const local = await window.tekia.companySettings.get();
          let company = local.company as OperatorSettings["company"];

          // First run: seed local from cloud if local is empty
          if (!local.hasLocalData) {
            try {
              const cloud = await api.settings();
              if (cloud?.company) {
                const seeded = await window.tekia.companySettings.save(
                  cloud.company,
                );
                company = seeded.company as OperatorSettings["company"];
              }
            } catch {
              // Cloud optional — local empty defaults are fine
            }
          }

          setSettings({
            company: { ...emptyCompany(), ...company },
            drive: {
              company_documents_folder_url: "",
              templates_folder_url: "",
              submissions_folder_url: "",
            },
            documents: [],
          });
          setSettingsSource("local");

          try {
            setConfig(await api.config());
          } catch {
            setConfig(null);
          }
          setError(null);
          return;
        }

        const [nextSettings, nextConfig] = await Promise.all([
          api.settings(),
          api.config(),
        ]);
        setSettings(nextSettings);
        setConfig(nextConfig);
        setSettingsSource("cloud");
        setError(null);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!settings) return;
    const form = new FormData(event.currentTarget);

    const company: OperatorSettings["company"] = {
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
      legal_form: String(form.get("legal_form") || ""),
      website: String(form.get("website") || ""),
      portfolio_references: String(form.get("portfolio_references") || ""),
      tech_stack: String(form.get("tech_stack") || ""),
      public_sector_notes: String(form.get("public_sector_notes") || ""),
    };

    try {
      if (isDesktop() && window.tekia?.companySettings) {
        const saved = await window.tekia.companySettings.save(company);
        setSettings((prev) =>
          prev
            ? {
                ...prev,
                company: saved.company as OperatorSettings["company"],
              }
            : prev,
        );
        setSettingsSource("local");
        setMessage(
          saved.cloudSynced
            ? "Company settings saved on this Mac (survive rebuilds) and mirrored to cloud watcher."
            : `Company settings saved on this Mac (survive rebuilds). Cloud mirror skipped: ${saved.cloudError ?? "unreachable"}.`,
        );
        setError(null);
        return;
      }

      const next: OperatorSettings = {
        company,
        drive: settings.drive,
        documents: settings.documents,
      };
      const saved = await api.saveSettings(next);
      setSettings(saved);
      setMessage("Company settings saved to cloud watcher DB.");
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

  return (
    <div className="stack">
      <DesktopConnectionPanel />
      <DriveVaultPanel />

      {!settings ? (
        <div className="error" role="alert">
          {error ?? "Settings unavailable. Save Desktop Connection first, then retry."}
        </div>
      ) : (
        <form className="stack" onSubmit={(e) => void handleSave(e)}>
          {message ? <div className="alert-box">{message}</div> : null}
          {error ? <div className="error">{error}</div> : null}

          <section className="card form-grid">
            <h2>Company</h2>
            <p className="muted" style={{ marginTop: 0 }}>
              Το Legal name χρησιμοποιείται σε επίσημες προσφορές και δηλώσεις. Το
              Brand χρησιμοποιείται για εμπορική παρουσίαση.
              {settingsSource === "local" ? (
                <>
                  {" "}
                  Stored locally in Electron userData — survives app rebuilds.
                </>
              ) : null}
            </p>

            <h3>LEGAL IDENTITY</h3>
            <div className="grid-2">
              <label>
                Legal name
                <input name="legal_name" defaultValue={settings.company.legal_name} />
              </label>
              <label>
                Legal form
                <input
                  name="legal_form"
                  defaultValue={settings.company.legal_form ?? ""}
                  placeholder="π.χ. ατομική επιχείρηση"
                />
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
              <label>
                Address
                <input name="address" defaultValue={settings.company.address} />
              </label>
            </div>

            <h3>BRAND</h3>
            <p className="muted" style={{ marginTop: 0 }}>
              Do not treat TEKIA as registered distinctive title unless confirmed
              below.
            </p>
            <div className="grid-2">
              <label>
                Brand name
                <input name="brand_name" defaultValue={settings.company.brand_name} />
              </label>
              <label>
                Trading / distinctive title
                <input name="trading_name" defaultValue={settings.company.trading_name} />
              </label>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                name="distinctive_title_confirmed"
                defaultChecked={settings.company.distinctive_title_confirmed}
              />
              Confirmed registered distinctive title
            </label>

            <h3>Operator contact (sender)</h3>
            <p className="muted" style={{ marginTop: 0 }}>
              Used as {`{{CONTACT_NAME}}`} / {`{{CONTACT_EMAIL}}`} /{" "}
              {`{{CONTACT_PHONE}}`} / {`{{LEGAL_REPRESENTATIVE}}`} in generated docs —
              not the tender authority contact.
            </p>
            <div className="grid-2">
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
                Website
                <input
                  name="website"
                  defaultValue={settings.company.website ?? ""}
                  placeholder="https://…"
                />
              </label>
            </div>
            <h3>Company Profile narrative (optional)</h3>
            <p className="muted" style={{ marginTop: 0 }}>
              Fills {`{{PORTFOLIO_REFERENCES}}`}, {`{{TECH_STACK}}`},{" "}
              {`{{PUBLIC_SECTOR_NOTES}}`} on Sync. Leave blank to keep placeholders.
            </p>
            <label>
              {`{{PORTFOLIO_REFERENCES}}`}
              <textarea
                name="portfolio_references"
                defaultValue={settings.company.portfolio_references ?? ""}
              />
            </label>
            <label>
              {`{{TECH_STACK}}`}
              <textarea
                name="tech_stack"
                defaultValue={settings.company.tech_stack ?? ""}
              />
            </label>
            <label>
              {`{{PUBLIC_SECTOR_NOTES}}`}
              <textarea
                name="public_sector_notes"
                defaultValue={settings.company.public_sector_notes ?? ""}
              />
            </label>
            <p className="muted">
              Saving updates the local desktop store
              {settingsSource === "local" ? " (primary)" : ""} and best-effort mirrors
              to the cloud watcher. Sync regenerates{" "}
              <code>Company Documents / Company Profile</code> from the{" "}
              <code>Templates / Company Profile</code> master. Use{" "}
              <strong>Sync Company Profile</strong> in the Drive Vault panel above.
            </p>
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
              Save company settings
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
