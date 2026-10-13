import { Building2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { TenderWorkflow } from "@/lib/api";
import { formatDateTime } from "./format";
import type { TenderPrimaryAction } from "./TenderPrimaryActions";

type OrganizationActivityTimelineProps = {
  entries: TenderWorkflow["timeline"];
  following: boolean;
  suggestedAction?: TenderPrimaryAction | null;
  busy?: boolean;
};

export const OrganizationActivityTimeline = ({
  entries,
  following,
  suggestedAction,
  busy,
}: OrganizationActivityTimelineProps) => {
  const orgEntries = entries.filter((entry) => entry.kind === "organization");

  if (!following && orgEntries.length === 0 && !suggestedAction) {
    return null;
  }

  return (
    <Card className="border-border/70">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Δικές σας ενέργειες</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {orgEntries.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Δεν έχετε καταγράψει ακόμη ενέργειες για αυτό το αίτημα.
          </p>
        ) : (
          <ul className="space-y-0">
            {orgEntries.map((entry, index) => (
              <li key={entry.key} className="relative flex gap-3 pb-5 last:pb-0">
                {index < orgEntries.length - 1 ? (
                  <span
                    className="absolute left-[7px] top-4 h-[calc(100%-8px)] w-px bg-border"
                    aria-hidden
                  />
                ) : null}
                <span className="relative z-[1] mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full border-2 border-primary bg-background" />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Building2
                      className="h-3.5 w-3.5 text-muted-foreground"
                      aria-hidden
                    />
                    <span className="text-sm font-medium">{entry.title}</span>
                    <Badge variant="outline">Εταιρεία</Badge>
                  </div>
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

        {suggestedAction ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-dashed border-border/80 px-3 py-3">
            <div className="text-sm text-muted-foreground">
              Προτεινόμενη επόμενη ενέργεια
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={suggestedAction.onClick}
            >
              {suggestedAction.label}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
};
