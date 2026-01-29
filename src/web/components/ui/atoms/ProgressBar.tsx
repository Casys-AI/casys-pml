/**
 * ProgressBar Atom - Compact progress indicator
 */

import type { JSX } from "preact";

export interface ProgressBarProps {
  /** Value between 0 and 1 */
  value: number;
  /** Optional label shown above the bar */
  label?: string;
  /** Whether to show the percentage value */
  showValue?: boolean;
  /** Custom color for the bar */
  color?: string;
  /** Height of the bar in pixels */
  height?: number;
}

const DEFAULT_COLOR = "var(--accent)";
const DEFAULT_HEIGHT = 4;

function clampPercentage(value: number): number {
  return Math.min(100, Math.max(0, value * 100));
}

export function ProgressBar({
  value,
  label,
  showValue = true,
  color = DEFAULT_COLOR,
  height = DEFAULT_HEIGHT,
}: ProgressBarProps): JSX.Element {
  const percentage = clampPercentage(value);

  return (
    <div class="w-full">
      {label && (
        <div class="flex justify-between items-center mb-1">
          <span class="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-dim)" }}>
            {label}
          </span>
          {showValue && (
            <span
              class="text-[10px] font-semibold tabular-nums"
              style={{ color, fontFamily: "var(--font-mono)" }}
            >
              {percentage.toFixed(1)}%
            </span>
          )}
        </div>
      )}
      <div
        class="rounded-full overflow-hidden"
        style={{ background: "var(--bg)", height: `${height}px` }}
      >
        <div
          class="h-full rounded-full transition-all duration-300"
          style={{ width: `${percentage}%`, background: color }}
        />
      </div>
    </div>
  );
}
