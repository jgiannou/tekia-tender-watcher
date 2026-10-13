import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatMatchReason } from "@/lib/matchReasons";
import { cn } from "@/lib/utils";
import { scoreToneClassName } from "@/lib/score";
import type { Opportunity } from "@/lib/api";

type TenderRelevanceCardProps = {
  matchMeta: Opportunity["matchMeta"];
};

export const TenderRelevanceCard = ({ matchMeta }: TenderRelevanceCardProps) => {
  const [expanded, setExpanded] = useState(false);
  const profiles = matchMeta?.matchedProfiles ?? [];
  if (!profiles.length) return null;

  const top = profiles[0]!;
  const topScore = Math.round(matchMeta?.highestScore ?? top.score ?? 0);
  const reasons = [
    ...new Set(profiles.flatMap((profile) => profile.reasons)),
  ];
  const visibleReasons = expanded ? reasons : reasons.slice(0, 4);
  const profileNames = profiles.map((profile) => profile.name).join(" · ");

  return (
    <Card className="border-border/70">
      <CardContent className="space-y-3 px-4 py-4 text-sm sm:px-5">
        <div
          className={cn(
            "inline-flex items-baseline gap-1.5 rounded-md px-2.5 py-1",
            scoreToneClassName(topScore),
          )}
          aria-label={`Σκορ συνάφειας ${topScore}%`}
        >
          <span className="text-2xl font-semibold tabular-nums tracking-tight">
            {topScore}%
          </span>
          <span className="text-sm font-medium opacity-90">συνάφεια</span>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Από την αναζήτηση</div>
          <div className="mt-0.5 font-medium">{profileNames}</div>
        </div>
        <ul className="space-y-1.5 text-muted-foreground">
          {visibleReasons.map((reason) => (
            <li key={reason} className="flex gap-2">
              <span className="text-primary" aria-hidden>
                ✓
              </span>
              <span>{formatMatchReason(reason)}</span>
            </li>
          ))}
        </ul>
        {reasons.length > 4 ? (
          <Button
            size="sm"
            variant="ghost"
            className="h-auto px-0 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded
              ? "Λιγότεροι λόγοι"
              : "Δείτε όλους τους λόγους"}
          </Button>
        ) : null}
        {profiles.length > 1 ? (
          <div className="flex flex-wrap gap-1 pt-1">
            {profiles.map((profile) => (
              <Badge key={profile.id} variant="outline">
                {profile.name} · {Math.round(profile.score)}%
              </Badge>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
};
