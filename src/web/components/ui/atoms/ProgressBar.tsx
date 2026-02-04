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
  /** Custom color for the bar (Tailwind class like 'bg-amber-500') */
  color?: string;
  /** Height of the bar (Tailwind class like 'h-1' or 'h-2') */
  height?: string;
}

const DEFAULT_COLOR = "bg-amber-500";
const DEFAULT_HEIGHT = "h-1";

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
          <span class="text-[10px] uppercase tracking-wide text-stone-500">
            {label}
          </span>
          {showValue && (
            <span class={`text-[10px] font-semibold tabular-nums font-mono text-amber-500`}>
              {percentage.toFixed(1)}%
            </span>
          )}
        </div>
      )}
      <div class={`rounded-full overflow-hidden bg-stone-800 ${height}`}>
        <div
          class={`h-full rounded-full transition-all duration-300 ${color}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
