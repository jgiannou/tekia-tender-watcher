import type { ButtonHTMLAttributes } from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type PdfActionProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label?: string;
};

/** Text "PDF" control for opening the official document preview. */
export const PdfAction = ({
  label = "Προεπισκόπηση PDF",
  className,
  ...props
}: PdfActionProps) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <Button
        type="button"
        size="sm"
        variant="outline"
        aria-label={label}
        className={cn("h-8 shrink-0 px-2.5 font-semibold tracking-wide", className)}
        {...props}
      >
        PDF
      </Button>
    </TooltipTrigger>
    <TooltipContent>{label}</TooltipContent>
  </Tooltip>
);
