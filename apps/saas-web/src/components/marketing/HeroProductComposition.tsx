import { cn } from "@/lib/utils";

/**
 * Crafted product mock from ARC UI patterns — not a raster AI collage.
 * One main window + two restrained floating accents.
 */
export const HeroProductComposition = ({ className }: { className?: string }) => (
  <div
    className={cn("relative mx-auto w-full max-w-lg lg:max-w-none", className)}
    aria-hidden
  >
    {/* Lifecycle path glow */}
    <div className="pointer-events-none absolute -inset-6 -z-10 opacity-70">
      <div className="absolute inset-0 rounded-[2rem] bg-[radial-gradient(ellipse_at_30%_40%,rgb(94_196_201/0.18),transparent_55%)]" />
      <div className="absolute inset-0 rounded-[2rem] bg-[radial-gradient(ellipse_at_80%_70%,rgb(180_120_200/0.08),transparent_50%)]" />
      <svg
        className="absolute left-[8%] top-[18%] h-[70%] w-[84%] opacity-40"
        viewBox="0 0 400 240"
        fill="none"
      >
        <path
          d="M20 180 C80 60, 140 40, 200 90 S320 160, 380 40"
          stroke="url(#arcPath)"
          strokeWidth="1.25"
          strokeDasharray="4 6"
        />
        <defs>
          <linearGradient id="arcPath" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="rgb(94 196 201 / 0.0)" />
            <stop offset="40%" stopColor="rgb(94 196 201 / 0.7)" />
            <stop offset="100%" stopColor="rgb(180 120 200 / 0.35)" />
          </linearGradient>
        </defs>
      </svg>
    </div>

    {/* Main app window */}
    <div className="arc-hero-float relative overflow-hidden rounded-xl border border-white/[0.08] bg-[#0c1113] shadow-[0_24px_80px_-24px_rgba(0,0,0,0.85)]">
      <div className="flex items-center gap-2 border-b border-white/[0.06] bg-[#101618] px-3 py-2.5">
        <span className="h-2 w-2 rounded-full bg-white/15" />
        <span className="h-2 w-2 rounded-full bg-white/15" />
        <span className="h-2 w-2 rounded-full bg-white/15" />
        <div className="ml-2 flex-1 truncate rounded-md border border-white/[0.06] bg-black/25 px-2.5 py-1 font-mono text-[10px] text-white/40">
          arc-tenders · Ευκαιρίες
        </div>
      </div>

      <div className="grid grid-cols-[4.5rem_1fr] sm:grid-cols-[5.5rem_1fr]">
        {/* Mini sidebar */}
        <div className="border-r border-white/[0.05] bg-[#0a0e10] px-2 py-3">
          <div className="mb-3 h-4 w-8 rounded bg-white/10" />
          <div className="space-y-1.5">
            {["Επισκ.", "Αναζ.", "Ευκαιρ.", "Παρακ."].map((label, i) => (
              <div
                key={label}
                className={cn(
                  "rounded px-1.5 py-1 text-[9px] leading-none",
                  i === 2
                    ? "bg-primary/15 font-medium text-primary"
                    : "text-white/35",
                )}
              >
                {label}
              </div>
            ))}
          </div>
        </div>

        {/* Opportunities content */}
        <div className="space-y-0 px-3 py-3 sm:px-4">
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <div>
              <p className="text-[11px] font-semibold text-white/90">Ευκαιρίες</p>
              <p className="text-[10px] text-white/35">Από αποθηκευμένες αναζητήσεις</p>
            </div>
            <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[9px] font-medium text-primary">
              3 νέες
            </span>
          </div>

          {[
            {
              type: "REQ",
              score: "82%",
              title: "Συντήρηση και ανάπτυξη ιστοσελίδας",
              meta: "Δήμος Κέρκυρας · 45.000 €",
              reason: "τίτλος: «ιστοσελίδα»",
              highlight: true,
            },
            {
              type: "REQ",
              score: "74%",
              title: "Ψηφιακές υπηρεσίες υποστήριξης",
              meta: "Περιφέρεια · 28.000 €",
              reason: "CPV match",
              highlight: false,
            },
            {
              type: "PROC",
              score: "68%",
              title: "Προμήθεια λογισμικού διαχείρισης",
              meta: "ΝΠΔΔ · 12.500 €",
              reason: "αποθηκευμένη: Web",
              highlight: false,
            },
          ].map((row) => (
            <div
              key={row.title}
              className={cn(
                "border-t border-white/[0.05] py-2.5 first:border-t-0",
                row.highlight && "bg-primary/[0.04] -mx-1 rounded-md px-1",
              )}
            >
              <div className="flex items-center gap-2">
                <span className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[9px] text-white/50">
                  {row.type}
                </span>
                <span className="text-[10px] font-semibold text-primary">
                  {row.score}
                </span>
              </div>
              <p className="mt-1 truncate text-[11px] font-medium text-white/90">
                {row.title}
              </p>
              <p className="mt-0.5 truncate text-[10px] text-white/35">{row.meta}</p>
              <p className="mt-1 text-[10px] text-white/45">✓ {row.reason}</p>
            </div>
          ))}
        </div>
      </div>
    </div>

    {/* Floating: monitoring state */}
    <div className="arc-hero-float-delayed absolute -bottom-3 -left-2 max-w-[11.5rem] rounded-lg border border-white/[0.08] bg-[#12181a]/95 px-3 py-2.5 shadow-xl backdrop-blur-sm sm:-left-4 sm:max-w-[13rem]">
      <p className="text-[9px] uppercase tracking-wider text-white/35">Παρακολούθηση</p>
      <p className="mt-1 text-[11px] font-medium leading-snug text-white/90">
        Αναμονή πρόσκλησης
      </p>
      <div className="mt-2 flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
        <span className="text-[10px] text-primary">Ενεργή · REQ→PROC</span>
      </div>
    </div>

    {/* Floating: notification */}
    <div className="arc-hero-float-delayed absolute -right-1 -top-2 max-w-[12rem] rounded-lg border border-white/[0.08] bg-[#12181a]/95 px-3 py-2.5 shadow-xl backdrop-blur-sm sm:-right-3 sm:max-w-[13.5rem]">
      <p className="text-[9px] uppercase tracking-wider text-white/35">Ειδοποίηση</p>
      <p className="mt-1 text-[11px] font-medium leading-snug text-white/90">
        Νέα σχετική πρόσκληση
      </p>
      <p className="mt-0.5 text-[10px] text-white/40">Από αποθηκευμένη «Web»</p>
    </div>
  </div>
);
