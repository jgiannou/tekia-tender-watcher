import { AlertCircle, Inbox, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export const PageLoading = ({ label = "Φόρτωση…" }: { label?: string }) => (
  <div className="flex min-h-56 flex-col items-center justify-center gap-3 text-muted-foreground">
    <Loader2 className="h-5 w-5 animate-spin" />
    <p className="text-sm">{label}</p>
  </div>
);

export const PageSkeleton = () => (
  <div className="space-y-4">
    <Skeleton className="h-8 w-56" />
    <Skeleton className="h-4 w-96 max-w-full" />
    <div className="grid gap-3 md:grid-cols-3">
      <Skeleton className="h-28" />
      <Skeleton className="h-28" />
      <Skeleton className="h-28" />
    </div>
    <Skeleton className="h-64 w-full" />
  </div>
);

export const EmptyState = ({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) => (
  <Card className="border-dashed">
    <CardContent className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      <div className="rounded-full bg-muted p-3">
        <Inbox className="h-5 w-5 text-muted-foreground" />
      </div>
      <div className="space-y-1">
        <h3 className="text-base font-semibold">{title}</h3>
        <p className="max-w-md text-sm text-muted-foreground">{description}</p>
      </div>
      {actionLabel && onAction ? (
        <Button onClick={onAction}>{actionLabel}</Button>
      ) : null}
    </CardContent>
  </Card>
);

export const ErrorState = ({
  title = "Κάτι πήγε στραβά",
  description,
  onRetry,
}: {
  title?: string;
  description: string;
  onRetry?: () => void;
}) => (
  <Card className="border-destructive/30">
    <CardContent className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <AlertCircle className="h-5 w-5 text-destructive" />
      <div className="space-y-1">
        <h3 className="text-base font-semibold">{title}</h3>
        <p className="max-w-md text-sm text-muted-foreground">{description}</p>
      </div>
      {onRetry ? (
        <Button variant="outline" onClick={onRetry}>
          Δοκιμή ξανά
        </Button>
      ) : null}
    </CardContent>
  </Card>
);
