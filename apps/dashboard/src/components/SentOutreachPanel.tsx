import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type OpportunityItem } from "../api";
import { formatDateTime, statusClass } from "../lib/format";
import { UI } from "../lib/ui-labels";

const sentAtValue = (item: OpportunityItem): number =>
  item.outreachSentAt ? Date.parse(item.outreachSentAt) || 0 : 0;

export const SentOutreachPanel = () => {
  const [items, setItems] = useState<OpportunityItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api
      .opportunities("req")
      .then((response) => {
        if (cancelled) return;
        const sentItems = response.items
          .filter((item) => item.outreachStatus === "SENT")
          .sort((a, b) => sentAtValue(b) - sentAtValue(a));
        setItems(sentItems);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="panel" aria-labelledby="sent-outreach-title">
      <div className="panel-header">
        <div>
          <h2 id="sent-outreach-title" style={{ margin: 0, fontSize: "1.05rem" }}>
            Πρωτογενή αιτήματα με αποσταλμένο email
          </h2>
          <p className="muted" style={{ margin: "4px 0 0" }}>
            Σε ποια πρωτογενή αιτήματα έχουμε στείλει εκδήλωση ενδιαφέροντος;
          </p>
        </div>
      </div>

      {error ? <div className="error" style={{ margin: 12 }}>{error}</div> : null}
      {loading ? (
        <p className="muted" style={{ padding: 16 }}>
          {UI.loading}
        </p>
      ) : null}

      {!loading ? (
        <table>
          <thead>
            <tr>
              <th>Φορέας</th>
              <th>Τίτλος</th>
              <th>ADAM</th>
              <th>Αποστολή</th>
              <th>Παραλήπτης</th>
              <th>Θέμα</th>
              <th>Παρακολούθηση</th>
              <th>Σχετική πρόσκληση</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={8} className="muted">
                  Δεν έχουμε στείλει email σε πρωτογενή αιτήματα ακόμη.
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.referenceNumber}>
                  <td>{item.organization ?? "—"}</td>
                  <td>
                    <Link to={`/tenders/${encodeURIComponent(item.referenceNumber)}`}>
                      {item.title ?? "—"}
                    </Link>
                  </td>
                  <td>
                    <code>{item.referenceNumber}</code>
                  </td>
                  <td>{formatDateTime(item.outreachSentAt)}</td>
                  <td>{item.outreachRecipient ?? "—"}</td>
                  <td>{item.outreachSubject ?? "—"}</td>
                  <td>
                    {item.monitoringState && item.monitoringState !== "NONE" ? (
                      <span className={statusClass(item.monitoringState)}>
                        {item.monitoringStateLabel}
                      </span>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>
                    {item.relatedProcAdam ? (
                      <Link to={`/tenders/${encodeURIComponent(item.relatedProcAdam)}`}>
                        <code>{item.relatedProcAdam}</code>
                      </Link>
                    ) : (
                      <span className="muted">Δεν έχει εντοπιστεί ακόμη</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      ) : null}
    </section>
  );
};
