import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type AuthenticatedPdfViewerProps = {
  organizationId: string;
  /** Relative authenticated API path that returns application/pdf */
  pdfPath: string;
  title?: string;
  downloadName?: string;
  officialUrl?: string | null;
  className?: string;
  iframeClassName?: string;
};

/**
 * Fetches a protected PDF with session + org header, then renders via blob URL.
 * Never put authenticated JSON API URLs directly into an iframe src.
 */
export const AuthenticatedPdfViewer = ({
  organizationId,
  pdfPath,
  title = "Επίσημο έγγραφο ΚΗΜΔΗΣ",
  downloadName = "document.pdf",
  officialUrl,
  className,
  iframeClassName,
}: AuthenticatedPdfViewerProps) => {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(pdfPath, {
        credentials: "include",
        headers: { "X-Organization-Id": organizationId },
      });
      if (!response.ok) {
        const text = await response.text();
        let message = `HTTP ${response.status}`;
        try {
          const json = JSON.parse(text) as { message?: string };
          if (json.message) message = json.message;
        } catch {
          // ignore
        }
        throw new Error(message);
      }
      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.includes("pdf") && !contentType.includes("octet-stream")) {
        throw new Error("unexpected_content_type");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      setBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
    } catch (err) {
      setBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setError(
        err instanceof Error
          ? err.message
          : "Δεν ήταν δυνατή η προεπισκόπηση του εγγράφου.",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    return () => {
      setBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    };
  }, [organizationId, pdfPath]);

  const handleDownload = async () => {
    try {
      const response = await fetch(
        pdfPath.includes("?") ? `${pdfPath}&inline=0` : `${pdfPath}?inline=0`,
        {
          credentials: "include",
          headers: { "X-Organization-Id": organizationId },
        },
      );
      if (!response.ok) throw new Error("download_failed");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = downloadName;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Αποτυχία λήψης PDF");
    }
  };

  return (
    <div className={className}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-medium">{title}</div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => void handleDownload()}>
            Λήψη PDF
          </Button>
          {officialUrl ? (
            <Button size="sm" variant="outline" asChild>
              <a href={officialUrl} target="_blank" rel="noreferrer">
                Άνοιγμα στο ΚΗΜΔΗΣ
              </a>
            </Button>
          ) : null}
        </div>
      </div>
      {loading ? (
        <div className="flex min-h-72 flex-1 items-center justify-center rounded-md border border-border text-sm text-muted-foreground">
          Φόρτωση PDF…
        </div>
      ) : error || !blobUrl ? (
        <div className="space-y-3 rounded-md border border-border px-4 py-8 text-center">
          <p className="text-sm text-muted-foreground">
            Δεν ήταν δυνατή η προεπισκόπηση του εγγράφου.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button size="sm" variant="outline" onClick={() => void load()}>
              Προσπάθεια ξανά
            </Button>
            <Button size="sm" variant="outline" onClick={() => void handleDownload()}>
              Λήψη PDF
            </Button>
            {officialUrl ? (
              <Button size="sm" variant="outline" asChild>
                <a href={officialUrl} target="_blank" rel="noreferrer">
                  Άνοιγμα στο ΚΗΜΔΗΣ
                </a>
              </Button>
            ) : null}
          </div>
        </div>
      ) : (
        <iframe
          title={title}
          src={blobUrl}
          className={cn(
            "h-[55vh] w-full flex-1 rounded-md border border-border bg-background",
            iframeClassName,
          )}
        />
      )}
    </div>
  );
};
