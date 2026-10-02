import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type OpportunitiesResponse } from "../api";
import { formatDateTime, formatEuro, statusClass } from "../lib/format";
import {
  UI,
  getGreekCategoryLabel,
  getGreekDocumentStatusLabel,
  getGreekRecordTypeLabel,
  getGreekStatusLabel,
} from "../lib/ui-labels";

const FILTERS = [
  { id: "all", label: "Όλα" },
  { id: "new", label: "Νέες" },
  { id: "monitored", label: "Παρακολουθούμενες" },
  { id: "formal", label: "Επίσημες" },
  { id: "closed", label: "Κλειστές" },
  { id: "review", label: "Υπό εξέταση" },
  { id: "ready", label: "Έτοιμα" },
  { id: "req", label: "REQ" },
  { id: "proc", label: "PROC" },
] as const;

type OpportunityFilterId = (typeof FILTERS)[number]["id"];

const FILTER_STORAGE_KEY = "tekia.opportunities.filter";
const cacheStorageKey = (filter: OpportunityFilterId) =>
  `tekia.opportunities.cache.${filter}`;

const isOpportunityFilterId = (value: unknown): value is OpportunityFilterId =>
  FILTERS.some((item) => item.id === value);

const readStoredFilter = (): OpportunityFilterId => {
  try {
    const stored = localStorage.getItem(FILTER_STORAGE_KEY);
    return isOpportunityFilterId(stored) ? stored : "all";
  } catch {
    return "all";
  }
};

const readCachedOpportunities = (
  filter: OpportunityFilterId,
): OpportunitiesResponse | null => {
  try {
    const raw = localStorage.getItem(cacheStorageKey(filter));
    return raw ? (JSON.parse(raw) as OpportunitiesResponse) : null;
  } catch {
    return null;
  }
};

const writeCachedOpportunities = (
  filter: OpportunityFilterId,
  response: OpportunitiesResponse,
): void => {
  try {
    localStorage.setItem(cacheStorageKey(filter), JSON.stringify(response));
  } catch {
    // Storage full or unavailable — cache is best-effort only.
  }
};

const outreachLabel = (status: string | null | undefined): string => {
  if (!status || status === "NOT_STARTED") return "—";
  if (status === "SENT") return "ΑΠΟΣΤΑΛΘΗΚΕ";
  return getGreekDocumentStatusLabel(status);
};

export const OpportunitiesPage = () => {
  const [filter, setFilter] = useState<OpportunityFilterId>(readStoredFilter);
  const [data, setData] = useState<OpportunitiesResponse | null>(() =>
    readCachedOpportunities(readStoredFilter()),
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const handleFilterChange = (nextFilter: OpportunityFilterId) => {
    try {
      localStorage.setItem(FILTER_STORAGE_KEY, nextFilter);
    } catch {
      // Ignore — filter still applies for this session.
    }
    setData(readCachedOpportunities(nextFilter));
    setFilter(nextFilter);
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .opportunities(filter)
      .then((response) => {
        if (!cancelled) {
          setData(response);
          setError(null);
          writeCachedOpportunities(filter, response);
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
          <div className="label">Νέες</div>
          <div className="value">{data?.counters.new ?? "—"}</div>
        </div>
        <div className="counter">
          <div className="label">Παρακολουθούμενες</div>
          <div className="value">{data?.counters.monitored ?? "—"}</div>
        </div>
        <div className="counter">
          <div className="label">Επίσημες</div>
          <div className="value">{data?.counters.formal ?? "—"}</div>
        </div>
        <div className="counter">
          <div className="label">Κλειστές</div>
          <div className="value">{data?.counters.closed ?? "—"}</div>
        </div>
        <div className="counter">
          <div className="label">Υποβληθέντα μήνα</div>
          <div className="value">{data?.counters.submittedThisMonth ?? "—"}</div>
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
                onClick={() => handleFilterChange(item.id)}
                aria-pressed={filter === item.id}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {error ? <div className="error" style={{ margin: 12 }}>{error}</div> : null}
        {loading && !data ? (
          <p className="muted" style={{ padding: 16 }}>
            {UI.loading}
          </p>
        ) : null}
        {loading && data ? (
          <p className="muted" style={{ padding: "4px 16px", fontSize: 12 }} aria-live="polite">
            Ανανέωση…
          </p>
        ) : null}

        {data ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Βαθμολογία</th>
                  <th>Φορέας</th>
                  <th>Τίτλος</th>
                  <th>ADAM</th>
                  <th>Εκδήλωση ενδιαφέροντος</th>
                  <th>Παρακολούθηση</th>
                  <th>Σχετική πρόσκληση</th>
                  <th>Προϋπολογισμός</th>
                  <th>Κατάσταση</th>
                  <th>Ενέργεια</th>
                </tr>
              </thead>
              <tbody>
                {data.items.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="muted">
                      Δεν υπάρχουν ευκαιρίες για αυτό το φίλτρο.
                    </td>
                  </tr>
                ) : (
                data.items.map((item) => (
                  <tr
                    key={item.referenceNumber}
                    className={item.linkedNotInvited ? "row-deprioritized" : undefined}
                  >
                    <td>{item.score ?? "—"}</td>
                    <td>
                      {item.organization ?? "—"}
                      <div className="muted" style={{ fontSize: 12 }}>
                        {getGreekCategoryLabel(item.category)}
                      </div>
                    </td>
                    <td>
                      {item.title ?? "—"}
                      {item.linkedNotInvited ? (
                        <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                          Στοχευμένη πρόσκληση — δεν προσκληθήκαμε
                        </div>
                      ) : null}
                      {item.possibleRelation ? (
                        <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                          Πιθανή συνέχεια Πρωτογενούς Αιτήματος
                        </div>
                      ) : null}
                    </td>
                    <td>
                      <code>{item.referenceNumber}</code>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {getGreekRecordTypeLabel(item.recordType)}
                      </div>
                    </td>
                    <td>
                      {item.outreachStatus && item.outreachStatus !== "NOT_STARTED" ? (
                        <>
                          <span className={statusClass(item.outreachStatus)}>
                            {outreachLabel(item.outreachStatus)}
                          </span>
                          {item.outreachSentAt ? (
                            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                              {formatDateTime(item.outreachSentAt)}
                            </div>
                          ) : null}
                          {item.outreachRecipient ? (
                            <div className="muted" style={{ fontSize: 12 }}>
                              {item.outreachRecipient}
                            </div>
                          ) : null}
                        </>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td>
                      {item.monitoringState && item.monitoringState !== "NONE" ? (
                        <>
                          <span className={statusClass(item.monitoringState)}>
                            {item.monitoringStateLabel}
                          </span>
                          {item.watchForRelatedProc ? (
                            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                              Παρακολούθηση ενεργή
                            </div>
                          ) : null}
                        </>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td>
                      {item.relatedProcAdam ? (
                        <>
                          <Link
                            to={`/tenders/${encodeURIComponent(item.relatedProcAdam)}`}
                          >
                            <code>{item.relatedProcAdam}</code>
                          </Link>
                          <div className="muted" style={{ fontSize: 12 }}>
                            {item.relatedProcLinked
                              ? "Συνδεδεμένη"
                              : item.relatedProcPossible
                                ? "Πιθανή"
                                : ""}
                          </div>
                        </>
                      ) : item.outreachStatus === "SENT" ? (
                        <span className="muted">Δεν έχει εντοπιστεί ακόμη</span>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td>{formatEuro(item.budgetWithoutVat)}</td>
                    <td>
                      <span className={statusClass(item.status)}>
                        {getGreekStatusLabel(item.status)}
                      </span>
                      {item.lastEventAt ? (
                        <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                          {formatDateTime(item.lastEventAt)}
                        </div>
                      ) : null}
                    </td>
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
