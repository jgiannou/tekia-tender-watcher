import { MoreHorizontal } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type TenderPrimaryAction = {
  label: string;
  onClick: () => void;
};

type TenderPrimaryActionsProps = {
  busy?: boolean;
  primaryAction?: TenderPrimaryAction | null;
  /** Low-frequency action kept out of the primary row (e.g. late Outreach). */
  overflowAction?: TenderPrimaryAction | null;
  secondaryPdf?: {
    label: string;
    onClick?: () => void;
    href?: string | null;
  } | null;
  following: boolean;
  onUnfollow?: () => void;
  onDismiss?: () => void;
  dismissLabel?: string;
  onCreateDriveFolder?: (() => void) | null;
  driveUpgradeHref?: string | null;
  showDriveUpgradeHint?: boolean;
};

export const TenderPrimaryActions = ({
  busy,
  primaryAction,
  overflowAction,
  secondaryPdf,
  following,
  onUnfollow,
  onDismiss,
  dismissLabel = "Απόκρυψη από τις Ευκαιρίες",
  onCreateDriveFolder,
  driveUpgradeHref,
  showDriveUpgradeHint,
}: TenderPrimaryActionsProps) => {
  const hasUtilityItems = Boolean(
    onCreateDriveFolder || showDriveUpgradeHint || overflowAction,
  );
  const hasDestructiveItems = Boolean(
    (following && onUnfollow) || onDismiss,
  );

  return (
  <div className="flex flex-wrap items-center gap-2">
    {primaryAction ? (
      <Button disabled={busy} onClick={primaryAction.onClick}>
        {primaryAction.label}
      </Button>
    ) : null}

    {secondaryPdf?.href ? (
      <Button variant="outline" size="default" asChild>
        <a href={secondaryPdf.href} target="_blank" rel="noreferrer">
          {secondaryPdf.label}
        </a>
      </Button>
    ) : secondaryPdf?.onClick ? (
      <Button
        variant="outline"
        disabled={busy}
        onClick={secondaryPdf.onClick}
      >
        {secondaryPdf.label}
      </Button>
    ) : null}

    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          aria-label="Περισσότερες ενέργειες"
          disabled={busy}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {overflowAction ? (
          <DropdownMenuItem onClick={overflowAction.onClick}>
            {overflowAction.label}
          </DropdownMenuItem>
        ) : null}
        {onCreateDriveFolder ? (
          <DropdownMenuItem onClick={onCreateDriveFolder}>
            Δημιουργία φακέλου στο Drive
          </DropdownMenuItem>
        ) : null}
        {showDriveUpgradeHint && driveUpgradeHref ? (
          <DropdownMenuItem asChild>
            <Link to={driveUpgradeHref}>Drive — δείτε τα πακέτα</Link>
          </DropdownMenuItem>
        ) : null}
        {hasUtilityItems && hasDestructiveItems ? (
          <DropdownMenuSeparator />
        ) : null}
        {following && onUnfollow ? (
          <DropdownMenuItem onClick={onUnfollow}>
            Διακοπή παρακολούθησης
          </DropdownMenuItem>
        ) : null}
        {onDismiss ? (
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={onDismiss}
          >
            {dismissLabel}
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
  );
};
