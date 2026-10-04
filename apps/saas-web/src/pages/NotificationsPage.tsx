import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSessionContext } from "@/auth/SessionProvider";
import { AttentionEventContent } from "@/components/AttentionEventContent";
import { Pagination, usePaginatedList } from "@/components/Pagination";
import { EmptyState, ErrorState, PageSkeleton } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { attentionEventHref } from "@/lib/attention-routing";
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

  const handleOpen = async (event: AttentionEvent) => {
    if (!event.readAt) {
      await saasApi.markAttentionRead(activeOrganization.id, event.id).catch(() => null);
      await load();
    }
    navigate(attentionEventHref(event));
  };

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
              <CardContent className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 flex-1 items-start gap-2">
                  <AttentionEventContent event={event} className="flex-1" />
                  {!event.readAt ? <Badge variant="warning">Νέο</Badge> : null}
                </div>
                <div className="flex shrink-0 gap-2">
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
                      Σήμανση ως αναγνωσμένο
                    </Button>
                  ) : null}
                  <Button size="sm" onClick={() => void handleOpen(event)}>
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
