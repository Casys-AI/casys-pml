/**
 * MetricCard Atom - Compact metric display
 */

import type { JSX } from "preact";

export type TrendDirection = "up" | "down" | "neutral";

export interface MetricCardProps {
  label: string;
  value: string | number;
  icon?: string;
  color?: string;
  trend?: TrendDirection;
  compact?: boolean;
}

function getTrendIcon(trend: TrendDirection | undefined): string {
  if (trend === "up") return "\u2191";
  if (trend === "down") return "\u2193";
  return "";
}

function getTrendColorClass(trend: TrendDirection | undefined): string {
  if (trend === "up") return "text-green-500";
  if (trend === "down") return "text-red-500";
  return "";
}

export function MetricCard({
  label,
  value,
  color,
  trend,
  compact,
}: MetricCardProps): JSX.Element {
  const trendIcon = getTrendIcon(trend);
  const trendColorClass = getTrendColorClass(trend);

  if (compact) {
    return (
      <div class="flex items-center justify-between px-2 py-1.5 rounded-lg bg-stone-900 border border-stone-700">
        <span class="text-[10px] uppercase tracking-wide text-stone-500">
          {label}
        </span>
        <span
          class="text-sm font-bold tabular-nums font-mono"
          style={color ? { color } : undefined}
        >
          <span class={color ? "" : "text-stone-100"}>{value}</span>
          {trendIcon && (
            <span class={`${trendColorClass} ml-0.5`}>{trendIcon}</span>
          )}
        </span>
      </div>
    );
  }

  return (
    <div class="p-3 rounded-lg transition-all duration-200 bg-stone-900 border border-stone-700">
      <span class="block text-[10px] uppercase tracking-wider mb-1 text-stone-500">
        {label}
      </span>
      <span
        class="block text-xl font-bold tabular-nums font-mono"
        style={color ? { color } : undefined}
      >
        <span class={color ? "" : "text-stone-100"}>{value}</span>
        {trendIcon && (
          <span class={`text-sm ml-1 ${trendColorClass}`}>{trendIcon}</span>
        )}
      </span>
    </div>
  );
}
