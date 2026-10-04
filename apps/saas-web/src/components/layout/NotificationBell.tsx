import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, Check } from "lucide-react";
import { useSessionContext } from "@/auth/SessionProvider";
import { AttentionEventContent } from "@/components/AttentionEventContent";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { attentionEventViewModel } from "@/lib/attention-content";
import { attentionEventHref } from "@/lib/attention-routing";
import { saasApi, type AttentionEvent } from "@/lib/api";

export const NotificationBell = () => {
  const navigate = useNavigate();
  const { activeOrganization } = useSessionContext();
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState<AttentionEvent[]>([]);

  const load = async () => {
    if (!activeOrganization) {
      setEvents([]);
      return;
    }
    try {
      const data = await saasApi.attention(activeOrganization.id);
      setEvents(data.events);
    } catch {
      setEvents([]);
    }
  };

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(timer);
  }, [activeOrganization?.id]);

  const unread = events.filter((event) => !event.readAt);
  const recent = events.slice(0, 8);

  const handleOpenEvent = async (event: AttentionEvent) => {
    if (!activeOrganization) return;
    if (!event.readAt) {
      await saasApi.markAttentionRead(activeOrganization.id, event.id).catch(() => null);
      await load();
    }
    setOpen(false);
    navigate(attentionEventHref(event));
  };

  const handleMarkRead = async (event: AttentionEvent) => {
    if (!activeOrganization || event.readAt) return;
    await saasApi.markAttentionRead(activeOrganization.id, event.id).catch(() => null);
    await load();
  };

  const handleMarkAll = async () => {
    if (!activeOrganization) return;
    await saasApi.markAllAttentionRead(activeOrganization.id);
    await load();
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="relative gap-2"
          aria-label="Ειδοποιήσεις"
        >
          <Bell className="h-4 w-4" />
          {unread.length > 0 ? (
            <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
              {unread.length > 99 ? "99+" : unread.length}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[380px] p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <div className="text-sm font-semibold">Ειδοποιήσεις</div>
            <div className="text-xs text-muted-foreground">
              {unread.length === 1
                ? "1 μη αναγνωσμένη"
                : `${unread.length} μη αναγνωσμένες`}
            </div>
          </div>
          {unread.length > 0 ? (
            <Button size="sm" variant="ghost" onClick={() => void handleMarkAll()}>
              Όλα αναγνωσμένα
            </Button>
          ) : null}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {recent.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              Δεν υπάρχουν ειδοποιήσεις ακόμη.
            </div>
          ) : (
            recent.map((event) => (
              <div
                key={event.id}
                className="flex w-full items-start gap-1 border-b border-border px-2 py-2 hover:bg-muted/60"
              >
                <button
                  type="button"
                  className="flex min-w-0 flex-1 cursor-pointer items-start gap-2 px-2 py-1 text-left"
                  onClick={() => void handleOpenEvent(event)}
                  aria-label={attentionEventViewModel(event).primaryFull}
                >
                  <AttentionEventContent event={event} className="flex-1" />
                  {!event.readAt ? (
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                  ) : null}
                </button>
                {!event.readAt ? (
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="mt-1 h-8 w-8 shrink-0"
                    aria-label="Σήμανση ως αναγνωσμένο"
                    title="Σήμανση ως αναγνωσμένο"
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleMarkRead(event);
                    }}
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                ) : null}
              </div>
            ))
          )}
        </div>
        <div className="border-t border-border p-2">
          <Button
            variant="ghost"
            className="w-full"
            onClick={() => {
              setOpen(false);
              navigate("/app/notifications");
            }}
          >
            Όλες οι ειδοποιήσεις
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};
