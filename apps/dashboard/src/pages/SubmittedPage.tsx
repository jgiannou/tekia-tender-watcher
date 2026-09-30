import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type SubmissionListItem } from "../api";
import { formatDateTime, formatEuro, statusClass } from "../lib/format";
import {
  UI,
  getGreekRecordTypeLabel,
  getGreekStatusLabel,
  getGreekSubmissionMethodLabel,
} from "../lib/ui-labels";

const FILTERS = [
  { id: "all", label: "Όλα" },
  { id: "pending", label: "Εκκρεμή" },
  { id: "won", label: "Επιτυχή" },
  { id: "lost", label: "Ανεπιτυχή" },
] as const;

export const SubmittedPage = () => {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");
  const [items, setItems] = useState<SubmissionListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api
      .submissions(filter)
      .then((response) => {
        setItems(response.items);
        setError(null);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const handleResult = async (id: string, result: "WON" | "LOST" | "PENDING") => {
    try {
      await api.updateSubmissionResult(id, result);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h1 style={{ margin: 0, fontSize: "1.05rem" }}>{UI.navSubmitted}</h1>
          <p className="muted" style={{ margin: "4px 0 0" }}>
            Σε ποια αιτήματα έχουμε ήδη υποβάλει;
          </p>
        </div>
        <div className="filters">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`filter-btn${filter === item.id ? " active" : ""}`}
              onClick={() => setFilter(item.id)}
              aria-pressed={filter === item.id}
            >
              {item.label}
            </button>
          ))}
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
              <th>Τύπος</th>
              <th>Υποβολή</th>
              <th>Τρόπος</th>
              <th>Παραλήπτης</th>
              <th>Ποσό</th>
              <th>Αποτέλεσμα</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={9} className="muted">
                  Δεν υπάρχουν υποβολές ακόμη.
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id}>
                  <td>{item.organization ?? "—"}</td>
                  <td>
                    <Link to={`/tenders/${encodeURIComponent(item.referenceNumber)}`}>
                      {item.title ?? "—"}
                    </Link>
                  </td>
                  <td>
                    <code>{item.referenceNumber}</code>
                  </td>
                  <td>{getGreekRecordTypeLabel(item.recordType ?? "")}</td>
                  <td>{formatDateTime(item.submittedAt)}</td>
                  <td>{getGreekSubmissionMethodLabel(item.submissionMethod)}</td>
                  <td>{item.recipient ?? "—"}</td>
                  <td>{formatEuro(item.amountWithoutVat)}</td>
                  <td>
                    <div className="stack" style={{ gap: 6 }}>
                      <span className={statusClass(item.result)}>
                        {getGreekStatusLabel(item.result)}
                      </span>
                      {item.result === "PENDING" ? (
                        <div className="actions" style={{ marginTop: 0 }}>
                          <button
                            type="button"
                            className="btn"
                            onClick={() => void handleResult(item.id, "WON")}
                          >
                            Επιτυχές
                          </button>
                          <button
                            type="button"
                            className="btn"
                            onClick={() => void handleResult(item.id, "LOST")}
                          >
                            Ανεπιτυχές
                          </button>
                        </div>
                      ) : null}
                    </div>
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
