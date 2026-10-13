import { Link } from "react-router-dom";
import { Landmark } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { TenderWorkflow } from "@/lib/api";
import { formatDateTime } from "./format";

type OfficialTimelineProps = {
  entries: TenderWorkflow["timeline"];
  expectedLabel?: string | null;
  expectedDescription?: string | null;
  relatedNeedsReview?: Array<{
    id: string;
    confidence: string;
    targetTender: {
      referenceNumber: string;
      recordType: string;
      title: string | null;
    };
  }>;
  busy?: boolean;
  onConfirmRelated?: (linkId: string) => void;
  onDismissRelated?: (linkId: string) => void;
};

export const OfficialTimeline = ({
  entries,
  expectedLabel,
  expectedDescription,
  relatedNeedsReview = [],
  busy,
  onConfirmRelated,
  onDismissRelated,
}: OfficialTimelineProps) => {
  const official = entries.filter((entry) => entry.kind === "official");

  return (
    <Card className="border-border/70">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Επίσημη πορεία</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {official.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Δεν υπάρχουν ακόμη επίσημες δημοσιεύσεις στο νήμα.
          </p>
        ) : (
          <ul className="space-y-0">
            {official.map((entry, index) => (
              <li key={entry.key} className="relative flex gap-3 pb-5 last:pb-0">
                {index < official.length - 1 ? (
                  <span
                    className="absolute left-[7px] top-4 h-[calc(100%-8px)] w-px bg-border"
                    aria-hidden
                  />
                ) : null}
                <span className="relative z-[1] mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-primary" />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{entry.title}</span>
                    {entry.isNew ? <Badge variant="warning">Νέο</Badge> : null}
                  </div>
                  {entry.adam ? (
                    <div className="font-mono text-xs text-muted-foreground">
                      {entry.adam}
                    </div>
                  ) : null}
                  {entry.subtitle ? (
                    <div className="text-sm text-muted-foreground">
                      {entry.subtitle}
                    </div>
                  ) : null}
                  <div className="text-xs text-muted-foreground">
                    {formatDateTime(entry.at)}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        {relatedNeedsReview.length > 0 ? (
          <div className="space-y-2 rounded-md border border-border/80 bg-muted/20 px-3 py-3">
            <div className="text-sm font-medium">Πιθανές σχετικές δημοσιεύσεις</div>
            {relatedNeedsReview.map((link) => {
              const type =
                link.targetTender.recordType === "PROC" ? "PROC" : "REQ";
              return (
                <div
                  key={link.id}
                  className="flex flex-col gap-2 rounded-md border border-border/70 bg-card px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">Πιθανή σχέση</Badge>
                      <span className="font-mono text-xs text-muted-foreground">
                        {link.targetTender.recordType}{" "}
                        {link.targetTender.referenceNumber}
                      </span>
                    </div>
                    <div className="text-sm">
                      {link.targetTender.title || "—"}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {onConfirmRelated ? (
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={() => onConfirmRelated(link.id)}
                      >
                        Επιβεβαίωση
                      </Button>
                    ) : null}
                    {onDismissRelated ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => onDismissRelated(link.id)}
                      >
                        Δεν σχετίζεται
                      </Button>
                    ) : null}
                    <Button size="sm" variant="outline" asChild>
                      <Link
                        to={`/app/tenders/${type}/${encodeURIComponent(link.targetTender.referenceNumber)}`}
                      >
                        Προβολή
                      </Link>
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}

        {expectedLabel ? (
          <div className="rounded-md border border-dashed border-border/80 bg-muted/15 px-3 py-3">
            <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Landmark className="h-3.5 w-3.5" aria-hidden />
              Τι περιμένουμε στη συνέχεια
            </div>
            <div className="text-sm font-medium text-foreground">
              {expectedLabel}
            </div>
            {expectedDescription ? (
              <p className="mt-1 text-sm text-muted-foreground">
                {expectedDescription}
              </p>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
};
