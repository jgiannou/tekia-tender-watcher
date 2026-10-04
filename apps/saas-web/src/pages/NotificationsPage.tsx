import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSessionContext } from "@/auth/SessionProvider";
import { Pagination, usePaginatedList } from "@/components/Pagination";
import { EmptyState, ErrorState, PageSkeleton } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { saasApi, type AttentionEvent } from "@/lib/api";

export const NotificationsPage = () => {
  const navigate = useNavigate();
  const { activeOrganization } = useSessionContext();
  const [events, setEvents] = useState<AttentionEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const paged = usePaginatedList(events);

  const load = async () => {
    if (!activeOrganization) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await saasApi.attention(activeOrganization.id);
      setEvents(data.events);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Αποτυχία φόρτωσης");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [activeOrganization?.id]);

  if (loading) return <PageSkeleton />;
  if (!activeOrganization) {
    return (
      <EmptyState
        title="Χωρίς οργανισμό"
        description="Δημιουργήστε οργανισμό για να δείτε ειδοποιήσεις."
      />
    );
  }
  if (error) return <ErrorState description={error} onRetry={() => void load()} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Ειδοποιήσεις</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Οργανωτικά γεγονότα προσοχής — ανεξάρτητα από την παράδοση email.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => void saasApi.markAllAttentionRead(activeOrganization.id).then(load)}
        >
          Σήμανση όλων ως αναγνωσμένα
        </Button>
      </div>

      {events.length === 0 ? (
        <EmptyState
          title="Καμία ειδοποίηση"
          description="Όταν εντοπιστούν σχετικές εξελίξεις σε παρακολουθούμενα, θα εμφανιστούν εδώ."
          actionLabel="Παρακολουθούμενα"
          onAction={() => navigate("/app/monitoring")}
        />
      ) : (
        <div className="space-y-2">
          {paged.pageItems.map((event) => (
            <Card key={event.id}>
              <CardContent className="flex items-start justify-between gap-3 px-4 py-4">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-medium">{event.title}</div>
                    {!event.readAt ? <Badge variant="warning">Νέο</Badge> : null}
                  </div>
                  <div className="mt-1 font-mono text-xs text-muted-foreground">
                    {event.type}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {new Date(event.createdAt).toLocaleString("el-GR")}
                  </div>
                </div>
                <div className="flex gap-2">
                  {!event.readAt ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        void saasApi
                          .markAttentionRead(activeOrganization.id, event.id)
                          .then(load)
                      }
                    >
                      Αναγνωσμένο
                    </Button>
                  ) : null}
                  <Button size="sm" onClick={() => navigate("/app/monitoring")}>
                    Προβολή
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
          <Pagination
            page={paged.page}
            totalPages={paged.totalPages}
            total={paged.total}
            pageSize={paged.pageSize}
            onPageChange={paged.setPage}
          />
        </div>
      )}
    </div>
  );
};
