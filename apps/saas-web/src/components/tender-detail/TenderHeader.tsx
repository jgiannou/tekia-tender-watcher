import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDate, formatMoney } from "./format";
import { TenderStatusBar } from "./TenderStatusBar";
import {
  TenderPrimaryActions,
  type TenderPrimaryAction,
} from "./TenderPrimaryActions";

type TenderHeaderProps = {
  recordType: string;
  title: string | null;
  authority: string | null;
  adam: string;
  budgetWithoutVat: number | null;
  budgetLabel?: string;
  submissionDate?: string | null;
  signedDate?: string | null;
  finalSubmissionDate?: string | null;
  contractTypeLabel?: string | null;
  regionLabel?: string | null;
  sourceLabel?: string;
  publicUrl?: string | null;
  publicUrlLabel?: string;
  following: boolean;
  waitingLabel?: string | null;
  hasOutreach?: boolean;
  invitationIssued?: boolean;
  relatedProcAdam?: string | null;
  diavgeiaAda?: string | null;
  diavgeiaUrl?: string | null;
  busy?: boolean;
  primaryAction?: TenderPrimaryAction | null;
  overflowAction?: TenderPrimaryAction | null;
  secondaryPdf?: {
    label: string;
    onClick?: () => void;
    href?: string | null;
  } | null;
  onBack: () => void;
  onUnfollow?: () => void;
  onDismiss?: () => void;
  dismissLabel?: string;
  onCreateDriveFolder?: (() => void) | null;
  driveUpgradeHref?: string | null;
  showDriveUpgradeHint?: boolean;
};

export const TenderHeader = ({
  recordType,
  title,
  authority,
  adam,
  budgetWithoutVat,
  budgetLabel = "χωρίς ΦΠΑ",
  submissionDate,
  signedDate,
  finalSubmissionDate,
  contractTypeLabel,
  regionLabel,
  sourceLabel,
  publicUrl,
  publicUrlLabel,
  following,
  waitingLabel,
  hasOutreach,
  invitationIssued,
  relatedProcAdam,
  diavgeiaAda,
  diavgeiaUrl,
  busy,
  primaryAction,
  overflowAction,
  secondaryPdf,
  onBack,
  onUnfollow,
  onDismiss,
  dismissLabel,
  onCreateDriveFolder,
  driveUpgradeHref,
  showDriveUpgradeHint,
}: TenderHeaderProps) => {
  const adamDisplay =
    adam.startsWith("TED:") || adam.startsWith("DIAVGEIA:")
      ? adam
      : `ΑΔΑΜ ${adam}`;

  const metaParts = [
    `${formatMoney(budgetWithoutVat)} ${budgetLabel}`,
    formatDate(submissionDate || signedDate),
    adamDisplay,
  ];
  if (finalSubmissionDate) {
    metaParts.push(`Προθεσμία ${formatDate(finalSubmissionDate)}`);
  }
  if (contractTypeLabel) metaParts.push(contractTypeLabel);
  if (regionLabel) metaParts.push(regionLabel);
  if (sourceLabel) metaParts.push(`Πηγή: ${sourceLabel}`);

  return (
    <div className="space-y-4">
      <Button
        variant="ghost"
        size="sm"
        className="-ml-2 text-muted-foreground"
        onClick={onBack}
      >
        <ArrowLeft className="h-4 w-4" />
        Πίσω
      </Button>

      <TenderStatusBar
        recordType={recordType}
        referenceNumber={adam}
        following={following}
        waitingLabel={waitingLabel}
        hasOutreach={hasOutreach}
        invitationIssued={invitationIssued}
        relatedProcAdam={relatedProcAdam}
        diavgeiaAda={diavgeiaAda}
        diavgeiaUrl={diavgeiaUrl}
      />

      <div className="space-y-2">
        <h1 className="text-xl font-semibold leading-snug tracking-tight sm:text-2xl">
          {title || "—"}
        </h1>
        <p className="text-sm text-muted-foreground">{authority || "—"}</p>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
          {metaParts.map((part, index) => (
            <span key={`${part}-${index}`} className="inline-flex items-center gap-2">
              {index > 0 ? (
                <span className="text-border" aria-hidden>
                  ·
                </span>
              ) : null}
              <span
                className={
                  index === 0
                    ? "font-medium tabular-nums text-foreground"
                    : index === 2
                      ? "font-mono text-xs"
                      : undefined
                }
              >
                {part}
              </span>
            </span>
          ))}
          {publicUrl ? (
            <>
              <span className="text-border" aria-hidden>
                ·
              </span>
              <a
                href={publicUrl}
                target="_blank"
                rel="noreferrer"
                className="underline-offset-2 hover:text-foreground hover:underline"
              >
                {publicUrlLabel ?? "Επίσημη πηγή"}
              </a>
            </>
          ) : null}
        </p>
      </div>

      <TenderPrimaryActions
        busy={busy}
        primaryAction={primaryAction}
        overflowAction={overflowAction}
        secondaryPdf={secondaryPdf}
        following={following}
        onUnfollow={onUnfollow}
        onDismiss={onDismiss}
        dismissLabel={dismissLabel}
        onCreateDriveFolder={onCreateDriveFolder}
        driveUpgradeHref={driveUpgradeHref}
        showDriveUpgradeHint={showDriveUpgradeHint}
      />
    </div>
  );
};
