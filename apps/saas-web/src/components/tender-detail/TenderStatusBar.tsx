import { Badge } from "@/components/ui/badge";
import { SourceBadge } from "@/components/SourceBadge";
import { InvitationIssuedBadge } from "@/components/InvitationIssuedBadge";
import { cn } from "@/lib/utils";

type TenderStatusBarProps = {
  recordType: string;
  referenceNumber: string;
  following: boolean;
  waitingLabel?: string | null;
  hasOutreach?: boolean;
  invitationIssued?: boolean;
  relatedProcAdam?: string | null;
  diavgeiaAda?: string | null;
  diavgeiaUrl?: string | null;
  className?: string;
};

export const TenderStatusBar = ({
  recordType,
  referenceNumber,
  following,
  waitingLabel,
  hasOutreach,
  invitationIssued,
  relatedProcAdam,
  diavgeiaAda,
  diavgeiaUrl,
  className,
}: TenderStatusBarProps) => (
  <div className={cn("flex flex-wrap items-center gap-2", className)}>
    <Badge variant={recordType === "REQ" ? "secondary" : "default"}>
      {recordType}
    </Badge>
    <SourceBadge referenceNumber={referenceNumber} />
    {following ? <Badge variant="success">Παρακολουθείται</Badge> : null}
    {waitingLabel ? (
      <Badge variant="outline" className="border-border/80 text-foreground/90">
        {waitingLabel}
      </Badge>
    ) : null}
    {hasOutreach ? (
      <Badge
        variant="outline"
        className="border-primary/30 bg-primary/10 text-primary"
      >
        ✓ Ενδιαφέρον καταγράφηκε
      </Badge>
    ) : null}
    {invitationIssued ? (
      <InvitationIssuedBadge relatedProcAdam={relatedProcAdam} compact />
    ) : null}
    {diavgeiaAda && diavgeiaUrl ? (
      <a
        href={diavgeiaUrl}
        target="_blank"
        rel="noreferrer"
        className="font-mono text-xs text-primary underline-offset-2 hover:underline"
      >
        ΑΔΑ {diavgeiaAda}
      </a>
    ) : null}
  </div>
);
