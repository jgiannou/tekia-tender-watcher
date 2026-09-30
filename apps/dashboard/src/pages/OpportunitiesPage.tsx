import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type OpportunitiesResponse } from "../api";
import { formatDateTime, formatEuro, statusClass } from "../lib/format";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "new", label: "New" },
  { id: "review", label: "Review" },
  { id: "ready", label: "Ready" },
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
    <div className="stack">
      <div className="counters" aria-label="Opportunity counters">
        <div className="counter">
          <div className="label">New</div>
          <div className="value">{data?.counters.new ?? "—"}</div>
        </div>
        <div className="counter">
          <div className="label">Ready</div>
          <div className="value">{data?.counters.ready ?? "—"}</div>
        </div>
        <div className="counter">
          <div className="label">Submitted this month</div>
          <div className="value">{data?.counters.submittedThisMonth ?? "—"}</div>
        </div>
        <div className="counter">
          <div className="label">Pending result</div>
          <div className="value">{data?.counters.pendingResult ?? "—"}</div>
        </div>
      </div>

      <section className="panel">
        <div className="panel-header">
          <h1 style={{ margin: 0, fontSize: "1.05rem" }}>Opportunities</h1>
          <div className="filters" role="tablist" aria-label="Filters">
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
        {loading ? <p className="muted" style={{ padding: 16 }}>Loading…</p> : null}

        {!loading && data ? (
          <table>
            <thead>
              <tr>
                <th>Score</th>
                <th>Category</th>
                <th>Organization</th>
                <th>Title</th>
                <th>ADAM</th>
                <th>Type</th>
                <th>Budget</th>
                <th>Deadline</th>
                <th>Status</th>
                <th>Detected</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {data.items.length === 0 ? (
                <tr>
                  <td colSpan={11} className="muted">
                    No opportunities for this filter.
                  </td>
                </tr>
              ) : (
                data.items.map((item) => (
                  <tr key={item.referenceNumber}>
                    <td>{item.score ?? "—"}</td>
                    <td>{item.category ?? "—"}</td>
                    <td>{item.organization ?? "—"}</td>
                    <td>{item.title ?? "—"}</td>
                    <td>
                      <code>{item.referenceNumber}</code>
                    </td>
                    <td>{item.recordType}</td>
                    <td>{formatEuro(item.budgetWithoutVat)}</td>
                    <td>{formatDateTime(item.deadline)}</td>
                    <td>
                      <span className={statusClass(item.status)}>{item.status}</span>
                    </td>
                    <td>{formatDateTime(item.detectedAt)}</td>
                    <td>
                      <Link
                        className="btn"
                        to={`/tenders/${encodeURIComponent(item.referenceNumber)}`}
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        ) : null}
      </section>
    </div>
  );
};
