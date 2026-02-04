/**
 * TraceCarousel - Vertical scrolling trace visualization
 *
 * Continuous vertical scroll showing workflow execution.
 * Gradient masks at top (appear) and bottom (disappear).
 *
 * @module web/components/landing/organisms/TraceCarousel
 */

import { TraceRow, type TraceRowData } from "../atoms/TraceRow.tsx";

interface TraceCarouselProps {
  rows: TraceRowData[];
  height?: number;
  speed?: number;
}

export function TraceCarousel({
  rows,
  height = 320,
  speed = 25
}: TraceCarouselProps) {
  // Duplicate rows for seamless loop
  const allRows = [...rows, ...rows];

  // Count unique models
  const models = new Set(rows.filter(r => r.model).map(r => r.model));

  // Calculate total cost
  const totalCost = rows.reduce((sum, r) => sum + (r.cost || 0), 0);

  // Count errors
  const errorCount = rows.filter(r => r.success === false).length;

  return (
    <div
      class="w-full max-w-[460px] md:max-w-[460px] opacity-0 animate-[carouselFadeIn_0.6s_ease_0.3s_forwards]"
      style={{ "--carousel-h": `${height}px`, "--carousel-speed": `${speed}s` } as any}
    >
      <div class="flex items-center justify-between px-1 pb-3 border-b border-white/[0.06]">
        <div class="flex items-center gap-2.5">
          <span class="w-2 h-2 rounded-full bg-amber-400 shadow-[0_0_12px_rgba(255,184,111,0.5)]" />
          <span class="font-mono text-[0.8rem] font-semibold text-neutral-100 tracking-tight">workflow:ci-deploy</span>
        </div>
        <span class="flex items-center gap-1.5 font-mono text-[0.6rem] font-medium text-amber-400 uppercase tracking-wider px-2.5 py-1 bg-amber-400/10 border border-amber-400/20 rounded-md">
          <span class="w-[5px] h-[5px] rounded-full bg-amber-400 animate-[carouselBlink_1.5s_ease-in-out_infinite]" />
          live
        </span>
      </div>

      <div class="relative overflow-hidden my-2 before:content-[''] before:absolute before:left-0 before:right-0 before:h-[60px] before:z-[2] before:pointer-events-none before:top-0 before:bg-gradient-to-b before:from-[#08080a] before:to-transparent after:content-[''] after:absolute after:left-0 after:right-0 after:h-[60px] after:z-[2] after:pointer-events-none after:bottom-0 after:bg-gradient-to-t after:from-[#08080a] after:to-transparent" style={{ height: `var(--carousel-h)` }}>
        <div class="animate-[carouselScroll_var(--carousel-speed)_linear_infinite] hover:[animation-play-state:paused]">
          {allRows.map((row, i) => (
            <TraceRow key={`${row.name}-${i}`} data={row} />
          ))}
        </div>
      </div>

      <div class="flex items-center justify-between px-1 pt-3 border-t border-white/[0.06]">
        <div class="flex items-center gap-3">
          <span class="flex items-baseline gap-1">
            <span class="font-mono text-[0.85rem] font-bold text-amber-400">{rows.length}</span>
            <span class="font-mono text-[0.55rem] text-neutral-600 uppercase tracking-wide">calls</span>
          </span>
          <span class="w-px h-3 bg-neutral-700" />
          <span class="flex items-baseline gap-1">
            <span class="font-mono text-[0.85rem] font-bold text-amber-400">{models.size}</span>
            <span class="font-mono text-[0.55rem] text-neutral-600 uppercase tracking-wide">models</span>
          </span>
          <span class="w-px h-3 bg-neutral-700" />
          <span class="flex items-baseline gap-1">
            <span class="font-mono text-[0.85rem] font-bold text-emerald-400">${totalCost.toFixed(3)}</span>
            <span class="font-mono text-[0.55rem] text-neutral-600 uppercase tracking-wide">cost</span>
          </span>
          {errorCount > 0 && (
            <>
              <span class="w-px h-3 bg-neutral-700" />
              <span class="flex items-baseline gap-1">
                <span class="font-mono text-[0.85rem] font-bold text-red-400">{errorCount}</span>
                <span class="font-mono text-[0.55rem] text-neutral-600 uppercase tracking-wide">retry</span>
              </span>
            </>
          )}
        </div>
        <div class="flex items-center gap-1.5 md:flex hidden">
          <span class="font-mono text-[0.5rem] font-medium uppercase tracking-wide px-2 py-[3px] rounded text-amber-400 bg-amber-400/10">cost tracked</span>
        </div>
      </div>

      <style>
        {`
        @keyframes carouselFadeIn {
          to { opacity: 1; }
        }

        @keyframes carouselBlink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }

        @keyframes carouselScroll {
          0% { transform: translateY(0); }
          100% { transform: translateY(-50%); }
        }
        `}
      </style>
    </div>
  );
}
