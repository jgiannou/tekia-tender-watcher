import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type OpportunitiesResponse } from "../api";
import { formatDateTime, formatEuro, statusClass } from "../lib/format";
import {
  UI,
  getGreekCategoryLabel,
  getGreekRecordTypeLabel,
  getGreekStatusLabel,
} from "../lib/ui-labels";

const FILTERS = [
  { id: "all", label: "Όλα" },
  { id: "new", label: "Νέα" },
  { id: "review", label: "Υπό εξέταση" },
  { id: "ready", label: "Έτοιμα" },
  { id: "req", label: "REQ" },
  { id: "proc", label: "PROC" },
] as const;

export const OpportunitiesPage = () => {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");
  const [data, setData] = useState<OpportunitiesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .opportunities(filter)
      .then((response) => {
        if (!cancelled) {
          setData(response);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filter]);

  return (
    <div className="opportunities-layout">
      <div className="counters" aria-label="Μετρητές ευκαιριών">
        <div className="counter">
          <div className="label">Νέα</div>
          <div className="value">{data?.counters.new ?? "—"}</div>
        </div>
        <div className="counter">
          <div className="label">Έτοιμα</div>
          <div className="value">{data?.counters.ready ?? "—"}</div>
        </div>
        <div className="counter">
          <div className="label">Υποβληθέντα μήνα</div>
          <div className="value">{data?.counters.submittedThisMonth ?? "—"}</div>
        </div>
        <div className="counter">
          <div className="label">Εκκρεμές αποτέλεσμα</div>
          <div className="value">{data?.counters.pendingResult ?? "—"}</div>
        </div>
      </div>

      <section className="panel">
        <div className="panel-header">
          <h1 style={{ margin: 0, fontSize: "1.05rem" }}>{UI.navOpportunities}</h1>
          <div className="filters" role="tablist" aria-label="Φίλτρα">
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

        {!loading && data ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Βαθμολογία</th>
                  <th>Κατηγορία</th>
                  <th>Φορέας</th>
                  <th>Τίτλος</th>
                  <th>ADAM</th>
                  <th>Τύπος</th>
                  <th>Προϋπολογισμός</th>
                  <th>Προθεσμία</th>
                  <th>Κατάσταση</th>
                  <th>Εντοπίστηκε</th>
                  <th>Ενέργεια</th>
                </tr>
              </thead>
              <tbody>
                {data.items.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="muted">
                      Δεν υπάρχουν ευκαιρίες για αυτό το φίλτρο.
                    </td>
                  </tr>
                ) : (
                  data.items.map((item) => (
                    <tr key={item.referenceNumber}>
                      <td>{item.score ?? "—"}</td>
                      <td>{getGreekCategoryLabel(item.category)}</td>
                      <td>{item.organization ?? "—"}</td>
                      <td>{item.title ?? "—"}</td>
                      <td>
                        <code>{item.referenceNumber}</code>
                      </td>
                      <td>{getGreekRecordTypeLabel(item.recordType)}</td>
                      <td>{formatEuro(item.budgetWithoutVat)}</td>
                      <td>{formatDateTime(item.deadline)}</td>
                      <td>
                        <span className={statusClass(item.status)}>
                          {getGreekStatusLabel(item.status)}
                        </span>
                      </td>
                      <td>{formatDateTime(item.detectedAt)}</td>
                      <td>
                        <Link
                          className="btn"
                          to={`/tenders/${encodeURIComponent(item.referenceNumber)}`}
                        >
                          {UI.open}
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </div>
  );
};
