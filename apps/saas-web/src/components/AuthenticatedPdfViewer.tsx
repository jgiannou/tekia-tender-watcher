import { useEffect, useRef, useState } from "react";
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

const PDF_MAGIC = "%PDF";

const readErrorMessage = async (response: Response): Promise<string> => {
  const text = await response.text();
  try {
    const json = JSON.parse(text) as { message?: string };
    if (json.message) return json.message;
  } catch {
    // The body is not JSON.
  }
  return `HTTP ${response.status}`;
};

const fetchPdfBlob = async (
  pdfPath: string,
  organizationId: string,
  inline: boolean,
  signal: AbortSignal,
): Promise<Blob> => {
  const path = inline
    ? pdfPath
    : pdfPath.includes("?")
      ? `${pdfPath}&inline=0`
      : `${pdfPath}?inline=0`;
  const response = await fetch(path, {
    credentials: "include",
    headers: { "X-Organization-Id": organizationId },
    signal,
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("pdf") && !contentType.includes("octet-stream")) {
    throw new Error("unexpected_content_type");
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  const magic = new TextDecoder().decode(bytes.subarray(0, 4));
  if (bytes.length < 5 || magic !== PDF_MAGIC) {
    throw new Error("official_document_is_not_a_pdf");
  }
  return new Blob([bytes], { type: "application/pdf" });
};

/**
 * Fetches a protected PDF with the session, checks the %PDF header, then
 * renders a blob URL. The URL stays alive until the viewer unmounts or a
 * newer document replaces it — revoking it inside the click handler cancels
 * the browser download.
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
  const [attempt, setAttempt] = useState(0);
  const blobUrlRef = useRef<string | null>(null);

  const replaceBlobUrl = (next: string | null) => {
    if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    blobUrlRef.current = next;
    setBlobUrl(next);
  };

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const blob = await fetchPdfBlob(pdfPath, organizationId, true, controller.signal);
        if (controller.signal.aborted) return;
        replaceBlobUrl(URL.createObjectURL(blob));
      } catch (err) {
        if (controller.signal.aborted) return;
        replaceBlobUrl(null);
        setError(
          err instanceof Error
            ? err.message
            : "Δεν ήταν δυνατή η προεπισκόπηση του εγγράφου.",
        );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    return () => {
      controller.abort();
    };
  }, [organizationId, pdfPath, attempt]);

  useEffect(
    () => () => {
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    },
    [],
  );

  const handleDownload = async () => {
    const controller = new AbortController();
    try {
      const blob = await fetchPdfBlob(pdfPath, organizationId, false, controller.signal);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = downloadName;
      anchor.rel = "noopener";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      if (controller.signal.aborted) return;
      toast.error(
        err instanceof Error && err.message !== "download_failed"
          ? "Αποτυχία λήψης PDF"
          : "Αποτυχία λήψης PDF",
      );
    }
  };

  const handleIframeError = () => {
    replaceBlobUrl(null);
    setError("pdf_render_failed");
    setLoading(false);
  };

  const fallbackActions = (
    <div className="flex flex-wrap justify-center gap-2">
      <Button size="sm" variant="outline" onClick={() => setAttempt((value) => value + 1)}>
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
  );

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
        <div className="space-y-3 rounded-md border border-destructive/40 bg-destructive/5 px-4 py-8 text-center">
          <p className="text-sm font-medium">Δεν ήταν δυνατή η προεπισκόπηση του εγγράφου.</p>
          <p className="text-sm text-muted-foreground">
            Το επίσημο PDF δεν φορτώθηκε. Δοκιμάστε ξανά ή ανοίξτε το απευθείας στο ΚΗΜΔΗΣ.
          </p>
          {fallbackActions}
        </div>
      ) : (
        <iframe
          title={title}
          src={blobUrl}
          onError={handleIframeError}
          className={cn(
            "h-[55vh] w-full flex-1 rounded-md border border-border bg-background",
            iframeClassName,
          )}
        />
      )}
    </div>
  );
};
