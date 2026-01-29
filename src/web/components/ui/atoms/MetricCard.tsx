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

const CARD_STYLE = {
  background: "var(--bg-surface)",
  border: "1px solid var(--border)",
};

function getTrendIcon(trend: TrendDirection | undefined): string {
  if (trend === "up") return "\u2191";
  if (trend === "down") return "\u2193";
  return "";
}

function getTrendColor(trend: TrendDirection | undefined): string {
  if (trend === "up") return "var(--success)";
  if (trend === "down") return "var(--error)";
  return "";
}

export function MetricCard({ label, value, color, trend, compact }: MetricCardProps): JSX.Element {
  const trendIcon = getTrendIcon(trend);
  const trendColor = getTrendColor(trend);

  if (compact) {
    return (
      <div class="flex items-center justify-between px-2 py-1.5 rounded-lg" style={CARD_STYLE}>
        <span class="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-dim)" }}>
          {label}
        </span>
        <span
          class="text-sm font-bold tabular-nums"
          style={{ color: color || "var(--text)", fontFamily: "var(--font-mono)" }}
        >
          {value}
          {trendIcon && <span style={{ color: trendColor, marginLeft: 2 }}>{trendIcon}</span>}
        </span>
      </div>
    );
  }

  return (
    <div class="p-3 rounded-lg transition-all duration-200" style={CARD_STYLE}>
      <span
        class="block text-[10px] uppercase tracking-wider mb-1"
        style={{ color: "var(--text-dim)" }}
      >
        {label}
      </span>
      <span
        class="block text-xl font-bold tabular-nums"
        style={{ color: color || "var(--text)", fontFamily: "var(--font-mono)" }}
      >
        {value}
        {trendIcon && <span class="text-sm ml-1" style={{ color: trendColor }}>{trendIcon}</span>}
      </span>
    </div>
  );
}
