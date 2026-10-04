import { attentionEventViewModel } from "@/lib/attention-content";
import type { AttentionEvent } from "@/lib/api";
import { cn } from "@/lib/utils";

type AttentionEventContentProps = {
  event: AttentionEvent;
  className?: string;
};

/** Shared structured notification body for bell + Notifications page. */
export const AttentionEventContent = ({
  event,
  className,
}: AttentionEventContentProps) => {
  const view = attentionEventViewModel(event);
  return (
    <div className={cn("min-w-0 space-y-1", className)}>
      <div className="text-xs font-medium text-muted-foreground">{view.eyebrow}</div>
      <div
        className="line-clamp-2 text-sm font-medium leading-snug"
        title={view.primaryFull}
        aria-label={view.primaryFull}
      >
        {view.primary}
      </div>
      <div className="text-xs text-muted-foreground">{view.secondary}</div>
      {view.context ? (
        <div className="text-xs text-muted-foreground">{view.context}</div>
      ) : null}
    </div>
  );
};
