import { cn } from "@/lib/utils";

type FrameProps = {
  className?: string;
  title?: string;
  src: string;
  alt: string;
  /** object-position for mobile crop readability */
  objectPosition?: string;
};

/**
 * Browser chrome around REAL sanitized ARC Tenders screenshots
 * (captured from the live app — no fictional dashboards).
 */
export const BrowserFrameScreenshot = ({
  className,
  title = "ARC Tenders",
  src,
  alt,
  objectPosition = "left top",
}: FrameProps) => (
  <figure
    className={cn(
      "overflow-hidden rounded-xl border border-border/80 bg-[#0b0f14] shadow-2xl shadow-black/40",
      className,
    )}
  >
    <div className="flex items-center gap-2 border-b border-white/10 bg-[#121820] px-3 py-2">
      <span className="h-2.5 w-2.5 rounded-full bg-white/15" aria-hidden />
      <span className="h-2.5 w-2.5 rounded-full bg-white/15" aria-hidden />
      <span className="h-2.5 w-2.5 rounded-full bg-white/15" aria-hidden />
      <div className="ml-2 flex-1 truncate rounded-md border border-white/10 bg-black/30 px-2 py-1 text-[10px] text-white/50">
        arc-tenders.tekia.gr/{title}
      </div>
    </div>
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      className="block h-auto w-full max-h-[520px] object-cover object-top sm:max-h-none"
      style={{ objectPosition }}
    />
  </figure>
);

export const SearchProductPreview = ({ className }: { className?: string }) => (
  <BrowserFrameScreenshot
    className={className}
    title="app/opportunities"
    src="/marketing/preview-opportunities.png"
    alt="Πραγματική προεπισκόπηση Ευκαιριών στο ARC Tenders"
    objectPosition="left 12%"
  />
);

export const SavedSearchProductPreview = ({
  className,
}: {
  className?: string;
}) => (
  <BrowserFrameScreenshot
    className={className}
    title="app/saved-searches"
    src="/marketing/preview-saved-searches.png"
    alt="Πραγματική προεπισκόπηση Αποθηκευμένων αναζητήσεων στο ARC Tenders"
    objectPosition="left top"
  />
);

export const MonitoringProductPreview = ({
  className,
}: {
  className?: string;
}) => (
  <BrowserFrameScreenshot
    className={className}
    title="app/monitoring"
    src="/marketing/preview-monitoring.png"
    alt="Πραγματική προεπισκόπηση Παρακολουθούμενων στο ARC Tenders"
    objectPosition="left 18%"
  />
);
