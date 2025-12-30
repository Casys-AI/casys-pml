/**
 * TrendIndicator - Displays trend direction arrow with color
 *
 * Part of CAS (Complex Adaptive Systems) emergence metrics visualization.
 *
 * @module web/components/ui/atoms/TrendIndicator
 */

import type { Trend } from "../../../../shared/emergence.types.ts";

interface TrendIndicatorProps {
  /** Trend direction */
  trend: Trend;
  /** Size variant */
  size?: "sm" | "md";
}

const COLORS: Record<Trend, string> = {
  rising: "var(--success, #4ade80)",
  falling: "var(--error, #f87171)",
  stable: "var(--text-dim, #8a8078)",
};

const ARROWS: Record<Trend, string> = {
  rising: "↑",
  falling: "↓",
  stable: "→",
};

/**
 * Displays a trend indicator arrow (↑↓→) with semantic colors
 */
export function TrendIndicator({ trend, size = "sm" }: TrendIndicatorProps) {
  const sizeClass = size === "sm" ? "text-xs" : "text-sm";

  return (
    <span
      class={`font-bold ${sizeClass}`}
      style={{ color: COLORS[trend] }}
      title={`Trend: ${trend}`}
    >
      {ARROWS[trend]}
    </span>
  );
}

export default TrendIndicator;
