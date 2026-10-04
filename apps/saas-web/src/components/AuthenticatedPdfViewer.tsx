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
const RENDER_PROBE_MS = 2000;

const browserCanEmbedPdf = (): boolean => {
  const nav = navigator as Navigator & { pdfViewerEnabled?: boolean };
  // Only offer embed when the host explicitly reports a PDF viewer.
  // Undefined (Electron / in-app / automation) often paints a blank panel.
  return nav.pdfViewerEnabled === true;
};

const readErrorMessage = async (response: Response): Promise<string> => {
  const text = await response.text();
  try {
    const json = JSON.parse(text) as { message?: string };
    if (json.message) return json.message;
  } catch {
    // The body is not JSON.
  }
  if (response.status >= 500) return "Προσωρινό σφάλμα διακομιστή. Δοκιμάστε ξανά.";
  if (response.status === 404) return "Το PDF δεν βρέθηκε.";
  return "Αποτυχία λήψης PDF.";
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

const triggerBlobDownload = (blob: Blob, downloadName: string) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = downloadName;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
};

/**
 * Fetches a protected PDF with the session, checks the %PDF header, then
 * surfaces download / new-tab / KIMDIS actions. Embedded preview is opt-in
 * only when the host reports a PDF viewer — never a silent blank panel.
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
  const [byteLength, setByteLength] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [embedRequested, setEmbedRequested] = useState(false);
  const [embedFailed, setEmbedFailed] = useState(false);
  const blobUrlRef = useRef<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

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
      setByteLength(0);
      setEmbedRequested(false);
      setEmbedFailed(false);
      try {
        const blob = await fetchPdfBlob(pdfPath, organizationId, true, controller.signal);
        if (controller.signal.aborted) return;
        setByteLength(blob.size);
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

  useEffect(() => {
    if (!blobUrl || !embedRequested || embedFailed) return;
    const timer = window.setTimeout(() => {
      const iframe = iframeRef.current;
      const iframeSrc = iframe?.getAttribute("src") ?? iframe?.src ?? "";
      const iframeBlank =
        !iframe ||
        !iframeSrc ||
        iframeSrc === "about:blank" ||
        iframeSrc.startsWith("about:");
      let painted = false;
      try {
        const doc = iframe?.contentDocument;
        painted = Boolean(
          doc &&
            (doc.body?.childElementCount ?? 0) > 0 &&
            !doc.URL?.startsWith("about:"),
        );
      } catch {
        // Cross-origin plugin page — cannot confirm; keep embed.
        painted = true;
      }
      if (iframeBlank && !painted) {
        setEmbedFailed(true);
      }
    }, RENDER_PROBE_MS);
    return () => window.clearTimeout(timer);
  }, [blobUrl, embedRequested, embedFailed, attempt]);

  const handleDownload = async () => {
    const controller = new AbortController();
    try {
      const blob = await fetchPdfBlob(pdfPath, organizationId, false, controller.signal);
      triggerBlobDownload(blob, downloadName);
      toast.success(`Η λήψη ξεκίνησε (${Math.max(1, Math.round(blob.size / 1024))} KB)`);
    } catch (err) {
      if (controller.signal.aborted) return;
      toast.error(
        err instanceof Error
          ? `Αποτυχία λήψης PDF: ${err.message}`
          : "Αποτυχία λήψης PDF",
      );
    }
  };

  const handleOpenBlobTab = () => {
    if (!blobUrl) return;
    const opened = window.open(blobUrl, "_blank", "noopener,noreferrer");
    if (!opened) {
      toast.error("Ο φυλλομετρητής απέκλεισε το νέο παράθυρο. Χρησιμοποιήστε «Λήψη PDF».");
    }
  };

  const handleTryEmbed = () => {
    if (!browserCanEmbedPdf()) {
      setEmbedFailed(true);
      toast.error("Αυτός ο φυλλομετρητής δεν υποστηρίζει ενσωματωμένη προεπισκόπηση PDF.");
      return;
    }
    setEmbedFailed(false);
    setEmbedRequested(true);
  };

  const sizeLabel = `${Math.max(1, Math.round(byteLength / 1024))} KB`;
  const actions = (
    <div className="flex flex-wrap justify-center gap-2">
      <Button size="sm" onClick={() => void handleDownload()}>
        Λήψη PDF
      </Button>
      {blobUrl ? (
        <Button size="sm" variant="outline" onClick={handleOpenBlobTab}>
          Άνοιγμα σε νέα καρτέλα
        </Button>
      ) : null}
      {officialUrl ? (
        <Button size="sm" variant="outline" asChild>
          <a href={officialUrl} target="_blank" rel="noreferrer">
            Άνοιγμα στο ΚΗΜΔΗΣ
          </a>
        </Button>
      ) : null}
      <Button size="sm" variant="ghost" onClick={() => setAttempt((value) => value + 1)}>
        Προσπάθεια ξανά
      </Button>
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
          {blobUrl ? (
            <Button size="sm" variant="outline" onClick={handleOpenBlobTab}>
              Νέα καρτέλα
            </Button>
          ) : null}
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
          <p className="text-sm font-medium">Δεν ήταν δυνατή η φόρτωση του εγγράφου.</p>
          <p className="text-sm text-muted-foreground">
            Το επίσημο PDF δεν επαληθεύτηκε από τον διακομιστή. Δοκιμάστε ξανά τη λήψη ή ανοίξτε
            το απευθείας στο ΚΗΜΔΗΣ.
          </p>
          {actions}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="space-y-3 rounded-md border border-border bg-muted/30 px-4 py-8 text-center">
            <p className="text-sm font-medium">
              Το επίσημο PDF επαληθεύτηκε και είναι έτοιμο ({sizeLabel}).
            </p>
            <p className="text-sm text-muted-foreground">
              Για αξιόπιστη ανάγνωση χρησιμοποιήστε λήψη ή νέα καρτέλα — ορισμένοι ενσωματωμένοι
              φυλλομετρητές δεν εμφανίζουν PDF μέσα στη σελίδα.
            </p>
            {actions}
            {!embedRequested && browserCanEmbedPdf() ? (
              <Button size="sm" variant="ghost" onClick={handleTryEmbed}>
                Δοκιμή ενσωματωμένης προεπισκόπησης
              </Button>
            ) : null}
            {!embedRequested && !browserCanEmbedPdf() ? (
              <p className="text-xs text-muted-foreground">
                Αυτός ο φυλλομετρητής δεν δηλώνει υποστήριξη ενσωματωμένου PDF viewer.
              </p>
            ) : null}
          </div>
          {embedRequested && !embedFailed ? (
            <iframe
              ref={iframeRef}
              title={title}
              src={`${blobUrl}#toolbar=1&navpanes=0`}
              onError={() => setEmbedFailed(true)}
              className={cn(
                "h-[55vh] w-full flex-1 rounded-md border border-border bg-muted",
                iframeClassName,
              )}
            />
          ) : null}
          {embedRequested && embedFailed ? (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/5 px-4 py-4 text-center text-sm text-muted-foreground">
              Η ενσωματωμένη προεπισκόπηση απέτυχε σε αυτόν τον φυλλομετρητή. Χρησιμοποιήστε
              «Λήψη PDF» ή «Άνοιγμα σε νέα καρτέλα».
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
};
