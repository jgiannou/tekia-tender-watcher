import type { ReactNode } from "react";
import { AuthenticatedPdfViewer } from "@/components/AuthenticatedPdfViewer";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type PdfPreviewModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  recordType: "REQ" | "PROC";
  adam: string;
  title?: string | null;
  officialUrl?: string | null;
  /** Optional actions under the title (e.g. link to tender page) */
  actions?: ReactNode;
};

export const PdfPreviewModal = ({
  open,
  onOpenChange,
  organizationId,
  recordType,
  adam,
  title,
  officialUrl,
  actions,
}: PdfPreviewModalProps) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="flex h-[92vh] w-[min(96vw,72rem)] max-w-none flex-col gap-3 overflow-hidden p-4 sm:p-6">
      <DialogHeader className="shrink-0 space-y-1 pr-8">
        <DialogTitle>Προεπισκόπηση PDF</DialogTitle>
        <DialogDescription className="font-mono">{adam}</DialogDescription>
        {title ? (
          <p className="line-clamp-2 text-sm text-muted-foreground">{title}</p>
        ) : null}
        {actions ? <div className="flex flex-wrap gap-2 pt-1">{actions}</div> : null}
      </DialogHeader>
      <div className="min-h-0 flex-1 overflow-hidden">
        {open && adam ? (
          <AuthenticatedPdfViewer
            organizationId={organizationId}
            pdfPath={`/api/saas/kimdis/pdf/${recordType}/${encodeURIComponent(adam)}`}
            downloadName={`${adam}.pdf`}
            officialUrl={officialUrl}
            iframeClassName="h-full min-h-[70vh]"
            className="flex h-full flex-col"
          />
        ) : null}
      </div>
    </DialogContent>
  </Dialog>
);
